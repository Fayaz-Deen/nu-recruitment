import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import { buildEmailHtml } from '../utils/emailTemplate';
import { getCompanyContext } from '../utils/companyContext';

export const scheduleRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function scheduleLink(token: string): string {
  return `${FRONTEND_URL}/schedule/${token}`;
}

function mapSlot(row: Record<string, unknown>) {
  return {
    id:         row.id         as string,
    scheduleId: row.schedule_id as string,
    startTime:  row.start_time  as string,
    endTime:    row.end_time    as string,
    isBooked:   row.is_booked   as boolean,
    createdAt:  row.created_at  as string,
  };
}

// Auto-generate 4 slots: 2 morning + 2 evening across next 2 business days
function nextBusinessDay(from: Date, skip = 1): Date {
  const d = new Date(from);
  let added = 0;
  while (added < skip) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

async function insertDefaultSlots(scheduleId: string): Promise<void> {
  const day1 = nextBusinessDay(new Date(), 1);
  const day2 = nextBusinessDay(new Date(), 2);
  const slots = [
    { day: day1, hour: 10, min: 0  },
    { day: day1, hour: 11, min: 30 },
    { day: day2, hour: 15, min: 0  },
    { day: day2, hour: 16, min: 30 },
  ];
  for (const s of slots) {
    const start = new Date(s.day); start.setHours(s.hour, s.min, 0, 0);
    const end   = new Date(start); end.setMinutes(end.getMinutes() + 45);
    await db.query(
      'INSERT INTO interview_slots (schedule_id, start_time, end_time) VALUES ($1,$2,$3)',
      [scheduleId, start.toISOString(), end.toISOString()]
    );
  }
}

const initBodySchema = z.object({
  candidateId: z.string().uuid('candidateId must be a valid UUID'),
  jobId: z.string().uuid('jobId must be a valid UUID'),
  emailId: z.string().uuid().optional(),
  candidateName: z.string().max(200).optional(),
  jobTitle: z.string().max(300).optional(),
  candidateEmail: z.string().email().optional(),
});

// POST /api/schedule/init
// Called by frontend after sending an invitation email
scheduleRouter.post('/init', validate(initBodySchema), async (req: Request, res: Response) => {
  try {
    const { emailId, candidateId, jobId, candidateName, jobTitle, candidateEmail } =
      req.body as z.infer<typeof initBodySchema>;

    // Return existing schedule if already created for this email
    if (emailId) {
      const existing = await db.query(
        'SELECT * FROM interview_schedule WHERE email_id = $1 LIMIT 1',
        [emailId]
      );
      if (existing.rows[0]) {
        const slots = await db.query(
          'SELECT * FROM interview_slots WHERE schedule_id = $1 ORDER BY start_time ASC',
          [existing.rows[0].id]
        );
        return res.json({
          success: true,
          data: {
            ...existing.rows[0],
            slots: slots.rows.map(mapSlot),
            link: scheduleLink(existing.rows[0].token),
          },
        });
      }
    }

    // Expire previous pending schedules for this candidate+job — prevents duplicate reminders after re-draft
    // Confirmed schedules are never expired (candidate already booked a slot)
    const expired = await db.query(
      `UPDATE interview_schedule
       SET status = 'expired'
       WHERE candidate_id = $1
         AND job_id = $2
         AND status NOT IN ('confirmed', 'expired')
       RETURNING id`,
      [candidateId, jobId]
    );
    if (expired.rowCount && expired.rowCount > 0) {
      logger.info('Expired old schedules on re-draft', { candidateId, jobId, count: expired.rowCount });
    }

    const token = generateToken();
    const result = await db.query(
      `INSERT INTO interview_schedule
        (candidate_id, job_id, email_id, token, candidate_name, job_title, candidate_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [candidateId, jobId, emailId ?? null, token, candidateName ?? null, jobTitle ?? null, candidateEmail ?? null]
    );

    const schedule = result.rows[0];
    await insertDefaultSlots(schedule.id);

    const slots = await db.query(
      'SELECT * FROM interview_slots WHERE schedule_id = $1 ORDER BY start_time ASC',
      [schedule.id]
    );
    logger.info('Interview schedule created with 4 default slots', { scheduleId: schedule.id, candidateId, jobId });

    res.json({
      success: true,
      data: { ...schedule, slots: slots.rows.map(mapSlot), link: scheduleLink(token) },
    });
  } catch (error) {
    logger.error('Schedule init failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to create interview schedule' });
  }
});

// GET /api/schedule/by-email/:emailId
// Recruiter view: get schedule for a specific sent email (if exists)
scheduleRouter.get('/by-email/:emailId', async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;
    const result = await db.query(
      'SELECT * FROM interview_schedule WHERE email_id = $1 LIMIT 1',
      [emailId]
    );
    if (!result.rows[0]) {
      return res.json({ success: true, data: null });
    }
    const schedule = result.rows[0];
    const slots = await db.query(
      'SELECT * FROM interview_slots WHERE schedule_id = $1 ORDER BY start_time ASC',
      [schedule.id]
    );
    res.json({
      success: true,
      data: { ...schedule, slots: slots.rows.map(mapSlot), link: scheduleLink(schedule.token) },
    });
  } catch (error) {
    logger.error('Schedule fetch failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
});

// POST /api/schedule/slots
// Add a slot to a schedule
// Body: { scheduleId, startTime, endTime }
scheduleRouter.post('/slots', async (req: Request, res: Response) => {
  try {
    const { scheduleId, startTime, endTime } =
      req.body as { scheduleId?: string; startTime?: string; endTime?: string };

    if (!scheduleId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'scheduleId, startTime and endTime are required' });
    }

    const scheduleExists = await db.query('SELECT id FROM interview_schedule WHERE id = $1', [scheduleId]);
    if (!scheduleExists.rows[0]) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const result = await db.query(
      'INSERT INTO interview_slots (schedule_id, start_time, end_time) VALUES ($1,$2,$3) RETURNING *',
      [scheduleId, startTime, endTime]
    );

    res.json({ success: true, data: mapSlot(result.rows[0]) });
  } catch (error) {
    logger.error('Add slot failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to add slot' });
  }
});

// PUT /api/schedule/slots/:slotId
// Edit a slot
// Body: { startTime, endTime }
scheduleRouter.put('/slots/:slotId', async (req: Request, res: Response) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };

    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'startTime and endTime are required' });
    }

    const result = await db.query(
      'UPDATE interview_slots SET start_time = $1, end_time = $2 WHERE id = $3 AND is_booked = FALSE RETURNING *',
      [startTime, endTime, slotId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Slot not found or already booked' });
    }

    res.json({ success: true, data: mapSlot(result.rows[0]) });
  } catch (error) {
    logger.error('Edit slot failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to edit slot' });
  }
});

// DELETE /api/schedule/slots/:slotId
scheduleRouter.delete('/slots/:slotId', async (req: Request, res: Response) => {
  try {
    const { slotId } = req.params;
    const result = await db.query(
      'DELETE FROM interview_slots WHERE id = $1 AND is_booked = FALSE RETURNING id',
      [slotId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Slot not found or already booked' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete slot failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to delete slot' });
  }
});

// GET /api/schedule/public/:token
// Public endpoint — candidate view (no auth required)
scheduleRouter.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const result = await db.query(
      'SELECT * FROM interview_schedule WHERE token = $1 LIMIT 1',
      [token]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Scheduling link not found or expired' });
    }

    const schedule = result.rows[0];

    if (schedule.status === 'expired') {
      return res.json({ success: true, data: { scheduleId: schedule.id, candidateName: schedule.candidate_name, jobTitle: schedule.job_title, status: 'expired', slots: [], alreadyConfirmed: false, isUnavailable: true } });
    }

    if (schedule.status === 'confirmed') {
      return res.json({ success: true, data: { ...schedule, slots: [], alreadyConfirmed: true } });
    }

    const slots = await db.query(
      'SELECT * FROM interview_slots WHERE schedule_id = $1 AND is_booked = FALSE AND start_time > NOW() ORDER BY start_time ASC',
      [schedule.id]
    );

    res.json({
      success: true,
      data: {
        scheduleId: schedule.id,
        candidateName: schedule.candidate_name,
        jobTitle: schedule.job_title,
        status: schedule.status,
        slots: slots.rows.map(mapSlot),
        alreadyConfirmed: false,
      },
    });
  } catch (error) {
    logger.error('Public schedule fetch failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch scheduling page' });
  }
});

// GET /api/schedule/priority-actions
// Authenticated — returns priority action items for the dashboard
scheduleRouter.get('/priority-actions', async (_req: Request, res: Response) => {
  try {
    interface PriorityAction {
      type: 'upcoming_interview' | 'draft_jd' | 'manual_followup' | 'awaiting_email'
      priority: 'high' | 'medium' | 'low'
      title: string
      description: string
      meta: {
        candidateName?: string
        jobTitle?: string
        jobId?: string
        startTime?: string
        endTime?: string
        count?: number
      }
    }

    const actions: PriorityAction[] = []

    // 1. upcoming_interview (high): confirmed schedules with future slot
    const upcomingResult = await db.query<{
      candidate_name: string | null
      job_title: string | null
      job_id: string
      start_time: string
      end_time: string
    }>(
      `SELECT is2.candidate_name, is2.job_title, is2.job_id, sl.start_time, sl.end_time
       FROM interview_schedule is2
       JOIN interview_slots sl ON sl.id = is2.selected_slot_id
       WHERE is2.status = 'confirmed'
         AND sl.start_time > NOW()
       ORDER BY sl.start_time ASC`
    )

    for (const row of upcomingResult.rows) {
      actions.push({
        type: 'upcoming_interview',
        priority: 'high',
        title: `Interview: ${row.candidate_name ?? 'Candidate'}`,
        description: row.job_title ?? 'Role',
        meta: {
          candidateName: row.candidate_name ?? undefined,
          jobTitle: row.job_title ?? undefined,
          jobId: row.job_id,
          startTime: row.start_time,
          endTime: row.end_time,
        },
      })
    }

    // 2. draft_jd (medium): jobs with status='draft'
    const draftResult = await db.query<{ id: string; title: string }>(
      `SELECT id, title FROM jobs WHERE status = 'draft' ORDER BY created_at DESC`
    )

    if (draftResult.rows.length === 1) {
      const job = draftResult.rows[0]
      actions.push({
        type: 'draft_jd',
        priority: 'medium',
        title: job.title,
        description: 'Review and publish to start screening',
        meta: { jobId: job.id, jobTitle: job.title },
      })
    } else if (draftResult.rows.length > 1) {
      const n = draftResult.rows.length
      actions.push({
        type: 'draft_jd',
        priority: 'medium',
        title: `${n} Draft JDs`,
        description: 'Review and publish to start screening',
        meta: { count: n },
      })
    }

    // 3. manual_followup (low): schedules needing manual follow-up
    const followupResult = await db.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM interview_schedule WHERE status = 'needs_manual_followup'`
    )
    const followupCount = parseInt(followupResult.rows[0]?.cnt ?? '0', 10)
    if (followupCount > 0) {
      const s = followupCount === 1 ? '' : 's'
      actions.push({
        type: 'manual_followup',
        priority: 'low',
        title: `${followupCount} candidate${s} need manual scheduling`,
        description: 'No slot confirmed – reach out directly',
        meta: { count: followupCount },
      })
    }

    // 4. awaiting_email (low): candidates with evaluations but no sent email, grouped by job
    const awaitingResult = await db.query<{ job_id: string; job_title: string; cnt: string }>(
      `SELECT j.id AS job_id, j.title AS job_title, COUNT(DISTINCT e.candidate_id)::text AS cnt
       FROM jobs j
       JOIN evaluations e ON e.job_id = j.id
       WHERE NOT EXISTS (
         SELECT 1 FROM emails em
         WHERE em.candidate_id = e.candidate_id
           AND em.sent_at IS NOT NULL
       )
       GROUP BY j.id, j.title
       HAVING COUNT(DISTINCT e.candidate_id) > 0
       ORDER BY cnt DESC`
    )

    for (const row of awaitingResult.rows) {
      const n = parseInt(row.cnt, 10)
      const s = n === 1 ? '' : 's'
      actions.push({
        type: 'awaiting_email',
        priority: 'low',
        title: `Send emails for ${row.job_title}`,
        description: `${n} shortlisted candidate${s} awaiting communication`,
        meta: { jobId: row.job_id, jobTitle: row.job_title, count: n },
      })
    }

    // Sort: high → medium → low, then by startTime for interviews
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    actions.sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (pd !== 0) return pd
      // Within high priority, sort by startTime
      if (a.priority === 'high' && a.meta.startTime && b.meta.startTime) {
        return new Date(a.meta.startTime).getTime() - new Date(b.meta.startTime).getTime()
      }
      return 0
    })

    res.json({ success: true, data: actions })
  } catch (error) {
    logger.error('Priority actions fetch failed', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to fetch priority actions' })
  }
})

// POST /api/schedule/select
// Candidate selects a slot
// Body: { token, slotId }
scheduleRouter.post('/select', async (req: Request, res: Response) => {
  try {
    const { token, slotId } = req.body as { token?: string; slotId?: string };

    if (!token || !slotId) {
      return res.status(400).json({ success: false, error: 'token and slotId are required' });
    }

    const schedResult = await db.query(
      'SELECT * FROM interview_schedule WHERE token = $1 LIMIT 1',
      [token]
    );
    const schedule = schedResult.rows[0];

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    if (schedule.status === 'confirmed') {
      return res.status(409).json({ success: false, error: 'Interview already confirmed' });
    }
    if (schedule.status === 'expired') {
      return res.status(409).json({ success: false, error: 'This scheduling link has expired' });
    }

    // Candidate selected "None of these work"
    if (slotId === 'none') {
      await db.query(
        'UPDATE interview_schedule SET status = $1 WHERE id = $2',
        ['needs_manual_followup', schedule.id]
      );

      const recruiterEmailNone = process.env.SMTP_USER;
      if (recruiterEmailNone) {
        const noneCompany = await getCompanyContext();
        const noneBody =
`Hi ${noneCompany.recruiterName},

${schedule.candidate_name ?? 'A candidate'} was unable to find a suitable interview slot for the ${schedule.job_title ?? 'the role'} position and requires manual follow-up.

Candidate: ${schedule.candidate_name ?? 'N/A'}
Email: ${schedule.candidate_email ?? 'N/A'}
Role: ${schedule.job_title ?? 'N/A'}

Please reach out to arrange an alternative time.

Best regards,
${noneCompany.name} ATS`;
        await sendEmail(
          recruiterEmailNone,
          `Manual Follow-up Required — ${schedule.candidate_name ?? 'Candidate'} | ${schedule.job_title ?? 'Interview'}`,
          buildEmailHtml({ body: noneBody, company: noneCompany }),
        ).catch((err: Error) => logger.error('Recruiter none-notification failed', { error: err.message }));
      }

      logger.info('Candidate selected none — needs_manual_followup', { scheduleId: schedule.id });
      return res.json({
        success: true,
        data: { scheduleId: schedule.id, noneSelected: true, candidateName: schedule.candidate_name, jobTitle: schedule.job_title },
      });
    }

    const slotResult = await db.query(
      'SELECT * FROM interview_slots WHERE id = $1 AND schedule_id = $2 AND is_booked = FALSE',
      [slotId, schedule.id]
    );
    const slot = slotResult.rows[0];

    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not available' });
    }

    await db.query('UPDATE interview_slots SET is_booked = TRUE WHERE id = $1', [slotId]);
    await db.query(
      'UPDATE interview_schedule SET status = $1, selected_slot_id = $2 WHERE id = $3',
      ['confirmed', slotId, schedule.id]
    );

    // Resolve job title — fall back to jobs table when schedule.job_title was not stored
    const jobTitleRow = schedule.job_title
      ? null
      : await db.query('SELECT title FROM jobs WHERE id = $1', [schedule.job_id]);
    const jobTitle = schedule.job_title ?? jobTitleRow?.rows[0]?.title ?? 'the role';

    // Send confirmation email to candidate
    const company = await getCompanyContext();
    const slotDate = new Date(slot.start_time).toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });

    if (schedule.candidate_email) {
      const candidateBody =
`Dear ${schedule.candidate_name ?? 'Candidate'},

Congratulations! Your interview for the role of ${jobTitle} at ${company.name} has been confirmed. We look forward to speaking with you.

Our team will reach out shortly with further details — including the meeting link or venue — before your interview.

If you have any questions in the meantime, feel free to reply to this email.

Best regards,
${company.recruiterName}
${company.name} Recruitment Team`;

      const confirmationHtml = `
        <div style="margin:24px 0;padding:20px 24px;background:#eef0fa;border-left:4px solid #050766;border-radius:6px">
          <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#050766">&#10003;&nbsp; Interview Confirmed</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:600;white-space:nowrap;padding-right:12px">Date &amp; Time</td>
              <td style="padding:4px 0;font-size:13px;color:#111827;font-weight:700">${slotDate} IST</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:600;padding-right:12px">Role</td>
              <td style="padding:4px 0;font-size:13px;color:#111827">${jobTitle}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:600;padding-right:12px">Company</td>
              <td style="padding:4px 0;font-size:13px;color:#111827">${company.name}</td>
            </tr>
          </table>
        </div>`;

      const candidateHtml = buildEmailHtml({ body: candidateBody, schedulingHtml: confirmationHtml, company });
      await sendEmail(
        schedule.candidate_email,
        `Interview Confirmed — ${jobTitle} at ${company.name}`,
        candidateHtml,
      ).catch((err: Error) =>
        logger.error('Confirmation email failed (candidate)', { error: err.message })
      );
    }

    const recruiterEmail = process.env.SMTP_USER;
    if (recruiterEmail) {
      const recruiterBody =
`Hi ${company.recruiterName},

${schedule.candidate_name ?? 'A candidate'} has confirmed their interview slot for the ${jobTitle} role.

Candidate: ${schedule.candidate_name ?? 'N/A'}
Email: ${schedule.candidate_email ?? 'N/A'}
Date & Time: ${slotDate} IST
Role: ${jobTitle}

You can view the full schedule in the ATS dashboard.

Best regards,
${company.name} ATS`;

      const recruiterHtml = buildEmailHtml({ body: recruiterBody, company });
      await sendEmail(
        recruiterEmail,
        `Interview Confirmed — ${schedule.candidate_name ?? 'Candidate'} | ${jobTitle}`,
        recruiterHtml,
      ).catch((err: Error) => logger.error('Recruiter confirmation notification failed', { error: err.message }));
    }

    logger.info('Interview slot confirmed', {
      scheduleId: schedule.id,
      slotId,
      candidateName: schedule.candidate_name,
    });

    res.json({
      success: true,
      data: {
        scheduleId: schedule.id,
        slotId,
        startTime: slot.start_time,
        endTime: slot.end_time,
        candidateName: schedule.candidate_name,
        jobTitle,
      },
    });
  } catch (error) {
    logger.error('Slot selection failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to confirm slot' });
  }
});
