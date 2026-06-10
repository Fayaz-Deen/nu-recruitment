-- =============================================================================
-- 005_company_profile.sql  —  Company profile for dynamic AI context
-- Single-row table: always one record per installation (multi-tenancy in Phase 9).
-- Idempotent — safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_profile (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL DEFAULT '',
  tagline          TEXT        NOT NULL DEFAULT '',
  overview         TEXT        NOT NULL DEFAULT '',   -- main AI context paragraph
  industry         TEXT        NOT NULL DEFAULT '',
  company_size     TEXT        NOT NULL DEFAULT '',   -- 1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1000+
  location         TEXT        NOT NULL DEFAULT '',
  website          TEXT        NOT NULL DEFAULT '',
  work_mode        TEXT        NOT NULL DEFAULT 'hybrid', -- remote | hybrid | onsite
  founded_year     INTEGER,
  tech_stack       JSONB       NOT NULL DEFAULT '[]',
  services         JSONB       NOT NULL DEFAULT '[]',
  culture_values   JSONB       NOT NULL DEFAULT '[]',
  benefits         JSONB       NOT NULL DEFAULT '[]',
  contact_email    TEXT        NOT NULL DEFAULT '',
  contact_phone    TEXT        NOT NULL DEFAULT '',
  recruiter_name   TEXT        NOT NULL DEFAULT '',   -- default sender name for AI emails
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with NULogic defaults (only if table is empty)
INSERT INTO company_profile (
  name, tagline, overview, industry, company_size,
  location, website, work_mode, founded_year,
  tech_stack, services, culture_values, benefits,
  contact_email, contact_phone, recruiter_name
)
SELECT
  'NULogic',
  'Digital Commerce & Transformation Experts',
  'NULogic is a digital commerce and transformation company with over 17 years in business, 250+ experts, and 40+ global clients. We are engineers at heart, crafting cutting-edge solutions with a mindset rooted in scalability, reliability, and innovation. Global businesses — including Sephora, Reebok, UPPAbaby, Eddie Bauer, and Pokémon — choose NULogic to build, transform, and optimize their digital experiences.',
  'Technology',
  '201-500',
  'Dallas, TX, USA',
  'https://www.nulogic.io',
  'hybrid',
  2007,
  '["React", "Node.js", "TypeScript", "AWS", "Salesforce Commerce Cloud", "Kubernetes", "PostgreSQL"]'::jsonb,
  '["Digital Commerce", "Cloud Infrastructure", "Data & AI", "Enterprise Integration", "Experience Design", "Managed Services", "Agentic Commerce"]'::jsonb,
  '["Engineering-first", "Innovation-driven", "Customer-centric", "Scalability & reliability", "Continuous learning"]'::jsonb,
  '["Competitive salary", "Health, dental & vision insurance", "Remote-friendly & hybrid work", "Learning & certification budget", "401k with match", "Flexible PTO"]'::jsonb,
  'talent@nulogic.io',
  '+1 (469) 922-6985',
  'Alex Morgan'
WHERE NOT EXISTS (SELECT 1 FROM company_profile);
