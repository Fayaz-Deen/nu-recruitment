import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { companyRouter } from './routes/company';
import { jdRouter } from './routes/jd';
import { resumeRouter } from './routes/resume';
import { interviewRouter } from './routes/interview';
import { communicationRouter } from './routes/communication';
import { scheduleRouter } from './routes/schedule';
import { emailTemplatesRouter } from './routes/emailTemplates';
import { chatRouter } from './routes/chat';
import { candidateRouter } from './routes/candidate';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { db, testDbConnection } from './utils/db';
import { connectRedis, redisClient } from './utils/cache';
import { logger } from './utils/logger';
import { startReminderWorker, stopReminderWorker } from './workers/reminderWorker';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'https://nurecruit-fe.netlify.app',
    'https://nu-recruitment.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Tight limiter on credential endpoints — brute-force / enumeration protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
});

// Liveness: process is up. Readiness: dependencies are reachable.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Cache the DB probe briefly so aggressive prober polling can't starve the pool.
let lastDbCheck = { ok: true, at: 0 };
const DB_CHECK_TTL_MS = 5_000;
app.get('/health/ready', async (_req, res) => {
  if (Date.now() - lastDbCheck.at > DB_CHECK_TTL_MS) {
    try {
      await db.query('SELECT 1');
      lastDbCheck = { ok: true, at: Date.now() };
    } catch {
      lastDbCheck = { ok: false, at: Date.now() };
    }
  }
  const body = {
    status: lastDbCheck.ok ? 'ok' : 'degraded',
    db: lastDbCheck.ok ? 'up' : 'down',
    redis: redisClient.isReady ? 'up' : 'down',
    timestamp: new Date().toISOString(),
  };
  res.status(lastDbCheck.ok ? 200 : 503).json(body);
});

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/accept-invite', authLimiter);
app.use('/api/auth/refresh', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // legit clients refresh every ~15min; 60 leaves headroom for retries
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many refresh attempts.' },
}));
app.use('/api/auth', authRouter);
app.use('/api/schedule', scheduleRouter);    // candidate-facing scheduling links are public
app.use('/api/candidate', candidateRouter);  // candidate-facing interest checks are public

// ── Protected routes (JWT required) ──────────────────────────────────────────
app.use('/api/jd', authenticate, jdRouter);
app.use('/api/resume', authenticate, resumeRouter);
app.use('/api/interview', authenticate, interviewRouter);
app.use('/api/communication', authenticate, communicationRouter);
app.use('/api/users', authenticate, usersRouter);
app.use('/api/company', authenticate, companyRouter);
app.use('/api/email-templates', authenticate, emailTemplatesRouter);
app.use('/api/chat', authenticate, chatRouter);
app.use(errorHandler);

async function start() {
  try {
    await testDbConnection();
    try {
      await connectRedis();
    } catch (redisErr) {
      logger.error('Redis unavailable — continuing without cache', {
        error: redisErr instanceof Error ? redisErr.message : String(redisErr)
      });
    }
    const server = app.listen(PORT, () => {
      logger.info(`🚀 API running on http://localhost:${PORT}`);
    });
    startReminderWorker().catch(err => logger.error('Reminder worker failed to start', { err }));

    // Graceful shutdown: stop accepting connections, finish in-flight requests,
    // then release the worker timer, Redis connection and pg pool.
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received — shutting down gracefully`);

      const forceExit = setTimeout(() => {
        logger.error('Shutdown timed out after 10s — forcing exit');
        process.exit(1);
      }, 10_000);
      forceExit.unref();

      server.close(async () => {
        stopReminderWorker();
        try { if (redisClient.isOpen) await redisClient.quit(); } catch { /* already closed */ }
        try { await db.end(); } catch { /* already closed */ }
        logger.info('Shutdown complete');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server', { err });
    process.exit(1);
  }
}

start();
