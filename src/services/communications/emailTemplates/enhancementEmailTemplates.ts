/**
 * services/communications/emailTemplates/enhancementEmailTemplates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds email subjects and HTML/text bodies for enhancement requests
 * and QA / testing feedback submissions.
 * Outlook-safe: tables only, inline styles, no flexbox, no CSS variables.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { EnhancementRequestPayload } from '../../enhancementRequestService';

export function buildEnhancementSubject(payload: EnhancementRequestPayload): string {
  const tag      = payload.mode === 'qa' ? 'QA Feedback' : 'Enhancement Request';
  const priority = payload.priority ? ` [${payload.priority}]` : '';
  return `[pathscribe] ${tag}${priority} — ${payload.title}`;
}

export function buildEnhancementHtml(payload: EnhancementRequestPayload): string {
  const screenshotDataUrl = payload.screenshotDataUrl;
  const isQA       = payload.mode === 'qa';
  const accentHex  = isQA ? '#d97706' : '#0891b2';
  const tagLabel   = isQA ? 'QA / Testing Feedback' : 'Enhancement Request';
  const ts         = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const priority   = payload.priority ? ` &nbsp;|&nbsp; Priority: <strong>${payload.priority}</strong>` : '';

  const metaBlock = payload.metadata ? `
        <tr><td style="padding:0 0 4px 0;font-size:12px;color:#555555;font-family:Arial,sans-serif;">
          <strong>Submitted by:</strong> ${payload.metadata.userName} (${payload.metadata.userRole})
        </td></tr>
        <tr><td style="padding:0 0 4px 0;font-size:12px;color:#555555;font-family:Arial,sans-serif;">
          <strong>Page:</strong> ${payload.metadata.currentPage}${payload.metadata.caseSupportReference ? ` &nbsp;·&nbsp; <strong>Case support reference:</strong> ${payload.metadata.caseSupportReference}` : ''}
        </td></tr>
        <tr><td style="padding:0 0 4px 0;font-size:12px;color:#555555;font-family:Arial,sans-serif;">
          <strong>Browser:</strong> ${payload.metadata.browser} &nbsp;·&nbsp; ${payload.metadata.os} &nbsp;·&nbsp; v${payload.metadata.appVersion}
        </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
  <tr><td align="center" style="padding:32px 16px;">

    <table width="560" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">

      <!-- Header -->
      <tr>
        <td style="background-color:${accentHex};padding:20px 28px;border-radius:8px 8px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;font-weight:bold;color:#ffffff;font-family:Arial,sans-serif;">
              pathscribe <span style="font-size:11px;font-weight:normal;color:#e0f2fe;">AI</span>
            </td>
            <td align="right" style="font-size:11px;color:#e0f2fe;font-family:Arial,sans-serif;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
              ${tagLabel}
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- Category + Priority bar -->
      <tr>
        <td style="background-color:#f8fafc;padding:10px 28px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:12px;color:${accentHex};font-family:Arial,sans-serif;font-weight:bold;">
            ${payload.category}${priority}
          </span>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">

            <!-- Title -->
            <tr><td style="padding:0 0 16px 0;">
              <p style="margin:0;font-size:18px;font-weight:bold;color:#0f172a;font-family:Arial,sans-serif;line-height:1.3;">
                ${payload.title}
              </p>
            </td></tr>

            <!-- Description -->
            <tr><td style="padding:0 0 24px 0;border-bottom:1px solid #e2e8f0;">
              <p style="margin:0;font-size:14px;color:#475569;font-family:Arial,sans-serif;line-height:1.7;white-space:pre-wrap;">
                ${payload.description}
              </p>
            </td></tr>

            <!-- Metadata -->
            ${metaBlock ? `
            <tr><td style="padding:16px 0 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${metaBlock}
                <tr><td style="padding:8px 0 0 0;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">
                  ${ts}
                </td></tr>
              </table>
            </td></tr>` : `
            <tr><td style="padding:16px 0 0 0;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">
              ${ts}
            </td></tr>`}

          </table>
        </td>
      </tr>

      <!-- Screenshot (if captured) -->
      ${screenshotDataUrl ? `
      <tr><td style="padding:0 28px 20px;">
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Screen Capture</div>
        <img src="${screenshotDataUrl}" alt="Screen capture" style="width:100%;border-radius:6px;border:1px solid #e2e8f0;display:block;" />
        <div style="font-size:10px;color:#94a3b8;margin-top:4px;">PHI fields were auto-redacted before capture.</div>
      </td></tr>` : ''}

      <!-- Footer -->
      <tr>
        <td style="background-color:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">
            Sent via pathscribe AI &nbsp;·&nbsp; ${isQA ? 'QA team + admin notified' : 'Product team notified'}
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;
}

export function buildEnhancementText(payload: EnhancementRequestPayload): string {
  const isQA = payload.mode === 'qa';
  const tag  = isQA ? 'QA / Testing Feedback' : 'Enhancement Request';
  return [
    `pathscribe — ${tag}`,
    '='.repeat(40),
    '',
    `Title    : ${payload.title}`,
    `Category : ${payload.category}`,
    payload.priority ? `Priority : ${payload.priority}` : null,
    '',
    payload.description,
    '',
    payload.metadata ? [
      '---',
      `Submitted by : ${payload.metadata.userName} (${payload.metadata.userRole})`,
      `Page         : ${payload.metadata.currentPage}`,
      payload.metadata.caseSupportReference ? `Case ref     : ${payload.metadata.caseSupportReference}` : null,
      `Browser      : ${payload.metadata.browser} · ${payload.metadata.os}`,
      `Version      : ${payload.metadata.appVersion}`,
      `At           : ${new Date().toLocaleString()}`,
    ].filter(Boolean).join('\n') : `At: ${new Date().toLocaleString()}`,
  ].filter((l): l is string => l !== null).join('\n');
}
