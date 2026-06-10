import { generate } from '../utils/gemini';
import { CandidateEmail, CandidateEvaluation, JobDescription } from '../types';
import { logger } from '../utils/logger';
import { CompanyContext, DEFAULT_CONTEXT } from '../utils/companyContext';

const SYSTEM_PROMPT = `You are a compassionate talent acquisition specialist writing candidate emails.
Be warm, personal, specific — never robotic or generic.
Always respond with valid JSON only — no markdown, no code blocks, no backticks. Just raw JSON.`;

export async function draftCandidateEmail(
  type: CandidateEmail['type'],
  jd: JobDescription,
  evaluation: CandidateEvaluation,
  candidateName = 'Candidate',
  company: CompanyContext = DEFAULT_CONTEXT,
): Promise<CandidateEmail> {
  logger.info('Communication Agent: drafting', { type, candidateId: evaluation.candidateId, company: company.name });

  const cappedConcerns = evaluation.concerns.slice(0, 3);
  const cappedStrengths = evaluation.strengths.slice(0, 3);
  const cappedReasoning = evaluation.reasoning?.slice(0, 300) || '';

  const contextMap: Record<CandidateEmail['type'], string> = {
    invitation: `Candidate scored ${evaluation.matchPercentage}% — shortlisted.
Specific strengths: ${cappedStrengths.join('; ')}.
Write an invitation email: open with "${company.name} — ${company.tagline}", congratulate the candidate on being shortlisted for ${jd.title}, briefly mention 1-2 of their specific strengths to show the email is personalised. Close the main content with a natural transition sentence that directs the candidate to the interview slots that follow — for example: "We've included a few interview slots below — please select the time that works best for you." Then sign off warmly. IMPORTANT: Do NOT ask the candidate to reply with their availability, suggest slots themselves, or mention a screening call — the scheduling link handles all of that. Keep warm, professional, and under 200 words.`,

    rejection: `Candidate scored ${evaluation.matchPercentage}% — not shortlisted.
Specific gaps identified: ${cappedConcerns.join('; ')}.
Screening notes: ${cappedReasoning}
Write a professional, compassionate rejection email. Include one personalised paragraph that addresses the specific gaps — e.g. "While your background shows strength in X, we were looking for deeper experience in Y and Z for this particular role." Use the gaps listed above as the specific reasons. End with genuine encouragement to apply for future ${company.name} roles. Never be harsh. Be warm, specific, and leave a positive impression of ${company.name}.`,

    update: `Application is under review. Score: ${evaluation.matchPercentage}%.`,
    offer:  `Top candidate with score ${evaluation.matchPercentage}%. Proceed with an offer.`,
  };

  const prompt = `Write a ${type} email for a candidate who applied for ${jd.title} at ${company.name}.

COMPANY: ${company.name} — ${company.tagline}
REPLY-TO: ${company.contactEmail}
CONTEXT: ${contextMap[type]}
CANDIDATE NAME: ${candidateName}

Return this exact JSON (no markdown, no backticks, raw JSON only):
{
  "subject": "email subject line — must reference ${company.name} by name",
  "body": "full email body with greeting and sign-off. Use ${company.recruiterName} as the sender placeholder. Write '${company.name}' as the company name — never write [COMPANY_NAME] or any placeholder. Invitation and offer emails must open with '${company.name} — ${company.tagline}'. For invitation emails: end the main content with a transition sentence toward the interview slots (e.g. 'We've included a few interview slots below — please select the time that works best for you.'), then sign off. Never ask the candidate to reply with their availability. Sign off with the reply-to address ${company.contactEmail}. Keep under 200 words."
}`;

  const raw = await generate(SYSTEM_PROMPT, prompt, 2048);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const subject = type === 'invitation'
    ? `Your Application for ${jd.title} at ${company.name} - Shortlisted!`
    : `Your Application for ${jd.title} at ${company.name}`;

  return {
    candidateId: evaluation.candidateId,
    type,
    subject,
    body: parsed.body,
    generatedAt: new Date().toISOString(),
  };
}
