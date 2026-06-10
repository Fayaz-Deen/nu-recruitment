# API Reference

**Base URL:** `http://localhost:3001/api`

All responses are JSON. Success responses follow `{ success: true, data: ... }`.
Error responses follow `{ success: false, error: "message" }`.

---

## Job Descriptions — `/api/jd`

### `POST /api/jd/generate`

Generate a job description with Gemini AI and save it to the database.

**Request body**

```json
{
  "roleTitle": "Senior Salesforce Commerce Cloud Engineer",
  "yearsExperience": 5,
  "teamSize": 8,
  "keySkills": ["Salesforce", "TypeScript", "REST APIs"],
  "location": "Remote",
  "additionalContext": "Fast-growing fintech team"
}
```

| Field | Type | Required |
|-------|------|----------|
| `roleTitle` | string | ✅ |
| `yearsExperience` | number | ✅ |
| `teamSize` | number | ✅ |
| `keySkills` | string[] | ✅ (min 1) |
| `location` | string | — |
| `additionalContext` | string | — |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "jobNumber": 7,
    "title": "Senior Salesforce Commerce Cloud Engineer",
    "companyOverview": "NULogic is ...",
    "roleOverview": "...",
    "responsibilities": ["..."],
    "requiredQualifications": ["..."],
    "niceToHaves": ["..."],
    "benefits": ["..."],
    "status": "draft",
    "createdAt": "2026-06-06T10:00:00.000Z"
  }
}
```

---

### `GET /api/jd/list`

Return all job descriptions ordered by `created_at DESC`.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "jobNumber": 7,
      "title": "Senior Salesforce Commerce Cloud Engineer",
      "companyOverview": "...",
      "roleOverview": "...",
      "responsibilities": [...],
      "requiredQualifications": [...],
      "niceToHaves": [...],
      "benefits": [...],
      "status": "draft",
      "createdAt": "2026-06-06T10:00:00.000Z"
    }
  ]
}
```

---

### `DELETE /api/jd/:id`

Delete a job description (cascades to candidates, evaluations, interview guides, emails).

**Path param:** `id` — UUID of the job

**Response `200`**

```json
{ "success": true, "id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response `404`** — job not found  
**Response `400`** — invalid UUID format

---

### `GET /api/jd/stats`

Return aggregate counts for the dashboard.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "totalJobs": 12,
    "totalCandidates": 87,
    "totalEvaluations": 64,
    "totalInterviewGuides": 18,
    "totalEmails": 31
  }
}
```

---

## Resumes — `/api/resume`

### `POST /api/resume/upload`

Upload and parse resume files. Accepts `multipart/form-data`.

**Form fields**

| Field | Type | Description |
|-------|------|-------------|
| `resumes` | File[] | PDF, DOCX, DOC, TXT — max 100 files, 5 MB each |
| `jobId` | string | Optional job UUID to associate candidates |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "count": 3,
    "candidates": [
      { "id": "uuid-1", "fileName": "john_doe_cv.pdf" },
      { "id": "uuid-2", "fileName": "jane_smith_resume.docx" }
    ]
  }
}
```

---

### `POST /api/resume/screen`

Screen a batch of candidates against a job description using AI.

**Request body**

```json
{
  "jd": { /* full JobDescription object from /api/jd/list */ },
  "candidateIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "total": 3,
    "evaluations": [
      {
        "candidateId": "uuid-1",
        "jobId": "job-uuid",
        "totalScore": 87,
        "matchPercentage": 87,
        "categoryScores": {
          "experience": 22,
          "skills": 24,
          "education": 13,
          "progression": 14,
          "cultureFit": 9,
          "redFlags": 0
        },
        "strengths": ["8 years relevant experience", "Strong TypeScript skills"],
        "concerns": ["No Salesforce certification mentioned"],
        "reasoning": "Strong technical match with minor gaps in certification.",
        "recommendation": "Strong Match",
        "suggestedInterviewFocus": ["Salesforce architecture", "Team leadership"],
        "evaluatedAt": "2026-06-06T10:05:00.000Z"
      }
    ],
    "topCandidates": [ /* evaluations with matchPercentage >= 70 */ ]
  }
}
```

**Category scores** — each 0–25 (experience, skills) or 0–15 (education, progression) or 0–10 (cultureFit), with redFlags as a negative modifier.

---

### `GET /api/resume/results?jobId=<uuid>`

Fetch all saved evaluations for a job, joined with candidate filenames.
Ordered by `match_percentage DESC`.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "candidateId": "uuid-1",
      "jobId": "job-uuid",
      "fileName": "john_doe_cv.pdf",
      "matchPercentage": 87,
      "recommendation": "Strong Match",
      ...
    }
  ]
}
```

---

## Interview Guides — `/api/interview`

### `POST /api/interview/generate`

Generate a tailored interview guide for a specific candidate + job.

**Requires:** The candidate must have a saved evaluation (i.e., `POST /api/resume/screen` was run first).

**Request body**

```json
{
  "jobId": "job-uuid",
  "candidateId": "candidate-uuid"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "guide-uuid",
    "guideId": "guide-uuid",
    "jobId": "job-uuid",
    "candidateId": "candidate-uuid",
    "candidateName": "John Doe",
    "jobTitle": "Senior Salesforce Commerce Cloud Engineer",
    "behavioralQuestions": [
      {
        "id": "q1",
        "text": "Describe a time you led a complex migration project.",
        "type": "behavioral",
        "followUps": ["How did you handle stakeholder resistance?"],
        "whatToLookFor": "Evidence of project leadership and stakeholder management."
      }
    ],
    "technicalQuestions": [ /* same shape */ ],
    "scoringRubric": {
      "criteria": [
        {
          "name": "Technical Depth",
          "weight": 30,
          "scores": [
            { "score": 5, "description": "Expert-level, can teach others" },
            { "score": 3, "description": "Solid working knowledge" },
            { "score": 1, "description": "Basic awareness only" }
          ]
        }
      ]
    },
    "redFlagsToWatch": ["Vague answers about team conflicts", "No concrete metrics"],
    "createdAt": "2026-06-06T10:10:00.000Z"
  }
}
```

---

### `GET /api/interview/list?jobId=<uuid>`

List all generated guides for a job (summary only — no full question data).

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "guideId": "guide-uuid",
      "candidateId": "candidate-uuid",
      "candidateName": "John Doe",
      "jobTitle": "Senior Salesforce Commerce Cloud Engineer",
      "createdAt": "2026-06-06T10:10:00.000Z"
    }
  ]
}
```

---

### `GET /api/interview/:guideId`

Fetch a single guide with full question/rubric data.

**Response `200`** — same shape as `POST /api/interview/generate` response.

**Response `400`** — invalid UUID  
**Response `404`** — guide not found

---

## Communications — `/api/communication`

### `POST /api/communication/draft`

Draft a candidate email (invitation or rejection) using AI.

Email type is determined server-side: `invitation` if `matchPercentage ≥ 65`, else `rejection`.

**Request body**

```json
{
  "jobId": "job-uuid",
  "candidateId": "candidate-uuid"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "emailId": "email-uuid",
    "candidateId": "candidate-uuid",
    "candidateName": "John Doe",
    "extractedEmail": "john.doe@example.com",
    "emailType": "invitation",
    "subject": "Exciting Opportunity: Senior Salesforce Engineer at NULogic",
    "body": "Dear John,\n\nWe were impressed by your application...",
    "generatedAt": "2026-06-06T10:15:00.000Z"
  }
}
```

---

### `GET /api/communication/list?jobId=<uuid>`

Fetch all drafted emails for candidates evaluated against a job.
Ordered by `generated_at DESC`.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "emailId": "email-uuid",
      "candidateId": "candidate-uuid",
      "candidateName": "John Doe",
      "emailType": "invitation",
      "subject": "...",
      "body": "...",
      "generatedAt": "2026-06-06T10:15:00.000Z",
      "sentAt": null
    }
  ]
}
```

---

### `POST /api/communication/send`

Send a drafted email.

**Request body**

```json
{
  "emailId": "email-uuid",
  "recipientEmail": "john.doe@example.com"
}
```

`recipientEmail` is optional — falls back to the email extracted from the resume.

**Response `200`**

```json
{
  "success": true,
  "emailId": "email-uuid",
  "candidateId": "candidate-uuid",
  "emailType": "invitation",
  "sentAt": "2026-06-06T10:20:00.000Z"
}
```

**Response `400`** — email already sent  
**Response `404`** — email draft not found

---

## Error Responses

All error responses follow this shape:

```json
{ "success": false, "error": "Human-readable message" }
```

| HTTP code | When |
|-----------|------|
| `400` | Bad input (missing fields, invalid UUID, already sent) |
| `404` | Resource not found |
| `429` | Rate limit exceeded (100 req / 15 min) |
| `500` | Internal server error (AI failure, DB error) |
