import { Pool, PoolClient } from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("[db] DATABASE_URL is not set. Set this in your .env for local runs.");
}

const pool = new Pool({
  connectionString: DATABASE_URL
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params)
};

export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  try {
    const sqlPath = path.resolve(__dirname, "../migrations/init.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log("[db] migrations applied");
  } catch (err: any) {
    console.error("[db] migration error:", err.message);
    // Intentionally non-fatal for a dev skeleton; ensure your DB is reachable.
  }
}

// Allow running "npm run migrate" to apply migrations quickly in dev
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "migrate") {
    runMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
