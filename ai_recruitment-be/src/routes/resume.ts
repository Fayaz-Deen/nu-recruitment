import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { cleanCandidateName } from '../utils/nameUtils';
import path from 'path';
import fs from 'fs';
import { parseResume, stripPIIWithReport, extractEmail } from '../services/resumeParser';
import { screenResumes } from '../agents/resumeScreener';
import { db } from '../utils/db';
import { getCompanyContext } from '../utils/companyContext';
import { cacheSet, cacheGet } from '../utils/cache';
import { JobDescription, CandidateEvaluation, BiasFlag, DuplicateMatch } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { generateSecureToken } from '../services/authService';
import { sendEmail } from '../services/emailService';
import { getTemplate, renderTemplate } from './emailTemplates';
import { AuthRequest } from '../middleware/auth';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export const resumeRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported: ${ext}`));
  },
});

const uploadBodySchema = z.object({
  jobId: z.string().uuid('jobId must be a valid UUID').optional().or(z.literal('').transform(() => undefined)),
});

// POST /api/resume/upload
resumeRouter.post('/upload', upload.array('resumes', 100), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    const parsedBody = uploadBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ success: false, error: parsedBody.error.errors[0]?.message ?? 'Invalid jobId' });
    }
    const { jobId } = parsedBody.data;

    if (!files?.length) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const parsed = await Promise.all(
      files.map(async (file) => {
        let text: string;
        try {
          text = await parseResume(file.path);
        } finally {
          // The parsed text is persisted in Postgres; the raw file on local disk
          // is ephemeral on Railway and would otherwise accumulate PII forever.
          fs.promises.unlink(file.path).catch((unlinkErr) =>
            logger.warn('Failed to remove uploaded file after parsing', {
              file: file.filename,
              error: unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr),
            }),
          );
        }
        const candidateEmail = extractEmail(text);

        let cleanText: string;
        let piiReport = { emails: [] as string[], phones: [] as string[], linkedins: [] as string[], githubs: [] as string[] };
        try {
          const stripped = stripPIIWithReport(text);
          cleanText = stripped.cleanText;
          piiReport = stripped.report;
        } catch (stripErr) {
          logger.error('PII stripping failed, saving raw text', {
            file: file.originalname,
            error: stripErr instanceof Error ? stripErr.message : String(stripErr),
          });
          cleanText = text;
        }

        const candidateId = uuidv4();

        const inserted = await db.query<{ uploadedAt: Date }>(
          'INSERT INTO candidates (id, job_id, file_name, raw_text, email, pii_report) VALUES ($1,$2,$3,$4,$5,$6) RETURNING uploaded_at AS "uploadedAt"',
          [candidateId, jobId || null, file.originalname, cleanText, candidateEmail, JSON.stringify(piiReport)]
        );
        const uploadedAt: string = (inserted.rows[0]?.uploadedAt ?? new Date()).toISOString();

        await cacheSet(`resume:${candidateId}`, cleanText, 3600);

        return { id: candidateId, fileName: file.originalname, piiReport, uploadedAt };
      })
    );

    // Duplicate detection — check newly uploaded candidates against pre-existing ones
    const newIds = parsed.map((p) => p.id);
    let duplicates: DuplicateMatch[] = [];
    try {
      const dupResult = await db.query<DuplicateMatch>(
        `SELECT c1.id AS "newCandidateId", c2.id AS "existingId",
                c2.file_name AS "existingFileName", j.title AS "existingJobTitle",
                'email' AS "matchType"
         FROM candidates c1
         JOIN candidates c2
           ON c2.email = c1.email AND c2.email IS NOT NULL AND c2.id != c1.id
              AND NOT (c2.id = ANY($1::uuid[]))
         LEFT JOIN jobs j ON j.id = c2.job_id
         WHERE c1.id = ANY($1::uuid[])

         UNION

         SELECT c1.id AS "newCandidateId", c2.id AS "existingId",
                c2.file_name AS "existingFileName", j.title AS "existingJobTitle",
                'name' AS "matchType"
         FROM candidates c1
         JOIN candidates c2
           ON similarity(
                regexp_replace(lower(c1.file_name), '\\.[^.]+$', ''),
                regexp_replace(lower(c2.file_name), '\\.[^.]+$', '')
              ) > 0.5
              AND c2.id != c1.id
              AND NOT (c2.id = ANY($1::uuid[]))
              AND (c2.email IS NULL OR c2.email != c1.email)
         LEFT JOIN jobs j ON j.id = c2.job_id
         WHERE c1.id = ANY($1::uuid[])`,
        [newIds],
      );
      duplicates = dupResult.rows;
    } catch (dupErr) {
      // pg_trgm may not be installed yet — log and continue gracefully
      logger.warn('Duplicate detection skipped', { err: dupErr instanceof Error ? dupErr.message : String(dupErr) });
    }

    res.json({ success: true, data: { count: parsed.length, candidates: parsed, duplicates } });
  } catch (error) {
    logger.error('Upload failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to upload resumes' });
  }
});

// GET /api/resume/results?jobId=
resumeRouter.get('/results', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ success: false, error: 'jobId query param is required' });
    }

    const result = await db.query(
      `SELECT
        e.candidate_id              AS "candidateId",
        e.job_id                    AS "jobId",
        e.total_score               AS "totalScore",
        e.match_percentage          AS "matchPercentage",
        e.category_scores           AS "categoryScores",
        e.strengths,
        e.concerns,
        e.reasoning,
        e.recommendation,
        e.suggested_interview_focus AS "suggestedInterviewFocus",
        e.evaluated_at              AS "evaluatedAt",
        e.skills_gap                AS "skillsGap",
        e.confidence_score          AS "confidenceScore",
        e.confidence_reason         AS "confidenceReason",
        e.bias_flags                AS "biasFlags",
        c.file_name                 AS "fileName",
        c.pii_report                AS "piiReport",
        c.uploaded_at               AS "uploadedAt",
        c.interest_status           AS "interestStatus",
        c.interest_checked_at       AS "interestCheckedAt"
       FROM evaluations e
       JOIN candidates c ON c.id = e.candidate_id
       WHERE e.job_id = $1
       ORDER BY e.match_percentage DESC`,
      [jobId]
    );

    const rows = result.rows.map((row) => ({
      ...row,
      fileName: cleanCandidateName(row.fileName),
    }));
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Resume results fetch failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
});

// ── Bias detection ────────────────────────────────────────────────────────────
// Runs purely on the evaluated batch — no AI call needed.
// Flags: statistical score outliers (|z| > 2 on batches ≥ 3) and demographic
// language that shouldn't appear given the AI was instructed to ignore it.
const DEMOGRAPHIC_PATTERN = /\b(he|she|his|her|him|young|old|age\s+\d+|\d+\s+years?\s+old|foreign|native\s+speaker|nationality|religious|faith|pregnant|disability)\b/gi;

function detectBias(evaluations: CandidateEvaluation[]): Record<string, BiasFlag[]> {
  const result: Record<string, BiasFlag[]> = {};
  if (evaluations.length < 3) return result;

  const scores = evaluations.map((e) => e.totalScore);
  const mean   = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stddev = Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length);

  for (const ev of evaluations) {
    const flags: BiasFlag[] = [];

    if (stddev > 8) {
      const z = (ev.totalScore - mean) / stddev;
      if (Math.abs(z) > 2.0) {
        flags.push({
          type: 'score_outlier',
          description: `Score ${ev.totalScore} deviates significantly from batch mean (${mean.toFixed(0)} ± ${stddev.toFixed(0)}) — verify manually`,
          severity: 'warning',
        });
      }
    }

    const terms = ev.reasoning.match(DEMOGRAPHIC_PATTERN);
    if (terms) {
      const unique = [...new Set(terms.map((t) => t.toLowerCase()))];
      flags.push({
        type: 'language_flag',
        description: `Demographic language detected in AI assessment: ${unique.map((t) => `"${t}"`).join(', ')} — review for bias`,
        severity: 'warning',
      });
    }

    result[ev.candidateId] = flags;
  }

  return result;
}

const screenBodySchema = z.object({
  jd: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(300),
  }).passthrough(),
  candidateIds: z.array(z.string().uuid()).min(1, 'At least one candidate is required').max(100),
});

// POST /api/resume/screen
resumeRouter.post('/screen', validate(screenBodySchema), async (req: Request, res: Response) => {
  try {
    const { jd, candidateIds } = req.body as { jd: JobDescription; candidateIds: string[] };

    type ResumeEntry = { id: string; text: string | null };

    const resumes: ResumeEntry[] = await Promise.all(
      candidateIds.map(async (id): Promise<ResumeEntry> => {
        let text: string | null = await cacheGet(`resume:${id}`);
        if (!text) {
          const result = await db.query('SELECT raw_text FROM candidates WHERE id=$1', [id]);
          text = result.rows[0]?.raw_text ?? null;
        }
        return { id, text };
      })
    );

    const missing = resumes.filter((r) => !r.text);
    if (missing.length > 0) {
      logger.warn('Resume text missing at screening time', { missingIds: missing.map((r) => r.id) });
      return res.status(400).json({
        success: false,
        error: `Resume text not found for candidate ${missing[0].id} — please re-upload`,
      });
    }

    logger.info('Starting screening', {
      jobId: jd.id,
      jdTitle: jd.title,
      candidateCount: candidateIds.length,
      qualificationsCount: jd.requiredQualifications?.length ?? 0,
    });

    const company     = await getCompanyContext();
    const evaluations = await screenResumes(resumes as { id: string; text: string }[], jd, company);

    // Run bias detection on the full batch before persisting
    const biasFlagMap = detectBias(evaluations);
    const evaluationsWithFlags = evaluations.map((ev) => ({
      ...ev,
      biasFlags: biasFlagMap[ev.candidateId] ?? [],
    }));

    await Promise.all(
      evaluationsWithFlags.map((ev) =>
        db.query(
          `INSERT INTO evaluations
            (candidate_id, job_id, total_score, match_percentage, category_scores,
             strengths, concerns, reasoning, recommendation, suggested_interview_focus,
             skills_gap, confidence_score, confidence_reason, bias_flags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            ev.candidateId, ev.jobId, ev.totalScore, ev.matchPercentage,
            JSON.stringify(ev.categoryScores),
            JSON.stringify(ev.strengths),
            JSON.stringify(ev.concerns),
            ev.reasoning, ev.recommendation,
            JSON.stringify(ev.suggestedInterviewFocus),
            JSON.stringify(ev.skillsGap   ?? []),
            ev.confidenceScore  ?? null,
            ev.confidenceReason ?? null,
            JSON.stringify(ev.biasFlags),
          ]
        )
      )
    );

    res.json({
      success: true,
      data: {
        total: evaluationsWithFlags.length,
        evaluations: evaluationsWithFlags,
        topCandidates: evaluationsWithFlags.filter((e) => e.matchPercentage >= 70),
      },
    });
  } catch (error) {
    logger.error('Screening failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to screen resumes' });
  }
});

// GET /api/resume/interest-stats
// Returns global interest check counts + list of recently interested candidates.
resumeRouter.get('/interest-stats', async (_req: Request, res: Response) => {
  try {
    const [counts, recent] = await Promise.all([
      db.query<{ interest_status: string; count: string }>(
        `SELECT interest_status, COUNT(*) AS count FROM candidates GROUP BY interest_status`,
      ),
      db.query(
        `SELECT DISTINCT ON (c.id)
                c.id, c.file_name, c.interest_responded_at,
                j.title AS job_title
         FROM candidates c
         LEFT JOIN evaluations e ON e.candidate_id = c.id
         LEFT JOIN jobs j ON j.id = e.job_id
         WHERE c.interest_status = 'interested'
         ORDER BY c.id, c.interest_responded_at DESC NULLS LAST
         LIMIT 5`,
      ),
    ]);

    const stats: Record<string, number> = { interested: 0, checked: 0, not_looking: 0, unknown: 0 };
    counts.rows.forEach((r) => { stats[r.interest_status] = parseInt(r.count, 10); });

    return res.json({
      success: true,
      data: {
        stats,
        recentInterested: recent.rows.map((r) => ({
          id:          r.id,
          displayName: cleanCandidateName(r.file_name),
          jobTitle:    r.job_title ?? 'Unknown role',
          respondedAt: r.interest_responded_at ?? null,
        })),
      },
    });
  } catch (err) {
    logger.error('Interest stats failed', { err });
    return res.status(500).json({ success: false, error: 'Failed to fetch interest stats' });
  }
});

// POST /api/resume/check-interest/:candidateId
// Sends the candidate an email with one-click "still looking?" links.
resumeRouter.post(
  '/check-interest/:candidateId',
  validate(z.object({ candidateId: z.string().uuid('Invalid candidate ID') }), 'params'),
  async (req: AuthRequest, res: Response) => {
  const { candidateId } = req.params;

  try {
    const candidateRow = await db.query(
      `SELECT c.id, c.email, c.file_name, j.title AS job_title
       FROM candidates c
       LEFT JOIN evaluations e ON e.candidate_id = c.id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE c.id = $1
       ORDER BY e.evaluated_at DESC NULLS LAST
       LIMIT 1`,
      [candidateId],
    );

    const candidate = candidateRow.rows[0];
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });
    if (!candidate.email) {
      return res.status(400).json({ success: false, error: 'No email address on file for this candidate' });
    }

    const token     = generateSecureToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.query(
      `INSERT INTO candidate_interest_tokens (candidate_id, token, expires_at) VALUES ($1,$2,$3)`,
      [candidateId, token, expiresAt],
    );
    await db.query(
      `UPDATE candidates SET interest_status = 'checked', interest_checked_at = NOW() WHERE id = $1`,
      [candidateId],
    );

    const companyRow    = await db.query('SELECT name FROM company_profile LIMIT 1');
    const companyName   = companyRow.rows[0]?.name ?? 'Recruit360';
    const candidateName = cleanCandidateName(candidate.file_name);
    const jobTitle      = candidate.job_title ?? 'the role you applied for';
    const yesLink       = `${FRONTEND_URL}/interest-response?token=${token}&r=interested`;
    const noLink        = `${FRONTEND_URL}/interest-response?token=${token}&r=not_looking`;

    const tpl = await getTemplate('candidate_interest_check');
    if (tpl) {
      const vars = { candidate_name: candidateName, company_name: companyName, job_title: jobTitle, yes_link: yesLink, no_link: noLink };
      await sendEmail(candidate.email, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars));
    } else {
      logger.warn('candidate_interest_check template not found — email not sent');
    }

    return res.json({ success: true, data: { message: 'Interest check email sent' } });
  } catch (err) {
    logger.error('Check interest failed', { err });
    return res.status(500).json({ success: false, error: 'Failed to send interest check' });
  }
});
