import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { requireRole } from '../middleware/auth';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported image type — use PNG, JPG, SVG, WebP, or ICO'));
  },
});

export const companyRouter = Router();

const REQUIRED_FIELDS = ['name', 'overview', 'industry'];
const COMPLETENESS_FIELDS = [
  { key: 'name',          label: 'Company name',      required: true  },
  { key: 'overview',      label: 'Company overview',  required: true  },
  { key: 'industry',      label: 'Industry',          required: true  },
  { key: 'company_size',  label: 'Company size',      required: false },
  { key: 'location',      label: 'Location',          required: false },
  { key: 'tagline',       label: 'Tagline',           required: false },
  { key: 'website',       label: 'Website',           required: false },
  { key: 'recruiter_name',label: 'Recruiter name',    required: false },
  { key: 'contact_email', label: 'Contact email',     required: false },
  { key: 'tech_stack',    label: 'Tech stack',        required: false, isList: true },
  { key: 'services',      label: 'Services',          required: false, isList: true },
  { key: 'culture_values',label: 'Culture values',    required: false, isList: true },
  { key: 'benefits',      label: 'Benefits',          required: false, isList: true },
];

function rowToProfile(row: Record<string, unknown>) {
  return {
    id:            row.id,
    name:          row.name,
    tagline:       row.tagline,
    overview:      row.overview,
    industry:      row.industry,
    companySize:   row.company_size,
    location:      row.location,
    website:       row.website,
    workMode:      row.work_mode,
    foundedYear:   row.founded_year,
    techStack:     row.tech_stack,
    services:      row.services,
    cultureValues: row.culture_values,
    benefits:      row.benefits,
    contactEmail:  row.contact_email,
    contactPhone:  row.contact_phone,
    recruiterName: row.recruiter_name,
    logoUrl:       row.logo_url    ?? null,
    faviconUrl:    row.favicon_url ?? null,
    updatedAt:     row.updated_at,
  };
}

// ── GET /api/company ──────────────────────────────────────────────────────────
companyRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`SELECT * FROM company_profile LIMIT 1`);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Company profile not found. Run db:migrate.' });
    }
    return res.json({ success: true, data: rowToProfile(result.rows[0]) });
  } catch (err) {
    logger.error('Get company profile error', { err });
    return res.status(500).json({ success: false, error: 'Failed to fetch company profile' });
  }
});

// ── GET /api/company/completeness ─────────────────────────────────────────────
companyRouter.get('/completeness', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`SELECT * FROM company_profile LIMIT 1`);
    const row = result.rows[0];

    if (!row) {
      return res.json({
        success: true,
        data: { isComplete: false, score: 0, missing: REQUIRED_FIELDS },
      });
    }

    const missing: string[] = [];
    let filled = 0;

    for (const field of COMPLETENESS_FIELDS) {
      const val = row[field.key];
      const isEmpty = field.isList
        ? !Array.isArray(val) || (val as unknown[]).length === 0
        : !val || String(val).trim() === '';

      if (!isEmpty) {
        filled++;
      } else if (field.required) {
        missing.push(field.label);
      }
    }

    const score = Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
    const isComplete = missing.length === 0;

    return res.json({ success: true, data: { isComplete, score, missing } });
  } catch (err) {
    logger.error('Get completeness error', { err });
    return res.status(500).json({ success: false, error: 'Failed to check completeness' });
  }
});

// ── PUT /api/company ──────────────────────────────────────────────────────────
companyRouter.put('/', requireRole('super_admin', 'hr_admin'), async (req: Request, res: Response) => {
  const schema = z.object({
    name:          z.string().min(1).max(200),
    tagline:       z.string().max(300).default(''),
    overview:      z.string().max(3000).default(''),
    industry:      z.string().max(100).default(''),
    companySize:   z.string().max(50).default(''),
    location:      z.string().max(200).default(''),
    website:       z.string().max(300).default(''),
    workMode:      z.enum(['remote', 'hybrid', 'onsite']).default('hybrid'),
    foundedYear:   z.number().int().min(1800).max(new Date().getFullYear()).nullable().optional(),
    techStack:     z.array(z.string().max(100)).default([]),
    services:      z.array(z.string().max(100)).default([]),
    cultureValues: z.array(z.string().max(100)).default([]),
    benefits:      z.array(z.string().max(200)).default([]),
    contactEmail:  z.string().email().or(z.literal('')).default(''),
    contactPhone:  z.string().max(50).default(''),
    recruiterName: z.string().max(100).default(''),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.errors[0]?.message || 'Invalid company profile data',
    });
  }

  const d = parsed.data;

  try {
    const existing = await db.query(`SELECT id FROM company_profile LIMIT 1`);

    let row: Record<string, unknown>;
    if (existing.rows[0]) {
      const result = await db.query(
        `UPDATE company_profile SET
          name = $1, tagline = $2, overview = $3, industry = $4,
          company_size = $5, location = $6, website = $7, work_mode = $8,
          founded_year = $9, tech_stack = $10, services = $11,
          culture_values = $12, benefits = $13, contact_email = $14,
          contact_phone = $15, recruiter_name = $16, updated_at = NOW()
         WHERE id = $17
         RETURNING *`,
        [
          d.name, d.tagline, d.overview, d.industry,
          d.companySize, d.location, d.website, d.workMode,
          d.foundedYear ?? null, JSON.stringify(d.techStack), JSON.stringify(d.services),
          JSON.stringify(d.cultureValues), JSON.stringify(d.benefits), d.contactEmail,
          d.contactPhone, d.recruiterName, existing.rows[0].id,
        ],
      );
      row = result.rows[0];
    } else {
      const result = await db.query(
        `INSERT INTO company_profile (
          name, tagline, overview, industry, company_size, location,
          website, work_mode, founded_year, tech_stack, services,
          culture_values, benefits, contact_email, contact_phone, recruiter_name
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          d.name, d.tagline, d.overview, d.industry,
          d.companySize, d.location, d.website, d.workMode,
          d.foundedYear ?? null, JSON.stringify(d.techStack), JSON.stringify(d.services),
          JSON.stringify(d.cultureValues), JSON.stringify(d.benefits), d.contactEmail,
          d.contactPhone, d.recruiterName,
        ],
      );
      row = result.rows[0];
    }

    return res.json({ success: true, data: rowToProfile(row) });
  } catch (err) {
    logger.error('Update company profile error', { err });
    return res.status(500).json({ success: false, error: 'Failed to update company profile' });
  }
});

// ── POST /api/company/logo ────────────────────────────────────────────────────
companyRouter.post(
  '/logo',
  requireRole('super_admin', 'hr_admin'),
  imageUpload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image provided' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    try {
      await db.query(
        `UPDATE company_profile SET logo_url = $1, updated_at = NOW()
         WHERE id = (SELECT id FROM company_profile LIMIT 1)`,
        [dataUrl],
      );
      return res.json({ success: true, data: { logoUrl: dataUrl } });
    } catch (err) {
      logger.error('Logo upload error', { err });
      return res.status(500).json({ success: false, error: 'Failed to save logo' });
    }
  },
);

// ── DELETE /api/company/logo ──────────────────────────────────────────────────
companyRouter.delete('/logo', requireRole('super_admin', 'hr_admin'), async (_req: Request, res: Response) => {
  try {
    await db.query(
      `UPDATE company_profile SET logo_url = NULL, updated_at = NOW()
       WHERE id = (SELECT id FROM company_profile LIMIT 1)`,
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error('Logo remove error', { err });
    return res.status(500).json({ success: false, error: 'Failed to remove logo' });
  }
});

// ── POST /api/company/favicon ─────────────────────────────────────────────────
companyRouter.post(
  '/favicon',
  requireRole('super_admin', 'hr_admin'),
  imageUpload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image provided' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    try {
      await db.query(
        `UPDATE company_profile SET favicon_url = $1, updated_at = NOW()
         WHERE id = (SELECT id FROM company_profile LIMIT 1)`,
        [dataUrl],
      );
      return res.json({ success: true, data: { faviconUrl: dataUrl } });
    } catch (err) {
      logger.error('Favicon upload error', { err });
      return res.status(500).json({ success: false, error: 'Failed to save favicon' });
    }
  },
);

// ── DELETE /api/company/favicon ───────────────────────────────────────────────
companyRouter.delete('/favicon', requireRole('super_admin', 'hr_admin'), async (_req: Request, res: Response) => {
  try {
    await db.query(
      `UPDATE company_profile SET favicon_url = NULL, updated_at = NOW()
       WHERE id = (SELECT id FROM company_profile LIMIT 1)`,
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error('Favicon remove error', { err });
    return res.status(500).json({ success: false, error: 'Failed to remove favicon' });
  }
});
