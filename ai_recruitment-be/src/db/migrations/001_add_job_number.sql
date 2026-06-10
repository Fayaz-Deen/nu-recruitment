-- Adds human-readable sequential job number to existing databases.
-- Safe to re-run: uses IF NOT EXISTS guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'job_number'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS jobs_job_number_seq;
    ALTER TABLE jobs ADD COLUMN job_number INTEGER UNIQUE NOT NULL DEFAULT nextval('jobs_job_number_seq');
    ALTER SEQUENCE jobs_job_number_seq OWNED BY jobs.job_number;
  END IF;
END $$;
