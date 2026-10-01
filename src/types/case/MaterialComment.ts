// src/types/case/MaterialComment.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "why didn't we use a standard plain
// text for at the block, slide, and decant levels. Seems like
// overkill." Confirmed directly this was a real design mismatch, not
// a deliberate choice: CaseComment.text is documented as "Rich text
// (HTML) — same PathScribeEditor content" — a real, full,
// TipTap-based rich-text editor (headings, tables, font color,
// highlighting) built for substantial, formatted clinical
// documentation at case/specimen level. Block/stain/decant-level
// notes are real, but genuinely different in kind — short,
// operational/technical notes ("restain requested — poor uptake",
// "third piece recovered from cassette after initial count"), never
// needing headings or tables. Reusing CaseComment there was real
// overkill, and worse, a real, confirmed bug: the actual UI (a plain
// <input type="text">) never went through PathScribeEditor at all,
// yet the render side used dangerouslySetInnerHTML as if it had —
// any HTML-significant character a user typed (<, &) would have been
// interpreted as markup, not shown as the literal text typed.
//
// This type is the real, honest fix: a genuinely plain-text sibling
// to CaseComment, same real author/timestamp shape, deliberately
// never rendered via dangerouslySetInnerHTML.
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialComment {
  id: string;
  authorId: string;
  authorName: string;
  /** Plain text — deliberately NOT rich text/HTML. See this file's
   *  own header for why block/stain/decant-level notes don't need
   *  PathScribeEditor's own rich-text surface, unlike CaseComment. */
  text: string;
  createdAt: string;
  /** Real, same real station-stamping convention as
   *  CaseComment.stationId — captured automatically at creation. */
  stationId?: string | null;
}
