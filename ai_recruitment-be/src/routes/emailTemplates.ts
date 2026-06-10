import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { requireRole, AuthRequest } from '../middleware/auth';



export const emailTemplatesRouter = Router();

// ── Shared helper: load a template and substitute {{variables}} ───────────────

export async function getTemplate(key: string): Promise<{ subject: string; body: string } | null> {
  const result = await db.query(
    `SELECT subject, body FROM email_templates WHERE key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// ── GET /api/email-templates ──────────────────────────────────────────────────

emailTemplatesRouter.get(
  '/',
  requireRole('super_admin', 'hr_admin'),
  async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT et.id, et.key, et.name, et.description, et.subject, et.body,
                et.variables, et.updated_at,
                u.name  AS updated_by_name,
                u.email AS updated_by_email
         FROM email_templates et
         LEFT JOIN users u ON u.id = et.updated_by
         ORDER BY et.name`,
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('List email templates error', { err });
      return res.status(500).json({ success: false, error: 'Failed to list email templates' });
    }
  },
);

// ── GET /api/email-templates/:key ─────────────────────────────────────────────

emailTemplatesRouter.get(
  '/:key',
  requireRole('super_admin', 'hr_admin'),
  async (req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT et.id, et.key, et.name, et.description, et.subject, et.body,
                et.variables, et.updated_at,
                u.name  AS updated_by_name,
                u.email AS updated_by_email
         FROM email_templates et
         LEFT JOIN users u ON u.id = et.updated_by
         WHERE et.key = $1`,
        [req.params.key],
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('Get email template error', { err });
      return res.status(500).json({ success: false, error: 'Failed to get email template' });
    }
  },
);

// ── PUT /api/email-templates/:key ─────────────────────────────────────────────

emailTemplatesRouter.put(
  '/:key',
  requireRole('super_admin', 'hr_admin'),
  async (req: Request, res: Response) => {
    const schema = z.object({
      subject: z.string().min(1, 'Subject is required').max(500),
      body:    z.string().min(1, 'Body is required'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
      });
    }

    const auth = req as AuthRequest;
    const { subject, body } = parsed.data;

    try {
      // Load existing template to snapshot it into history
      const existing = await db.query(
        `SELECT id, subject, body FROM email_templates WHERE key = $1`,
        [req.params.key],
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }

      const { id: templateId } = existing.rows[0];

      await db.query(
        `UPDATE email_templates
         SET subject = $1, body = $2, updated_at = NOW(), updated_by = $3
         WHERE id = $4`,
        [subject, body, auth.user!.sub, templateId],
      );

      // Return updated template
      const updated = await db.query(
        `SELECT et.id, et.key, et.name, et.description, et.subject, et.body,
                et.variables, et.updated_at,
                u.name  AS updated_by_name,
                u.email AS updated_by_email
         FROM email_templates et
         LEFT JOIN users u ON u.id = et.updated_by
         WHERE et.id = $1`,
        [templateId],
      );

      logger.info('Email template updated', { key: req.params.key, by: auth.user!.email });
      return res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
      logger.error('Update email template error', { err });
      return res.status(500).json({ success: false, error: 'Failed to update template' });
    }
  },
);

