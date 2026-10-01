// src/utils/formatList.ts
// Batch 356: joins translated items the way the user's language does
// ("a, b, and c" / "a, b et c" / "a, b und c"), so no English punctuation or
// "and" sits between translated pieces. Intl.ListFormat isn't in this
// project's TypeScript lib, hence the narrow type below.
type ListFormatCtor = new (locale: string, options: { style: 'long'; type: 'conjunction' }) => { format(items: readonly string[]): string };

export function formatList(items: readonly string[], locale: string): string {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  try {
    if (ListFormat) return new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch { /* an unknown locale falls through */ }
  return items.join(', ');
}
