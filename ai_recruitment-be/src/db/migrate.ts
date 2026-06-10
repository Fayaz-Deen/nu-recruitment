import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database');

    // Base schema
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await client.query(initSql);
    console.log('Applied: init.sql');

    // Incremental migrations (alphabetical)
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        console.log(`Applied: migrations/${file}`);
      }
    }

    // Seed initial Super Admin from env vars (only if no users exist yet)
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const adminName = process.env.INITIAL_ADMIN_NAME || 'Admin';

    if (adminEmail && adminPassword) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail.toLowerCase()]);
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 12);
        await client.query(
          `INSERT INTO users (email, password_hash, name, role, status)
           VALUES ($1, $2, $3, 'super_admin', 'active')`,
          [adminEmail.toLowerCase(), hash, adminName],
        );
        console.log(`✅ Created initial Super Admin: ${adminEmail}`);
      } else {
        console.log(`ℹ️  Admin already exists: ${adminEmail}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
