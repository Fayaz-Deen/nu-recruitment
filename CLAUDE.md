# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout — Important Git Gotcha

This root repo (`Fayaz-Deen/nu-recruitment`) contains two apps that are **also independent git repos** with their own `.git` directories pointing at the `NUTechnolgyInc` org:

- `ai_recruitment-be/` → `NUTechnolgyInc/ai_recruitment-be`
- `ai_recruitment-fe/` → `NUTechnolgyInc/ai_recruitment-fe`

Consequences:
- `git` commands run inside a subdirectory operate on the **inner** repo, not this one.
- From the root, `git add` treats the subdirectories as embedded repos (gitlinks) and will NOT stage their file contents. To commit subproject changes to the root repo, temporarily rename the nested `.git` dirs (e.g. to `.git-local`, which is gitignored), `git add`, commit, then rename back.
- Never push to the `NUTechnolgyInc` remotes unless explicitly asked.

`OPEN_ISSUES.md` at the root is a production-readiness audit (security, reliability, correctness, UX) with file/line references — consult it before fixing bugs or adding features; the issue may already be catalogued with a definition of done.

## Commands

There are no tests or linters in either project. Verification = `npm run build` (which runs `tsc`) plus manual checks.

### Backend (`ai_recruitment-be/`)
```bash
npm run dev          # ts-node-dev on :3001 (predev kills anything on the port)
npm run build        # tsc + copies init.sql and migrations/ into dist/
npm run db:migrate   # runs src/db/init.sql then migrations/ in filename order
npm start            # node dist/index.js
```
Requires `.env` (copy `.env.example`): `GEMINI_API_KEY`, `DATABASE_URL` (Postgres), `REDIS_URL`. Health check: `curl localhost:3001/health`.

### Frontend (`ai_recruitment-fe/`)
```bash
npm run dev          # Vite on :5173, proxies /api → VITE_API_TARGET (default :3001)
npm run build        # tsc && vite build
```
Backend must be running for the dev proxy to work. `.env.production` carries `VITE_API_BASE_URL` for Netlify builds and is intentionally tracked.

## Architecture

Stack: React 18 + Vite + Tailwind + TanStack Query (FE) · Express 4 + TypeScript + PostgreSQL (`pg` pool, parameterized queries) + Redis + Google Gemini 2.5 Flash (BE). Deployed FE→Netlify, BE→Railway (`railway.json`).

Detailed docs live in `ai_recruitment-fe/docs/` (PROJECT_OVERVIEW, architecture, api, database, pages, styling).

### Request flow
React page → `useQuery`/`useMutation` → typed Axios wrappers in `fe/src/services/api.ts` → Vite proxy → Express route → (Gemini agent and/or Postgres/Redis) → JSON back.

### Backend structure (`be/src/`)
- `agents/` — Gemini prompt builders returning structured JSON (jdGenerator, resumeScreener, interviewDesigner, communicationAgent). Each route delegates AI work here; `utils/gemini.ts` is the shared generate() wrapper and `utils/companyContext.ts` injects brand copy into prompts.
- `routes/` — one router per domain, mounted in `index.ts`. **Auth boundary:** `/api/auth`, `/api/schedule`, `/api/candidate` are public (candidate-facing links); everything else goes through the `authenticate` middleware. Auth-sensitive endpoints (`login`, `forgot-password`, `reset-password`, `accept-invite`) have a dedicated rate limiter on top of the global one.
- `services/` — authService (JWT access + httpOnly-cookie refresh-token rotation), emailService (nodemailer/SMTP), resumeParser (pdf-parse/mammoth; note: truncates text at 3000 chars before screening).
- `workers/reminderWorker.ts` — `setInterval` worker sending interview reminder emails, with Redis-based leader election for multi-instance safety.
- `db/` — `init.sql` base schema + `migrations/` run in filename order by `migrate.ts` (idempotent `CREATE TABLE IF NOT EXISTS`; beware: two migrations share the `010_` prefix, so alphabetical order decides).

### Frontend structure (`fe/src/`)
- `pages/` — route-level components defined in `App.tsx`; auth state in `contexts/AuthContext.tsx` with token handling in `services/authToken.ts`.
- Styling has a single re-brand point: CSS custom properties in `styles/brand.css`, mirrored as TS constants in `tokens.ts` for inline styles. Tailwind config extends these.
- The recruiter workflow is a pipeline across pages: JD generation → resume upload/screening → interview guide → scheduling → candidate communication; `JobSelect` and `NextStepButton` components tie the steps together around a selected job.

### Caching
Uploaded resume text is cached in Redis (TTL 1h) keyed for the screening step, falling back to `candidates.raw_text` in Postgres on miss.

### Resume uploads
Stored on local disk at `be/uploads/` (gitignored — contains real PII; never commit or publish these).
