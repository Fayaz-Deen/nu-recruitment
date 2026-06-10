export interface JobDescription {
  id: string;
  jobNumber?: number;
  title: string;
  companyOverview: string;
  roleOverview: string;
  responsibilities: string[];
  requiredQualifications: string[];
  niceToHaves: string[];
  benefits: string[];
  createdAt: string;
  status: 'draft' | 'active' | 'closed';
  createdBy?: string | null;
  createdByName?: string | null;
}

export interface JDInput {
  roleTitle: string;
  yearsExperience: number;
  teamSize: number;
  keySkills: string[];
  location?: string;
  additionalContext?: string;
}

export interface SkillGap {
  skill: string;
  severity: 'critical' | 'nice-to-have';
}

export interface BiasFlag {
  type: 'score_outlier' | 'language_flag';
  description: string;
  severity: 'warning' | 'info';
}

export interface PiiReport {
  emails:    string[];
  phones:    string[];
  linkedins: string[];
  githubs:   string[];
}

export interface DuplicateMatch {
  newCandidateId:   string;
  existingId:       string;
  existingFileName: string;
  existingJobTitle: string | null;
  matchType:        'email' | 'name';
}

export interface CandidateEvaluation {
  candidateId: string;
  jobId: string;
  totalScore: number;
  matchPercentage: number;
  categoryScores: {
    experience: number;
    skills: number;
    education: number;
    progression: number;
    cultureFit: number;
    redFlags: number;
  };
  strengths: string[];
  concerns: string[];
  reasoning: string;
  recommendation: 'Strong Match' | 'Good Match' | 'Weak Match' | 'No Match';
  suggestedInterviewFocus: string[];
  evaluatedAt: string;
  skillsGap?:        SkillGap[];
  confidenceScore?:  number | null;
  confidenceReason?: string | null;
  biasFlags?:        BiasFlag[];
}

export interface InterviewGuide {
  guideId?: string;
  id: string;
  jobId: string;
  candidateId?: string;
  candidateName?: string;
  jobTitle?: string;
  behavioralQuestions: Question[];
  technicalQuestions: Question[];
  scoringRubric: { criteria: RubricCriterion[] };
  redFlagsToWatch: string[];
  createdAt: string;
}

export interface InterviewGuideSummary {
  guideId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  createdAt: string;
}

export type InterestStatus = 'unknown' | 'checked' | 'interested' | 'not_looking';

export interface CandidateResult extends CandidateEvaluation {
  fileName:            string;
  piiReport?:          PiiReport | null;
  uploadedAt?:         string;
  interestStatus?:     InterestStatus;
  interestCheckedAt?:  string | null;
}

export interface Question {
  id: string;
  text: string;
  type: string;
  followUps?: string[];
  whatToLookFor: string;
}

export interface RubricCriterion {
  name: string;
  weight: number;
  scores: { score: number; description: string }[];
}

export interface CandidateEmail {
  candidateId: string;
  type: 'invitation' | 'rejection' | 'update' | 'offer';
  subject: string;
  body: string;
  generatedAt: string;
}

export interface DraftedEmail {
  emailId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string | null;
  extractedEmail?: string | null;
  emailType: 'invitation' | 'rejection';
  subject: string;
  body: string;
  generatedAt: string;
  sentAt?: string;
  scheduleStatus?: InterviewSchedule['status'] | null;
  scheduledSlotStart?: string | null;
  scheduledSlotEnd?: string | null;
}

export interface InterviewSlot {
  id: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  createdAt: string;
}

export interface InterviewSchedule {
  id: string;
  candidateId: string;
  jobId: string;
  emailId: string | null;
  selectedSlotId: string | null;
  status: 'pending' | 'pending_reminder_1' | 'needs_manual_followup' | 'confirmed' | 'expired';
  token: string;
  candidateName: string | null;
  jobTitle: string | null;
  candidateEmail: string | null;
  reminder1SentAt: string | null;
  reminder2SentAt: string | null;
  createdAt: string;
  slots: InterviewSlot[];
  link: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  tagline: string;
  overview: string;
  industry: string;
  companySize: string;
  location: string;
  website: string;
  workMode: 'remote' | 'hybrid' | 'onsite';
  foundedYear: number | null;
  techStack: string[];
  services: string[];
  cultureValues: string[];
  benefits: string[];
  contactEmail: string;
  contactPhone: string;
  recruiterName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  updatedAt: string;
}

export interface CompanyCompleteness {
  isComplete: boolean;
  score: number;
  missing: string[];
}

export interface EmailTemplateVariable {
  key: string
  label: string
  description: string
  example: string
}

export interface EmailTemplate {
  id: string
  key: string
  name: string
  description: string
  subject: string
  body: string
  variables: EmailTemplateVariable[]
  updated_at: string
  updated_by_name: string | null
  updated_by_email: string | null
}

export interface PriorityAction {
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

export type UserRole = 'super_admin' | 'hr_admin' | 'recruiter' | 'hiring_manager' | 'interviewer';
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login: string | null;
  invited_by_email: string | null;
}
