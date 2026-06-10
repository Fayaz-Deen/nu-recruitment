-- Candidate interest / freshness tracking
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS interest_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (interest_status IN ('unknown', 'checked', 'interested', 'not_looking')),
  ADD COLUMN IF NOT EXISTS interest_checked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interest_responded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS candidate_interest_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  response     TEXT CHECK (response IN ('interested', 'not_looking')),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Email template for candidate interest check
INSERT INTO email_templates (key, name, description, subject, body, variables)
VALUES (
  'candidate_interest_check',
  'Candidate Interest Check',
  'Sent to candidates to check if they are still actively looking for new opportunities.',
  'Are you still open to opportunities at {{company_name}}?',
  '<p>Hi {{candidate_name}},</p>
<p>We have your resume on file at <strong>{{company_name}}</strong> for the <strong>{{job_title}}</strong> role.</p>
<p>We wanted to check in — are you currently open to new opportunities?</p>
<p style="margin:28px 0;text-align:center">
  <a href="{{yes_link}}" style="background:#1B1F4E;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-right:10px">Yes, I''m interested</a>
  <a href="{{no_link}}" style="background:#F1F2F9;color:#555;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block">Not right now</a>
</p>
<p style="color:#aaa;font-size:0.85em">This link expires in 7 days. Simply ignore this email if you are not interested.</p>',
  '[
    {"key":"candidate_name","label":"Candidate Name","description":"Cleaned name from the resume filename","example":"Jane Smith"},
    {"key":"company_name","label":"Company Name","description":"Your company name from settings","example":"NULogic"},
    {"key":"job_title","label":"Job Title","description":"The role the candidate applied for","example":"Senior Frontend Engineer"},
    {"key":"yes_link","label":"Interested Link","description":"One-click link to confirm interest","example":"https://app.example.com/interest-response?token=xxx&r=interested"},
    {"key":"no_link","label":"Not Looking Link","description":"One-click link to decline","example":"https://app.example.com/interest-response?token=xxx&r=not_looking"}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
