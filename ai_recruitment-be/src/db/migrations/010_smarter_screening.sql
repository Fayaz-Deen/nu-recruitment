-- Enable trigram extension for fuzzy name matching (duplicate detection)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Audit trail: what PII was stripped from each uploaded resume
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS pii_report JSONB NOT NULL DEFAULT '{}';

-- Smarter screening fields on evaluations
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS skills_gap        JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confidence_score  INT,
  ADD COLUMN IF NOT EXISTS confidence_reason TEXT,
  ADD COLUMN IF NOT EXISTS bias_flags        JSONB NOT NULL DEFAULT '[]';
