import { Router, Response } from 'express';
import { generateJobDescription } from '../agents/jdGenerator';
import { db } from '../utils/db';
import { JDInput } from '../types';
import { logger } from '../utils/logger';
import { getCompanyContext } from '../utils/companyContext';
import { AuthRequest } from '../middleware/auth';
import { JDValidationError } from '../agents/jdGenerator';

export const jdRouter = Router();

// POST /api/jd/generate
jdRouter.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const input: JDInput = req.body;

    if (!input.roleTitle || !input.yearsExperience || !input.keySkills?.length) {
      return res.status(400).json({
        success: false,
        error: 'roleTitle, yearsExperience, and keySkills are required',
      });
    }

    const company = await getCompanyContext();
    const jd = await generateJobDescription(input, company);

    const createdBy     = req.user?.sub  ?? null;
    const createdByName = req.user?.name ?? null;

    let jobNumber: number | undefined;
    try {
      const inserted = await db.query(
        `INSERT INTO jobs (id, title, company_overview, role_overview, responsibilities,
          required_qualifications, nice_to_haves, benefits, status, created_at,
          created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING job_number`,
        [
          jd.id, jd.title, jd.companyOverview, jd.roleOverview,
          JSON.stringify(jd.responsibilities),
          JSON.stringify(jd.requiredQualifications),
          JSON.stringify(jd.niceToHaves),
          JSON.stringify(jd.benefits),
          jd.status, jd.createdAt,
          createdBy, createdByName,
        ]
      );
      jobNumber = inserted.rows[0]?.job_number;
    } catch (dbError) {
      logger.error('JD db insert failed', { error: dbError, jobId: jd.id });
      throw dbError;
    }

    res.json({ success: true, data: { ...jd, jobNumber, createdByName } });
  } catch (error) {
    logger.error('JD generation failed', { error });
    res.status(500).json({ success: false, error: 'Failed to generate job description' });
  }
});

// DELETE /api/jd/:id
jdRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid job ID format' });
  }

  try {
    const result = await db.query('DELETE FROM jobs WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    logger.error('JD delete failed', { error, jobId: id });
    res.status(500).json({ success: false, error: 'Failed to delete job description' });
  }
});

// GET /api/jd/stats
jdRouter.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [jobs, candidates, evaluations, interviewGuides, emails] = await Promise.all([
      db.query('SELECT COUNT(*) AS count FROM jobs'),
      db.query('SELECT COUNT(*) AS count FROM candidates'),
      db.query('SELECT COUNT(*) AS count FROM evaluations'),
      db.query('SELECT COUNT(*) AS count FROM interview_guides'),
      db.query('SELECT COUNT(*) AS count FROM emails'),
    ]);

    res.json({
      success: true,
      data: {
        totalJobs:            parseInt(jobs.rows[0].count, 10),
        totalCandidates:      parseInt(candidates.rows[0].count, 10),
        totalEvaluations:     parseInt(evaluations.rows[0].count, 10),
        totalInterviewGuides: parseInt(interviewGuides.rows[0].count, 10),
        totalEmails:          parseInt(emails.rows[0].count, 10),
      },
    });
  } catch (error) {
    logger.error('Stats query failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/jd/list
jdRouter.get('/list', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT
        id,
        job_number              AS "jobNumber",
        title,
        company_overview        AS "companyOverview",
        role_overview           AS "roleOverview",
        responsibilities,
        required_qualifications AS "requiredQualifications",
        nice_to_haves           AS "niceToHaves",
        benefits,
        status,
        created_at              AS "createdAt",
        created_by              AS "createdBy",
        created_by_name         AS "createdByName"
       FROM jobs ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('JD list failed', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
  }
});
