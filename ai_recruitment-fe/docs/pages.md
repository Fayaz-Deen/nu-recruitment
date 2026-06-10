# Pages

Every page lives inside the shared `Layout` (fixed sidebar + scrollable content area).
The workflow progresses left-to-right: **JD Generator → Resume Screener → Interview Guide → Communications**.

---

## Dashboard

**Route:** `/dashboard` (default redirect from `/`)

### Features

- **Stats row** — 4 animated counters: JDs Generated, Resumes Screened, Interview Guides, Emails Drafted. Numbers count up on mount.
- **Workflow pipeline** — 4 step cards showing the end-to-end flow with icons and descriptions.
- **Recent Job Descriptions** — table of all saved JDs with status dot, title, relative timestamp (`timeAgo()`), and delete button.
  - Clicking a row opens `JDDetailModal`.
  - "Go to Resume Screener" in the modal navigates to `/resume-screener?jobId=<id>` (the JD is auto-selected on arrival).
  - Delete shows an inline confirmation before calling `DELETE /api/jd/:id`.
- **Empty state** — shown when no JDs exist; links to JD Generator.

### Queries

| Query key | Endpoint | When |
|-----------|----------|------|
| `['stats']` | `GET /api/jd/stats` | On mount, invalidated after any delete |
| `['jd-list']` | `GET /api/jd/list` | On mount, invalidated after any delete |

---

## JD Generator

**Route:** `/jd-generator`

### Features

- **Form (left column)**
  - Role Title (required)
  - Years Experience (number, default 3)
  - Team Size (number, default 5)
  - Key Skills — tag input: type + Enter or click `+`; chips with × to remove
  - Location (optional)
  - Additional Context (optional textarea)
  - "Generate Job Description" — disabled until `roleTitle` and at least one skill are filled
- **Preview (right column)** — live preview panel shows three states:
  - *Empty* — placeholder illustration
  - *Generating* — shimmer skeleton + animated Wand icon
  - *Generated* — full JD with sections: Company Overview, Role Overview, Responsibilities, Required Qualifications, Nice to Haves, Benefits
- **Post-generation footer** — two buttons, same row:
  - "Generate more JDs" (`btn-secondary`) — resets entire form (`EMPTY_FORM`) + clears preview
  - "Next: Resume Screener" (`btn-primary`) — navigates to `/resume-screener`

### Queries

| Query key | Endpoint | When |
|-----------|----------|------|
| `['stats']` | invalidated | After successful generation |
| `['jd-list']` | invalidated | After successful generation |

---

## Resume Screener

**Route:** `/resume-screener`

**URL params:** `?jobId=<uuid>` — pre-selects a job on arrival (linked from Dashboard modal).

### Features

**Step 1 — Job Description**

- Uses `JobSelect` (searchable dropdown showing `#001 · Job Title`).
- On selection shows a green "selected" confirmation panel with job number + title and a "Change" link.
- Auto-selects from `?jobId=` URL param once the JD list loads.

**Step 2 — Upload Resumes**

- Drag-and-drop zone (React Dropzone); accepts PDF, DOCX.
- Max 100 files, 5 MB each.
- Shows truncated file name list + file count; "Clear" button.

**Step 3 — Upload action**

- "Upload N Resumes" button — calls `POST /api/resume/upload`.
- Disabled when no files selected, no JD selected, or upload already done.
- After success: button text becomes "✓ N Resumes Uploaded".

**Step 4 — Screen action**

- Appears only after upload.
- "Screen N Resumes with AI" — calls `POST /api/resume/screen`.
- Shows spinner while AI is running.

**Results**

- Ranked candidate list, ordered by `matchPercentage DESC`.
- Each row: rank badge, name (cleaned from filename), score badge, recommendation badge.
- Expand row: Score Breakdown chart, AI Assessment (typewriter text reveal), Strengths/Concerns grid.
- Action buttons on expanded row: "Interview Guide" (→ `/interview?jobId=`) and "Draft Email" (→ `/communication?jobId=`).

---

## Interview Guide

**Route:** `/interview`

**URL params:** `?jobId=<uuid>` — pre-selects a job on arrival.

### Features

**Step 1 — Select Job Description**

- `JobSelect` component.
- Changing selection resets loaded guides.

**Step 2 — Eligible Candidates**

- Shows candidates with `matchPercentage ≥ 65%`.
- "Generate All Guides" button — sequential with 1 s delay between requests.
- Per-candidate buttons: "Generate Guide" or "View Guide" (if already generated).
- Loading skeleton while candidates fetch.
- "No candidates" and "No eligible candidates" empty states.

**Section 3 — Generated Guides**

- Guide cards, collapsible accordion.
- Each guide shows: Behavioural Questions, Technical Questions, Scoring Rubric (table), Red Flags.
- Footer buttons: "Copy All Questions" (clipboard) and "Print / Export".

**Print / Export**

- Calls `printGuide(key)` — adds `print-target` class to the specific card, calls `window.print()`, removes class on `afterprint`.
- `@media print` styles (in `src/styles/print.css`) show only the targeted guide with a branded NULogic header (NL monogram + company name, document title, print date).
- See [styling.md](./styling.md#print-system) for full details.

---

## Communications

**Route:** `/communication`

**URL params:** `?jobId=<uuid>` — pre-selects a job on arrival.

### Features

**Step 1 — Select Job Description**

- `JobSelect` component.
- Changing selection resets loaded emails.

**Step 2 — Candidates**

- Shortlisted (`matchPercentage ≥ 65%`) and non-shortlisted candidates in separate groups.
- Per-candidate: match score, email type badge (Invitation / Rejection), "Draft Email" or "View Email" button.
- "Draft All" button processes all candidates sequentially with progress counter.

**Generated Emails**

- Email cards showing candidate name, email type badge, subject, body (formatted).
- "Copy Subject" and "Copy Full Email" buttons.
- "Send" button — calls `POST /api/communication/send`; updates `sentAt` timestamp.
- Already-sent emails show a "Sent" badge.

---

## Shared Components

### `JobSelect`

Searchable combobox used on Resume Screener, Interview Guide, and Communications.

| Prop | Type | Description |
|------|------|-------------|
| `jobs` | `JobDescription[]` | Full list from `/api/jd/list` |
| `value` | `string \| null` | Currently selected job ID |
| `onChange` | `(id: string \| null) => void` | Called on selection or clear |
| `placeholder` | `string` | Optional override |

- Opens on click, shows search input, filters by job title OR `#NNN` job number.
- Each option shows `#001` monospace prefix + title.
- × button clears selection.
- Click outside closes dropdown.

### `JobSelect` — Search behaviour

| Input | Matches |
|-------|---------|
| `"senior"` | Any title containing "senior" |
| `"001"` | Job with `jobNumber = 1` |
| `"front"` | Any title containing "front" |

### `NextStepButton`

Shown at the bottom of JD Generator only (other pages use inline navigation).
Reads current route from `useLocation()`, navigates to the next step in the workflow array.
Returns `null` on the last page or if `enabled` is false.

### `JDDetailModal`

Full-screen modal overlay for viewing a JD from the Dashboard.
- ESC key closes.
- "Go to Resume Screener" navigates to `/resume-screener?jobId=<id>`.

### `ScoreBreakdown`

Horizontal bar chart for the 6 evaluation categories:
Experience, Skills, Education, Progression, Culture Fit, Red Flags.
