# functions/main.py
# ─────────────────────────────────────────────────────────────────────────────
# Firebase Cloud Functions (Python, firebase_functions SDK). Two real,
# separate functions:
#
#   render_report — generates the real, structured PDF (or, since the
#   outputFormat: 'text' extension, plain text) for a PathScribe
#   Orchestration case report, replacing the old window.open() +
#   win.print() approach in SynopticReportPage.tsx. See its own header
#   comment below for the full real request/response contract.
#
#   receive_interface_message — the real receiving end for PathScribe's
#   real outbound interface dispatch (A08/A40/A47/ORU^R01/LIS sync). See
#   its own header comment below for the full real request/response
#   contract.
#
# IMPORTANT — keep this in sync with ReportPreviewRenderer.tsx:
#   This file re-implements the same node-tree walk as renderNode() in
#   src/pages/ReportPreview/ReportPreviewRenderer.tsx, in Python instead of
#   TypeScript, because ReportLab requires Python and there is no way to
#   share rendering logic across the two languages. If you add a node type,
#   change labelConfig handling, or change showWhen/condition semantics in
#   the TS renderer, mirror the change here too — there is no shared source
#   of truth for this logic, only this comment linking the two files.
#
# What this function does NOT duplicate:
#   • Case → display-field mapping (patient.name, order.fullAccession, etc.)
#     — the frontend computes this once via buildRenderScope() /
#     getInstitution() (both exported from ReportPreviewRenderer.tsx) and
#     sends the resolved scope/institution objects in the request body.
#     This function only ever does dict path lookups on JSON it's given —
#     it has no knowledge of the real Case type's field names.
#   • AI-narrative generation — sections[] arrives pre-generated from
#     orchSections. This function never calls an AI model.
#
# Request body (JSON), POSTed to this function's URL:
#   {
#     "templateName": str, "resolvedBy": str,
#     "institution": {"name","dept","address","phone"},
#     "caseHeader": {"accession","patient","mrn","dob","referring","clinician"},
#     "bodyAssembly": [ {"slotId","partId","partName","order","nodes":[...]} ],
#     "sections": [ {"id","label","text","committed","userEdited","aiGenerated","required"} ],
#     "renderScope": { ...buildRenderScope() output... },
#     "synopticAnswers": [ {"fieldId","fieldLabel","displayValue"} ],
#     "outputFormat": "pdf" | "text",  # optional, defaults to "pdf" — see below
#   }
#
# Response:
#   outputFormat "pdf" (default, and every existing real caller as of this
#   change): application/pdf bytes, exactly as before this field existed.
#   outputFormat "text": application/json, {"text": str} — a real, plain-
#   text rendering of the same real report, built via a second, real,
#   deliberately separate node-tree walk (render_node_as_text(), see its
#   own header comment for why) rather than reused from the PDF path's
#   own ReportLab-specific flowables. Added for buildOruR01Payload.ts's
#   own reportNarrativeText field (services/reports/ in the frontend
#   repo) — an interface engine building an FT (Formatted Text) HL7
#   segment for a client that can't consume ED/PDF data needs this same
#   real, authoritative narrative as plain text, not a second,
#   independently-reconstructed approximation of it.
# ─────────────────────────────────────────────────────────────────────────────

import json
import re
from io import BytesIO

from firebase_functions import https_fn, options
from firebase_functions.options import set_global_options
# Real, per direct guidance (the real receiving end for PathScribe's real
# outbound interface dispatch — receive_interface_message below): this
# function genuinely does write to Firestore, unlike render_report, which
# stays pure rendering and correctly skips this. initialize_app() is
# called once, here, for the whole file — both real functions in this
# file share the one real Firebase app instance.
from firebase_admin import initialize_app, firestore

initialize_app()

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# For cost control — caps concurrent instances so a traffic spike degrades
# performance rather than runs up a surprise bill. Per-function override
# available via max_instances on the decorator below if ever needed.
set_global_options(max_instances=10)

# ── Path / condition evaluation ─────────────────────────────────────────────
# Mirrors getPath() / evalCondition() / evalClause() in ReportPreviewRenderer.tsx
# exactly. Same caveat as the file header: changes there need a matching
# change here.

def get_path(obj, path):
    if obj is None or not path:
        return None
    cur = obj
    for key in path.split('.'):
        if cur is None:
            return None
        cur = cur.get(key) if isinstance(cur, dict) else None
    return cur


_INTERP_RE = re.compile(r'\{\{\s*([\w.]+)\s*\}\}')


def interpolate(template: str, scope: dict) -> str:
    def repl(m):
        v = get_path(scope, m.group(1))
        return '' if v is None or v == '' else str(v)
    return _INTERP_RE.sub(repl, template)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan')


def eval_clause(clause: dict, scope: dict) -> bool:
    actual = get_path(scope, clause.get('field'))
    op = clause.get('operator')
    value = clause.get('value')
    if op == '==':
        return str(actual or '') == str(value or '')
    if op == '!=':
        return str(actual or '') != str(value or '')
    if op == '>':
        return _num(actual) > _num(value)
    if op == '<':
        return _num(actual) < _num(value)
    if op == '>=':
        return _num(actual) >= _num(value)
    if op == '<=':
        return _num(actual) <= _num(value)
    if op == 'notEmpty':
        return actual is not None and str(actual).strip() != ''
    if op == 'isEmpty':
        return actual is None or str(actual).strip() == ''
    if op == 'contains':
        if isinstance(actual, list):
            return str(value) in [str(a) for a in actual]
        return str(value or '') in str(actual or '')
    return True


def eval_condition(cond: dict | None, scope: dict) -> bool:
    if not cond or not cond.get('clauses'):
        return True
    results = [eval_clause(c, scope) for c in cond['clauses']]
    return any(results) if cond.get('logic') == 'OR' else all(results)


# ── Styles ───────────────────────────────────────────────────────────────────

_styles = getSampleStyleSheet()
_styles.add(ParagraphStyle(name='RPLabel', fontSize=9, textColor=colors.HexColor('#475569'), alignment=TA_LEFT))
_styles.add(ParagraphStyle(name='RPValue', fontSize=11, leading=15, alignment=TA_LEFT))
_styles.add(ParagraphStyle(name='RPHeading', fontSize=12, fontName='Helvetica-Bold', spaceAfter=6, spaceBefore=10))
_styles.add(ParagraphStyle(name='RPCaption', fontSize=8, textColor=colors.HexColor('#666666')))


def _apply_text_transform(text: str, label_config: dict | None) -> str:
    t = (label_config or {}).get('transform')
    if t == 'uppercase':
        return text.upper()
    if t == 'capitalize':
        return text.title()
    return text


def _apply_decoration(text: str, label_config: dict | None) -> str:
    if (label_config or {}).get('decoration') == 'underline':
        return f'<u>{text}</u>'
    return text


def _label_style(label_config: dict | None) -> ParagraphStyle:
    """Mirrors labelStyle() in ReportPreviewRenderer.tsx."""
    kwargs = {}
    if label_config:
        if label_config.get('weight') == 'bold':
            kwargs['fontName'] = 'Helvetica-Bold'
        if label_config.get('fontSize'):
            kwargs['fontSize'] = label_config['fontSize']
    return ParagraphStyle('dyn-label', parent=_styles['RPLabel'], **kwargs)


def field_row(label: str, value: str, label_config: dict | None, default_position: str):
    """Mirrors the <FieldRow> component in ReportPreviewRenderer.tsx."""
    position = (label_config or {}).get('position', default_position)
    value_para = Paragraph(str(value) if value else '—', _styles['RPValue'])

    if position == 'none':
        return [value_para]

    label_text = _apply_decoration(_apply_text_transform(label, label_config), label_config)
    label_para = Paragraph(label_text, _label_style(label_config))

    if position == 'above':
        return [label_para, value_para]

    # adjacent — two-cell row so label/value sit on one line, same intent
    # as the TS renderer's flex row.
    t = Table([[label_para, value_para]], colWidths=[38 * mm, None])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return [t]


# ── Shared setup ─────────────────────────────────────────────────────────────

def resolve_scope_and_sections(payload: dict) -> tuple[dict, dict]:
    """Real, per direct guidance (outputFormat: 'text' — the real
    extension for buildOruR01Payload.ts's own reportNarrativeText field):
    the one small, genuinely shared, node-type-agnostic piece of setup
    build_report_pdf() and build_report_text() both need identically —
    extracted here so it's stated once, not duplicated. Everything after
    this (walking the real node tree) is genuinely format-specific and
    stays in its own real, separate function per format — see
    render_node_as_text()'s own header comment for why."""
    scope = dict(payload.get('renderScope') or {})
    scope['__synopticAnswers__'] = payload.get('synopticAnswers') or []
    sections_by_id = {s['id']: s for s in (payload.get('sections') or [])}
    return scope, sections_by_id


# ── Node rendering ───────────────────────────────────────────────────────────

def render_ai_section(node: dict, sections_by_id: dict):
    """Mirrors renderAiSection() in ReportPreviewRenderer.tsx — AI sections
    render purely from the generated text; their own node children (if any)
    are never walked, same decision as the TS renderer and for the same
    reason (OrchestratorEngine generates one text blob per section, not
    per-field)."""
    section = sections_by_id.get(node['id'])
    label = node.get('printHeading') or node.get('label', '')
    if not section:
        return [Paragraph(label, _styles['RPHeading']), Paragraph('Not yet generated', _styles['RPCaption'])]

    flows = [Paragraph(label, _styles['RPHeading'])]
    text = section.get('text') or ''
    if text:
        # AI/editor output is HTML from textToHtml() — <p>/<b>/<i>/<u>/<br>,
        # which is within the safe subset ReportLab's Paragraph mini-markup
        # already supports directly.
        flows.append(Paragraph(text, _styles['RPValue']))
    else:
        msg = '⚠ Required — not yet completed' if node.get('required') else 'No content'
        flows.append(Paragraph(msg, _styles['RPCaption']))
    return flows


def render_node(node: dict, scope: dict, sections_by_id: dict) -> list:
    show_when = node.get('showWhen')
    if show_when and not eval_condition(show_when, scope):
        return []

    node_type = node.get('type')

    # synoptic-block is a deliberate ad-hoc extension (see
    # mockReportPartService.ts) not in the formal TemplateNode union —
    # handled before the main dispatch, same as the TS renderer.
    if node_type == 'synoptic-block':
        answers = scope.get('__synopticAnswers__') or []
        if not answers:
            return [Paragraph('No synoptic data recorded.', _styles['RPCaption'])]
        rows = [[a.get('fieldLabel', ''), a.get('displayValue', '')] for a in answers]
        t = Table(rows, colWidths=[70 * mm, None])
        t.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LINEBELOW', (0, 0), (-1, -2), 0.25, colors.HexColor('#e2e8f0')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        return [t]

    if node_type == 'expression-value':
        text = interpolate(node['template'], scope).strip() or node.get('fallback', '')
        if node.get('hideIfEmpty') and not text:
            return []
        return field_row(node['label'], text, node.get('labelConfig'), 'adjacent')

    if node_type == 'static-label':
        variant_size = {'h1': 18, 'h2': 15, 'h3': 13, 'caption': 8}.get(node.get('variant'), 11)
        style = ParagraphStyle(
            'dyn-static', parent=_styles['Normal'], fontSize=variant_size,
            fontName='Helvetica-Bold' if node.get('bold') else 'Helvetica',
        )
        text = f"<i>{node['text']}</i>" if node.get('italic') else node['text']
        return [Paragraph(text, style)]

    if node_type == 'paragraph':
        raw = get_path(scope, node.get('bindingKey')) if node.get('bindingKey') else None
        html = str(raw) if raw not in (None, '') else (node.get('freeformContent') or '')
        if node.get('hideIfEmpty') and not html:
            return []
        value = html or (node.get('placeholder') or '—')
        return field_row(node['label'], value, node.get('labelConfig'), 'above')

    if node_type == 'dropdown':
        raw = get_path(scope, node.get('bindingKey'))
        values = raw if isinstance(raw, list) else ([raw] if raw is not None else [])
        opt_by_value = {o['value']: o['label'] for o in node.get('options', [])}
        labels = [opt_by_value.get(str(v), str(v)) for v in values]
        if node.get('hideIfEmpty') and not labels:
            return []
        return field_row(node['label'], ', '.join(labels) if labels else '—', node.get('labelConfig'), 'adjacent')

    if node_type == 'column-layout':
        n = node.get('numColumns', 2)
        flows = render_children(node.get('children', []), scope, sections_by_id)
        # ReportLab has no CSS-grid-style reflow — approximate by chunking
        # the rendered flowables into rows of n. Good enough for the
        # column usage seen in the current seed Parts (label/value pairs
        # side by side); revisit if a column layout ever needs flowables
        # that span multiple rows each.
        rows, row = [], []
        for f in flows:
            row.append(f)
            if len(row) == n:
                rows.append(row)
                row = []
        if row:
            while len(row) < n:
                row.append('')
            rows.append(row)
        if not rows:
            return []
        t = Table(rows, colWidths=[None] * n)
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        return [t]

    if node_type == 'section':
        ai = node.get('ai') or {}
        if ai.get('enabled'):
            return render_ai_section(node, sections_by_id)
        flows = []
        if node.get('printHeading'):
            flows.append(Paragraph(node['printHeading'], _styles['RPHeading']))
        flows += render_children(node.get('children', []), scope, sections_by_id)
        return flows

    if node_type == 'repeat-group':
        items = get_path(scope, node.get('iterateOver')) or []
        if not isinstance(items, list) or not items:
            return []
        alias = node.get('itemAlias', 'item')
        flows = []
        for item in items:
            child_scope = {**scope, alias: item}
            flows += render_children(node.get('children', []), child_scope, sections_by_id)
            flows.append(Spacer(1, 4))
        return flows

    if node_type == 'if-block':
        children = node.get('children', []) if eval_condition(node.get('condition'), scope) else node.get('elseChildren', [])
        return render_children(children, scope, sections_by_id)

    if node_type == 'switch-block':
        match = next((c for c in node.get('cases', []) if eval_condition(c.get('when'), scope)), None)
        children = match['children'] if match else node.get('defaultChildren', [])
        return render_children(children, scope, sections_by_id)

    # number / date / computed / image-embed / text-field / page-break /
    # template-ref / header / footer — not exercised by any seed Part as of
    # this change, and not implemented in ReportPreviewRenderer.tsx's
    # renderNode either. Same scope decision in both places: render nothing
    # rather than guess at an unverified format. Implement in both files
    # together if/when a real Part needs one of these.
    return []


def render_children(nodes: list, scope: dict, sections_by_id: dict) -> list:
    flows = []
    for n in nodes:
        flows += render_node(n, scope, sections_by_id)
    return flows


# ── Text-mode node rendering ─────────────────────────────────────────────────
# Real, per direct guidance (outputFormat: 'text' — the real extension for
# buildOruR01Payload.ts's own reportNarrativeText field, "requested from
# the same real, authoritative rendering service as the PDF"). Genuinely
# considered extracting plain text back out of the already-built PDF
# flowables above instead of a second tree-walk here — rejected on
# reflection: ReportLab's Table doesn't expose its real cell contents
# through any stable, public attribute (only the private, undocumented
# _cellvalues), so that path meant reaching into ReportLab's own
# internals rather than this file's own real data. Building text
# directly from the same raw node tree, before it ever becomes a
# ReportLab-specific object, is the real, sound approach instead.
#
# IMPORTANT — same real obligation as the file's own top header comment
# already states for ReportPreviewRenderer.tsx: keep this in sync with
# render_node()/render_children() above. Deliberately mirrors that
# function's own real dispatch order and every real node_type branch,
# node type for node type, precisely so a future change to one is easy
# to compare directly against the other — this is not a rewrite, it's
# the same real tree walk, twice, once per real output format.

_BR_RE = re.compile(r'<br\s*/?>', re.IGNORECASE)
_CLOSE_P_RE = re.compile(r'</p>', re.IGNORECASE)
_ANY_TAG_RE = re.compile(r'<[^>]+>')
_MULTI_NEWLINE_RE = re.compile(r'\n{3,}')


def strip_html_to_text(html: str) -> str:
    """Real, per direct guidance: converts the same safe HTML subset this
    file's own Paragraph rendering already relies on (see render_ai_section()'s
    own comment — <p>/<b>/<i>/<u>/<br>, "within the safe subset ReportLab's
    Paragraph mini-markup already supports directly") into real plain
    text. <br>/</p> become real newlines; every other tag is dropped
    outright — plain text has no bold/italic/underline to preserve.
    Never a general-purpose HTML-to-text converter; scoped to exactly
    the same known, small tag set the PDF path already assumes."""
    if not html:
        return ''
    text = _BR_RE.sub('\n', html)
    text = _CLOSE_P_RE.sub('\n', text)
    text = _ANY_TAG_RE.sub('', text)
    text = _MULTI_NEWLINE_RE.sub('\n\n', text)
    return text.strip()


def field_row_as_text(label: str, value, label_config: dict | None) -> list[str]:
    """Real, text-mode mirror of field_row() above. position ('above' vs
    'adjacent') is a real, purely visual PDF layout distinction with no
    plain-text equivalent — both collapse to the same real 'Label:
    Value' line here. 'none' still means no real label at all, exactly
    the same real authored intent field_row() already respects for PDF."""
    position = (label_config or {}).get('position')
    value_text = str(value) if value else '—'
    if position == 'none':
        return [value_text]
    return [f'{label}: {value_text}']


def render_ai_section_as_text(node: dict, sections_by_id: dict) -> list[str]:
    """Real, text-mode mirror of render_ai_section() above."""
    section = sections_by_id.get(node['id'])
    label = node.get('printHeading') or node.get('label', '')
    if not section:
        return [label, 'Not yet generated']

    lines = [label]
    text = section.get('text') or ''
    if text:
        # Real, per direct guidance: AI/editor output is real HTML from
        # textToHtml() (same real source the PDF path already handles) —
        # stripped to real plain text here, never left as raw HTML in a
        # plain-text field.
        lines.append(strip_html_to_text(text))
    else:
        lines.append('⚠ Required — not yet completed' if node.get('required') else 'No content')
    return lines


def render_node_as_text(node: dict, scope: dict, sections_by_id: dict) -> list[str]:
    show_when = node.get('showWhen')
    if show_when and not eval_condition(show_when, scope):
        return []

    node_type = node.get('type')

    if node_type == 'synoptic-block':
        answers = scope.get('__synopticAnswers__') or []
        if not answers:
            return ['No synoptic data recorded.']
        return [f"{a.get('fieldLabel', '')}: {a.get('displayValue', '')}" for a in answers]

    if node_type == 'expression-value':
        text = interpolate(node['template'], scope).strip() or node.get('fallback', '')
        if node.get('hideIfEmpty') and not text:
            return []
        return field_row_as_text(node['label'], text, node.get('labelConfig'))

    if node_type == 'static-label':
        # Real, per direct guidance: node['text'] is a real, plain string
        # in the real schema (never HTML) — the PDF path's own <i> wrap
        # is a pure visual style applied at render time, with no real
        # plain-text equivalent to preserve.
        return [node['text']]

    if node_type == 'paragraph':
        raw = get_path(scope, node.get('bindingKey')) if node.get('bindingKey') else None
        html = str(raw) if raw not in (None, '') else (node.get('freeformContent') or '')
        if node.get('hideIfEmpty') and not html:
            return []
        value = strip_html_to_text(html) or (node.get('placeholder') or '—')
        return field_row_as_text(node['label'], value, node.get('labelConfig'))

    if node_type == 'dropdown':
        raw = get_path(scope, node.get('bindingKey'))
        values = raw if isinstance(raw, list) else ([raw] if raw is not None else [])
        opt_by_value = {o['value']: o['label'] for o in node.get('options', [])}
        labels = [opt_by_value.get(str(v), str(v)) for v in values]
        if node.get('hideIfEmpty') and not labels:
            return []
        return field_row_as_text(node['label'], ', '.join(labels) if labels else '—', node.get('labelConfig'))

    if node_type == 'column-layout':
        # Real, per direct guidance: the PDF path's own n-column chunking
        # is a purely visual grid layout — plain text has no columns, so
        # this is just the real, flattened children, same real content,
        # no real information lost.
        return render_children_as_text(node.get('children', []), scope, sections_by_id)

    if node_type == 'section':
        ai = node.get('ai') or {}
        if ai.get('enabled'):
            return render_ai_section_as_text(node, sections_by_id)
        lines = []
        if node.get('printHeading'):
            lines.append(node['printHeading'])
        lines += render_children_as_text(node.get('children', []), scope, sections_by_id)
        return lines

    if node_type == 'repeat-group':
        items = get_path(scope, node.get('iterateOver')) or []
        if not isinstance(items, list) or not items:
            return []
        alias = node.get('itemAlias', 'item')
        lines = []
        for item in items:
            child_scope = {**scope, alias: item}
            lines += render_children_as_text(node.get('children', []), child_scope, sections_by_id)
            lines.append('')
        return lines

    if node_type == 'if-block':
        children = node.get('children', []) if eval_condition(node.get('condition'), scope) else node.get('elseChildren', [])
        return render_children_as_text(children, scope, sections_by_id)

    if node_type == 'switch-block':
        match = next((c for c in node.get('cases', []) if eval_condition(c.get('when'), scope)), None)
        children = match['children'] if match else node.get('defaultChildren', [])
        return render_children_as_text(children, scope, sections_by_id)

    # Real, same real scope decision as render_node() above, for the same
    # real reason: render nothing rather than guess at an unverified
    # format. Implement in both real functions together if/when a real
    # Part needs one of these.
    return []


def render_children_as_text(nodes: list, scope: dict, sections_by_id: dict) -> list[str]:
    lines = []
    for n in nodes:
        lines += render_node_as_text(n, scope, sections_by_id)
    return lines


# ── Document assembly ────────────────────────────────────────────────────────

def build_report_pdf(payload: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18 * mm, bottomMargin=22 * mm, leftMargin=20 * mm, rightMargin=20 * mm,
        title=payload.get('caseHeader', {}).get('accession', 'PathScribe Report'),
    )

    flows = []
    inst = payload.get('institution') or {}
    header = payload.get('caseHeader') or {}

    if inst.get('name'):
        flows.append(Paragraph(inst['name'], _styles['RPHeading']))
    if inst.get('dept'):
        flows.append(Paragraph(inst['dept'], _styles['RPCaption']))
    if inst.get('address'):
        flows.append(Paragraph(inst['address'], _styles['RPCaption']))
    flows.append(Spacer(1, 8))

    if header.get('accession'):
        flows.append(Paragraph(header['accession'], _styles['RPHeading']))

    case_rows = [
        [k, v] for k, v in [
            ('Patient', header.get('patient')),
            ('MRN', header.get('mrn')),
            ('Date of Birth', header.get('dob')),
            ('Referring', header.get('referring')),
            ('Clinician', header.get('clinician')),
        ] if v
    ]
    if case_rows:
        t = Table(case_rows, colWidths=[35 * mm, None])
        t.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        flows.append(t)

    template_name = payload.get('templateName')
    if template_name:
        resolved_by = (payload.get('resolvedBy') or '').replace('-', ' ')
        suffix = f' (resolved by {resolved_by})' if resolved_by else ''
        flows.append(Spacer(1, 4))
        flows.append(Paragraph(f'Report Template: {template_name}{suffix}', _styles['RPCaption']))

    flows.append(Spacer(1, 12))

    scope, sections_by_id = resolve_scope_and_sections(payload)

    body_assembly = sorted(payload.get('bodyAssembly') or [], key=lambda p: p.get('order', 0))
    for part in body_assembly:
        for node in part.get('nodes', []):
            flows += render_node(node, scope, sections_by_id)
        flows.append(Spacer(1, 10))

    flows.append(Spacer(1, 16))
    flows.append(Paragraph('CONFIDENTIAL — PATHOLOGY REPORT', _styles['RPCaption']))

    doc.build(flows)
    return buf.getvalue()


def build_report_text(payload: dict) -> str:
    """Real, per direct guidance (outputFormat: 'text' — the real
    extension for buildOruR01Payload.ts's own reportNarrativeText field).
    Text-mode mirror of build_report_pdf() above — same real header/case/
    template/body content, same real order, joined as plain lines instead
    of assembled into a PDF. See render_node_as_text()'s own header
    comment for why this walks the real node tree a second time rather
    than reusing build_report_pdf()'s own already-built ReportLab
    flowables."""
    lines: list[str] = []
    inst = payload.get('institution') or {}
    header = payload.get('caseHeader') or {}

    if inst.get('name'):
        lines.append(inst['name'])
    if inst.get('dept'):
        lines.append(inst['dept'])
    if inst.get('address'):
        lines.append(inst['address'])
    lines.append('')

    if header.get('accession'):
        lines.append(header['accession'])

    for label, value in [
        ('Patient', header.get('patient')),
        ('MRN', header.get('mrn')),
        ('Date of Birth', header.get('dob')),
        ('Referring', header.get('referring')),
        ('Clinician', header.get('clinician')),
    ]:
        if value:
            lines.append(f'{label}: {value}')

    template_name = payload.get('templateName')
    if template_name:
        resolved_by = (payload.get('resolvedBy') or '').replace('-', ' ')
        suffix = f' (resolved by {resolved_by})' if resolved_by else ''
        lines.append('')
        lines.append(f'Report Template: {template_name}{suffix}')

    lines.append('')

    scope, sections_by_id = resolve_scope_and_sections(payload)

    body_assembly = sorted(payload.get('bodyAssembly') or [], key=lambda p: p.get('order', 0))
    for part in body_assembly:
        for node in part.get('nodes', []):
            lines += render_node_as_text(node, scope, sections_by_id)
        lines.append('')

    lines.append('')
    lines.append('CONFIDENTIAL — PATHOLOGY REPORT')

    return '\n'.join(lines)


# ── HTTP entrypoint ──────────────────────────────────────────────────────────

@https_fn.on_request(
    cors=options.CorsOptions(
        # Restricted to the real frontend deployment + local dev servers.
        # If you add a staging URL or change Vite's dev port, add it here too.
        cors_origins=[
            "https://pathscribe-ai-ui.vercel.app",
            "http://localhost:5173",   # Vite dev server default
            "http://127.0.0.1:5173",
        ],
        cors_methods=["POST"],
    ),
)
def render_report(req: https_fn.Request) -> https_fn.Response:
    if req.method != 'POST':
        return https_fn.Response('Method not allowed', status=405)

    payload = req.get_json(silent=True)
    if not payload:
        return https_fn.Response('Missing or invalid JSON body', status=400)

    # Real, per direct guidance (outputFormat: 'text' — the real
    # extension for buildOruR01Payload.ts's own reportNarrativeText
    # field): missing/undefined defaults to 'pdf', so every existing
    # real caller of this function is completely unaffected.
    output_format = payload.get('outputFormat', 'pdf')

    if output_format == 'text':
        try:
            text = build_report_text(payload)
        except Exception as e:  # noqa: BLE001 — same real posture as the PDF path below
            return https_fn.Response(f'Report generation failed: {e}', status=500)
        return https_fn.Response(
            json.dumps({'text': text}),
            status=200,
            headers={'Content-Type': 'application/json'},
        )

    try:
        pdf_bytes = build_report_pdf(payload)
    except Exception as e:  # noqa: BLE001 — return a clean 500, don't leak internals/stack traces
        return https_fn.Response(f'Report generation failed: {e}', status=500)

    accession = (payload.get('caseHeader') or {}).get('accession') or 'report'
    return https_fn.Response(
        pdf_bytes,
        status=200,
        headers={
            'Content-Type': 'application/pdf',
            'Content-Disposition': f'inline; filename="{accession}.pdf"',
        },
    )


# ── receive_interface_message ────────────────────────────────────────────────
# Real, per direct guidance ("we can setup just the receiving end for now
# and look to see that the json packages coming out of PS are correct" —
# a real, generic receiving end so all real outbound transaction types can
# be checked, not one receiver per type).
#
# Deliberately never generates HL7 itself, same real "PathScribe sends
# JSON, the interface engine builds HL7" posture as this whole outbound
# architecture — this function is a real stand-in for that interface
# engine's receiving side, not a Mirth Connect replacement.
#
# Request body (JSON), POSTed to this function's URL — one real, generic
# envelope shape used by every real transaction type, rather than four
# independently-shaped request bodies this function would need separate
# validation for:
#   {
#     "queueEntryId": str,  # the real DLQ queue entry id this dispatch came from
#     "transactionType": "A08" | "A40" | "A47" | "ORU_R01" | "LIS_SYNC" | "ORDER_CREATED",
#     "dispatchedAt": str,  # real ISO timestamp of this dispatch attempt
#     "payload": { ... },   # the real, actual payload — Adt08DemographicUpdatePayload /
#                           # Adt40MergePatientPayload / Adt47ChangeIdentifierPayload /
#                           # OruR01Payload (all defined in the frontend repo,
#                           # services/patients/buildPatientAdtPayload.ts and
#                           # services/reports/buildOruR01Payload.ts), the real
#                           # LIS-sync detail object (see the frontend's own
#                           # useLisIntegration.ts) for LIS_SYNC, or
#                           # OrderCreationEventPayload (services/interfaceEngine/
#                           # IInterfaceEngineService.ts) for ORDER_CREATED.
#   }
#
# Validation deliberately stays at the real envelope level (every field
# above present, transactionType a real known value, payload a real
# object) rather than deep-validating each of the four real payload
# shapes field-by-field — those shapes are already defined and enforced
# by TypeScript on the sending side; re-implementing that same validation
# here in Python would be a second, real place for the two to drift out
# of sync, for real fields this function has no real use for beyond
# storing them.
#
# Response: application/json.
#   Success: {"ok": true, "id": str}  — the real Firestore document id.
#   Validation failure: {"ok": false, "error": str}, HTTP 422.
# ─────────────────────────────────────────────────────────────────────────────

_VALID_TRANSACTION_TYPES = {'A08', 'A40', 'A47', 'ORU_R01', 'LIS_SYNC', 'ORDER_CREATED'}


def validate_envelope(body: dict) -> str | None:
    """Real, per direct guidance: validates the real, generic envelope
    shape every real transaction type sends — see this file's own module
    header comment above for the full real contract and why validation
    deliberately stops here rather than reaching into payload's own
    real, per-type shape."""
    for field in ('queueEntryId', 'transactionType', 'dispatchedAt', 'payload'):
        if not body.get(field):
            return f'Missing required field: {field}'
    transaction_type = body['transactionType']
    if transaction_type not in _VALID_TRANSACTION_TYPES:
        return f'Unknown transactionType: {transaction_type!r}. Expected one of {sorted(_VALID_TRANSACTION_TYPES)}.'
    if not isinstance(body['payload'], dict):
        return 'payload must be a real JSON object, not a string/array/primitive.'
    return None


@https_fn.on_request(
    cors=options.CorsOptions(
        # Same real, restricted origin list as render_report above — see
        # its own comment for the real reasoning.
        cors_origins=[
            "https://pathscribe-ai-ui.vercel.app",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        cors_methods=["POST"],
    ),
)
def receive_interface_message(req: https_fn.Request) -> https_fn.Response:
    if req.method != 'POST':
        return https_fn.Response('Method not allowed', status=405)

    body = req.get_json(silent=True)
    if not body:
        return https_fn.Response('Missing or invalid JSON body', status=400)

    validation_error = validate_envelope(body)
    if validation_error:
        return https_fn.Response(
            json.dumps({'ok': False, 'error': validation_error}),
            status=422,
            headers={'Content-Type': 'application/json'},
        )

    try:
        db = firestore.client()
        doc_ref = db.collection('received_interface_messages').document()
        doc_ref.set({
            **body,
            # Real, server-assigned receipt timestamp — deliberately
            # separate from the real, client-supplied dispatchedAt above,
            # so a genuine clock-skew or network-delay gap between "PathScribe
            # sent this" and "the receiver actually got it" stays visible,
            # not silently collapsed into one real timestamp.
            'receivedAt': firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:  # noqa: BLE001 — return a clean 500, don't leak internals/stack traces
        return https_fn.Response(
            json.dumps({'ok': False, 'error': f'Storage failed: {e}'}),
            status=500,
            headers={'Content-Type': 'application/json'},
        )

    return https_fn.Response(
        json.dumps({'ok': True, 'id': doc_ref.id}),
        status=200,
        headers={'Content-Type': 'application/json'},
    )
