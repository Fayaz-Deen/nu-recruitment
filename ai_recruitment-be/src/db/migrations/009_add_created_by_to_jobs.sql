-- Add creator tracking to jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS created_by      UUID  REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;
