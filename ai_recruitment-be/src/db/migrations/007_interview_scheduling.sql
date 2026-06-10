-- Interview scheduling tables (add-on, does not modify existing schema)

CREATE TABLE IF NOT EXISTS interview_schedule (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  email_id        UUID        REFERENCES emails(id) ON DELETE SET NULL,
  selected_slot_id UUID,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','pending_reminder_1','needs_manual_followup','confirmed','expired')),
  token           TEXT        UNIQUE NOT NULL,
  candidate_name  TEXT,
  job_title       TEXT,
  candidate_email TEXT,
  reminder_1_sent_at  TIMESTAMPTZ,
  reminder_2_sent_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_slots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID        NOT NULL REFERENCES interview_schedule(id) ON DELETE CASCADE,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  is_booked   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interview_schedule
  DROP CONSTRAINT IF EXISTS fk_selected_slot;

ALTER TABLE interview_schedule
  ADD CONSTRAINT fk_selected_slot
  FOREIGN KEY (selected_slot_id) REFERENCES interview_slots(id) ON DELETE SET NULL;
