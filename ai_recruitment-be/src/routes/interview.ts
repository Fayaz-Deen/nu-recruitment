import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { generateInterviewGuide } from '../agents/interviewDesigner';
import { db } from '../utils/db';
import { getCompanyContext } from '../utils/companyContext';
import { logger } from '../utils/logger';
import { cleanCandidateName } from '../utils/nameUtils';

export const interviewRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JD_SELECT = `
  SELECT
    id, title,
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

const generateBodySchema = z.object({
  jobId: z.string().uuid('jobId must be a valid UUID'),
  candidateId: z.string().uuid('candidateId must be a valid UUID'),
});

// POST /api/interview/generate
// Body: { jobId, candidateId }
interviewRouter.post('/generate', validate(generateBodySchema), async (req: Request, res: Response) => {
  try {
    const { jobId, candidateId } = req.body as { jobId: string; candidateId: string };

    const [jdResult, evalResult, candidateResult] = await Promise.all([
      db.query(JD_SELECT, [jobId]),
      db.query(EVAL_SELECT, [candidateId, jobId]),
      db.query('SELECT file_name AS "fileName" FROM candidates WHERE id = $1', [candidateId]),
    ]);

    if (!jdResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (!evalResult.rows[0]) {
      return res.status(404).json({
        success: false,
        error: 'No screening evaluation found for this candidate. Screen the resume first before generating an interview guide.',
      });
    }

    const jd = jdResult.rows[0];
    const evaluation = evalResult.rows[0];
    const rawFileName = candidateResult.rows[0]?.fileName ?? '';
    const candidateName = cleanCandidateName(rawFileName);

    logger.info('Generating interview guide', { jobId, candidateId, candidateName });

    const company = await getCompanyContext();
    const guide = await generateInterviewGuide(jd, evaluation, company);

    await db.query(
      `INSERT INTO interview_guides
        (id, job_id, candidate_id, behavioral_questions, technical_questions, scoring_rubric, red_flags)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        guide.id, jobId, candidateId,
        JSON.stringify(guide.behavioralQuestions),
        JSON.stringify(guide.technicalQuestions),
        JSON.stringify(guide.scoringRubric),
        JSON.stringify(guide.redFlagsToWatch),
      ]
    );

    res.json({
      success: true,
      data: {
        ...guide,
        guideId: guide.id,
        candidateName,
        jobTitle: jd.title,
      },
    });
  } catch (error) {
    logger.error('Interview guide generation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to generate interview guide' });
  }
});

// GET /api/interview/list?jobId=
// Must be registered before /:guideId to avoid "list" matching as a UUID param
interviewRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ success: false, error: 'jobId query param is required' });
    }

    const result = await db.query(
      `SELECT
        ig.id              AS "guideId",
        ig.candidate_id    AS "candidateId",
        ig.created_at      AS "createdAt",
        c.file_name        AS "candidateName",
        j.title            AS "jobTitle"
       FROM interview_guides ig
       JOIN candidates c ON c.id = ig.candidate_id
       JOIN jobs      j ON j.id = ig.job_id
       WHERE ig.job_id = $1 AND ig.candidate_id IS NOT NULL
       ORDER BY ig.created_at DESC`,
      [jobId]
    );

    const guides = result.rows.map((row) => ({
      ...row,
      candidateName: cleanCandidateName(row.candidateName),
    }));

    res.json({ success: true, data: guides });
  } catch (error) {
    logger.error('Interview list failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch interview guides' });
  }
});

// GET /api/interview/:guideId
interviewRouter.get('/:guideId', async (req: Request, res: Response) => {
  try {
    const { guideId } = req.params;

    if (!UUID_REGEX.test(guideId)) {
      return res.status(400).json({ success: false, error: 'Invalid guide ID format' });
    }

    const result = await db.query(
      `SELECT
        ig.id                    AS "guideId",
        ig.candidate_id          AS "candidateId",
        ig.job_id                AS "jobId",
        ig.behavioral_questions  AS "behavioralQuestions",
        ig.technical_questions   AS "technicalQuestions",
        ig.scoring_rubric        AS "scoringRubric",
        ig.red_flags             AS "redFlagsToWatch",
        ig.created_at            AS "createdAt",
        c.file_name              AS "candidateName",
        j.title                  AS "jobTitle"
       FROM interview_guides ig
       JOIN candidates c ON c.id = ig.candidate_id
       JOIN jobs      j ON j.id = ig.job_id
       WHERE ig.id = $1`,
      [guideId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Interview guide not found' });
    }

    const guide = result.rows[0];
    guide.candidateName = cleanCandidateName(guide.candidateName);

    res.json({ success: true, data: guide });
  } catch (error) {
    logger.error('Interview guide fetch failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch interview guide' });
  }
});
