import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { logger } from '../utils/logger';

export const candidateRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// GET /api/candidate/interest-response?token=xxx&r=interested|not_looking
// Public — no auth. Called by the frontend InterestResponsePage.
candidateRouter.get('/interest-response', async (req: Request, res: Response) => {
  const { token, r } = req.query as { token?: string; r?: string };

  if (!token || !r || !['interested', 'not_looking'].includes(r)) {
    return res.status(400).json({ success: false, error: 'Invalid or missing token/response' });
  }

  try {
    const tokenRow = await db.query(
      `SELECT cit.id, cit.candidate_id, cit.used_at, cit.expires_at,
              c.file_name, cp.name AS company_name
       FROM candidate_interest_tokens cit
       JOIN candidates c ON c.id = cit.candidate_id
       LEFT JOIN company_profile cp ON TRUE
       WHERE cit.token = $1
       LIMIT 1`,
      [token],
    );

    if (!tokenRow.rows[0]) {
      return res.status(404).json({ success: false, error: 'Invalid link — token not found.' });
    }

    const row = tokenRow.rows[0];

    if (row.used_at) {
      return res.json({ success: true, alreadyRecorded: true, response: r, companyName: row.company_name });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This link has expired. Please contact the recruiter.' });
    }

    const response = r as 'interested' | 'not_looking';
    await db.query(
      `UPDATE candidate_interest_tokens SET response = $1, used_at = NOW() WHERE id = $2`,
      [response, row.id],
    );
    await db.query(
      `UPDATE candidates
       SET interest_status = $1, interest_responded_at = NOW()
       WHERE id = $2`,
      [response, row.candidate_id],
    );

    logger.info('Candidate interest response recorded', {
      candidateId: row.candidate_id,
      response,
    });

    return res.json({
      success:     true,
      response,
      companyName: row.company_name ?? 'the company',
    });
  } catch (err) {
    logger.error('Interest response failed', { err });
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/candidate/interest-redirect?token=xxx&r=...
// Optional: direct backend redirect (for email clients that strip query params)
candidateRouter.get('/interest-redirect', (_req: Request, res: Response) => {
  const { token, r } = _req.query as { token?: string; r?: string };
  if (!token || !r) return res.status(400).send('Invalid link');
  return res.redirect(`${FRONTEND_URL}/interest-response?token=${token}&r=${r}`);
});
