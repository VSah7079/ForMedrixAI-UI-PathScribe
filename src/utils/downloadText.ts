// src/utils/downloadText.ts
// Browser download of text already built by a service (a CSV or JSON export
// whose content, filename and media type the service decided). The generic
// counterpart of utils/csv.ts's downloadCsv and utils/downloadJson.ts.
export function downloadText(filename: string, content: string, mime: string): void {
  // Excel needs a byte-order mark to read a UTF-8 CSV's accents correctly.
  const body = mime.startsWith('text/csv') ? '﻿' + content : content;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
