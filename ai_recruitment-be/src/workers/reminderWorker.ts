import { db } from '../utils/db';
import { sendEmail } from '../services/emailService';
import { buildEmailHtml } from '../utils/emailTemplate';
import { getCompanyContext } from '../utils/companyContext';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/cache';

const MODE           = process.env.REMINDER_MODE ?? 'PROD';
const FIRST_MIN      = parseInt(process.env.REMINDER_FIRST_DELAY_MIN  ?? (MODE === 'TEST' ? '1'    : '1440'), 10);
const FINAL_MIN      = parseInt(process.env.REMINDER_FINAL_DELAY_MIN  ?? (MODE === 'TEST' ? '2'    : '2160'), 10);
const EXPIRY_MIN     = parseInt(process.env.SCHEDULE_EXPIRY_MIN        ?? (MODE === 'TEST' ? '3'    : '30'),   10);
const CHECK_INTERVAL = MODE === 'TEST' ? 30_000 : 5 * 60 * 1000;

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function slotLink(token: string): string {
  return `${FRONTEND_URL}/schedule/${token}`;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function formatExpiry(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

async function resolveJobTitle(scheduleJobTitle: string | null, jobId: string): Promise<string> {
  if (scheduleJobTitle) return scheduleJobTitle;
  const r = await db.query('SELECT title FROM jobs WHERE id = $1', [jobId]);
  return r.rows[0]?.title ?? 'the role';
}

function buildSlotItems(rows: { start_time: string; end_time: string }[]): string {
  return rows.map(sl => {
    const start = new Date(sl.start_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const end   = new Date(sl.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `<p style="margin:2px 0;font-size:13px;color:#222">• ${start} – ${end}</p>`;
  }).join('');
}

function buildReminderParts(
  name: string,
  intro: string,
  slotItems: string,
  link: string,
  recruiterName: string,
  companyName: string,
  expiryWarning?: string,
): { body: string; schedulingHtml: string } {
  const expiryNote = expiryWarning
    ? `<p style="margin:12px 0 0;font-size:12px;color:#b91c1c;font-weight:600">⚠ ${expiryWarning}</p>`
    : '';

  const body =
`Hi ${name},

We hope you're doing well.

${intro}

Best regards,
${recruiterName}
${companyName} Recruitment Team`;

  const schedulingHtml = `
    <div style="margin:24px 0;padding:20px 24px;background:#f7f8fc;border-left:4px solid #050766;border-radius:6px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#050766">Interview Scheduling</p>
      <p style="margin:0 0 14px;font-size:13px;color:#6b7280">Please select one of the available interview slots below:</p>
      ${slotItems || '<p style="margin:0 0 14px;font-size:13px;color:#6b7280">Please use the link below to view available slots.</p>'}
      <p style="margin:16px 0 0">
        <a href="${link}" style="display:inline-block;padding:11px 24px;background:#050766;color:#ffffff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;font-family:Arial,sans-serif">Select Interview Slot</a>
      </p>
      <p style="margin:10px 0 0;font-size:11px;color:#9ca3af">Can't click the button? Copy this link: <a href="${link}" style="color:#050766">${link}</a></p>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280">If none of these times work for you, select <strong>"None of These Work"</strong> on the scheduling page and our team will reach out to find a suitable time.</p>
      ${expiryNote}
    </div>`;

  return { body, schedulingHtml };
}

async function runReminders(): Promise<void> {
  try {
    const company = await getCompanyContext();

    // ── FIRST REMINDER ────────────────────────────────────────────────────────
    // Clock starts from when the invitation email was SENT (not schedule created_at)
    const firstBatch = await db.query(
      `SELECT s.* FROM interview_schedule s
       JOIN emails e ON e.id = s.email_id
       WHERE s.status = 'pending'
         AND s.reminder_1_sent_at IS NULL
         AND e.sent_at IS NOT NULL
         AND e.sent_at <= $1`,
      [minutesAgo(FIRST_MIN)]
    );

    for (const s of firstBatch.rows) {
      try {
        if (s.candidate_email) {
          const jobTitle = await resolveJobTitle(s.job_title, s.job_id);

          const slotsResult = await db.query(
            'SELECT start_time, end_time FROM interview_slots WHERE schedule_id = $1 AND is_booked = FALSE ORDER BY start_time ASC',
            [s.id]
          );

          const { body, schedulingHtml } = buildReminderParts(
            s.candidate_name ?? 'there',
            `This is a friendly reminder to select your interview slot for <strong>${jobTitle}</strong> at ${company.name}. We're excited to continue the conversation with you.`,
            buildSlotItems(slotsResult.rows),
            slotLink(s.token),
            company.recruiterName,
            company.name,
          );

          await sendEmail(
            s.candidate_email,
            `Reminder: Select Your Interview Slot — ${jobTitle} at ${company.name}`,
            buildEmailHtml({ body, schedulingHtml, company }),
          );
        }

        await db.query(
          `UPDATE interview_schedule SET status = 'pending_reminder_1', reminder_1_sent_at = NOW() WHERE id = $1`,
          [s.id]
        );

        logger.info('Reminder 1 sent', { scheduleId: s.id, candidateName: s.candidate_name });
      } catch (err) {
        logger.error('Reminder 1 failed for schedule', {
          scheduleId: s.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── FINAL REMINDER ────────────────────────────────────────────────────────
    const finalBatch = await db.query(
      `SELECT s.* FROM interview_schedule s
       JOIN emails e ON e.id = s.email_id
       WHERE s.status = 'pending_reminder_1'
         AND s.reminder_1_sent_at <= $1
         AND s.reminder_2_sent_at IS NULL
         AND e.sent_at IS NOT NULL`,
      [minutesAgo(FINAL_MIN)]
    );

    for (const s of finalBatch.rows) {
      try {
        if (s.candidate_email) {
          const jobTitle = await resolveJobTitle(s.job_title, s.job_id);

          const slotsResult = await db.query(
            'SELECT start_time, end_time FROM interview_slots WHERE schedule_id = $1 AND is_booked = FALSE ORDER BY start_time ASC',
            [s.id]
          );

          const { body, schedulingHtml } = buildReminderParts(
            s.candidate_name ?? 'there',
            `This is your <strong>final reminder</strong> to select your interview slot for <strong>${jobTitle}</strong> at ${company.name}.`,
            buildSlotItems(slotsResult.rows),
            slotLink(s.token),
            company.recruiterName,
            company.name,
            `This link will expire in ${formatExpiry(EXPIRY_MIN)}. Please respond before it expires.`,
          );

          await sendEmail(
            s.candidate_email,
            `Final Reminder: Select Your Interview Slot — ${jobTitle} at ${company.name}`,
            buildEmailHtml({ body, schedulingHtml, company }),
          );
        }

        await db.query(
          `UPDATE interview_schedule SET status = 'needs_manual_followup', reminder_2_sent_at = NOW() WHERE id = $1`,
          [s.id]
        );

        logger.info('Final reminder sent, marked needs_manual_followup', {
          scheduleId: s.id,
          candidateName: s.candidate_name,
        });
      } catch (err) {
        logger.error('Final reminder failed for schedule', {
          scheduleId: s.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── EXPIRY PASS ───────────────────────────────────────────────────────────
    // Candidates who didn't respond within EXPIRY_MIN after the final reminder
    const expiryBatch = await db.query(
      `SELECT id, candidate_name FROM interview_schedule
       WHERE status = 'needs_manual_followup'
         AND reminder_2_sent_at IS NOT NULL
         AND reminder_2_sent_at <= $1`,
      [minutesAgo(EXPIRY_MIN)]
    );

    for (const s of expiryBatch.rows) {
      try {
        await db.query(
          `UPDATE interview_schedule SET status = 'expired' WHERE id = $1`,
          [s.id]
        );
        logger.info('Schedule expired — no response after final reminder', {
          scheduleId: s.id,
          candidateName: s.candidate_name,
        });
      } catch (err) {
        logger.error('Expiry transition failed', {
          scheduleId: s.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

  } catch (err) {
    logger.error('Reminder worker run failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Redis singleton lock — only one worker runs across all server processes ────
const LOCK_KEY = 'reminder_worker:leader';
const LOCK_TTL = Math.ceil(CHECK_INTERVAL / 1000) + 60; // interval + 60s buffer

// Fail CLOSED: without Redis we cannot guarantee a single leader, and running
// the loop on every instance would send candidates duplicate reminder emails.
// Single-instance deployments can opt out with REMINDER_ALLOW_NO_REDIS=true.
const ALLOW_NO_REDIS = process.env.REMINDER_ALLOW_NO_REDIS === 'true';

// Unique per-process identity so a leader can recognise (and renew) its own lock.
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

async function acquireLock(): Promise<boolean> {
  try {
    const result = await redisClient.set(LOCK_KEY, INSTANCE_ID, { NX: true, EX: LOCK_TTL });
    if (result === 'OK') return true;
    // Lock exists — we are still leader if it's ours (renew handled by refreshLock).
    const holder = await redisClient.get(LOCK_KEY);
    return holder === INSTANCE_ID;
  } catch (err) {
    if (ALLOW_NO_REDIS) {
      logger.warn('Reminder worker: Redis unavailable, REMINDER_ALLOW_NO_REDIS=true — running without leader lock');
      return true;
    }
    logger.error('Reminder worker: Redis unavailable — skipping this cycle to avoid duplicate reminders', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function refreshLock(): Promise<void> {
  try { await redisClient.expire(LOCK_KEY, LOCK_TTL); } catch { /* ignore */ }
}

let workerTimer: NodeJS.Timeout | null = null;

export async function startReminderWorker(): Promise<void> {
  logger.info(`Reminder worker started [MODE=${MODE}, first=${FIRST_MIN}min, final=${FINAL_MIN}min, expiry=${EXPIRY_MIN}min, interval=${CHECK_INTERVAL / 1000}s]`);
  workerTimer = setInterval(async () => {
    // Re-attempt leadership every cycle so a surviving instance takes over
    // when the previous leader dies, and so Redis outages skip cleanly.
    const isLeader = await acquireLock();
    if (!isLeader) return;
    await refreshLock();
    await runReminders();
  }, CHECK_INTERVAL);
}

export function stopReminderWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('Reminder worker stopped');
  }
}
