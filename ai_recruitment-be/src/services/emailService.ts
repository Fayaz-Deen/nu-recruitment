import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// Never log SMTP host/user/pass — only whether the transport is configured.
logger.info('SMTP transport', {
  configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
});
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Fail fast when SMTP is unreachable (e.g. Railway blocks outbound SMTP) —
  // nodemailer's 2-minute defaults left requests hanging past the client timeout.
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

export async function sendEmail(to: string, subject: string, body: string) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@example.com',
    to,
    subject,
    html: body.includes('<') ? body : body.replace(/\n/g, '<br/>'),
  });
}