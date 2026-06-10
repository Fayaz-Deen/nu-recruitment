import { Pool } from 'pg';
import { logger } from './logger';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in .env');
}

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on('error', (err) => {
  logger.error('Postgres pool error', { err });
});

export async function testDbConnection() {
  const client = await db.connect();
  const res = await client.query('SELECT NOW()');
  client.release();
  logger.info('✅ Postgres connected', { time: res.rows[0].now });
}
