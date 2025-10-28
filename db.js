// server/db.js
import 'dotenv/config.js';
import pg from 'pg';

const { Pool } = pg;

/**
 * Use a global singleton so hot-reloads (nodemon) don’t create extra pools.
 */
const globalForPool = globalThis.__pgPool ?? { pool: null };
if (!globalForPool.pool) {
  globalForPool.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
      ? false
      : { rejectUnauthorized: false }, // SSL for hosted PG (Neon/Vercel/Supabase)
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}
export const pool = globalForPool.pool;
globalThis.__pgPool = globalForPool;

/**
 * Ensure schema exists (idempotent).
 */
export async function ensureSchema() {
  await pool.query(`
    create table if not exists messages (
      id        text primary key,
      room      text not null,
      username  text not null,
      text      text not null,
      ts        bigint not null
    );
    create index if not exists messages_room_ts_idx on messages (room, ts desc);
  `);
}

/**
 * Save one message.
 */
export async function saveMessage({ id, room, username, text, ts }) {
  await pool.query(
    `insert into messages (id, room, username, text, ts)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do nothing`,
    [id, room, username, text, String(ts)]
  );
}

/**
 * Get recent N messages for a room (default 50, newest first).
 */
export async function getRecentMessages(room, limit = 50) {
  const { rows } = await pool.query(
    `select id, room, username, text, ts
     from messages
     where room = $1
     order by ts desc
     limit $2`,
    [room, limit]
  );
  // return oldest→newest for display
  return rows.reverse();
}

/**
 * Optional clean shutdown (useful in some hosts/tests).
 */
export async function closePool() {
  await pool.end();
}
