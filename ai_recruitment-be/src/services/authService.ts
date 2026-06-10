import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../utils/db';

const BCRYPT_ROUNDS = 12;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in .env');
}

// Fail fast on a malformed expiry instead of silently signing tokens with
// whatever string happens to be in the environment. Pattern mirrors the `ms`
// grammar jsonwebtoken accepts (bare seconds, or number + unit incl. long forms).
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const MS_GRAMMAR = /^\d+(\.\d+)?\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)?$/i;
if (!MS_GRAMMAR.test(JWT_EXPIRES_IN.trim())) {
  throw new Error(`Invalid JWT_EXPIRES_IN "${JWT_EXPIRES_IN}" — expected formats like "900", "15m", "1h", "7 days"`);
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
}

// ── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Access token (JWT, short-lived) ──────────────────────────────────────────

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
}

// ── Refresh token (opaque UUID, stored as SHA-256 hash) ──────────────────────

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(
  userId: string,
  ip?: string,
  userAgent?: string,
): Promise<string> {
  const token = crypto.randomUUID();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, ip ?? null, userAgent ?? null],
  );

  return token;
}

export async function rotateRefreshToken(
  oldToken: string,
  userId: string,
  ip?: string,
  userAgent?: string,
): Promise<string | null> {
  const oldHash = hashToken(oldToken);

  const result = await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND user_id   = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     RETURNING id`,
    [oldHash, userId],
  );

  if ((result.rowCount ?? 0) === 0) return null;

  return createRefreshToken(userId, ip, userAgent);
}

export async function findUserByRefreshToken(
  token: string,
): Promise<{ id: string; email: string; name: string; role: string } | null> {
  const hash = hashToken(token);
  const result = await db.query(
    `SELECT u.id, u.email, u.name, u.role
     FROM users u
     JOIN refresh_tokens rt ON rt.user_id = u.id
     WHERE rt.token_hash = $1
       AND rt.revoked_at IS NULL
       AND rt.expires_at > NOW()
       AND u.status = 'active'`,
    [hash],
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const hash = hashToken(token);
  await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hash]);
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

// ── One-time secure tokens (invite / password reset) ─────────────────────────

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
