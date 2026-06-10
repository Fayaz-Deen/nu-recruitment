-- Add logo and favicon storage to company profile
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS logo_url    TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;
