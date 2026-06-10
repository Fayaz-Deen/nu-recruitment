import { getModel } from '../utils/gemini';
import { InterviewGuide, JobDescription, CandidateEvaluation } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { CompanyContext, DEFAULT_CONTEXT } from '../utils/companyContext';

const SYSTEM_PROMPT = `You are an expert interviewer designing structured, fair interview processes.
Always respond with valid JSON only — no markdown, no code blocks, no backticks. Just raw JSON.`;

// responseSchema enforces structure at the API layer — Gemini cannot exceed maxItems
// or deviate from field names. responseMimeType guarantees raw JSON output, no fences.
const GENERATION_CONFIG = {
  maxOutputTokens: 4096,
  temperature: 0.4,
  thinkingConfig: { thinkingBudget: 0 },
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'object',
    properties: {
      behavioralQuestions: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            id:            { type: 'string' },
            text:          { type: 'string' },
            type:          { type: 'string' },
            followUps:     { type: 'array', items: { type: 'string' } },
            whatToLookFor: { type: 'string' },
          },
        },
      },
      technicalQuestions: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            id:            { type: 'string' },
            text:          { type: 'string' },
            type:          { type: 'string' },
            followUps:     { type: 'array', items: { type: 'string' } },
            whatToLookFor: { type: 'string' },
          },
        },
      },
      scoringRubric: {
        type: 'object',
        properties: {
          criteria: {
            type: 'array',
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                name:   { type: 'string' },
                weight: { type: 'number' },
                scores: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      score:       { type: 'number' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      redFlagsToWatch: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string' },
      },
    },
  },
};

export async function generateInterviewGuide(
  jd: JobDescription,
  evaluation?: CandidateEvaluation,
  company: CompanyContext = DEFAULT_CONTEXT,
): Promise<InterviewGuide> {
  logger.info('Interview Designer: starting', { jobId: jd.id });

  // Cap inputs to keep prompt lean
  const cappedQualifications = jd.requiredQualifications.slice(0, 8).join('; ');
  const cappedResponsibilities = jd.responsibilities.slice(0, 8).join('; ');
  const cappedRoleOverview = jd.roleOverview.slice(0, 500);
  const focusAreas = evaluation?.suggestedInterviewFocus?.slice(0, 5).join(', ') || 'general role competencies';
  const cappedStrengths = evaluation?.strengths?.slice(0, 5).join(', ') || '';
  const cappedConcerns = evaluation?.concerns?.slice(0, 5).join(', ') || '';
  const cappedReasoning = evaluation?.reasoning?.slice(0, 500) || '';

  const prompt = `Generate a customised interview guide for this candidate based on the job description and their screening evaluation.

COMPANY: ${company.name} — ${company.tagline}
CULTURE: ${company.cultureValues.length ? company.cultureValues.slice(0, 4).join(', ') : 'Engineering-first, innovation-driven'}. Values scalability, reliability, and technical depth.

ROLE: ${jd.title}
OVERVIEW: ${cappedRoleOverview}
REQUIREMENTS: ${cappedQualifications}
RESPONSIBILITIES: ${cappedResponsibilities}
FOCUS AREAS: ${focusAreas}
${cappedStrengths ? `CANDIDATE STRENGTHS: ${cappedStrengths}` : ''}
${cappedConcerns ? `CANDIDATE CONCERNS: ${cappedConcerns}` : ''}
${cappedReasoning ? `SCREENING NOTES: ${cappedReasoning}` : ''}`;

  logger.debug('Interview Designer: Gemini config', { generationConfig: { ...GENERATION_CONFIG, responseSchema: '[schema]' } });

  const model = getModel();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
    generationConfig: GENERATION_CONFIG as Record<string, unknown>,
  });
  const raw = result.response.text();

  logger.debug('Interview Designer: Gemini responded', { responseLength: raw.length });

  if (raw.length < 100) {
    throw new Error('Interview guide response too short — likely truncated');
  }

  // responseMimeType: "application/json" guarantees no markdown fences — parse directly
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    logger.error('Interview Designer: JSON parse failed', {
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      rawPreview: raw.slice(0, 300),
    });
    throw new Error('Gemini returned invalid JSON for interview guide');
  }

  logger.info('Interview Designer: done', { jobId: jd.id });

  return {
    id: uuidv4(),
    jobId: jd.id,
    candidateId: evaluation?.candidateId,
    ...parsed,
    createdAt: new Date().toISOString(),
  } as InterviewGuide;
}
