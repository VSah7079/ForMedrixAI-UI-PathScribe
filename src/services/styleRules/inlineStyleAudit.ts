// src/services/styleRules/inlineStyleAudit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 367 (PS-74): the check behind standing rule 1 ("no inline CSS").
//
// A `style` prop may set only CSS custom properties (`--name`), for values
// that really are per instance; a CSS rule in pathscribe.css reads them.
// Colours are never built in JSX (`hex + '18'`): pass the base colour
// (`--ps-hue`) and let CSS derive tints with color-mix().
//
// What counts as a finding:
//   - `style={{ … }}` with a key that isn't a custom property, or a spread;
//   - on a DOM element, `style={x}` / `style={f(…)}` where the name doesn't
//     end in "Vars"/"Var" (the naming convention for helpers that return only
//     custom properties), after looking through `?:`, `&&`, `??` and `as`;
//   - a helper named …Vars/…Var whose returned object literal sets anything
//     but custom properties;
//   - a colour built from a hex string plus an alpha suffix
//     (`${c}22`, c + '18') or `rgba(${…})` anywhere in the file.
// A `style` prop on a component (capitalised tag) that isn't an object
// literal is the component's own business: its internals are checked where
// they reach a DOM element.
// ─────────────────────────────────────────────────────────────────────────────

import ts from 'typescript';

export interface InlineStyleFinding {
  line: number;
  kind: 'css-property' | 'spread' | 'not-vars' | 'helper' | 'built-colour';
  snippet: string;
}

const HELPER_NAME = /Vars?$/i;
const BUILT_COLOUR = [/\}[0-9a-fA-F]{2}`/, /\+\s*'[0-9a-fA-F]{2}'/, /\+\s*"[0-9a-fA-F]{2}"/, /rgba\(\$\{/];

const keyName = (p: ts.ObjectLiteralElementLike, sf: ts.SourceFile): string | null => {
  if (!('name' in p) || !p.name) return null;
  const n = p.name;
  if (ts.isStringLiteral(n) || ts.isIdentifier(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    let e = n.expression;
    while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return e.head.text; // `--${prefix}-x` starts with "--"
    return n.getText(sf);
  }
  return null;
};

const unwrap = (e: ts.Expression): ts.Expression => {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
};

const calleeName = (e: ts.Expression): string | null => {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isCallExpression(e)) return calleeName(e.expression);
  return null;
};

export function auditInlineStyles(fileName: string, code: string): InlineStyleFinding[] {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: InlineStyleFinding[] = [];
  const add = (node: ts.Node, kind: InlineStyleFinding['kind']) =>
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind, snippet: node.getText(sf).replace(/\s+/g, ' ').slice(0, 120) });

  const checkObject = (obj: ts.ObjectLiteralExpression) => {
    for (const p of obj.properties) {
      if (ts.isSpreadAssignment(p)) {
        const spread = unwrap(p.expression);
        // `...(cond ? { '--x': v } : {})` is checked branch by branch.
        const branches = ts.isConditionalExpression(spread) ? [spread.whenTrue, spread.whenFalse].map(unwrap)
          : ts.isBinaryExpression(spread) && spread.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [unwrap(spread.right)] : null;
        if (branches && branches.every(ts.isObjectLiteralExpression)) { branches.forEach(o => checkObject(o as ts.ObjectLiteralExpression)); continue; }
        const name = calleeName(spread);
        if (!name || !HELPER_NAME.test(name)) add(p, 'spread');
        continue;
      }
      const k = keyName(p, sf);
      if (k === null || !k.startsWith('--')) add(p, 'css-property');
    }
  };

  const checkValue = (e: ts.Expression, domElement: boolean, at: ts.Node) => {
    e = unwrap(e);
    if (ts.isConditionalExpression(e)) { checkValue(e.whenTrue, domElement, at); checkValue(e.whenFalse, domElement, at); return; }
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) checkValue(e.left, domElement, at);
      checkValue(e.right, domElement, at);
      return;
    }
    if (ts.isObjectLiteralExpression(e)) { checkObject(e); return; }
    if (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return;
    if (!domElement) return;
    const name = calleeName(e);
    if (!name || !HELPER_NAME.test(name)) add(at, 'not-vars');
  };

  const returnedObjects = (body: ts.Node): ts.ObjectLiteralExpression[] => {
    const found: ts.ObjectLiteralExpression[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isFunctionLike(n) && n !== body) return;
      if (ts.isReturnStatement(n) && n.expression) {
        const r = unwrap(n.expression);
        if (ts.isObjectLiteralExpression(r)) found.push(r);
      }
      ts.forEachChild(n, visit);
    };
    if (ts.isArrowFunction(body) && !ts.isBlock(body.body)) {
      const r = unwrap(body.body);
      if (ts.isObjectLiteralExpression(r)) found.push(r);
    } else ts.forEachChild(body, visit);
    return found;
  };

  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'style' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      const tag = n.parent.parent;
      const tagName = (ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)) ? tag.tagName.getText(sf) : '';
      checkValue(n.initializer.expression, /^[a-z]/.test(tagName), n);
    }
    // Helpers named …Vars: what they return must be custom properties only.
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && HELPER_NAME.test(n.name.text) && n.initializer) {
      const init = unwrap(n.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) returnedObjects(init).forEach(checkObject);
      else if (ts.isObjectLiteralExpression(init)) checkObject(init);
    }
    if (ts.isFunctionDeclaration(n) && n.name && HELPER_NAME.test(n.name.text) && n.body) returnedObjects(n).forEach(checkObject);
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // Colours built from strings, anywhere in UI code.
  code.split('\n').forEach((text, i) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (BUILT_COLOUR.some(re => re.test(text))) out.push({ line: i + 1, kind: 'built-colour', snippet: trimmed.slice(0, 120) });
  });

  // Findings inside helpers are reported once per property; keep them sorted.
  return out.map(f => (f.kind === 'css-property' || f.kind === 'spread') && isInsideHelper(sf, f.line) ? { ...f, kind: 'helper' as const } : f)
    .sort((a, b) => a.line - b.line);
}

function isInsideHelper(sf: ts.SourceFile, line: number): boolean {
  let inside = false;
  const visit = (n: ts.Node) => {
    const start = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
    if (line < start || line > end) return;
    if ((ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && HELPER_NAME.test(n.name.text)) || (ts.isFunctionDeclaration(n) && n.name && HELPER_NAME.test(n.name.text))) inside = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return inside;
}
