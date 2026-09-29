// Batch 363 (PS-72): what the PHI render check finds, and what it rightly ignores.
import { describe, expect, it } from 'vitest';
import { auditPhiRendering, classifyPath } from './phiRenderAudit';

const audit = (code: string, file = 'Fixture.tsx') => auditPhiRendering(file, code);
const kinds = (code: string, file?: string) => audit(code, file).map(f => `${f.kind}/${f.where}`);

describe('classifyPath', () => {
  it('recognises patient identifiers by their property path', () => {
    expect(classifyPath(['c', 'patient', 'lastName'])).toBe('name');
    expect(classifyPath(['patientName'])).toBe('name');
    expect(classifyPath(['record', 'dateOfBirth'])).toBe('dob');
    expect(classifyPath(['c', 'patient', 'mrn'])).toBe('mrn');
    expect(classifyPath(['caseData', 'accession', 'fullAccession'])).toBe('accession');
    expect(classifyPath(['patient', 'address'])).toBe('contact');
  });
  it('does not treat staff names or unrelated fields as patient data', () => {
    expect(classifyPath(['pathologist', 'firstName'])).toBeNull();
    expect(classifyPath(['user', 'name'])).toBeNull();
    expect(classifyPath(['specimen', 'label'])).toBeNull();
  });
});

describe('auditPhiRendering: shown on screen, not redacted', () => {
  it('flags a patient name rendered without a tag', () => {
    expect(kinds(`const R = ({ c }) => <div>{c.patient.lastName}, {c.patient.firstName}</div>;`)).toEqual(['name/text', 'name/text']);
  });
  it('flags a value built locally from patient data', () => {
    expect(kinds(`const R = ({ p }) => { const label = \`\${p.patient.firstName} \${p.patient.lastName}\`; return <span>{label}</span>; };`)).toEqual(['name/text']);
  });
  it('flags patient data in a form field, and a translation that carries it', () => {
    expect(kinds(`const R = ({ mrn }) => <input value={mrn} />;`)).toEqual(['mrn/field']);
    expect(kinds(`const R = ({ c }) => <h1>{t('page.title', { accession: c.id })}</h1>;`)).toEqual(['accession/text']);
  });
  it('flags a list of label/value rows rendered through map', () => {
    const code = `const R = ({ c }) => <div>{[{ label: 'MRN', value: c.patient.mrn }].map(({ label, value }) => <span key={label}>{value}</span>)}</div>;`;
    expect(kinds(code)).toEqual(['mrn/text']);
  });
  it('flags a toast message carrying patient data', () => {
    expect(kinds(`toast.warn(\`Block for \${accession}\`);`, 'svc.ts')).toEqual(['accession/toast']);
    expect(kinds(`showToast(t('x', { accession: caseData.accession.fullAccession }));`, 'hook.ts')).toEqual(['accession/toast']);
  });
  it('flags <Trans values> unless its components tag the values', () => {
    expect(kinds(`const R = ({ accession }) => <Trans i18nKey="k" values={{ accession }} components={{ b: <strong /> }} />;`)).toEqual(['accession/trans']);
    expect(kinds(`const R = ({ accession }) => <Trans i18nKey="k" values={{ accession }} components={{ b: <strong data-phi="accession" /> }} />;`)).toEqual([]);
  });
});

describe('auditPhiRendering: covered, or not patient data on screen', () => {
  it('accepts data-phi on the element or any enclosing element', () => {
    expect(kinds(`const R = ({ c }) => <td data-phi="name"><div>{c.patient.lastName}</div></td>;`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <span data-phi={kind}>{c.patient.mrn}</span>;`)).toEqual([]);
    expect(kinds(`const R = ({ mrn }) => <input data-phi="mrn" value={mrn} />;`)).toEqual([]);
  });
  it('accepts the PHI class names phiSelectors.ts redacts', () => {
    expect(kinds(`const R = ({ c }) => <span className="patient-name">{c.patient.lastName}</span>;`)).toEqual([]);
  });
  it('accepts redacted toasts', () => {
    expect(kinds(`toast.success(<PhiToastMessage>{patientName}</PhiToastMessage>);`)).toEqual([]);
    expect(kinds(`toast.warn(phiToastContent(\`\${accession}\`));`, 'svc.ts')).toEqual([]);
    expect(kinds(`showToast(t('x', { accession }), 'info', { containsPhi: true });`, 'hook.ts')).toEqual([]);
  });
  it('ignores class names, translation keys, comments and conditions', () => {
    expect(kinds(`const R = () => <div className="ps-accession-row">{t('accessionPage.title')}</div>;`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <div>{/* c.patient.lastName */}</div>;`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <div>{c.patient.mrn ? t('has') : t('none')}</div>;`)).toEqual([]);
    expect(kinds(`const R = ({ mrn, dob }) => <div>{mrn === dob && t('same')}</div>;`)).toEqual([]);
  });
  it('ignores counts, props handed to another component, and code that is not rendered', () => {
    expect(kinds(`const R = ({ cases }) => <div>{cases.filter(c => c.patient.mrn).length}</div>;`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <HeaderBar patientName={c.patient.lastName} mrn={c.patient.mrn} />;`)).toEqual([]);
    expect(kinds(`const hits = rows.filter(o => o.patient.lastName.includes(q));`, 'x.ts')).toEqual([]);
  });
  it('ignores staff names and sample data', () => {
    expect(kinds(`const R = ({ p }) => <option>{p.firstName} {p.lastName}</option>;`)).toEqual([]);
    expect(kinds(`const R = () => <p>{t('demo', { accession: SAMPLE_ACCESSION })}{MOCK_CTX.patient.name}</p>;`)).toEqual([]);
    // DEMO_ values name real seed cases, so they count.
    expect(kinds(`const R = () => <p>{t('demo', { accession: DEMO_ACCESSION })}</p>;`)).toEqual(['accession/text']);
  });
  it('ignores a lookup table whose keys happen to be identifier types', () => {
    expect(kinds(`const BADGE = { accession: { label: 'Accession' } }; const R = ({ k }) => <b>{BADGE[k].label}</b>;`)).toEqual([]);
  });
  it('reports the line of each finding', () => {
    const [f] = audit(`const R = ({ c }) => (\n  <div>\n    {c.patient.mrn}\n  </div>\n);`);
    expect(f.line).toBe(3);
  });
});

describe('case numbers (Batch 363 browser check)', () => {
  it('treats a rendered case id as the accession when the file reads that object as a case', () => {
    expect(kinds(`const R = ({ c }) => <tr><td>{c.patient.mrn && ''}</td><td>{c.id}</td></tr>;`)).toEqual(['accession/text']);
    expect(kinds(`const R = ({ item }) => <b>{item.caseData.id}</b>;`)).toEqual(['accession/text']);
    expect(kinds(`const R = ({ c }) => <b>{c.id}</b>;`)).toEqual([]);
  });
  it('sees through type casts and leaves render helpers to their own check', () => {
    expect(kinds(`const R = ({ c }) => { const r = run(c.accession); return <p>{(r as { reason: string }).reason}</p>; };`)).toEqual([]);
    expect(kinds(`const R = ({ c }) => <div>{renderFlags(c.caseFlags, c.id)}</div>;`)).toEqual([]);
  });
});

describe('identifiers under other names (Batch 363 browser check)', () => {
  it('counts caseId and patient identifier fields, but not a patient-id standard\'s labels', () => {
    expect(kinds(`const R = ({ log }) => <span>{log.caseId}</span>;`)).toEqual(['accession/text']);
    expect(kinds(`const R = ({ e }) => <div>{e.sourcePatientIdentifier}</div>;`)).toEqual(['mrn/text']);
    expect(kinds(`const R = ({ r }) => <td>{r.patientMrn}</td>;`)).toEqual(['mrn/text']);
    expect(kinds(`const R = () => <span>{t(patientId.labelKey)}</span>;`)).toEqual([]);
  });
  it('judges a lookup by the field read, and treats xFor(id) helpers as lookups', () => {
    expect(kinds(`const R = ({ qt }) => <b>{t(QUEUE_CONFIG[qt].labelKey)}</b>;`)).toEqual([]);
    expect(kinds(`const R = ({ e }) => <td>{siteLabelFor(e.caseId)}</td>;`)).toEqual([]);
  });
});
