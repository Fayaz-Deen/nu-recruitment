import { createClient } from 'redis';
import { logger } from './logger';

// Redis is an optional cache: when it's down, every operation must fail fast
// (or no-op) so requests degrade to cache-less instead of hanging.
//  - disableOfflineQueue: commands reject immediately while disconnected,
//    instead of queueing forever (which froze /api/resume/upload for 60s+).
//  - reconnectStrategy: capped exponential backoff instead of twice a second.
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => Math.min(retries * 500, 30_000),
  },
});

let lastErrorLog = 0;
client.on('error', (err) => {
  // Throttle: one log line per 30s, not one per reconnect attempt
  const now = Date.now();
  if (now - lastErrorLog > 30_000) {
    lastErrorLog = now;
    logger.error('Redis error', { err: err instanceof Error ? err.message : String(err) });
  }
});

export async function connectRedis() {
  // connect() keeps retrying in the background after the race rejects —
  // swallow its eventual rejection so it can't surface as unhandled.
  const connecting = client.connect();
  connecting.catch(() => { /* logged via the error handler above */ });
  await Promise.race([
    connecting,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
    ),
  ]);
  logger.info('✅ Redis connected');
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!client.isReady) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 3600) {
  if (!client.isReady) return;
  try {
    await client.setEx(key, ttlSeconds, value);
  } catch (err) {
    logger.error('Redis set error', { err });
  }
}

export async function cacheDel(key: string) {
  if (!client.isReady) return;
  try {
    await client.del(key);
  } catch (err) {
    logger.error('Redis del error', { err });
  }
}

export { client as redisClient };
