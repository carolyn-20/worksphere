if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) { console.error('Missing JWT_SECRET/DATABASE_URL'); process.exit(1); }
const app = require('./app'), { pool } = require('./db');
const server = app.listen(3000, () => console.log('api on :3000'));
const stop = () => server.close(async () => { await pool.end(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
