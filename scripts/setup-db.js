// Creates every table in an empty database from scripts/schema.sql, for a new
// firm's deployment, and lets the given emails register. No data is copied:
// the first user to register becomes admin, adds the rest of the team in the
// Admin panel and fills in Firm and Operations settings.
//
//   node scripts/setup-db.js "postgresql://user:pass@host/db?sslmode=require" admin@firm.com
//
// The URL is a required argument (never read from .env.local) so this can't
// run against the wrong database by accident. On a database that already has
// tables it only adds the emails.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const [url, ...emails] = process.argv.slice(2);
if (!url) { console.error('Usage: node scripts/setup-db.js <DATABASE_URL> [email ...]'); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: /localhost/.test(url) ? false : { rejectUnauthorized: false } });

(async () => {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
  if (rows[0].n > 0 && emails.length === 0) {
    console.error(`Refusing: this database already has ${rows[0].n} tables. Use an empty database.`);
    process.exit(1);
  }
  if (rows[0].n === 0) await createSchema();

  for (const email of emails) {
    await pool.query(
      `INSERT INTO allowed_emails (email, added_by) VALUES ($1, 'setup') ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase().trim()],
    );
  }

  const after = await pool.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
  const allowed = await pool.query(`SELECT email FROM allowed_emails ORDER BY created_at`);
  console.log(`Done: ${after.rows[0].n} tables. Allowed to register: ${allowed.rows.map(r => r.email).join(', ') || 'nobody yet'}.`);
  console.log('Deploy, then register — the first account becomes admin.');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });

async function createSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
