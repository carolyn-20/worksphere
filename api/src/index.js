if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) { console.error('Missing JWT_SECRET/DATABASE_URL'); process.exit(1); }
const app = require('./app'), { pool } = require('./db');
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`api on :${port}`));
const stop = () => server.close(async () => { await pool.end(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
