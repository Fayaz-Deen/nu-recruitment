# Recruitment Frontend

React + Vite + TypeScript + Tailwind UI for the Intelligent Recruitment Assistant.

> Product context, problem statement and architecture: see [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) and the rest of [docs/](docs/).

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Open `.env` and update if needed:

| Variable | Default | Description |
|---|---|---|
| `VITE_PORT` | `5173` | Dev server port |
| `VITE_API_TARGET` | `http://localhost:3001` | Backend URL for Vite proxy |

### 3. Start dev server
```bash
npm run dev
```

Opens at http://localhost:5173

> Make sure the backend is running on `VITE_API_TARGET` first.  
> Vite automatically proxies `/api` calls to the configured backend.

## Build for production
```bash
npm run build
```

## Folder structure

```
src/
├── pages/          Route-level page components
├── components/     Reusable UI components
├── services/api.ts Axios API client
└── types/index.ts  TypeScript types
```
