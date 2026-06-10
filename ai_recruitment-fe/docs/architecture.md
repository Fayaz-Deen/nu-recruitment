# Architecture

## Tech Stack

### Frontend (`ai_recruitment-fe/`)

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router v6 |
| Server state | TanStack React Query v5 |
| HTTP | Axios |
| Styling | Tailwind CSS v3 + custom CSS variables |
| Icons | Lucide React |
| File upload | React Dropzone |
| Notifications | React Hot Toast |

### Backend (`ai_recruitment-be/`)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 4 |
| Database | PostgreSQL (via `pg` pool) |
| Cache | Redis |
| AI | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Resume parsing | `pdf-parse`, `mammoth` (DOCX) |
| Validation | Zod |
| Logging | Winston |
| Security | Helmet, express-rate-limit, CORS |

---

## Project Structure

### Backend

```
ai_recruitment-be/src/
├── agents/
│   ├── jdGenerator.ts          Gemini prompt → structured JD JSON
│   ├── resumeScreener.ts       Batch resume evaluation agent
│   ├── interviewGuide.ts       Interview question + rubric generator
│   └── communicationAgent.ts   Invitation / rejection email drafter
├── routes/
│   ├── jd.ts                   POST /generate, DELETE /:id, GET /list, GET /stats
│   ├── resume.ts               POST /upload, POST /screen, GET /results
│   ├── interview.ts            POST /generate, GET /list, GET /:guideId
│   └── communication.ts        POST /draft, GET /list, POST /send
├── db/
│   ├── init.sql                Base schema (CREATE TABLE IF NOT EXISTS)
│   ├── migrate.ts              Migration runner
│   └── migrations/
│       └── 001_add_job_number.sql
├── utils/
│   ├── db.ts                   pg Pool instance + testDbConnection()
│   ├── redis.ts                Redis client + connectRedis()
│   ├── gemini.ts               Gemini generate() wrapper
│   ├── logger.ts               Winston logger
│   └── companyContext.ts       NULogic brand copy used in prompts
├── types/
│   └── index.ts                Shared TypeScript interfaces
└── index.ts                    Express app, middleware, route mounts
```

### Frontend

```
ai_recruitment-fe/src/
├── pages/
│   ├── DashboardPage.tsx
│   ├── JDGeneratorPage.tsx
│   ├── ResumeScreenerPage.tsx
│   ├── InterviewPage.tsx
│   └── CommunicationPage.tsx
├── components/
│   ├── layout/Layout.tsx       Fixed sidebar + content area shell
│   ├── JobSelect.tsx           Searchable job dropdown (all workflow pages)
│   ├── JDDetailModal.tsx       Job description detail overlay
│   ├── NextStepButton.tsx      Workflow "Next →" navigator
│   └── ScoreBreakdown.tsx      Category score bar chart
├── services/
│   └── api.ts                  Typed Axios wrappers for all endpoints
├── types/
│   └── index.ts                Frontend TypeScript interfaces
├── styles/
│   ├── brand.css               CSS custom properties — single re-brand point
│   └── print.css               Print-only styles for interview guide export
├── tokens.ts                   TypeScript color constants for inline style= props
├── index.css                   Global entry: imports brand + print, Tailwind, components
├── App.tsx                     React Router route definitions
└── main.tsx                    React root, QueryClient, BrowserRouter, Toaster
```

---

## Data Flow

```
User Action
    │
    ▼
React Component  ──useQuery/useMutation──▶  TanStack React Query cache
                                                    │
                                          Axios (services/api.ts)
                                                    │
                                         Vite dev proxy /api → :3001
                                                    │
                                         Express route handler
                                           │              │
                                      Gemini AI      PostgreSQL / Redis
                                           │              │
                                        JSON ◀───────────┘
                                           │
                                     HTTP response
                                           │
                                   React component re-render
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google AI Studio API key |
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | `redis://localhost:6379` |
| `PORT` | — | Default `3001` |
| `NODE_ENV` | — | `development` / `production` |
| `FRONTEND_URL` | — | CORS origin, default `http://localhost:5173` |

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PORT` | `5173` | Dev server port |
| `VITE_API_TARGET` | `http://localhost:3001` | Backend URL for Vite proxy |

---

## Security

- **Rate limiting** — 100 requests per 15 minutes per IP
- **CORS** — origin locked to `FRONTEND_URL`
- **Helmet** — standard HTTP security headers
- **Input validation** — UUID regex on all `/:id` params; Zod on request bodies
- **SQL injection** — all queries use parameterised `$1, $2` placeholders
- **Secrets** — never committed; `.env` is gitignored

---

## Caching Strategy

Resume text is stored in Redis (TTL 3600 s) after upload so the screening step
can retrieve it instantly without re-reading the DB. On cache miss the route
falls back to `candidates.raw_text` in PostgreSQL.
