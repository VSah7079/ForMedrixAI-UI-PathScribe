// src/protocols/protocolChangeSummary.ts
// Builds a human-readable list of what changed between two versions of a
// ProtocolDefinition, for the audit log entry written on save. Extracted
// out of ProtocolEditor.tsx's save() handler — pure data-diffing logic
// with no React/UI dependency.
//
// These summary lines are persisted audit-trail text (written verbatim
// into the audit log via useAuditLog's log("save_protocol", { changes })),
// not on-screen UI copy, so — consistent with this codebase's established
// i18n convention — they are deliberately left in English regardless of
// the active locale.
import { ProtocolDefinition } from "../types/ProtocolDefinition";

export function buildProtocolChangeSummary(
  orig: ProtocolDefinition | null,
  protocol: ProtocolDefinition
): string[] {
  const changes: string[] = [];
  if (!orig) return changes;

  // Top-level field changes
  if (orig.name !== protocol.name)
    changes.push(`Name: "${orig.name}" → "${protocol.name}"`);
  if (orig.lifecycle !== protocol.lifecycle)
    changes.push(`Lifecycle: "${orig.lifecycle}" → "${protocol.lifecycle}"`);
  if (orig.version !== protocol.version)
    changes.push(`Version: "${orig.version}" → "${protocol.version}"`);

  // Section-level changes
  const origSections = new Map(orig.sections.map(s => [s.id, s]));
  const newSections = new Map(protocol.sections.map(s => [s.id, s]));

  // Added sections
  protocol.sections.forEach(s => {
    if (!origSections.has(s.id))
      changes.push(`Added section: "${s.title}"`);
  });

  // Removed sections
  orig.sections.forEach(s => {
    if (!newSections.has(s.id))
      changes.push(`Removed section: "${s.title}"`);
  });

  // Modified sections / questions
  protocol.sections.forEach(newSection => {
    const origSection = origSections.get(newSection.id);
    if (!origSection) return;

    if (origSection.title !== newSection.title)
      changes.push(`Section renamed: "${origSection.title}" → "${newSection.title}"`);

    const origQs = new Map(origSection.questions.map(q => [q.id, q]));
    const newQs = new Map(newSection.questions.map(q => [q.id, q]));

    newSection.questions.forEach(q => {
      if (!origQs.has(q.id))
        changes.push(`Added question in "${newSection.title}": "${q.text}"`);
    });
    origSection.questions.forEach(q => {
      if (!newQs.has(q.id))
        changes.push(`Removed question from "${newSection.title}": "${q.text}"`);
    });
    newSection.questions.forEach(q => {
      const oq = origQs.get(q.id);
      if (!oq) return;
      if (oq.text !== q.text)
        changes.push(`Question text: "${oq.text}" → "${q.text}"`);
      if (oq.type !== q.type)
        changes.push(`"${q.text}" type: ${oq.type} → ${q.type}`);
      if (oq.required !== q.required)
        changes.push(`"${q.text}" required: ${oq.required} → ${q.required}`);
    });
  });

  return changes;
}
