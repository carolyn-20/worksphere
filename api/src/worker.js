// Outbox worker: SKIP LOCKED => safe with multiple/restarting workers; attempts cap => dead-letter.
const { pool, tx } = require('./db');
const MAX = 5; let run = true;
async function send(n) { console.log(JSON.stringify({ level: 'info', msg: 'MOCK email send', notification: n.id, kind: n.kind })); } // mocked provider
async function tick() {
  await tx(async c => {
    const rows = (await c.query(`SELECT * FROM notifications WHERE status='pending' ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED`)).rows;
    for (const n of rows) {
      try { await send(n); await c.query(`UPDATE notifications SET status='sent', attempts=attempts+1 WHERE id=$1`, [n.id]); }
      catch (e) { await c.query(`UPDATE notifications SET attempts=attempts+1, last_error=$2, status=CASE WHEN attempts+1>=$3 THEN 'dead' ELSE 'pending' END WHERE id=$1`, [n.id, e.message, MAX]); }
    }
  });
}
(async () => { while (run) { try { await tick(); } catch (e) { console.error(e.message); } await new Promise(r => setTimeout(r, 2000)); } await pool.end(); })();
process.on('SIGTERM', () => { run = false; });
