import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// Railway blocks outbound SMTP (ports 25/465/587), so production sends go through
// Brevo's HTTP API (port 443) when BREVO_API_KEY is set. SMTP remains as the
// fallback for local dev where outbound SMTP works.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const brevoApiKey = process.env.BREVO_API_KEY;

// Never log SMTP host/user/pass or the API key — only which transport is configured.
logger.info('Email transport', {
  brevo: Boolean(brevoApiKey),
  smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Fail fast when SMTP is unreachable — nodemailer's 2-minute defaults left
  // requests hanging past the client timeout.
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@example.com';
}

function toHtml(body: string): string {
  return body.includes('<') ? body : body.replace(/\n/g, '<br/>');
}

async function sendViaBrevo(to: string, subject: string, html: string) {
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey as string,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromAddress(), name: process.env.EMAIL_FROM_NAME ?? 'NULogic Recruitment' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function sendEmail(to: string, subject: string, body: string) {
  const html = toHtml(body);

  if (brevoApiKey) {
    return sendViaBrevo(to, subject, html);
  }

  return transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
  });
}
