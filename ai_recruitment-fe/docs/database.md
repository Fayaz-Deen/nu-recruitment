# Database

PostgreSQL. All queries use parameterised placeholders (`$1, $2, …`) — no raw string interpolation.

---

## Running Migrations

```bash
cd ai_recruitment-be
npm run db:migrate
```

The migration runner (`src/db/migrate.ts`):
1. Runs `src/db/init.sql` — creates all tables with `IF NOT EXISTS` (safe to re-run)
2. Runs every `src/db/migrations/*.sql` in alphabetical order — each migration is idempotent

---

## Schema

### `jobs`

Stores generated job descriptions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key, `gen_random_uuid()` |
| `job_number` | `SERIAL UNIQUE NOT NULL` | Human-readable sequential ID (`#001`, `#002`, …) |
| `title` | `TEXT NOT NULL` | |
| `company_overview` | `TEXT` | |
| `role_overview` | `TEXT` | |
| `responsibilities` | `JSONB` | Default `'[]'` |
| `required_qualifications` | `JSONB` | Default `'[]'` |
| `nice_to_haves` | `JSONB` | Default `'[]'` |
| `benefits` | `JSONB` | Default `'[]'` |
| `status` | `TEXT` | Default `'draft'`; values: `draft`, `active`, `closed` |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Default `NOW()` |

---

### `candidates`

Stores parsed resume data.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key |
| `job_id` | `UUID` | FK → `jobs.id` ON DELETE CASCADE |
| `file_name` | `TEXT NOT NULL` | Original filename |
| `raw_text` | `TEXT` | Parsed resume text |
| `uploaded_at` | `TIMESTAMPTZ` | Default `NOW()` |

---

### `evaluations`

Stores AI screening results for each candidate+job pair.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key |
| `candidate_id` | `UUID` | FK → `candidates.id` ON DELETE CASCADE |
| `job_id` | `UUID` | FK → `jobs.id` ON DELETE CASCADE |
| `total_score` | `INTEGER` | 0–100 |
| `match_percentage` | `INTEGER` | 0–100 |
| `category_scores` | `JSONB` | `{ experience, skills, education, progression, cultureFit, redFlags }` |
| `strengths` | `JSONB` | Default `'[]'` |
| `concerns` | `JSONB` | Default `'[]'` |
| `reasoning` | `TEXT` | AI narrative explanation |
| `recommendation` | `TEXT` | `Strong Match` / `Good Match` / `Weak Match` / `No Match` |
| `suggested_interview_focus` | `JSONB` | Default `'[]'` |
| `evaluated_at` | `TIMESTAMPTZ` | Default `NOW()` |

---

### `interview_guides`

Stores generated interview guides.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key |
| `job_id` | `UUID` | FK → `jobs.id` ON DELETE CASCADE |
| `candidate_id` | `UUID` | FK → `candidates.id` (no cascade — guide survives candidate deletion) |
| `behavioral_questions` | `JSONB` | Default `'[]'` |
| `technical_questions` | `JSONB` | Default `'[]'` |
| `scoring_rubric` | `JSONB` | `{ criteria: [{ name, weight, scores: [{ score, description }] }] }` |
| `red_flags` | `JSONB` | Default `'[]'` |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` |

---

### `emails`

Stores drafted and sent candidate emails.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key |
| `candidate_id` | `UUID` | FK → `candidates.id` ON DELETE CASCADE |
| `type` | `TEXT NOT NULL` | `invitation` or `rejection` |
| `subject` | `TEXT` | |
| `body` | `TEXT` | |
| `generated_at` | `TIMESTAMPTZ` | Default `NOW()` |
| `sent_at` | `TIMESTAMPTZ` | `NULL` until sent |

---

## Relationships

```
jobs (1) ──────────────────────────── (many) candidates
  │                                              │
  │ (many) evaluations (candidate_id + job_id)  │
  │                                              │
  └── (many) interview_guides                   │
  └── (many) emails (via candidates)  ──────────┘
```

Deleting a `job` cascades to:
- `candidates` → which cascade to `evaluations` and `emails`
- `interview_guides` directly

---

## Migrations

### `001_add_job_number.sql`

Adds `job_number SERIAL` to existing databases that were created before the column existed.
Uses a `DO $$ … IF NOT EXISTS … $$` guard — safe to run multiple times.

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'job_number'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS jobs_job_number_seq;
    ALTER TABLE jobs ADD COLUMN job_number INTEGER UNIQUE NOT NULL
      DEFAULT nextval('jobs_job_number_seq');
    ALTER SEQUENCE jobs_job_number_seq OWNED BY jobs.job_number;
  END IF;
END $$;
```

---

## Connection Pool

`src/utils/db.ts` — `pg.Pool` with:

| Setting | Value |
|---------|-------|
| Max connections | 10 |
| Idle timeout | 30 000 ms |
| Connection timeout | 2 000 ms |

`DATABASE_URL` must be set or the server throws at startup.
`testDbConnection()` is called during server boot to verify the pool is healthy.
