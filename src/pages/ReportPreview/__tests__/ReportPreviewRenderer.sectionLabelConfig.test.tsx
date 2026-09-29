// @vitest-environment happy-dom
//
// src/pages/ReportPreview/__tests__/ReportPreviewRenderer.sectionLabelConfig.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Focused test for one specific fix: a SectionNode's printHeading previously
// rendered via the fixed rp-node-section-heading CSS class alone, with
// node.labelConfig never read at all — even though BaseNode has always
// carried the field and the admin editor (TemplateInspector.tsx) now exposes
// it for sections. This directly renders a section with a real labelConfig
// and checks the resulting DOM node's actual inline style, rather than
// fighting the full admin-editor UI's own internal state/automation.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReportPreviewRenderer from '../ReportPreviewRenderer';
import type { BodyPartAssembly } from '@/orchestrator/contextBuilder';
import type { Case } from '@/types/case/Case';

function makeCase(): Case {
  return { id: 'TEST-CASE', status: 'accessioned' } as unknown as Case;
}

describe('ReportPreviewRenderer — section printHeading respects labelConfig', () => {
  it('applies fontSize/weight/decoration/transform from node.labelConfig to the section heading', () => {
    const bodyAssembly: BodyPartAssembly[] = [{
      slotId: 'slot-1',
      partId: 'test_part',
      partName: 'Test Part',
      order: 1,
      nodes: [{
        id: 'sec-1',
        type: 'section',
        label: 'Test Section',
        printHeading: 'Test Section Heading',
        collapsible: false,
        children: [],
        labelConfig: { position: 'above', transform: 'uppercase', weight: 'bold', decoration: 'underline', fontSize: 26 },
      } as any],
    }];

    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={bodyAssembly} structuredContext={null} caseData={makeCase()} />
    );

    const heading = container.querySelector('.rp-node-section-heading');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe('Test Section Heading');

    // Batch 367 (PS-74): passed as custom properties the .rp-node-section-heading rule reads.
    const style = (heading as HTMLElement).style;
    expect(style.getPropertyValue('--rp-heading-size')).toBe('26px');
    expect(style.getPropertyValue('--rp-heading-weight')).toBe('700');
    expect(style.getPropertyValue('--rp-heading-decoration')).toBe('underline');
    expect(style.getPropertyValue('--rp-heading-transform')).toBe('uppercase');
  });

  it('renders with the base CSS class alone, no inline overrides, when no labelConfig is set', () => {
    const bodyAssembly: BodyPartAssembly[] = [{
      slotId: 'slot-1',
      partId: 'test_part',
      partName: 'Test Part',
      order: 1,
      nodes: [{
        id: 'sec-2',
        type: 'section',
        label: 'Plain Section',
        printHeading: 'Plain Section Heading',
        collapsible: false,
        children: [],
      } as any],
    }];

    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={bodyAssembly} structuredContext={null} caseData={makeCase()} />
    );

    const heading = container.querySelector('.rp-node-section-heading') as HTMLElement;
    expect(heading).not.toBeNull();
    // No inline style properties set at all — base CSS class alone governs
    // appearance, exactly the pre-existing behavior for a template that
    // hasn't configured anything.
    expect(heading.getAttribute('style')).toBeNull();
  });
});

describe('ReportPreviewRenderer — documentStyle.body cascades from the report root', () => {
  it('applies documentStyle.body on the report root (as custom properties), so it cascades via CSS inheritance', () => {
    const { container } = render(
      <ReportPreviewRenderer
        sections={[]} bodyAssembly={[]} structuredContext={null} caseData={makeCase()}
        documentStyle={{ body: { position: 'above', fontFamily: 'Arial', fontSize: 10 } }}
      />
    );
    const root = container.querySelector('.rp-page') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.getPropertyValue('--rp-body-family')).toBe('Arial');
    expect(root.style.getPropertyValue('--rp-body-size')).toBe('10px');
  });

  it('a field-level labelConfig still wins over the cascaded body default — override, not replacement', () => {
    const bodyAssembly: BodyPartAssembly[] = [{
      slotId: 'slot-1', partId: 'test_part', partName: 'Test Part', order: 1,
      nodes: [{
        id: 'field-1', type: 'expression-value', label: 'Final Diagnosis', template: 'Adenocarcinoma', fallback: '',
        labelConfig: { position: 'above', transform: 'uppercase', weight: 'bold', fontSize: 14 },
      } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer
        sections={[]} bodyAssembly={bodyAssembly} structuredContext={null} caseData={makeCase()}
        documentStyle={{ body: { position: 'above', fontFamily: 'Arial', fontSize: 10 } }}
      />
    );
    // Root still carries the cascaded body default...
    const root = container.querySelector('.rp-page') as HTMLElement;
    expect(root.style.getPropertyValue('--rp-body-family')).toBe('Arial');
    expect(root.style.getPropertyValue('--rp-body-size')).toBe('10px');
    // ...but this specific field's own label keeps its own override,
    // exactly the "Final Diagnosis... all bold and capitalized" case.
    const label = container.querySelector('.rp-node-label') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.style.getPropertyValue('--rp-label-weight')).toBe('700');
    expect(label.style.getPropertyValue('--rp-label-transform')).toBe('uppercase');
    expect(label.style.getPropertyValue('--rp-label-size')).toBe('14px');
  });

  it('the value span carries no inline font override of its own, so it is free to inherit the cascaded body default in a real browser', () => {
    const bodyAssembly: BodyPartAssembly[] = [{
      slotId: 'slot-1', partId: 'test_part', partName: 'Test Part', order: 1,
      nodes: [{ id: 'field-1', type: 'expression-value', label: 'Site', template: 'Right shoulder', fallback: '' } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer
        sections={[]} bodyAssembly={bodyAssembly} structuredContext={null} caseData={makeCase()}
        documentStyle={{ body: { position: 'above', fontFamily: 'Arial', fontSize: 10 } }}
      />
    );
    const value = container.querySelector('.rp-node-value') as HTMLElement;
    expect(value).not.toBeNull();
    expect(value.getAttribute('style')).toBeNull();
  });

  it('renders identically to before when no documentStyle is provided at all', () => {
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} structuredContext={null} caseData={makeCase()} />
    );
    const root = container.querySelector('.rp-page') as HTMLElement;
    expect(root.getAttribute('style')).toBeNull();
  });
});

describe('ReportPreviewRenderer — header/footer render through the real pipeline (Step 2)', () => {
  function makeCaseWithPatient(): Case {
    return {
      id: 'TEST-CASE', status: 'accessioned',
      patient: { firstName: 'Diane', lastName: 'Holbrook', mrn: '600001' },
      accession: { fullAccession: 'O26-0018' },
    } as unknown as Case;
  }

  it('renders a real header-p1 part, resolving a real scope value rather than falling back to a hardcoded string', () => {
    const headerAssembly: BodyPartAssembly[] = [{
      slotId: 'hdr-1', partId: 'std_header_page1', partName: 'Page 1 Header', order: 0,
      nodes: [{
        id: 'h1', type: 'header', label: 'Header', scope: 'page1', children: [
          { id: 'c1', type: 'expression-value', label: 'Institution', template: '{{institution.name}}', fallback: 'Fallback Lab' } as any,
        ],
      } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} headerAssembly={headerAssembly} footerAssembly={[]}
        structuredContext={null} caseData={makeCaseWithPatient()} />
    );
    // headerFooterScope resolves institution.name to a real value (the
    // fix this test exists to cover) — so the node's own fallback text
    // correctly never appears at all.
    expect(container.textContent).not.toContain('Fallback Lab');
    expect(container.querySelector('.rp-inst-name')?.textContent).toBeTruthy();
  });

  it('a configured header field not present in the hardcoded version proves this is genuinely part-driven, not the old hardcoded block', () => {
    const headerAssembly: BodyPartAssembly[] = [{
      slotId: 'hdr-1', partId: 'p1', partName: 'Header', order: 0,
      nodes: [{
        id: 'h1', type: 'header', label: 'Header', scope: 'page1', children: [
          { id: 'c1', type: 'static-label', label: 'Custom', text: 'CLIA# 99D0000000' } as any,
        ],
      } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} headerAssembly={headerAssembly} footerAssembly={[]}
        structuredContext={null} caseData={makeCaseWithPatient()} />
    );
    // Not part of the hardcoded institution header at all — only
    // appears if the real, configured part actually rendered.
    expect(container.textContent).toContain('CLIA# 99D0000000');
  });

  it('falls back to the hardcoded institution header when no header-p1 part is resolved — never a regression for an unconfigured template', () => {
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} headerAssembly={[]} footerAssembly={[]}
        structuredContext={null} caseData={makeCaseWithPatient()} />
    );
    expect(container.querySelector('.rp-inst-header')).not.toBeNull();
  });

  it('a real footer-p1 part resolves {{patient.name}} correctly — confirms the header/footer scope carries the same patient data as the rest of the report', () => {
    const footerAssembly: BodyPartAssembly[] = [{
      slotId: 'ftr-1', partId: 'std_footer_page1', partName: 'Page 1 Footer', order: 0,
      nodes: [{
        id: 'f1', type: 'footer', label: 'Footer', scope: 'page1', children: [
          { id: 'c1', type: 'expression-value', label: 'Patient line', template: '{{patient.name}}', fallback: '' } as any,
        ],
      } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} headerAssembly={[]} footerAssembly={footerAssembly}
        structuredContext={null} caseData={makeCaseWithPatient()} />
    );
    expect(container.textContent).toContain('Holbrook, Diane');
  });

  it('documentStyle.header and documentStyle.footer apply independently, each to their own container', () => {
    const headerAssembly: BodyPartAssembly[] = [{
      slotId: 'hdr-1', partId: 'p1', partName: 'Header', order: 0,
      nodes: [{ id: 'h1', type: 'header', label: 'Header', scope: 'page1', children: [] } as any],
    }];
    const footerAssembly: BodyPartAssembly[] = [{
      slotId: 'ftr-1', partId: 'p2', partName: 'Footer', order: 0,
      nodes: [{ id: 'f1', type: 'footer', label: 'Footer', scope: 'page1', children: [] } as any],
    }];
    const { container } = render(
      <ReportPreviewRenderer sections={[]} bodyAssembly={[]} headerAssembly={headerAssembly} footerAssembly={footerAssembly}
        structuredContext={null} caseData={makeCaseWithPatient()}
        documentStyle={{
          header: { position: 'above', fontFamily: 'Georgia', fontSize: 14, weight: 'bold' },
          body:   { position: 'above', fontFamily: 'Arial', fontSize: 10 },
          footer: { position: 'above', fontFamily: 'Verdana', fontSize: 8 },
        }}
      />
    );
    const headerWrapper = container.querySelector('.rp-page > .rp-doc-header') as HTMLElement;
    const footerWrapper = container.querySelector('.rp-page > .rp-doc-footer') as HTMLElement;
    expect(headerWrapper.style.getPropertyValue('--rp-header-family')).toBe('Georgia');
    expect(headerWrapper.style.getPropertyValue('--rp-header-size')).toBe('14px');
    expect(headerWrapper.style.getPropertyValue('--rp-header-weight')).toBe('700');
    expect(footerWrapper.style.getPropertyValue('--rp-footer-family')).toBe('Verdana');
    expect(footerWrapper.style.getPropertyValue('--rp-footer-size')).toBe('8px');
  });
});
