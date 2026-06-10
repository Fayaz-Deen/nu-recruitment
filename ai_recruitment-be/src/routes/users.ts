import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { requireRole, AuthRequest } from '../middleware/auth';
import {
  generateSecureToken,
  hashPassword,
  verifyPassword,
  revokeAllUserRefreshTokens,
  hashToken,
} from '../services/authService';
import { sendEmail } from '../services/emailService';
import { getTemplate, renderTemplate } from './emailTemplates';

export const usersRouter = Router();

const VALID_ROLES = ['super_admin', 'hr_admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;
type Role = typeof VALID_ROLES[number];

const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
// Update the authenticated user's own profile. Registered before any /:id
// routes so "me" never matches as an ID parameter.
usersRouter.patch('/me', async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid profile data' });
  }

  const auth = req as AuthRequest;

  try {
    const result = await db.query(
      `UPDATE users SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, role`,
      [parsed.data.name, auth.user!.sub],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update own profile error', { err });
    return res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// ── POST /api/users/me/password ───────────────────────────────────────────────
// Change own password; requires the current password and logs out all other sessions.
usersRouter.post('/me/password', async (req: Request, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid password data' });
  }

  const auth = req as AuthRequest;
  const { currentPassword, newPassword } = parsed.data;

  try {
    const result = await db.query(
      `SELECT password_hash FROM users WHERE id = $1 AND status = 'active'`,
      [auth.user!.sub],
    );

    const user = result.rows[0];
    if (!user?.password_hash) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, auth.user!.sub],
    );

    // Security: invalidate every OTHER session after a password change.
    // The session performing the change keeps its refresh token.
    const currentToken = req.cookies?.r_token;
    if (currentToken) {
      await db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL AND token_hash != $2`,
        [auth.user!.sub, hashToken(currentToken)],
      );
    } else {
      await revokeAllUserRefreshTokens(auth.user!.sub);
    }

    return res.json({ success: true, data: { message: 'Password updated. Other sessions have been logged out.' } });
  } catch (err) {
    logger.error('Change own password error', { err });
    return res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// ── GET /api/users ────────────────────────────────────────────────────────────
usersRouter.get('/', requireRole('super_admin', 'hr_admin'), async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.status,
              u.created_at, u.last_login,
              inv.email AS invited_by_email
       FROM users u
       LEFT JOIN users inv ON inv.id = u.invited_by
       ORDER BY u.created_at DESC`,
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('List users error', { err });
    return res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

// ── POST /api/users/invite ────────────────────────────────────────────────────
usersRouter.post('/invite', requireRole('super_admin', 'hr_admin'), async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(VALID_ROLES),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Valid email and role required' });
  }

  const { email, role } = parsed.data;
  const auth = req as AuthRequest;

  // hr_admin cannot invite super_admin
  if (auth.user!.role === 'hr_admin' && role === 'super_admin') {
    return res.status(403).json({ success: false, error: 'HR Admin cannot invite Super Admin' });
  }

  try {
    const existing = await db.query(`SELECT id, status FROM users WHERE email = $1`, [email.toLowerCase()]);
    if (existing.rows[0]) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }

    const client = await db.connect();
    let userId: string;
    let inviteUrl: string;

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (email, role, status, invited_by)
         VALUES ($1, $2, 'invited', $3)
         RETURNING id`,
        [email.toLowerCase(), role, auth.user!.sub],
      );
      userId = userResult.rows[0].id;

      const token = generateSecureToken();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      await client.query(
        `INSERT INTO invite_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [userId, token, expiresAt],
      );

      await client.query('COMMIT');
      inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    try {
      const companyRow = await db.query(`SELECT name FROM company_profile LIMIT 1`);
      const companyName = companyRow.rows[0]?.name ?? 'Recruit360';
      const inviterRow  = await db.query(`SELECT name FROM users WHERE id = $1`, [auth.user!.sub]);
      const inviterName = inviterRow.rows[0]?.name ?? auth.user!.email;

      const tpl = await getTemplate('user_invite');
      if (tpl) {
        const vars = { company_name: companyName, inviter_name: inviterName, role_label: roleLabel(role), invite_link: inviteUrl };
        await sendEmail(email, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars));
      } else {
        logger.warn('user_invite template not found — invite created but email not sent');
      }
    } catch (emailErr) {
      logger.error('Failed to send invite email — invite URL returned for manual sharing', { emailErr });
    }

    return res.status(201).json({ success: true, data: { message: 'Invite sent', inviteUrl } });
  } catch (err) {
    logger.error('Invite user error', { err });
    return res.status(500).json({ success: false, error: 'Failed to invite user' });
  }
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
usersRouter.patch('/:id', requireRole('super_admin', 'hr_admin'), async (req: Request, res: Response) => {
  const schema = z.object({
    role: z.enum(VALID_ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid update fields' });
  }

  const { id } = req.params;
  const auth = req as AuthRequest;

  if (id === auth.user!.sub) {
    return res.status(400).json({ success: false, error: 'Cannot modify your own account' });
  }

  const updates = parsed.data;
  if (!updates.role && !updates.status) {
    return res.status(400).json({ success: false, error: 'Nothing to update' });
  }

  try {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (updates.role !== undefined) { sets.push(`role = $${i++}`); values.push(updates.role); }
    if (updates.status !== undefined) { sets.push(`status = $${i++}`); values.push(updates.status); }
    sets.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, status`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update user error', { err });
    return res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// ── POST /api/users/:id/resend-invite ─────────────────────────────────────────
usersRouter.post('/:id/resend-invite', requireRole('super_admin', 'hr_admin'), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query(`SELECT id, email, status FROM users WHERE id = $1`, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.status !== 'invited') {
      return res.status(400).json({ success: false, error: 'User already has an active account' });
    }

    // Expire all pending tokens for this user
    await db.query(
      `UPDATE invite_tokens SET expires_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [id],
    );

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO invite_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [id, token, expiresAt],
    );

    const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;

    try {
      const companyRow = await db.query(`SELECT name FROM company_profile LIMIT 1`);
      const companyName = companyRow.rows[0]?.name ?? 'Recruit360';

      const tpl = await getTemplate('user_invite');
      if (tpl) {
        const vars = { company_name: companyName, inviter_name: companyName, role_label: '', invite_link: inviteUrl };
        await sendEmail(user.email, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars));
      } else {
        logger.warn('user_invite template not found — resend invite email not sent');
      }
    } catch (emailErr) {
      logger.error('Failed to resend invite email', { emailErr });
    }

    return res.json({ success: true, data: { message: 'Invite resent', inviteUrl } });
  } catch (err) {
    logger.error('Resend invite error', { err });
    return res.status(500).json({ success: false, error: 'Failed to resend invite' });
  }
});
