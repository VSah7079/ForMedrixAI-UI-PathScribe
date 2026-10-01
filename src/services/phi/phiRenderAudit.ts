// src/services/phi/phiRenderAudit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 363 (PS-72): finds patient data (PHI) that the UI puts on screen
// outside an element the screenshot redaction can see.
//
// Why this exists: the support-ticket screenshot (hooks/useScreenCapture.ts)
// only hides elements matching services/phiSelectors.ts — mostly
// `data-phi="…"` attributes. scripts/tag-phi.mjs matched variable names line
// by line, so it also flagged class names ("ps-accession-…"), comments,
// search filters and values passed to child components, and it could not
// see a `data-phi` on the enclosing cell. Of its 420 flags, most were not
// real gaps, and the real ones were hard to find among them.
//
// This reads the code's structure (TypeScript's parser) instead:
//   - A finding is patient data that is RENDERED here: a JSX child
//     expression, an <input>/<textarea> value, a <Trans values>, or the
//     message of a toast (react-toastify's `toast…()`, the report page's
//     `showToast()`).
//   - It is covered when the element or any enclosing element carries
//     `data-phi`/`data-pii`, a PHI class from phiSelectors.ts, or is a
//     redacting component (PhiToastMessage).
//   - Values passed as props to another component are not findings here:
//     that component renders them and is checked in its own file.
//   - Patient data is recognised from property paths and local constants
//     (`c.patient.lastName`, `const label = \`${patient.firstName}…\``),
//     never from string contents, so class names and translation keys don't
//     count.
// Staff names (pathologists, requesting providers) are deliberately not
// patient PHI here: Pete's scope decision recorded in scripts/tag-phi.mjs.
//
// Pure: takes a file's text, returns findings. The guard test
// (phiTagging.guard.test.ts) runs it over src/.
// ─────────────────────────────────────────────────────────────────────────────
import ts from 'typescript';
import { PHI_SELECTORS } from '../phiSelectors';

export type PhiKind = 'name' | 'dob' | 'mrn' | 'nhs' | 'accession' | 'contact' | 'insurance';

export interface PhiFinding {
  line: number;
  kind: PhiKind;
  /** Where it is shown: a JSX child, a form field's value, a Trans value, or a toast message. */
  where: 'text' | 'field' | 'trans' | 'toast';
  snippet: string;
}

/** Components that hide their content in screenshots. */
export const REDACTING_COMPONENTS: readonly string[] = ['PhiToastMessage'];
/** Functions whose result is a redacted toast message (components/Common/PhiToastMessage.tsx). */
export const REDACTING_CALLS: readonly string[] = ['phiToastContent'];
/** Invented sample data (a template preview's pretend patient), not a patient. `DEMO_` values
 *  are not included: they name real seed cases. */
const SAMPLE_ROOT = /^(MOCK|SAMPLE|EXAMPLE)_/;

/** Class names phiSelectors.ts redacts, without the leading dot. */
const PHI_CLASSES = PHI_SELECTORS.filter(s => s.startsWith('.')).map(s => s.slice(1));

const PATIENT_SEGMENT = /^patient/i;
const NAME_FIELD = /^(name|fullName|firstName|lastName|givenName|givenNames|familyName|familyNames|familySurname|displayName|preferredName|surname|forename)$/i;
const CONTACT_FIELD = /^(address|street|city|postcode|postalCode|zip|zipCode|phone|phoneNumber|mobile|telephone|email|emailAddress)$/i;
const INSURANCE_FIELD = /^(insurance|insurer|policyNumber|payerId|memberId)$/i;
const NAME_VARIABLE = /patient(Full|Display)?Name$|^patientLabel$/i;
/** `patientId`, `sourcePatientIdentifier`, `patientMrn`: a patient identifier under another name. */
const PATIENT_ID_VARIABLE = /patient(Id|Identifier|Mrn|Number)$/i;
const DOB = /^(dob|dateOfBirth|birthDate)$/i;
const MRN = /^(mrn|medicalRecordNumber)$/i;
const NHS = /^(nhsNumber|nhsNo)$/i;
// In this app a case's id is its case number, so `caseId` is shown as the accession too.
const ACCESSION = /^(accession|accessionNumber|accessionNo|fullAccession|caseNumber|caseId|caseRef)$/i;

/** What kind of patient data a property path (["c", "patient", "lastName"]) holds, if any. */
export function classifyPath(segments: readonly string[]): PhiKind | null {
  const afterPatient = segments.findIndex(s => PATIENT_SEGMENT.test(s));
  const tail = afterPatient >= 0 ? segments.slice(afterPatient + 1) : [];
  if (segments.some(s => NAME_VARIABLE.test(s)) || tail.some(s => NAME_FIELD.test(s))) return 'name';
  if (segments.some(s => DOB.test(s)) || tail.some(s => s === 'age')) return 'dob';
  if (segments.some(s => MRN.test(s)) || PATIENT_ID_VARIABLE.test(segments[segments.length - 1])) return 'mrn';
  if (segments.some(s => NHS.test(s))) return 'nhs';
  if (segments.some(s => ACCESSION.test(s))) return 'accession';
  if (tail.some(s => CONTACT_FIELD.test(s))) return 'contact';
  if (tail.some(s => INSURANCE_FIELD.test(s))) return 'insurance';
  return null;
}

/** ["c", "patient", "lastName"] for `c?.patient!.lastName`; null for anything that isn't a plain path. */
function pathOf(node: ts.Node): string[] | null {
  if (ts.isIdentifier(node)) return [node.text];
  if (node.kind === ts.SyntaxKind.ThisKeyword) return ['this'];
  if (ts.isPropertyAccessExpression(node)) {
    const base = pathOf(node.expression);
    return base ? [...base, node.name.text] : null;
  }
  if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return pathOf(node.expression);
  }
  return null;
}

type Locals = Map<string, ts.Node>;

/** A segment that names a case record: its `.id` is the case number (the accession). */
const CASE_SEGMENT = /^(case|caseData|caseRecord|pathologyCase|currentCase|selectedCase)$/i;

/**
 * Names used for case records in this file: anything read as `x.accession…`
 * or `x.patient…` (`c.accession`, `c.patient.mrn`). In this app a case's id
 * is its case number, so a rendered `c.id` shows the accession.
 */
function collectCaseRoots(sf: ts.SourceFile): Set<string> {
  const roots = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) && /^(accession|patient)$/.test(n.name.text)) {
      const base = pathOf(n.expression);
      if (base && base.length === 1) roots.add(base[0]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return roots;
}

/** `c.id` / `item.caseData.id` where that object is a case record. */
function isCaseId(path: readonly string[], caseRoots: ReadonlySet<string>): boolean {
  if (path.length < 2 || path[path.length - 1] !== 'id') return false;
  const owner = path[path.length - 2];
  return CASE_SEGMENT.test(owner) || (path.length === 2 && caseRoots.has(owner));
}

/** Local constants and destructured names, so `{label}` can be traced to what built it. */
function collectLocals(sf: ts.SourceFile): Locals {
  const locals: Locals = new Map();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isIdentifier(n.name)) locals.set(n.name.text, n.initializer);
      else if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          if (!ts.isIdentifier(el.name)) continue;
          const prop = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
          locals.set(el.name.text, ts.factory.createPropertyAccessExpression(n.initializer as ts.Expression, prop));
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return locals;
}

const COMPARISON = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.InstanceOfKeyword, ts.SyntaxKind.InKeyword,
]);
/** A path ending in one of these is a number or a flag, not the data itself. */
const NOT_DATA = /^(length|size|count)$/;

/** The values object of a translation call: `t('key', { … })`, `i18n.t(…)`, `tGrossingNav(…)`. */
const isTranslationValues = (obj: ts.Node) =>
  ts.isObjectLiteralExpression(obj) && ts.isCallExpression(obj.parent) && obj.parent.arguments[1] === obj
  && /^(t|t[A-Z]\w*|[\w.]+\.t)$/.test(obj.parent.expression.getText());

const isFunction = (n: ts.Node): n is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n);
const isHookCall = (n: ts.Node) => ts.isCallExpression(n) && /^use[A-Z]/.test(n.expression.getText());

/**
 * The patient data an expression shows, looking through local constants (a
 * few levels deep). Only what can end up on screen counts:
 *   - `a ? b : c` shows b or c, `a && b` shows b, a comparison shows nothing;
 *   - a callback shows what it returns, not its other statements;
 *   - JSX inside is skipped (its own children are checked where they sit);
 *   - `x.length` is a number.
 */
let currentCaseRoots: ReadonlySet<string> = new Set();

function phiIn(expr: ts.Node, locals: Locals, depth = 0, seen = new Set<string>()): PhiKind | null {
  let found: PhiKind | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return;
    if (ts.isConditionalExpression(n)) { visit(n.whenTrue); visit(n.whenFalse); return; }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (COMPARISON.has(op)) return;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) { visit(n.right); return; }
      visit(n.left); visit(n.right); return;
    }
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) return;
    if (ts.isTypeOfExpression(n)) return;
    if (isFunction(n)) {
      if (ts.isBlock(n.body)) {
        const returns = (b: ts.Node): void => {
          if (ts.isReturnStatement(b)) { if (b.expression) visit(b.expression); return; }
          if (isFunction(b) || ts.isFunctionDeclaration(b)) return;
          ts.forEachChild(b, returns);
        };
        returns(n.body);
      } else visit(n.body);
      return;
    }
    // `{ accession: x }` / `{ patient: x }` (translation values): the key says what x is.
    // Otherwise a key is only a name: `{ label: x }` shows whatever x is.
    if (ts.isPropertyAssignment(n)) {
      const key = n.name.getText().replace(/['"]/g, '');
      const k = isTranslationValues(n.parent) ? (key === 'patient' ? 'name' : classifyPath([key])) : null;
      const valuePath = pathOf(n.initializer);
      const sample = !!valuePath && SAMPLE_ROOT.test(valuePath[0]);
      if (k && !sample && !ts.isStringLiteral(n.initializer) && !ts.isNoSubstitutionTemplateLiteral(n.initializer)) { found = k; return; }
      visit(n.initializer); return;
    }
    if (ts.isShorthandPropertyAssignment(n)) { check(n.name); return; }
    if (ts.isParameter(n)) return;
    // `renderFlags(…)` returns JSX, which is checked where that function builds it;
    // `siteLabelFor(caseId)` looks something up for the id rather than showing it.
    if (ts.isCallExpression(n) && /^render[A-Z]|For$/.test(n.expression.getText())) return;
    // `rows.map(r => …)` shows what the callback returns, not `rows` itself.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(map|flatMap)$/.test(n.expression.name.text)) {
      n.arguments.forEach(visit); return;
    }
    if (ts.isPropertyAccessExpression(n) && NOT_DATA.test(n.name.text)) return;
    if (ts.isPropertyAccessExpression(n) || ts.isIdentifier(n)) { check(n); return; }
    ts.forEachChild(n, visit);
  };
  const check = (n: ts.Node) => {
    const path = pathOf(n);
    if (!path) {
      // `CONFIG[key].labelKey`, `load().patient.mrn`: judge by the field names read, not the whole base.
      if (ts.isPropertyAccessExpression(n)) {
        const trail: string[] = [];
        let e: ts.Expression = n;
        while (ts.isPropertyAccessExpression(e)) { trail.unshift(e.name.text); e = e.expression; }
        const k = NOT_DATA.test(trail[trail.length - 1]) ? null : classifyPath(trail);
        if (k) found = k;
        else if (!ts.isElementAccessExpression(e)) visit(e);
      }
      return;
    }
    if (path.length > 1 && NOT_DATA.test(path[path.length - 1])) return;
    if (SAMPLE_ROOT.test(path[0])) return;
    const kind = classifyPath(path) ?? (isCaseId(path, currentCaseRoots) ? 'accession' : null);
    if (kind) { found = kind; return; }
    const root = path[0];
    const listed = depth < 4 ? mappedValues(n, path) : null;
    if (listed) {
      for (const v of listed) { const k = phiIn(v, locals, depth + 1, seen); if (k) { found = k; return; } }
      return;
    }
    if (depth >= 4 || !locals.has(root) || seen.has(root)) return;
    seen.add(root);
    const init = locals.get(root)!;
    const rootPath = pathOf(init);
    if (rootPath) {
      // `label.x` where `const label = c.patient` → c.patient.x
      const k = classifyPath([...rootPath, ...path.slice(1)]);
      if (k) found = k;
      return;
    }
    // A value built locally (`const label = \`${p.firstName} ${p.lastName}\``) shows what built it.
    // A field of something else (`signer.busy`) or a hook's result doesn't.
    if (path.length === 1 && !isHookCall(init) && !isFunction(init)) {
      const k = phiIn(init, locals, depth + 1, seen);
      if (k) found = k;
    }
  };
  visit(expr);
  return found;
}

/**
 * `[{ value: c.patient.mrn }, …].map(({ value }) => …{value}…)`: a callback
 * parameter's values, traced back to a literal list it maps over (directly or
 * through a local constant). Null when the name isn't such a parameter.
 */
function mappedValues(at: ts.Node, path: readonly string[]): ts.Node[] | null {
  const name = path[0];
  for (let n: ts.Node | undefined = at.parent; n; n = n.parent) {
    if (!isFunction(n)) continue;
    const param = n.parameters[0];
    if (!param) continue;
    let prop: string | undefined;
    if (ts.isIdentifier(param.name) && param.name.text === name) prop = path[1];
    else if (ts.isObjectBindingPattern(param.name)) {
      const el = param.name.elements.find(e => ts.isIdentifier(e.name) && e.name.text === name);
      if (el) prop = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : name;
    }
    if (n.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === name) || prop !== undefined) {
      const call = n.parent;
      if (!prop || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return null;
      let list: ts.Node = call.expression.expression;
      const sf = at.getSourceFile();
      if (ts.isIdentifier(list)) {
        const decl = findConst(sf, list.text);
        if (decl) list = decl;
      }
      if (!ts.isArrayLiteralExpression(list)) return null;
      const values: ts.Node[] = [];
      for (const el of list.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        for (const p of el.properties) {
          if (ts.isPropertyAssignment(p) && p.name.getText() === prop) values.push(p.initializer);
          if (ts.isShorthandPropertyAssignment(p) && p.name.text === prop) values.push(p.name);
        }
      }
      return values;
    }
  }
  return null;
}

function findConst(sf: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) { found = n.initializer; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function tagName(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return el.tagName.getText();
}

function isCovering(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  if (REDACTING_COMPONENTS.includes(tagName(el))) return true;
  return el.attributes.properties.some(p => {
    if (!ts.isJsxAttribute(p)) return false;
    const name = p.name.getText();
    if (name === 'data-phi' || name === 'data-pii') return true;
    if (name === 'className' && p.initializer) {
      const text = p.initializer.getText();
      return PHI_CLASSES.some(c => new RegExp(`(^|[\\s"'\`{])${c}($|[\\s"'\`}])`).test(text));
    }
    return false;
  });
}

/** Whether the node sits inside (or is) an element the screenshot redacts. */
function isCovered(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxElement(n) && isCovering(n.openingElement)) return true;
    if (ts.isJsxSelfClosingElement(n) && isCovering(n)) return true;
  }
  return false;
}

/** `<Trans components={{ case: <span data-phi="accession" /> }}>`: its values render inside tagged elements. */
function transTagsItsValues(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  return el.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText() === 'components'
    && !!p.initializer && /data-ph[ie]=/.test(p.initializer.getText()));
}

/** `showToast(message, kind, { containsPhi: true })`: the report page's toast redacts that message. */
function markedAsPhi(arg: ts.Node): boolean {
  return ts.isObjectLiteralExpression(arg) && arg.properties.some(p =>
    ts.isPropertyAssignment(p) && p.name.getText() === 'containsPhi' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
}

const FIELD_ATTRIBUTES = new Set(['value', 'defaultValue']);
const FIELD_ELEMENTS = new Set(['input', 'textarea', 'select']);
const TOAST_CALLEE = /^(toast(\.(success|error|info|warn|warning|loading))?|showToast)$/;

export function auditPhiRendering(fileName: string, text: string): PhiFinding[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const locals = collectLocals(sf);
  currentCaseRoots = collectCaseRoots(sf);
  const findings: PhiFinding[] = [];
  const add = (node: ts.Node, k: PhiKind, where: PhiFinding['where']) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ line: line + 1, kind: k, where, snippet: node.getText(sf).replace(/\s+/g, ' ').slice(0, 120) });
  };

  const visit = (n: ts.Node) => {
    // 1. Shown as text: {expr} among an element's children.
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const k = phiIn(n.expression, locals);
      if (k && !isCovered(n)) add(n, k, 'text');
    }
    // 2. Shown in a form field, or through <Trans values>.
    if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      const el = n.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement;
      const attr = n.name.getText();
      const tag = tagName(el);
      const where = FIELD_ELEMENTS.has(tag) && FIELD_ATTRIBUTES.has(attr) ? 'field'
        : tag === 'Trans' && attr === 'values' && !transTagsItsValues(el) ? 'trans' : null;
      if (where) {
        const k = phiIn(n.initializer.expression, locals);
        if (k && !isCovered(el)) add(n, k, where);
      }
    }
    // 3. A toast message: the text is rendered by the toast, outside this component.
    if (ts.isCallExpression(n) && TOAST_CALLEE.test(n.expression.getText().replace(/\s/g, '')) && n.arguments.length > 0) {
      const msg = n.arguments[0];
      const wrapped = (ts.isJsxElement(msg) && isCovering(msg.openingElement))
        || (ts.isJsxSelfClosingElement(msg) && isCovering(msg))
        || (ts.isCallExpression(msg) && REDACTING_CALLS.includes(msg.expression.getText()))
        || n.arguments.slice(1).some(markedAsPhi);
      if (!wrapped) {
        const k = phiIn(msg, locals);
        if (k) add(n, k, 'toast');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return findings;
}
