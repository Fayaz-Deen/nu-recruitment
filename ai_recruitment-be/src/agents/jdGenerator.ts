import { generate } from '../utils/gemini';
import { JDInput, JobDescription } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { CompanyContext, DEFAULT_CONTEXT } from '../utils/companyContext';

const SYSTEM_PROMPT = `You are an expert recruiter writing compelling, inclusive job descriptions.
Always respond with valid JSON only — no markdown, no code blocks, no extra text. Just raw JSON.`;

const VALIDATION_SYSTEM_PROMPT = `You are a job title and skills validator. Always respond with valid JSON only — no markdown, no code blocks, no extra text. Just raw JSON.`;

export class JDValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JDValidationError';
  }
}

async function validateInput(input: JDInput): Promise<void> {
  const prompt = `Validate this job description input and respond with JSON only.

Role title: "${input.roleTitle}"
Skills: ${input.keySkills.join(', ')}

Rules:
1. The role title must be a recognizable, real-world job title (e.g. "Software Engineer", "Product Manager"). Gibberish, random words, or non-job phrases are invalid.
2. All skills must be reasonably relevant to the role title. A skill is irrelevant if it has no professional connection to the role (e.g. "cooking" for a "Software Engineer").

Return this exact JSON:
{
  "isValidTitle": true or false,
  "irrelevantSkills": ["list only skills that are clearly irrelevant to the role, empty array if all are fine"],
  "titleMessage": "short reason if title is invalid, else empty string",
  "skillsMessage": "short reason if skills are irrelevant, else empty string"
}`;

  const raw = await generate(VALIDATION_SYSTEM_PROMPT, prompt, 512);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const result = JSON.parse(cleaned);

  if (!result.isValidTitle) {
    throw new JDValidationError(
      result.titleMessage || `"${input.roleTitle}" is not a valid job title. Please provide a recognizable role name.`
    );
  }

  if (result.irrelevantSkills?.length > 0) {
    throw new JDValidationError(
      result.skillsMessage ||
        `The following skills are not relevant to "${input.roleTitle}": ${result.irrelevantSkills.join(', ')}. Please provide skills that match the role.`
    );
  }
}

export async function generateJobDescription(
  input: JDInput,
  company: CompanyContext = DEFAULT_CONTEXT,
): Promise<JobDescription> {
  logger.info('JD Generator: starting', { role: input.roleTitle, company: company.name });

  await validateInput(input);

  const cultureNote = company.cultureValues.length
    ? `Culture: ${company.cultureValues.join(', ')}.`
    : '';
  const techNote = company.techStack.length
    ? `Tech stack: ${company.techStack.slice(0, 8).join(', ')}.`
    : '';
  const servicesNote = company.services.length
    ? `Services: ${company.services.slice(0, 6).join(', ')}.`
    : '';

  const prompt = `Generate a job description for this role at ${company.name}.

COMPANY: ${company.name} — ${company.tagline}
INDUSTRY: ${company.industry}
OVERVIEW: ${company.overview}
${cultureNote}
${techNote}
${servicesNote}

ROLE: ${input.roleTitle}
EXPERIENCE: ${input.yearsExperience}+ years
TEAM SIZE: ${input.teamSize}
SKILLS: ${input.keySkills.join(', ')}
${input.location ? `LOCATION: ${input.location}` : ''}
${input.additionalContext ? `CONTEXT: ${input.additionalContext}` : ''}

Return this exact JSON structure (no markdown, no backticks, raw JSON only):
{
  "title": "job title",
  "companyOverview": "2-3 sentence description of ${company.name} as the employer — use the name directly, never write [COMPANY_NAME] or any placeholder",
  "roleOverview": "1 paragraph role description framed around ${company.name}'s culture and values",
  "responsibilities": ["5-7 responsibilities"],
  "requiredQualifications": ["5-7 required qualifications"],
  "niceToHaves": ["3-5 nice to haves"],
  "benefits": ["4-6 benefits"]
}`;

  const raw = await generate(SYSTEM_PROMPT, prompt, 4096);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const jd: JobDescription = {
    id: uuidv4(),
    ...parsed,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };

  logger.info('JD Generator: done', { jobId: jd.id });
  return jd;
}
