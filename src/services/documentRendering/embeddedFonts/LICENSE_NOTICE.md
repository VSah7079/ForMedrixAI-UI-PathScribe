# Embedded font provenance — Liberation Sans (Regular + Bold)

Real, per PS-276 §1.1.1 gap-closing pass. This folder's two `.ts` files
carry the actual, real TrueType font program bytes (base64-encoded)
that `registerEmbeddedPrintFont.ts` embeds into every generated
cytology PDF via jsPDF's `addFileToVFS`/`addFont`.

## Source

- npm package: `@typopro/dtp-liberation@3.7.5`
- Files extracted: `TypoPRO-LiberationSans-Regular.ttf`,
  `TypoPRO-LiberationSans-Bold.ttf`
- Package's own declared license (per its `package.json`):
  `MIT AND Apache-2.0 AND OFL-1.1 AND CC0-1.0`

## Verified directly, not assumed

Each font file's own embedded `name` table was read directly with
`fontTools` before use:

- Family: `TypoPRO Liberation Sans` (Regular) / `TypoPRO Liberation
  Sans Bold` (Bold)
- License record (name ID 13): `Licensed under the SIL Open Font
  License, Version 1.1`

The SIL Open Font License, Version 1.1 explicitly permits embedding,
bundling, and redistribution of the font — including inside generated
documents — free of charge. Its one real restriction (the Reserved
Font Name clause) blocks redistributing a *modified* font under the
original name; this app embeds the font unmodified, so that clause
doesn't apply.

## Why Liberation Sans

Liberation Sans is a real, purpose-built, metrically-compatible,
freely embeddable replacement for Helvetica/Arial — chosen specifically
so this app's real, existing print layout (character widths jsPDF's
own `splitTextToSize()` measures against) doesn't shift meaningfully
from what the app was built and tested against while it used jsPDF's
non-embeddable built-in `'helvetica'`.

## Real, disclosed trade-off

`registerEmbeddedPrintFont.ts` embeds the FULL font program (jsPDF's
`WinAnsiEncoding` embedding path), never a subsetted one — there's no
font-subsetting tool in this project's own toolchain. This adds a
real, fixed ~180KB (Regular) / ~188KB (Bold) to every generated
cytology PDF's byte size. Accepted as a real, worthwhile trade-off:
PDF/A conformance requires embedding, and a full, real font program is
what "embedded" honestly means — subsetting to shrink this further is
real, separate, unstarted follow-up work.
