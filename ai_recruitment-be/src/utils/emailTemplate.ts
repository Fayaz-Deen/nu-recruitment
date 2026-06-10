import { CompanyContext } from './companyContext';

function plainToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';

      const isSignature = /^(best|kind|warm|regards|sincerely|yours|thank|cheers)/i.test(lines[0]);
      const inner = lines.join('<br>');

      return isSignature
        ? `<p style="margin:28px 0 0;font-size:14px;color:#374151;line-height:1.7">${inner}</p>`
        : `<p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.7">${inner}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

export function buildEmailHtml(options: {
  body: string;
  schedulingHtml?: string;
  company: CompanyContext;
}): string {
  const { body, schedulingHtml = '', company } = options;
  const bodyHtml = plainToHtml(body);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif">

  <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td><![endif]-->

  <!-- Header -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#050766">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr>
            <td style="padding:24px 32px">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">${company.name}</p>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.72)">${company.tagline}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Body card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7">
    <tr>
      <td align="center" style="padding:28px 16px">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;
                      box-shadow:0 1px 4px rgba(0,0,0,0.08)">
          <tr>
            <td style="padding:36px 40px 32px">

              <!-- AI-generated body -->
              ${bodyHtml}

              <!-- Interview scheduling section (injected only for invitation emails) -->
              ${schedulingHtml}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:16px 16px 28px">
        <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif">
          ${company.name} &nbsp;&bull;&nbsp; ${company.contactEmail}
        </p>
        <p style="margin:6px 0 0;font-size:10px;color:#d1d5db;font-family:Arial,sans-serif">
          This email was sent by ${company.recruiterName} on behalf of ${company.name}.
        </p>
      </td>
    </tr>
  </table>

  <!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;
}
