import { Router, Response } from 'express';
import { z } from 'zod';
import { GoogleGenerativeAI, FunctionCallingMode, FunctionDeclarationSchemaType as T } from '@google/generative-ai';
import type { Content, Part, FunctionDeclaration } from '@google/generative-ai';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { generateJobDescription } from '../agents/jdGenerator';
import { generateInterviewGuide } from '../agents/interviewDesigner';
import { draftCandidateEmail } from '../agents/communicationAgent';
import { getCompanyContext } from '../utils/companyContext';
import { cleanCandidateName } from '../utils/nameUtils';
import { v4 as uuidv4 } from 'uuid';
import { generateSecureToken } from '../services/authService';
import { sendEmail } from '../services/emailService';
import { getTemplate, renderTemplate } from './emailTemplates';

export const chatRouter = Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Tool declarations ─────────────────────────────────────────────────────────

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_stats',
    description: 'Get overall hiring statistics: total jobs, candidates, evaluations, interview guides, emails sent.',
    parameters: { type: T.OBJECT, properties: {} },
  },
  {
    name: 'get_pipeline',
    description: 'Get hiring pipeline for all jobs showing candidates screened, shortlisted, guides generated.',
    parameters: { type: T.OBJECT, properties: {} },
  },
  {
    name: 'list_jobs',
    description: 'List job descriptions. Optionally filter by status (draft, active, closed).',
    parameters: {
      type: T.OBJECT,
      properties: {
        status: { type: T.STRING, description: 'Filter by status: draft, active, or closed' },
      },
    },
  },
  {
    name: 'create_job',
    description: 'Generate and save a new job description using AI.',
    parameters: {
      type: T.OBJECT,
      properties: {
        title:              { type: T.STRING, description: 'Job title' },
        department:         { type: T.STRING, description: 'Department name' },
        location:           { type: T.STRING, description: 'Work location' },
        experience_level:   { type: T.STRING, description: 'One of: junior, mid, senior, lead, executive' },
        key_skills:         { type: T.ARRAY,  items: { type: T.STRING, properties: {} }, description: 'Key skills required' },
        additional_context: { type: T.STRING, description: 'Extra context about the role' },
      },
      required: ['title'],
    },
  },
  {
    name: 'search_candidates',
    description: 'Search candidates in the talent pool. Filter by name/email query, job, or minimum score.',
    parameters: {
      type: T.OBJECT,
      properties: {
        query:     { type: T.STRING, description: 'Search by candidate name or email' },
        job_id:    { type: T.STRING, description: 'Filter by job ID (UUID)' },
        min_score: { type: T.NUMBER, description: 'Minimum screening score 0-100' },
        limit:     { type: T.NUMBER, description: 'Max results, default 10' },
      },
    },
  },
  {
    name: 'get_candidate_details',
    description: 'Get full details for a specific candidate including their evaluation scores, strengths and concerns.',
    parameters: {
      type: T.OBJECT,
      properties: {
        candidate_id: { type: T.STRING, description: 'The candidate UUID' },
      },
      required: ['candidate_id'],
    },
  },
  {
    name: 'generate_interview_guide',
    description: 'Generate a tailored interview guide for a candidate-job pair. Candidate must be screened first.',
    parameters: {
      type: T.OBJECT,
      properties: {
        job_id:       { type: T.STRING, description: 'Job ID (UUID)' },
        candidate_id: { type: T.STRING, description: 'Candidate ID (UUID)' },
      },
      required: ['job_id', 'candidate_id'],
    },
  },
  {
    name: 'draft_email',
    description: 'Draft a candidate email (invitation, rejection, or offer). Candidate must be screened first.',
    parameters: {
      type: T.OBJECT,
      properties: {
        job_id:       { type: T.STRING, description: 'Job ID (UUID)' },
        candidate_id: { type: T.STRING, description: 'Candidate ID (UUID)' },
        email_type:   { type: T.STRING, description: 'One of: invitation, rejection, offer, update' },
      },
      required: ['job_id', 'candidate_id'],
    },
  },
  {
    name: 'list_team',
    description: 'List all team members in the organization with their roles and status.',
    parameters: { type: T.OBJECT, properties: {} },
  },
  {
    name: 'invite_team_member',
    description: 'Invite a new team member by email. Only super_admin and hr_admin can do this. Sends them an invitation email with a setup link.',
    parameters: {
      type: T.OBJECT,
      properties: {
        email: { type: T.STRING, description: 'Email address of the person to invite' },
        role:  {
          type: T.STRING,
          description: 'Role to assign: recruiter, hiring_manager, interviewer, hr_admin, or super_admin',
        },
      },
      required: ['email', 'role'],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

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

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: { sub: string; name: string; role: string },
): Promise<unknown> {
  switch (name) {

    case 'get_stats': {
      const [jobs, candidates, evals, guides, sentEmails, activeJobs] = await Promise.all([
        db.query('SELECT COUNT(*) FROM jobs'),
        db.query('SELECT COUNT(*) FROM candidates'),
        db.query('SELECT COUNT(*) FROM evaluations'),
        db.query('SELECT COUNT(*) FROM interview_guides'),
        db.query("SELECT COUNT(*) FROM emails WHERE sent_at IS NOT NULL"),
        db.query("SELECT COUNT(*) FROM jobs WHERE status = 'active'"),
      ]);
      return {
        totalJobs: parseInt(jobs.rows[0].count),
        activeJobs: parseInt(activeJobs.rows[0].count),
        totalCandidates: parseInt(candidates.rows[0].count),
        totalEvaluations: parseInt(evals.rows[0].count),
        totalInterviewGuides: parseInt(guides.rows[0].count),
        emailsSent: parseInt(sentEmails.rows[0].count),
      };
    }

    case 'get_pipeline': {
      const result = await db.query(`
        SELECT
          j.id, j.title, j.job_number AS "jobNumber", j.status,
          COUNT(DISTINCT e.candidate_id)::int                                                          AS "screenedCount",
          COUNT(DISTINCT CASE WHEN e.recommendation IN ('Strong Match','Good Match') THEN e.candidate_id END)::int AS "shortlistedCount",
          COUNT(DISTINCT ig.candidate_id)::int                                                         AS "guidesCount",
          COALESCE(MAX(e.total_score)::int, 0)                                                         AS "topScore",
          COALESCE(ROUND(AVG(e.total_score)::numeric, 0)::int, 0)                                      AS "avgScore"
        FROM jobs j
        LEFT JOIN evaluations e ON e.job_id = j.id
        LEFT JOIN interview_guides ig ON ig.job_id = j.id
        GROUP BY j.id, j.title, j.job_number, j.status
        ORDER BY j.created_at DESC
        LIMIT 15
      `);
      return { pipeline: result.rows, total: result.rows.length };
    }

    case 'list_jobs': {
      const { status } = args as { status?: string };
      const result = await db.query(
        status
          ? 'SELECT id, title, job_number AS "jobNumber", status, created_at AS "createdAt", created_by_name AS "createdBy" FROM jobs WHERE status = $1 ORDER BY created_at DESC LIMIT 20'
          : 'SELECT id, title, job_number AS "jobNumber", status, created_at AS "createdAt", created_by_name AS "createdBy" FROM jobs ORDER BY created_at DESC LIMIT 20',
        status ? [status] : [],
      );
      return { jobs: result.rows, total: result.rows.length };
    }

    case 'create_job': {
      const { title, department, location, experience_level, key_skills, additional_context } =
        args as { title: string; department?: string; location?: string; experience_level?: string; key_skills?: string[]; additional_context?: string };

      const expMap: Record<string, number> = { junior: 1, mid: 3, senior: 5, lead: 8, executive: 12 };
      const company = await getCompanyContext();
      const input = {
        roleTitle: title,
        yearsExperience: expMap[experience_level ?? 'mid'] ?? 3,
        teamSize: 5,
        keySkills: key_skills?.length ? key_skills : [department ?? 'general'],
        location,
        additionalContext: [department && `Department: ${department}`, additional_context].filter(Boolean).join('. '),
      };

      const jd = await generateJobDescription(input, company);

      await db.query(
        `INSERT INTO jobs
           (id, title, company_overview, role_overview, responsibilities,
            required_qualifications, nice_to_haves, benefits, status, created_at,
            created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11)`,
        [jd.id, jd.title, jd.companyOverview, jd.roleOverview,
          JSON.stringify(jd.responsibilities), JSON.stringify(jd.requiredQualifications),
          JSON.stringify(jd.niceToHaves), JSON.stringify(jd.benefits), jd.createdAt,
          ctx.sub, ctx.name],
      );

      return {
        jobId: jd.id,
        title: jd.title,
        status: 'draft',
        responsibilities: jd.responsibilities.slice(0, 3),
        requiredQualifications: jd.requiredQualifications.slice(0, 3),
        message: `"${jd.title}" created as a draft. Visit the JD Generator page to review and activate it.`,
      };
    }

    case 'search_candidates': {
      const { query, job_id, min_score, limit = 10 } =
        args as { query?: string; job_id?: string; min_score?: number; limit?: number };

      const params: unknown[] = [];
      let idx = 1;
      let sql = `
        SELECT DISTINCT ON (c.id)
          c.id, c.file_name AS "fileName", c.email,
          e.total_score AS "totalScore", e.match_percentage AS "matchPercentage",
          e.recommendation, e.strengths,
          j.title AS "jobTitle", j.id AS "jobId"
        FROM candidates c
        LEFT JOIN evaluations e ON e.candidate_id = c.id
        LEFT JOIN jobs j ON j.id = e.job_id
        WHERE 1=1
      `;
      if (query) { sql += ` AND (c.file_name ILIKE $${idx} OR c.email ILIKE $${idx})`; params.push(`%${query}%`); idx++; }
      if (job_id) { sql += ` AND (e.job_id = $${idx} OR c.job_id = $${idx})`; params.push(job_id); idx++; }
      if (min_score != null) { sql += ` AND e.total_score >= $${idx}`; params.push(min_score); idx++; }
      sql += ` ORDER BY c.id, e.total_score DESC NULLS LAST LIMIT $${idx}`;
      params.push(Math.min(Number(limit) || 10, 20));

      const result = await db.query(sql, params);
      return {
        candidates: result.rows.map(r => ({ ...r, displayName: cleanCandidateName(r.fileName) })),
        total: result.rows.length,
      };
    }

    case 'get_candidate_details': {
      const { candidate_id } = args as { candidate_id: string };
      const result = await db.query(`
        SELECT
          c.id, c.file_name AS "fileName", c.email,
          e.total_score AS "totalScore", e.match_percentage AS "matchPercentage",
          e.category_scores AS "categoryScores", e.strengths, e.concerns,
          e.reasoning, e.recommendation,
          e.suggested_interview_focus AS "suggestedInterviewFocus",
          j.title AS "jobTitle", j.id AS "jobId"
        FROM candidates c
        LEFT JOIN evaluations e ON e.candidate_id = c.id
        LEFT JOIN jobs j ON j.id = e.job_id
        WHERE c.id = $1
        ORDER BY e.total_score DESC NULLS LAST
        LIMIT 1
      `, [candidate_id]);

      if (!result.rows[0]) return { error: 'Candidate not found', candidate_id };
      const row = result.rows[0];
      return { ...row, displayName: cleanCandidateName(row.fileName) };
    }

    case 'generate_interview_guide': {
      const { job_id, candidate_id } = args as { job_id: string; candidate_id: string };

      const [jdRes, evalRes, candidateRes] = await Promise.all([
        db.query(JD_SELECT, [job_id]),
        db.query(EVAL_SELECT, [candidate_id, job_id]),
        db.query('SELECT file_name AS "fileName" FROM candidates WHERE id = $1', [candidate_id]),
      ]);

      if (!jdRes.rows[0]) return { error: 'Job not found', job_id };
      if (!evalRes.rows[0]) return { error: 'No evaluation found. Screen the resume first.', candidate_id };

      const company = await getCompanyContext();
      const guide = await generateInterviewGuide(jdRes.rows[0], evalRes.rows[0], company);
      const candidateName = cleanCandidateName(candidateRes.rows[0]?.fileName ?? '');

      await db.query(
        `INSERT INTO interview_guides
           (id, job_id, candidate_id, behavioral_questions, technical_questions, scoring_rubric, red_flags)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [guide.id, job_id, candidate_id,
          JSON.stringify(guide.behavioralQuestions), JSON.stringify(guide.technicalQuestions),
          JSON.stringify(guide.scoringRubric), JSON.stringify(guide.redFlagsToWatch)],
      );

      return {
        guideId: guide.id,
        candidateName,
        jobTitle: jdRes.rows[0].title,
        behavioralQuestions: guide.behavioralQuestions.slice(0, 3).map(q => q.text),
        technicalQuestions: guide.technicalQuestions.slice(0, 3).map(q => q.text),
        redFlags: guide.redFlagsToWatch.slice(0, 3),
        message: `Interview guide created for ${candidateName} (${jdRes.rows[0].title}).`,
      };
    }

    case 'draft_email': {
      const { job_id, candidate_id, email_type = 'invitation' } =
        args as { job_id: string; candidate_id: string; email_type?: string };

      const validTypes = ['invitation', 'rejection', 'offer', 'update'] as const;
      type EmailType = typeof validTypes[number];
      const type: EmailType = validTypes.includes(email_type as EmailType)
        ? (email_type as EmailType)
        : 'invitation';

      const [jdRes, evalRes, candidateRes] = await Promise.all([
        db.query(JD_SELECT, [job_id]),
        db.query(EVAL_SELECT, [candidate_id, job_id]),
        db.query('SELECT file_name AS "fileName", email FROM candidates WHERE id = $1', [candidate_id]),
      ]);

      if (!jdRes.rows[0]) return { error: 'Job not found', job_id };
      if (!evalRes.rows[0]) return { error: 'No evaluation found. Screen resume first.', candidate_id };

      const company = await getCompanyContext();
      const candidateRow = candidateRes.rows[0];
      const candidateName = cleanCandidateName(candidateRow?.fileName ?? '');
      const draft = await draftCandidateEmail(type, jdRes.rows[0], evalRes.rows[0], candidateName, company);

      await db.query(
        `INSERT INTO emails (id, candidate_id, type, subject, body, email, candidate_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), candidate_id, draft.type, draft.subject, draft.body,
          candidateRow?.email ?? null, candidateName],
      );

      return {
        subject: draft.subject,
        bodyPreview: draft.body.slice(0, 300) + (draft.body.length > 300 ? '…' : ''),
        emailType: draft.type,
        candidateName,
        jobTitle: jdRes.rows[0].title,
        message: `${draft.type} email drafted for ${candidateName}.`,
      };
    }

    case 'list_team': {
      const result = await db.query(
        `SELECT id, email, name, role, status,
                created_at AS "createdAt", last_login AS "lastLogin"
         FROM users ORDER BY created_at ASC`,
      );
      return { members: result.rows, total: result.rows.length };
    }

    case 'invite_team_member': {
      const VALID_ROLES = ['super_admin', 'hr_admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;
      type InviteRole = typeof VALID_ROLES[number];

      const { email, role: inviteRole } = args as { email: string; role: string };

      if (!['super_admin', 'hr_admin'].includes(ctx.role))
        return { error: 'Only Super Admin or HR Admin can invite team members.' };

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return { error: 'A valid email address is required.' };

      if (!VALID_ROLES.includes(inviteRole as InviteRole))
        return { error: `Invalid role "${inviteRole}". Must be one of: ${VALID_ROLES.join(', ')}.` };

      if (ctx.role === 'hr_admin' && inviteRole === 'super_admin')
        return { error: 'HR Admin cannot invite a Super Admin.' };

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows[0]) return { error: `A user with email ${email} already exists.` };

      const client = await db.connect();
      let inviteUrl: string;
      try {
        await client.query('BEGIN');
        const userRow = await client.query(
          `INSERT INTO users (email, role, status, invited_by) VALUES ($1, $2, 'invited', $3) RETURNING id`,
          [email.toLowerCase(), inviteRole, ctx.sub],
        );
        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO invite_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
          [userRow.rows[0].id, token, expiresAt],
        );
        await client.query('COMMIT');
        inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      try {
        const companyRow = await db.query('SELECT name FROM company_profile LIMIT 1');
        const companyName = companyRow.rows[0]?.name ?? 'Recruit360';
        const roleLabel = inviteRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const tpl = await getTemplate('user_invite');
        if (tpl) {
          const vars = { company_name: companyName, inviter_name: ctx.name, role_label: roleLabel, invite_link: inviteUrl };
          await sendEmail(email, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars));
        } else {
          logger.warn('user_invite template not found — invite created but email not sent');
        }
      } catch (emailErr) {
        logger.warn('Invite email failed — invite created but email not sent', { emailErr });
      }

      const roleLabel = inviteRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return {
        message: `Invite sent to ${email} as ${roleLabel}. They'll receive an email with a setup link valid for 48 hours.`,
        email,
        role: inviteRole,
        inviteUrl,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(name: string, role: string, company: string): string {
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin', hr_admin: 'HR Admin', recruiter: 'Recruiter',
    hiring_manager: 'Hiring Manager', interviewer: 'Interviewer',
  };
  return `You are Recruit AI, an intelligent recruitment assistant embedded in ${company}'s hiring platform built by NULogic.

You help recruiters and HR teams manage their hiring pipeline efficiently through natural conversation.

Current user: ${name} (${roleLabels[role] ?? role})

## What you can do
- **get_stats / get_pipeline**: Show hiring metrics and pipeline status
- **list_jobs**: List all job openings (filter by status)
- **create_job**: Generate a complete AI-written job description
- **search_candidates**: Find candidates (by name, job, or score threshold)
- **get_candidate_details**: Deep-dive on a specific candidate
- **generate_interview_guide**: Create a personalised interview guide
- **draft_email**: Draft invitation, rejection, or offer emails
- **list_team**: Show organisation members

## Behaviour rules
- Always use tools to get real data — never make up names, scores, or IDs
- When listing candidates or jobs, include their UUIDs so follow-up tool calls work
- After creating something (JD, guide, email), confirm with a brief summary
- Use markdown: **bold** key figures, bullet lists for items, headings for sections
- Be concise — 2-4 sentences max before a list or tool call
- If a tool returns an error, explain it clearly and suggest what to do next
- UUIDs from tool results can be passed directly into subsequent tool calls`;
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function sse(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── POST /api/chat/stream ─────────────────────────────────────────────────────

const chatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(8_000),
    }),
  ).min(1).max(50),
});

chatRouter.post('/stream', async (req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const parsedBody = chatBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      sse(res, { type: 'error', message: parsedBody.error.errors[0]?.message ?? 'Invalid messages payload' });
      return res.end();
    }
    const { messages } = parsedBody.data;

    const userName  = req.user?.name ?? req.user?.email ?? 'User';
    const userRole  = req.user?.role ?? 'recruiter';
    const userCtx   = { sub: req.user!.sub, name: userName, role: userRole };

    const companyRes = await db.query('SELECT name FROM company_profile LIMIT 1').catch(() => ({ rows: [] }));
    const companyName = companyRes.rows[0]?.name ?? 'your company';

    // Build Gemini chat history (all messages except the last one)
    const allMsgs = [...messages];
    const lastMsg = allMsgs.pop()!;

    const history: Content[] = allMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(userName, userRole, companyName),
    });

    const chat = model.startChat({
      history,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
      generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
    });

    // ── Agentic loop ──────────────────────────────────────────────────────────
    let currentMsg: string | Part[] = lastMsg.content;
    const MAX_ROUNDS = 6;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await chat.sendMessage(currentMsg);
      const response = result.response;
      const functionCalls = response.functionCalls?.() ?? [];

      if (!functionCalls.length) {
        // Final text response
        sse(res, { type: 'text', content: response.text() });
        break;
      }

      // Execute each tool call
      const responseParts: Part[] = [];
      for (const fc of functionCalls) {
        const toolName = fc.name;
        const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

        sse(res, { type: 'tool_start', name: toolName, input: toolArgs });

        try {
          const toolResult = await executeToolCall(toolName, toolArgs, userCtx);
          sse(res, { type: 'tool_done', name: toolName, result: toolResult });
          responseParts.push({
            functionResponse: { name: toolName, response: { result: toolResult } },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Tool failed';
          logger.error('Chat tool execution failed', { toolName, err });
          sse(res, { type: 'tool_error', name: toolName, error: errMsg });
          responseParts.push({
            functionResponse: { name: toolName, response: { error: errMsg } },
          });
        }
      }

      currentMsg = responseParts;
    }

    sse(res, { type: 'done' });
    res.end();
  } catch (err) {
    logger.error('Chat stream failed', { err });
    sse(res, { type: 'error', message: friendlyGeminiError(err) });
    res.end();
  }
});

function friendlyGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('503') || msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('unavailable'))
    return 'The AI model is experiencing high demand right now. Please try again in a moment.';
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit'))
    return 'Rate limit reached. Please wait a few seconds and try again.';
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('api key'))
    return 'AI service configuration error. Please contact your administrator.';
  if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('deadline'))
    return 'The request timed out. Please try a shorter message or try again.';
  return 'Something went wrong with the AI service. Please try again.';
}
