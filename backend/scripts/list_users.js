const { Client } = require('pg');

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query('SELECT github_username, wallet_address FROM users ORDER BY updated_at DESC NULLS LAST LIMIT 10');
  console.log(JSON.stringify(rows, null, 2));
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
