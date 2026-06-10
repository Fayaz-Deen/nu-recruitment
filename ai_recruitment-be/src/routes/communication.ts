import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { draftCandidateEmail } from '../agents/communicationAgent';
import { db } from '../utils/db';
import { getCompanyContext } from '../utils/companyContext';
import { buildEmailHtml } from '../utils/emailTemplate';
import { logger } from '../utils/logger';
import { cleanCandidateName } from '../utils/nameUtils';
import { sendEmail } from '../services/emailService';
import { extractCandidateName } from '../services/resumeParser';

export const communicationRouter = Router();

function nextBusinessDay(from: Date, skip = 1): Date {
  const d = new Date(from);
  let added = 0;
  while (added < skip) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function generateFutureSlots(count = 4): Array<{ start: Date; end: Date }> {
  const PREFERRED_TIMES = [
    { hour: 10, min: 0  },
    { hour: 11, min: 30 },
    { hour: 15, min: 0  },
    { hour: 16, min: 30 },
  ];
  const DURATION_MIN = 45;
  const earliest     = new Date(Date.now() + 60 * 60 * 1000); // at least 1h from now

  const slots: Array<{ start: Date; end: Date }> = [];
  let offset = 0;

  while (slots.length < count) {
    offset++;
    const day = nextBusinessDay(new Date(), offset);

    for (const t of PREFERRED_TIMES) {
      if (slots.length >= count) break;
      const start = new Date(day);
      start.setHours(t.hour, t.min, 0, 0);
      if (start > earliest) {
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + DURATION_MIN);
        slots.push({ start, end });
      }
    }
  }

  return slots;
}

async function initScheduleForEmail(
  emailId: string, candidateId: string, jobId: string,
  candidateName: string, jobTitle: string | null, candidateEmail: string | null,
): Promise<void> {
  // Expire previous pending schedules for this candidate+job (keep confirmed ones)
  await db.query(
    `UPDATE interview_schedule SET status = 'expired'
     WHERE candidate_id = $1 AND job_id = $2 AND status NOT IN ('confirmed', 'expired')`,
    [candidateId, jobId],
  );

  const token = crypto.randomBytes(32).toString('hex');
  const result = await db.query(
    `INSERT INTO interview_schedule (candidate_id, job_id, email_id, token, candidate_name, job_title, candidate_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [candidateId, jobId, emailId, token, candidateName, jobTitle, candidateEmail],
  );
  const scheduleId = result.rows[0].id;

  for (const s of generateFutureSlots(4)) {
    await db.query(
      'INSERT INTO interview_slots (schedule_id, start_time, end_time) VALUES ($1,$2,$3)',
      [scheduleId, s.start.toISOString(), s.end.toISOString()],
    );
  }
  logger.info('Auto-created interview schedule at draft time', { scheduleId, emailId, candidateId });
}

const JD_SELECT = `
  SELECT id, title,
    company_overview        AS "companyOverview",
    role_overview           AS "roleOverview",
    responsibilities,
    required_qualifications AS "requiredQualifications",
    nice_to_haves           AS "niceToHaves",
    benefits, status,
    created_at              AS "createdAt"
  FROM jobs WHERE id = $1`;

const EVAL_SELECT = `
  SELECT
    candidate_id             AS "candidateId",
    job_id                   AS "jobId",
    total_score              AS "totalScore",
    match_percentage         AS "matchPercentage",
    category_scores          AS "categoryScores",
    strengths, concerns, reasoning, recommendation,
    suggested_interview_focus AS "suggestedInterviewFocus",
    evaluated_at             AS "evaluatedAt"
  FROM evaluations
  WHERE candidate_id = $1 AND job_id = $2
  ORDER BY evaluated_at DESC LIMIT 1`;

// POST /api/communication/draft
// Body: { jobId, candidateId }
communicationRouter.post('/draft', async (req: Request, res: Response) => {
  try {
    const { jobId, candidateId } = req.body as { jobId?: string; candidateId?: string };

    if (!jobId || !candidateId) {
      return res.status(400).json({ success: false, error: 'jobId and candidateId are required' });
    }

    const [jdResult, evalResult, candidateResult] = await Promise.all([
      db.query(JD_SELECT, [jobId]),
      db.query(EVAL_SELECT, [candidateId, jobId]),
      db.query('SELECT file_name AS "fileName", raw_text AS "rawText", email FROM candidates WHERE id = $1', [candidateId]),
    ]);

    if (!jdResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (!evalResult.rows[0]) {
      return res.status(404).json({
        success: false,
        error: 'No screening evaluation found for this candidate. Screen the resume first.',
      });
    }

    const jd = jdResult.rows[0];
    const evaluation = evalResult.rows[0];
    const rawText = candidateResult.rows[0]?.rawText ?? '';
    const rawFileName = candidateResult.rows[0]?.fileName ?? '';
    const extractedEmail: string | null = candidateResult.rows[0]?.email ?? null;

    const extractedName = await extractCandidateName(rawText);
    logger.info('Extracted contact from resume', { extractedName, extractedEmail, candidateId });
    const candidateName = extractedName !== 'Candidate' ? extractedName : cleanCandidateName(rawFileName);

    // emailType determined by backend based on score — frontend never decides this
    const emailType: 'invitation' | 'rejection' =
      evaluation.matchPercentage >= 65 ? 'invitation' : 'rejection';

    logger.info('Communication Agent: drafting', { emailType, candidateId, score: evaluation.matchPercentage });

    const company = await getCompanyContext();
    const email = await draftCandidateEmail(emailType, jd, evaluation, candidateName, company);

    const insertResult = await db.query(
      'INSERT INTO emails (candidate_id, type, subject, body, email, candidate_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [candidateId, emailType, email.subject, email.body, extractedEmail, candidateName]
    );
    const emailId: string = insertResult.rows[0].id;

    // Auto-create schedule with default slots so the slot block is ready when the email is sent
    if (emailType === 'invitation') {
      await initScheduleForEmail(emailId, candidateId, jobId, candidateName, jd.title ?? null, extractedEmail);
    }

    res.json({
      success: true,
      data: {
        emailId,
        candidateId,
        candidateName,
        extractedEmail,
        emailType,
        subject: email.subject,
        body: email.body,
        generatedAt: email.generatedAt,
      },
    });
  } catch (error) {
    logger.error('Email draft failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to draft email' });
  }
});

// GET /api/communication/list?jobId=
communicationRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ success: false, error: 'jobId query param is required' });
    }

    const result = await db.query(
      `SELECT
        em.id              AS "emailId",
        em.candidate_id    AS "candidateId",
        em.type            AS "emailType",
        em.subject,
        em.body,
        em.email           AS "candidateEmail",
        em.candidate_name  AS "candidateName",
        em.generated_at    AS "generatedAt",
        em.sent_at         AS "sentAt",
        em.last_sent_at    AS "lastSentAt",
        em.resend_count    AS "resendCount",
        sched.status       AS "scheduleStatus",
        slot.start_time    AS "scheduledSlotStart",
        slot.end_time      AS "scheduledSlotEnd"
       FROM emails em
       LEFT JOIN LATERAL (
         SELECT id, status, selected_slot_id
         FROM interview_schedule
         WHERE candidate_id = em.candidate_id
         ORDER BY
           CASE status WHEN 'expired' THEN 1 ELSE 0 END ASC,
           created_at DESC
         LIMIT 1
       ) sched ON TRUE
       LEFT JOIN interview_slots slot ON slot.id = sched.selected_slot_id
       WHERE em.candidate_id IN (
         SELECT candidate_id FROM evaluations WHERE job_id = $1
       )
       ORDER BY em.generated_at DESC`,
      [jobId]
    );

    const emails = result.rows;

    res.json({ success: true, data: emails });
  } catch (error) {
    logger.error('Email list failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch emails' });
  }
});

// POST /api/communication/send
// Body: { emailId, recipientEmail?, subject?, body? }
// subject/body overrides let the UI send edited content without a round-trip save
communicationRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const { emailId, recipientEmail, subject: subjectOverride, body: bodyOverride } =
      req.body as { emailId?: string; recipientEmail?: string; subject?: string; body?: string };

    if (!emailId) {
      return res.status(400).json({ success: false, error: 'emailId is required' });
    }

    const emailResult = await db.query(
      'SELECT id, candidate_id AS "candidateId", type, subject, body, email, sent_at AS "sentAt" FROM emails WHERE id = $1',
      [emailId]
    );

    const email = emailResult.rows[0];
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email draft not found' });
    }

    if (email.sentAt) {
      return res.status(409).json({ success: false, error: 'Email has already been sent' });
    }

    // Guard against duplicate sends when multiple drafts exist for the same candidate (e.g. after a re-draft)
    if (email.type === 'invitation') {
      const alreadySent = await db.query(
        `SELECT id FROM emails WHERE candidate_id = $1 AND type = 'invitation' AND sent_at IS NOT NULL AND id != $2 LIMIT 1`,
        [email.candidateId, emailId]
      );
      if (alreadySent.rows[0]) {
        return res.status(409).json({ success: false, error: 'An invitation has already been sent to this candidate' });
      }
    }

    const toAddress = recipientEmail ?? email.email;
    if (!toAddress) {
      return res.status(400).json({ success: false, error: 'recipientEmail is required (no email stored for this draft)' });
    }

    const finalSubject  = subjectOverride ?? email.subject;
    const aiBodyText    = bodyOverride    ?? email.body;
    const company       = await getCompanyContext();

    // Build scheduling section HTML for invitation emails
    let schedulingHtml = '';
    if (email.type === 'invitation') {
      const schedResult = await db.query(
        'SELECT token, status FROM interview_schedule WHERE email_id = $1 LIMIT 1',
        [emailId]
      );
      if (schedResult.rows[0] && schedResult.rows[0].status !== 'confirmed') {
        const schedToken = schedResult.rows[0].token;
        const link = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/schedule/${schedToken}`;

        const slotsResult = await db.query(
          `SELECT s.start_time, s.end_time
           FROM interview_slots s
           JOIN interview_schedule is2 ON is2.id = s.schedule_id
           WHERE is2.token = $1 AND s.is_booked = FALSE
           ORDER BY s.start_time ASC`,
          [schedToken]
        );

        const slotItems = slotsResult.rows.map((sl: { start_time: string; end_time: string }) => {
          const start = new Date(sl.start_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          const end   = new Date(sl.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return `<tr>
            <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6">
              &#8226; ${start} – ${end}
            </td>
          </tr>`;
        }).join('');

        schedulingHtml = `
          <div style="margin:28px 0 0;padding:24px;background:#f7f8fc;border-left:4px solid #050766;border-radius:6px">
            <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#050766">Interview Scheduling</p>
            <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Please select one of the available interview slots below:</p>
            ${slotItems
              ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">${slotItems}</table>`
              : `<p style="margin:0 0 16px;font-size:13px;color:#6b7280">Please use the link below to view available slots.</p>`
            }
            <p style="margin:16px 0 0">
              <a href="${link}"
                 style="display:inline-block;padding:11px 24px;background:#050766;color:#ffffff;
                        border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;
                        font-family:Arial,sans-serif">
                Select Interview Slot
              </a>
            </p>
            <p style="margin:10px 0 0;font-size:11px;color:#9ca3af">
              Can't click the button? Copy this link: <a href="${link}" style="color:#050766">${link}</a>
            </p>
            <p style="margin:10px 0 0;font-size:12px;color:#6b7280">
              If none of these times work for you, select <strong>"None of These Work"</strong> on the scheduling page
              and our team will reach out to find a suitable time.
            </p>
          </div>`;
      }
    }

    const htmlBody = buildEmailHtml({ body: aiBodyText, schedulingHtml, company });
    await sendEmail(toAddress, finalSubject, htmlBody);
    await db.query('UPDATE emails SET sent_at = NOW() WHERE id = $1', [emailId]);

    logger.info('Communication Agent: email sent', {
      emailId,
      candidateId: email.candidateId,
      emailType: email.type,
    });

    res.json({
      success: true,
      data: { emailId, candidateId: email.candidateId, emailType: email.type, sentAt: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Email send failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});