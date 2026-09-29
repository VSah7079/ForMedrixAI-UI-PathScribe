// Batch 367 (PS-74): what the inline-CSS check finds, and what it accepts.
import { describe, expect, it } from 'vitest';
import { auditInlineStyles } from './inlineStyleAudit';

const kinds = (code: string) => auditInlineStyles('Fixture.tsx', code).map(f => f.kind);

describe('auditInlineStyles: findings', () => {
  it('flags a real CSS property, even beside custom properties', () => {
    expect(kinds(`const R = () => <div style={{ color: 'red' }} />;`)).toEqual(['css-property']);
    expect(kinds(`const R = ({ w }) => <div style={{ '--w': w, width: w } as React.CSSProperties} />;`)).toEqual(['css-property']);
  });
  it('flags both branches of a condition', () => {
    expect(kinds(`const R = ({ a }) => <div style={a ? { left: 1 } : { '--x': 1 }} />;`)).toEqual(['css-property']);
    expect(kinds(`const R = ({ a }) => <div style={a && { top: 0 }} />;`)).toEqual(['css-property']);
  });
  it('flags a style object passed by name to a DOM element unless it is a …Vars helper', () => {
    expect(kinds(`const R = ({ s }) => <div style={s} />;`)).toEqual(['not-vars']);
    expect(kinds(`const R = () => <button style={btn(true)} />;`)).toEqual(['not-vars']);
    expect(kinds(`const R = () => <div style={themeVars(t)} />;`)).toEqual([]);
  });
  it('flags a …Vars helper that returns a real property, and an unnamed spread', () => {
    expect(kinds(`const hueVars = (c: string) => ({ '--ps-hue': c, color: c });`)).toEqual(['helper']);
    expect(kinds(`const R = ({ o }) => <div style={{ ...o, '--x': 1 }} />;`)).toEqual(['spread']);
  });
  it('flags colours built from a hex string and an alpha suffix', () => {
    expect(kinds('const R = ({ c }) => <div style={{ \'--bg\': `${c}22` } as React.CSSProperties} />;')).toEqual(['built-colour']);
    expect(kinds(`const bg = color + '18';`)).toEqual(['built-colour']);
    expect(kinds('const bg = `rgba(${r},${g},${b},0.2)`;')).toEqual(['built-colour']);
  });
});

describe('auditInlineStyles: accepted', () => {
  it('custom properties only, literal or computed, in either branch', () => {
    expect(kinds(`const R = ({ c, a }) => <div style={a ? { '--ps-hue': c } as React.CSSProperties : undefined} />;`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <div style={{ ['--node-color' as string]: c }} />;`)).toEqual([]);
  });
  it('a …Vars helper, and spreading one into custom properties', () => {
    expect(kinds(`const R = () => <div style={{ ...themeVars(t), '--h': '1px' } as React.CSSProperties} />;`)).toEqual([]);
    expect(kinds(`function labelVars(c: string) { return { '--label': c }; }`)).toEqual([]);
    expect(kinds(`const pctVar = (p: number, c?: string) => ({ '--pct': p, ...(c ? { '--ps-hue': c } : {}) });`)).toEqual([]);
    expect(kinds(`const pctVar = (p: number, c?: string) => ({ '--pct': p, ...(c ? { color: c } : {}) });`)).toEqual(['helper']);
  });
  it('a style prop on a component that is not a literal (the component checks its own DOM)', () => {
    expect(kinds(`const R = ({ s }) => <DocumentStyleEditor style={s} />;`)).toEqual([]);
  });
  it('ignores comments', () => {
    expect(kinds(`// used to be color + '18'\nconst x = 1;`)).toEqual([]);
  });
});
