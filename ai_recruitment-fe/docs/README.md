# Recruit360 — Documentation Index

**NULogic AI Recruitment Platform** — an end-to-end recruitment workflow powered by Gemini AI.

---

## Contents

| File | What it covers |
|------|----------------|
| [architecture.md](./architecture.md) | Tech stack, project structure, data flow, environment setup |
| [pages.md](./pages.md) | Every page — routes, features, URL params, component breakdown |
| [api.md](./api.md) | All REST endpoints with request / response shapes |
| [database.md](./database.md) | Schema, table relationships, migration system |
| [styling.md](./styling.md) | Design system, brand tokens, CSS architecture, component library |

---

## Quick Start

```bash
# Backend
cd ai_recruitment-be
cp .env.example .env        # fill in DATABASE_URL and GEMINI_API_KEY
npm install
npm run db:migrate
npm run dev                 # http://localhost:3001

# Frontend
cd ai_recruitment-fe
cp .env.example .env        # defaults work out of the box
npm install
npm run dev                 # http://localhost:5173
```

---

## Workflow

```
JD Generator → Resume Screener → Interview Guide → Communications
```

Each page maps to one step. A "Next →" button at the bottom of each page
advances the user through the workflow.

---

## Repository Layout

```
recruit360/
├── ai_recruitment-be/     Node.js + Express + TypeScript backend
├── ai_recruitment-fe/     React + Vite + TypeScript frontend
└── docs/                  This documentation
```
