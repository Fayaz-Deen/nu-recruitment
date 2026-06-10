# Open Issues — AI Recruitment Platform

Production-readiness audit of `ai_recruitment-be` (Express + TypeScript + PostgreSQL + Gemini) and
`ai_recruitment-fe` (React 18 + Vite + Tailwind). Audited 2026-06-11.

**Status: MVP-quality. Not production-ready.** Solid foundations (JWT + refresh-token rotation,
parameterized SQL, Zod in core routes, React Query, strict TS), but the issues below must be
resolved before real candidate data is handled at scale.

Severity: 🔴 Blocker (fix before go-live) · 🟠 High (fix before scale) · 🟡 Medium (quality/maintainability)

---

## Status update — 2026-06-11 (branch `feature/production-readiness` in both repos)

Both apps were already GitHub repos; work is committed on `feature/production-readiness`
(BE commits `89e322f`, `e0e9…`; FE commits `2ebb2fe`, `ecb539d`, `ef050d2`).

**Resolved ✔** — S1 (DOMPurify on both `dangerouslySetInnerHTML` sites + HTML-escape before markdown),
S2 (10/15min limiter on login/forgot/reset/accept-invite, 60/15min on refresh),
S3 (SMTP credentials no longer logged), S8 (JWT_EXPIRES_IN validated, full ms grammar),
O1 (graceful shutdown: SIGTERM/SIGINT drain server → worker → Redis → pg pool),
O3 (reminder worker fails closed without Redis; `REMINDER_ALLOW_NO_REDIS=true` opt-out;
per-cycle ownership-checked leader election), O5 (`/health/ready` with cached DB probe),
C1 (`PATCH /users/me` + `POST /users/me/password` implemented and wired; password change
revokes other sessions), C2 (zod validation on resume upload/screen/check-interest,
interview generate, schedule init, chat stream), F1 (root + per-page ErrorBoundary),
F5 (`getApiErrorMessage` utility, all 8 cast sites replaced), F7 (`workflow.js` deleted,
README-2 → `docs/PROJECT_OVERVIEW.md`), F8 (`noUnusedLocals`/`noUnusedParameters` on, fallout fixed).

**Partially resolved ◐** — O2: uploaded resume files are now deleted on every exit path
(parsed text lives in Postgres); proper object storage (S3/GCS) still recommended.
S9: PII resumes still in `be/uploads/` locally (gitignored, never committed) — safe to purge.

**Also shipped** — design/motion system: Sora + Instrument Sans pairing, motion tokens,
route entrance + staggered grids, CTA sheen, focus-visible rings, full
`prefers-reduced-motion` support (CSS + JS counters).

**Still open** — S4 (CSRF), S5 (password policy), S6/S7 (PII in logs, prompt-injection
hardening), O4 (async email queue), O6 (request logging), O7 (migration renumbering),
O8 (Sentry/metrics), C3–C7, F2–F4, F6, E1 (tests), E3 (ESLint/Prettier), E4 (env validation).

---

## 1. Security

| # | Sev | Issue | Where | Definition of Done |
|---|-----|-------|-------|--------------------|
| S1 | 🔴 | XSS via `dangerouslySetInnerHTML` without sanitization — user-editable email-template HTML and AI chat markdown rendered raw | `fe/src/pages/ProfilePage.tsx:787`, `fe/src/components/ChatWidget.tsx:156` (naive `renderMarkdown` at :56-67) | All injected HTML passed through DOMPurify (or replaced with a proper markdown library); no raw `__html` from user/AI content |
| S2 | 🔴 | No rate limiting on auth endpoints — login, forgot-password, invite are brute-forceable (only a global 200 req/15min limiter exists) | `be/src/routes/auth.ts`, `be/src/routes/users.ts`, `be/src/index.ts:44` | Per-IP + per-account limiter on `/login`, `/forgot-password`, `/reset-password`, `/invite` (e.g. 5/15min) with lockout/backoff |
| S3 | 🔴 | SMTP credentials/host logged to stdout at startup | `be/src/services/emailService.ts:3` | No credential or host material in logs; startup logs only "SMTP configured: yes/no" |
| S4 | 🟠 | No CSRF protection on state-changing endpoints (cookie-based refresh + permissive CORS) | `be/src/index.ts` CORS setup, all POST/PUT/DELETE routes | CSRF token or strict Origin-header validation on mutating requests |
| S5 | 🟠 | Weak password policy — 8-char minimum only, no complexity or breach check | `be/src/routes/auth.ts:173` | Enforce length ≥ 12 + zxcvbn-style strength check on register/accept-invite/reset |
| S6 | 🟠 | Candidate PII (resume text, names) logged in AI agent prompts; no log redaction | `be/src/agents/resumeScreener.ts`, `interviewDesigner.ts` | Prompts not logged at info level; PII redacted from all persisted logs |
| S7 | 🟠 | Prompt-injection surface: resume text and JD fields interpolated into Gemini prompts unescaped, and chat route exposes 12 function-calling tools | `be/src/agents/*`, `be/src/routes/chat.ts` | Delimit/escape untrusted text in prompts; validate function-call args with Zod; restrict chat tool scope by role |
| S8 | 🟡 | `JWT_EXPIRES_IN` cast to `any` — arbitrary env value silently accepted | `be/src/services/authService.ts:33` | Validate env var against allowed pattern at startup, fail fast |
| S9 | 🟡 | Real candidate resumes (PII) sitting in `be/uploads/` inside the repo directory; `.env.production` in FE not covered by `.gitignore` | `be/uploads/` (30+ files), `fe/.gitignore` | Purge sample PII from the tree; add `.env.*` to FE `.gitignore`; initialize git with clean history |

## 2. Reliability & Operations

| # | Sev | Issue | Where | Definition of Done |
|---|-----|-------|-------|--------------------|
| O1 | 🔴 | No graceful shutdown — no SIGTERM/SIGINT handling; reminder worker `setInterval` never cleaned up; DB pool/Redis never drained | `be/src/index.ts`, `be/src/workers/reminderWorker.ts:254` | Signal handlers stop the HTTP server, clear worker timers, drain pg pool and Redis before exit |
| O2 | 🔴 | Resume files stored on local disk (`process.cwd()/uploads`) — lost on every Railway redeploy; never cleaned up; not multi-instance safe | `be/src/routes/resume.ts:23-26` | Files in S3/GCS (or Railway volume as stopgap); temp files deleted after parsing |
| O3 | 🔴 | Reminder worker leader election fails OPEN — if Redis is down, every instance sends duplicate reminder emails | `be/src/workers/reminderWorker.ts:236` | Fail closed (skip cycle and alert) when the lock cannot be acquired |
| O4 | 🟠 | Email sending is synchronous in request handlers — slow SMTP blocks API responses; no retry on transient failure | `be/src/routes/communication.ts:119-123`, `be/src/services/emailService.ts` | Queue-based async send (BullMQ on existing Redis) with retry + dead-letter logging |
| O5 | 🟠 | `/health` doesn't check dependencies — returns OK even when Postgres/Redis/Gemini are down | `be/src/index.ts:49-51` | `/health` verifies DB ping (and reports Redis/Gemini status); separate liveness vs readiness |
| O6 | 🟠 | No request logging / correlation IDs — no way to trace a failed request in production | `be/src/index.ts` middleware stack | HTTP access-log middleware (method, path, status, latency, request-id) wired to Winston |
| O7 | 🟡 | Migrations run alphabetically with a duplicate prefix (`010_add_branding…` and `010_smarter_screening…`); no rollback strategy | `be/src/db/migrate.ts`, `be/src/db/migrations/` | Renumber migrations; document ordering guarantee; adopt a migration tool (node-pg-migrate) or rollback runbook |
| O8 | 🟡 | No error tracking or metrics in either app (no Sentry/APM, no `/metrics`) | both apps | Sentry (FE+BE) wired; basic Prometheus metrics endpoint on BE |

## 3. Correctness & Data Integrity

| # | Sev | Issue | Where | Definition of Done |
|---|-----|-------|-------|--------------------|
| C1 | 🔴 | Profile update & password change are STUBS — UI fakes success with `setTimeout`; changes never persist | `fe/src/pages/ProfilePage.tsx:511`, `:643` (`// TODO: wire to PATCH /users/me`) | `PATCH /users/me` + password-change endpoint implemented on BE and wired in FE |
| C2 | 🔴 | Input validation missing on 4+ backend routes — resume upload, interview generate, schedule init, chat accept unvalidated bodies straight into AI agents | `be/src/routes/resume.ts:45`, `interview.ts:40-46`, `schedule.ts:67-71`, `chat.ts` | Zod schemas on every route body/params/query, consistent 400 responses |
| C3 | 🟠 | No transaction around the resume-upload pipeline (insert candidate → evaluate → dedupe) — partial rows on failure | `be/src/routes/resume.ts:45-126` | Multi-step writes wrapped in a single transaction (pattern already exists in `users.ts:66-90`) |
| C4 | 🟠 | No pagination on `/api/resume/results` — returns every evaluation incl. full JSONB PII report | `be/src/routes/resume.ts:137-186` | Cursor/offset pagination + field selection; cap page size |
| C5 | 🟡 | Missing DB indexes on hot paths: `candidates.job_id`, `evaluations.job_id/candidate_id`, `jobs.status/created_at`, reminder-worker columns | `be/src/db/` | Migration adding the indexes; verified with `EXPLAIN` on the main list queries |
| C6 | 🟡 | N+1 / multi-query stats: dashboard stats run 5 separate COUNTs | `be/src/routes/jd.ts:87-92`, `resume.ts:326-329` | Single aggregated query per stats endpoint |
| C7 | 🟡 | Resume text truncated at a hardcoded 3000 chars before AI screening — long resumes silently judged on partial content | `be/src/services/resumeParser.ts:56` | Configurable limit; chunk or summarize long resumes instead of silent truncation |

## 4. Frontend Quality & UX

| # | Sev | Issue | Where | Definition of Done |
|---|-----|-------|-------|--------------------|
| F1 | 🟠 | No React error boundaries — any render error white-screens the whole app | `fe/src/App.tsx` | Root-level + per-route error boundaries with a recovery UI |
| F2 | 🟠 | Accessibility failures: labels without `htmlFor`, icon buttons without `aria-label`, modals without `role="dialog"`/focus trap, color-only error states | `fe/src/pages/*`, `JDDetailModal.tsx`, `InterviewScheduleCard.tsx` | Pass an axe-core audit on all pages; keyboard-navigable modals |
| F3 | 🟡 | Missing loading/error states on Dashboard, ResumeScreener, Profile queries — layout shift and blank panels on slow networks | `fe/src/pages/DashboardPage.tsx`, `ResumeScreenerPage.tsx`, `ProfilePage.tsx` | Every `useQuery` renders explicit loading + error UI |
| F4 | 🟡 | Oversized page files: DashboardPage 1222 lines, ProfilePage 1021 lines | `fe/src/pages/` | Split into sub-components; pages under ~400 lines |
| F5 | 🟡 | Duplicated error-narrowing cast `(err as { response?... })` in 5+ places | `fe/src/pages/*` | Shared `getApiErrorMessage(err: unknown)` utility |
| F6 | 🟡 | `~20` non-null assertions on API responses (`r.data.data!`) — no runtime contract validation | `fe/src/services/api.ts` | Zod-validated API responses or safe unwrap helper |
| F7 | 🟡 | Dead/stale code: unused `src/config/workflow.js` (JS in a TS project, references a nonexistent `/interview-guide` route); `README-2.md` duplicates README | `fe/src/config/workflow.js`, `fe/README-2.md` | Delete or convert; consolidate into one README |
| F8 | 🟡 | `noUnusedLocals`/`noUnusedParameters` disabled in FE tsconfig | `fe/tsconfig.json` | Enable both, fix fallout |

## 5. Engineering Foundations

| # | Sev | Issue | Where | Definition of Done |
|---|-----|-------|-------|--------------------|
| E1 | 🔴 | Zero tests across both apps (68 source files, 0 test files); no test framework installed | repo-wide | Vitest + Supertest on BE (auth, resume pipeline, validation), Vitest + Testing Library on FE (auth flow, guards), Playwright smoke for login→upload→screen; CI gate |
| E2 | 🟠 | Not a git repository — no version control, no CI/CD, no review workflow | repo root | `git init`, clean history (no `.env`, no `uploads/` PII), GitHub remote, CI running build + lint + tests |
| E3 | 🟡 | No linting/formatting toolchain (no ESLint/Prettier config in either app) | both apps | ESLint + Prettier configured and passing; pre-commit hook |
| E4 | 🟡 | Env vars not validated at FE build/startup (`VITE_API_BASE_URL` empty → silent broken requests) | `fe/src/services/api.ts:11` | Fail fast with a clear message when required env vars are missing |

---

## Suggested execution order

1. **Week 1 — Blockers (🔴):** S1–S3, O1–O3, C1, C2, S9 purge + E2 git init.
2. **Week 2 — High (🟠):** S4–S7, O4–O6, C3, C4, F1, F2; start E1 test scaffolding on the auth + resume paths.
3. **Week 3+ — Medium (🟡):** remaining items, driven by E1 coverage and E3 lint cleanup.

Progress convention: mark items `[x]` and append the commit/PR reference when closed.
