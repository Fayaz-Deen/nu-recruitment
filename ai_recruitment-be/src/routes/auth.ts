import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  findUserByRefreshToken,
  revokeRefreshToken,
  generateSecureToken,
} from '../services/authService';
import { sendEmail } from '../services/emailService';
import { getTemplate, renderTemplate } from './emailTemplates';

export const authRouter = Router();

const REFRESH_COOKIE = 'r_token';

const isProd = process.env.NODE_ENV === 'production';

// Cross-origin (Netlify → Railway) requires SameSite=None;Secure.
// SameSite=Strict silently blocks the cookie on cross-origin requests,
// making every refresh attempt fail with 401 and logging the user out.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// clearCookie must carry the same Secure + SameSite as the original Set-Cookie,
// otherwise the browser ignores the deletion on cross-origin cookies.
const CLEAR_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Valid email and password required' });
  }

  const { email, password } = parsed.data;

  try {
    const result = await db.query(
      `SELECT id, email, name, role, status, password_hash FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );

    const user = result.rows[0];

    // Constant-time delay to prevent email enumeration
    if (!user || !user.password_hash) {
      await new Promise((r) => setTimeout(r, 200));
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ success: false, error: 'Account is disabled. Contact your administrator.' });
    }

    if (user.status === 'invited') {
      return res.status(403).json({ success: false, error: 'Please accept your invite first' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
    const accessToken = signAccessToken(payload);
    const refreshToken = await createRefreshToken(user.id, req.ip, req.headers['user-agent']);

    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);

    return res.json({
      success: true,
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    logger.error('Login error', { err });
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No refresh token' });
  }

  try {
    const user = await findUserByRefreshToken(token);
    if (!user) {
      res.clearCookie(REFRESH_COOKIE, CLEAR_COOKIE_OPTS);
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }

    const newRefreshToken = await rotateRefreshToken(
      token,
      user.id,
      req.ip,
      req.headers['user-agent'] as string,
    );

    if (!newRefreshToken) {
      res.clearCookie(REFRESH_COOKIE, CLEAR_COOKIE_OPTS);
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.cookie(REFRESH_COOKIE, newRefreshToken, COOKIE_OPTS);

    return res.json({
      success: true,
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    logger.error('Refresh error', { err });
    return res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
authRouter.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      await revokeRefreshToken(token);
    } catch (err) {
      logger.error('Logout revoke error', { err });
    }
  }
  res.clearCookie(REFRESH_COOKIE, CLEAR_COOKIE_OPTS);
  return res.json({ success: true });
});

// ── POST /api/auth/accept-invite ──────────────────────────────────────────────
authRouter.post('/accept-invite', async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
    name: z.string().min(1).max(100),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.errors[0]?.message || 'Name and password (min 8 chars) required',
    });
  }

  const { token, name, password } = parsed.data;

  try {
    const result = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM invite_tokens WHERE token = $1`,
      [token],
    );

    if (!result.rows[0]) {
      return res.status(400).json({ success: false, error: 'Invalid invite link' });
    }

    const invite = result.rows[0];

    if (invite.used_at) {
      return res.status(400).json({ success: false, error: 'This invite has already been used' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Invite link has expired. Ask your admin to resend.' });
    }

    const passwordHash = await hashPassword(password);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users
         SET name = $1, password_hash = $2, status = 'active', updated_at = NOW()
         WHERE id = $3`,
        [name.trim(), passwordHash, invite.user_id],
      );
      await client.query(
        `UPDATE invite_tokens SET used_at = NOW() WHERE id = $1`,
        [invite.id],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({ success: true, data: { message: 'Account activated. You can now log in.' } });
  } catch (err) {
    logger.error('Accept invite error', { err });
    return res.status(500).json({ success: false, error: 'Failed to activate account' });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }

  const { email } = parsed.data;

  // Always return success — prevents email enumeration
  try {
    const result = await db.query(
      `SELECT id FROM users WHERE email = $1 AND status = 'active'`,
      [email.toLowerCase()],
    );

    if (result.rows[0]) {
      const token = generateSecureToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [result.rows[0].id, token, expiresAt],
      );

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

      try {
        const companyRow = await db.query(`SELECT name FROM company_profile LIMIT 1`);
        const companyName = companyRow.rows[0]?.name ?? 'Recruit360';
        const userRow = await db.query(`SELECT name FROM users WHERE id = $1`, [result.rows[0].id]);
        const userName = userRow.rows[0]?.name ?? '';

        const tpl = await getTemplate('password_reset');
        const vars = { company_name: companyName, user_name: userName, reset_link: resetUrl };
        const subject = tpl ? renderTemplate(tpl.subject, vars) : `Reset your ${companyName} password`;
        const body    = tpl ? renderTemplate(tpl.body, vars)
          : `<p>Hi ${userName},</p><p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

        await sendEmail(email, subject, body);
      } catch (emailErr) {
        logger.error('Failed to send reset email', { emailErr });
      }
    }

    return res.json({
      success: true,
      data: { message: 'If that email is registered, a reset link has been sent.' },
    });
  } catch (err) {
    logger.error('Forgot password error', { err });
    return res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.errors[0]?.message || 'Token and password (min 8 chars) required',
    });
  }

  const { token, password } = parsed.data;

  try {
    const result = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1`,
      [token],
    );

    if (!result.rows[0]) {
      return res.status(400).json({ success: false, error: 'Invalid reset link' });
    }

    const resetToken = result.rows[0];

    if (resetToken.used_at) {
      return res.status(400).json({ success: false, error: 'Reset link already used' });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset link has expired. Request a new one.' });
    }

    const passwordHash = await hashPassword(password);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, resetToken.user_id],
      );
      await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [resetToken.id]);
      // Revoke all refresh tokens for this user (security: all devices logged out)
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [resetToken.user_id],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      success: true,
      data: { message: 'Password updated. Please log in with your new password.' },
    });
  } catch (err) {
    logger.error('Reset password error', { err });
    return res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// ── GET /api/auth/me  (session restore on page reload) ───────────────────────
authRouter.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    const user = await findUserByRefreshToken(token);
    if (!user) {
      res.clearCookie(REFRESH_COOKIE, CLEAR_COOKIE_OPTS);
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    logger.error('Me endpoint error', { err });
    return res.status(500).json({ success: false, error: 'Failed to restore session' });
  }
});
