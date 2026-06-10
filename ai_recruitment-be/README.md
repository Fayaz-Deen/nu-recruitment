# Recruitment Backend

Node.js + Express + TypeScript API powered by Gemini AI.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Open `.env` and fill in:
- `GEMINI_API_KEY` — get from https://aistudio.google.com/app/apikey
- `DATABASE_URL` — replace YOUR_MAC_USERNAME with output of `whoami`

### 3. Run database migration
```bash
npm run db:migrate
```
__Note: correct `DATABASE_URL` string it required to run this migration

### 4. Start dev server
```bash
npm run dev
```

Server runs on http://localhost:3001

### Health check
```bash
curl http://localhost:3001/health
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jd/generate` | Generate job description |
| GET | `/api/jd/list` | List all jobs |
| POST | `/api/resume/upload` | Upload resume files |
| POST | `/api/resume/screen` | Screen resumes against JD |
| POST | `/api/interview/generate` | Generate interview guide |
| POST | `/api/communication/draft` | Draft candidate email |

## Folder structure

```
src/
├── agents/         Gemini AI agents
├── routes/         Express route handlers
├── services/       Resume parsing
├── utils/          DB, Redis, Gemini, Logger
├── middleware/     Error handler
├── types/          TypeScript types
└── db/
    ├── init.sql    Database schema
    └── migrate.ts  Migration runner
```
