CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number SERIAL UNIQUE NOT NULL,
  title TEXT NOT NULL,
  company_overview TEXT,
  role_overview TEXT,
  responsibilities JSONB DEFAULT '[]',
  required_qualifications JSONB DEFAULT '[]',
  nice_to_haves JSONB DEFAULT '[]',
  benefits JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  raw_text TEXT,
  email TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  total_score INTEGER,
  match_percentage INTEGER,
  category_scores JSONB,
  strengths JSONB DEFAULT '[]',
  concerns JSONB DEFAULT '[]',
  reasoning TEXT,
  recommendation TEXT,
  suggested_interview_focus JSONB DEFAULT '[]',
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID,
  behavioral_questions JSONB DEFAULT '[]',
  technical_questions JSONB DEFAULT '[]',
  scoring_rubric JSONB,
  red_flags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
