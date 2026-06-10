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
}

export interface JDInput {
  roleTitle: string;
  yearsExperience: number;
  teamSize: number;
  keySkills: string[];
  location?: string;
  salaryRange?: string;
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
  skillsGap:        SkillGap[];
  confidenceScore:  number;
  confidenceReason: string;
  biasFlags:        BiasFlag[];
}

export interface InterviewGuide {
  id: string;
  jobId: string;
  candidateId?: string;
  behavioralQuestions: Question[];
  technicalQuestions: Question[];
  scoringRubric: ScoringRubric;
  redFlagsToWatch: string[];
  createdAt: string;
}

export interface Question {
  id: string;
  text: string;
  type: 'behavioral' | 'technical' | 'situational';
  followUps?: string[];
  whatToLookFor: string;
}

export interface ScoringRubric {
  criteria: RubricCriterion[];
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
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
  updatedAt: string;
}

export type UserRole = 'super_admin' | 'hr_admin' | 'recruiter' | 'hiring_manager' | 'interviewer';
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin: string | null;
  invitedByEmail: string | null;
}
