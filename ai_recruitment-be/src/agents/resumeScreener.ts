import { getModel } from '../utils/gemini';
import { CandidateEvaluation, JobDescription } from '../types';
import { logger } from '../utils/logger';
import { CompanyContext, DEFAULT_CONTEXT } from '../utils/companyContext';

const SYSTEM_PROMPT = `You are an expert unbiased recruiter evaluating candidates.
RULES: Ignore names, gender, age, ethnicity. Focus only on skills and experience.
Always respond with valid JSON only — no markdown, no code blocks, no backticks. Just raw JSON.`;

const GENERATION_CONFIG = {
  maxOutputTokens: 3000,
  temperature: 0.3,
  thinkingConfig: { thinkingBudget: 0 },
};

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  candidateId = ''
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const is503 =
        err instanceof Error &&
        (err.message.includes('503') ||
          err.message.includes('Service Unavailable') ||
          err.message.includes('high demand'));
      if (is503 && attempt < maxAttempts) {
        const waitMs = attempt * 3000;
        logger.warn('Gemini 503 — retrying', { attempt, waitMs, candidateId });
        await new Promise<void>((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function screenResume(
  resumeText: string,
  jd: JobDescription,
  candidateId: string,
  company: CompanyContext = DEFAULT_CONTEXT,
): Promise<CandidateEvaluation> {
  logger.debug('Screening resume', {
    candidateId,
    jdTitle: jd.title,
    resumeLength: resumeText.length,
  });

  const cappedResume = resumeText.slice(0, 3000);
  if (resumeText.length > 3000) {
    logger.debug('Resume truncated', {
      original: resumeText.length,
      truncated: cappedResume.length,
    });
  }

  const cappedQualifications = jd.requiredQualifications.slice(0, 8);
  const cappedNiceToHaves = jd.niceToHaves.slice(0, 8);

  const cultureNote = company.cultureValues.length
    ? company.cultureValues.slice(0, 4).join(', ')
    : 'Engineering-first, innovation-driven, scalability-focused';

  const prompt = `Evaluate this candidate for the role at ${company.name}.

COMPANY: ${company.name} — ${company.tagline}
CULTURE: ${cultureNote}. Score cultureFit based on evidence of alignment with these values.

JOB: ${jd.title}
REQUIREMENTS: ${cappedQualifications.join('; ')}
NICE TO HAVES: ${cappedNiceToHaves.join('; ')}

RESUME:
${cappedResume}

Return this exact JSON (no markdown, no backticks, raw JSON only):
{
  "totalScore": <0-100>,
  "matchPercentage": <0-100>,
  "categoryScores": {
    "experience": <0-25>,
    "skills": <0-25>,
    "education": <0-15>,
    "progression": <0-15>,
    "cultureFit": <0-10>,
    "redFlags": <-20 to 0>
  },
  "strengths": ["3-5 specific strengths"],
  "concerns": ["0-3 concerns or gaps"],
  "reasoning": "2-3 sentence assessment",
  "recommendation": "<Strong Match | Good Match | Weak Match | No Match>",
  "suggestedInterviewFocus": ["2-3 areas to probe"],
  "skillsGap": [
    {"skill": "<specific missing skill name>", "severity": "<critical|nice-to-have>"}
  ],
  "confidenceScore": <0-100 integer — 100=highly confident clear resume, 0=very uncertain vague/brief resume. Rate low (<40) if: resume under 200 words, heavy formatting artifacts, no discernible work history>,
  "confidenceReason": "<one sentence explaining confidence level>"
}`;

  const fullPromptLength = (SYSTEM_PROMPT + prompt).length;
  logger.debug('Prompt assembled', {
    candidateId,
    resumeLength: cappedResume.length,
    promptLength: fullPromptLength,
  });

  logger.debug('Gemini config', { generationConfig: GENERATION_CONFIG });

  const model = getModel();
  const result = await withRetry(
    () =>
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
        generationConfig: GENERATION_CONFIG,
      }),
    3,
    candidateId
  );
  const raw = result.response.text();

  logger.debug('Gemini responded', {
    candidateId,
    responseLength: raw.length,
    preview: raw.slice(0, 80),
  });

  if (raw.length < 150) {
    logger.warn('Gemini response suspiciously short — likely truncated or empty', {
      candidateId,
      responseLength: raw.length,
      raw,
    });
    throw new Error(
      `Gemini response suspiciously short (${raw.length} chars) for candidate ${candidateId} — likely truncated or empty`
    );
  }

  const cleaned = raw.replace(/```json|```/g, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    logger.error('Gemini JSON parse failed', {
      candidateId,
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawPreview: raw.slice(0, 300),
    });
    throw new Error(
      `Gemini returned invalid JSON for candidate ${candidateId}: ` +
        (parseError instanceof Error ? parseError.message : String(parseError))
    );
  }

  return {
    candidateId,
    jobId: jd.id,
    ...parsed,
    evaluatedAt: new Date().toISOString(),
  } as CandidateEvaluation;
}

export async function screenResumes(
  resumes: { id: string; text: string }[],
  jd: JobDescription,
  company: CompanyContext = DEFAULT_CONTEXT,
): Promise<CandidateEvaluation[]> {
  logger.info(`Screening ${resumes.length} resumes sequentially`, { jobId: jd.id });

  const results: CandidateEvaluation[] = [];

  for (let i = 0; i < resumes.length; i++) {
    const { id, text } = resumes[i];

    logger.info('Screening candidate', {
      index: i + 1,
      total: resumes.length,
      candidateId: id,
    });

    const result = await screenResume(text, jd, id, company);
    results.push(result);

    logger.info('Candidate screened', {
      index: i + 1,
      total: resumes.length,
      candidateId: id,
    });

    // 1s breathing room between calls — prevents burst even in sequential mode
    if (i < resumes.length - 1) {
      await new Promise<void>((r) => setTimeout(r, 1000));
    }
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
}
