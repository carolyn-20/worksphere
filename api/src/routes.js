const { Router } = require('express'), { z } = require('zod'), bcrypt = require('bcryptjs'), crypto = require('crypto');
const { pool, tx } = require('./db'), { hash, sign, auth, allow, issueRefresh, err } = require('./auth');
const r = Router();
const wrap = f => (q, s, n) => Promise.resolve(f(q, s, n)).catch(n);
const audit = (c, u, action, entity, id) => c.query('INSERT INTO audit_logs(org_id,actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4,$5)', [u.org, u.id, action, entity, id]);
const page = q => ({ limit: Math.min(parseInt(q.limit) || 25, 100), offset: Math.max(parseInt(q.offset) || 0, 0) });
const MANAGE = ['owner', 'project_manager', 'platform_admin'], WRITE = [...MANAGE, 'member'];

// ---------- auth ----------
const pw = z.string().min(10).max(128);
r.post('/auth/register', wrap(async (q, s) => {
  const b = z.object({ org_name: z.string().min(2).max(100), name: z.string().min(1).max(100), email: z.string().email(), password: pw }).parse(q.body);
  const out = await tx(async c => {
    const o = (await c.query('INSERT INTO organizations(name) VALUES($1) RETURNING id', [b.org_name])).rows[0];
    const u = (await c.query(`INSERT INTO users(org_id,email,name,password_hash,role) VALUES($1,lower($2),$3,$4,'owner') RETURNING id,org_id,role`, [o.id, b.email, b.name, await bcrypt.hash(b.password, 10)])).rows[0];
    await audit(c, { org: o.id, id: u.id }, 'org.create', 'organization', o.id);
    return { access_token: sign(u), refresh_token: await issueRefresh(c, u.id) };
  });
  s.status(201).json(out);
}));
r.post('/auth/login', wrap(async (q, s) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(q.body);
  const u = (await pool.query('SELECT * FROM users WHERE email=lower($1)', [b.email])).rows[0];
  if (!u || !(await bcrypt.compare(b.password, u.password_hash))) return err(q, s, 401, 'invalid_credentials', 'Email or password incorrect');
  const c = await pool.connect(); try { s.json({ access_token: sign(u), refresh_token: await issueRefresh(c, u.id) }); } finally { c.release(); }
}));
r.post('/auth/refresh', wrap(async (q, s) => {
  const { refresh_token } = z.object({ refresh_token: z.string().min(20) }).parse(q.body);
  const out = await tx(async c => {
    const t = (await c.query('SELECT * FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE', [hash(refresh_token)])).rows[0];
    if (!t || t.expires_at < new Date()) return null;
    if (t.revoked) { await c.query('UPDATE refresh_tokens SET revoked=true WHERE family_id=$1', [t.family_id]); return 'reuse'; } // reuse => revoke family
    await c.query('UPDATE refresh_tokens SET revoked=true WHERE id=$1', [t.id]);
    const u = (await c.query('SELECT id,org_id,role FROM users WHERE id=$1', [t.user_id])).rows[0];
    return { access_token: sign(u), refresh_token: await issueRefresh(c, u.id, t.family_id) };
  });
  if (!out || out === 'reuse') return err(q, s, 401, 'invalid_refresh', 'Refresh token invalid');
  s.json(out);
}));
r.post('/auth/logout', wrap(async (q, s) => {
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(q.body);
  await pool.query('UPDATE refresh_tokens SET revoked=true WHERE family_id=(SELECT family_id FROM refresh_tokens WHERE token_hash=$1)', [hash(refresh_token)]);
  s.status(204).end();
}));
r.post('/auth/accept-invite', wrap(async (q, s) => {
  const b = z.object({ token: z.string(), name: z.string().min(1), password: pw }).parse(q.body);
  await tx(async c => {
    const i = (await c.query('SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE', [hash(b.token)])).rows[0];
    if (!i) throw Object.assign(new Error('bad invite'), { code: 'INVITE' });
    await c.query('INSERT INTO users(org_id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)', [i.org_id, i.email, b.name, await bcrypt.hash(b.password, 10), i.role]);
    await c.query('UPDATE invitations SET accepted_at=now() WHERE id=$1', [i.id]);
  });
  s.status(201).json({ ok: true });
}));

r.use(auth);
// ---------- org / invitations ----------
r.get('/users', wrap(async (q, s) => s.json((await pool.query('SELECT id,name,email,role FROM users WHERE org_id=$1 ORDER BY name', [q.user.org])).rows)));
r.post('/invitations', allow('owner', 'project_manager'), wrap(async (q, s) => {
  const b = z.object({ email: z.string().email(), role: z.enum(['project_manager', 'member', 'auditor']) }).parse(q.body);
  if (q.user.role === 'project_manager' && b.role === 'project_manager') return err(q, s, 403, 'forbidden', 'Only owners invite managers');
  const raw = crypto.randomBytes(24).toString('hex');
  await tx(async c => {
    await c.query(`INSERT INTO invitations(org_id,email,role,token_hash,expires_at) VALUES($1,lower($2),$3,$4,now()+interval '3 days')`, [q.user.org, b.email, b.role, hash(raw)]);
    await audit(c, q.user, 'invite.create', 'invitation', b.email);
  });
  s.status(201).json({ invite_token: raw, note: 'Email delivery is mocked; share this token.' });
}));
r.post('/teams', allow('owner', 'project_manager'), wrap(async (q, s) => {
  const b = z.object({ name: z.string().min(1).max(80) }).parse(q.body);
  s.status(201).json((await pool.query('INSERT INTO teams(org_id,name) VALUES($1,$2) RETURNING *', [q.user.org, b.name])).rows[0]);
}));

// ---------- projects / milestones ----------
r.get('/projects', wrap(async (q, s) => { const p = page(q.query);
  s.json((await pool.query('SELECT * FROM projects WHERE org_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [q.user.org, p.limit, p.offset])).rows); }));
r.post('/projects', allow(...MANAGE), wrap(async (q, s) => {
  const b = z.object({ name: z.string().min(1).max(120) }).parse(q.body);
  const row = await tx(async c => { const p = (await c.query('INSERT INTO projects(org_id,name) VALUES($1,$2) RETURNING *', [q.user.org, b.name])).rows[0]; await audit(c, q.user, 'project.create', 'project', p.id); return p; });
  s.status(201).json(row);
}));
r.post('/projects/:pid/milestones', allow(...MANAGE), wrap(async (q, s) => {
  const b = z.object({ name: z.string().min(1), due_date: z.string().date().optional() }).parse(q.body);
  const row = await pool.query('INSERT INTO milestones(org_id,project_id,name,due_date) SELECT $1,id,$3,$4 FROM projects WHERE id=$2 AND org_id=$1 RETURNING *', [q.user.org, q.params.pid, b.name, b.due_date || null]);
  row.rows[0] ? s.status(201).json(row.rows[0]) : err(q, s, 404, 'not_found', 'Project not found');
}));

// ---------- tasks ----------
const taskIn = z.object({ title: z.string().min(1).max(200), description: z.string().max(5000).optional(), assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(), parent_id: z.string().uuid().nullable().optional(), milestone_id: z.string().uuid().nullable().optional() });
r.get('/projects/:pid/tasks', wrap(async (q, s) => { const p = page(q.query), st = q.query.status || null;
  s.json((await pool.query('SELECT * FROM tasks WHERE org_id=$1 AND project_id=$2 AND ($3::text IS NULL OR status=$3) ORDER BY created_at LIMIT $4 OFFSET $5', [q.user.org, q.params.pid, st, p.limit, p.offset])).rows); }));
r.post('/projects/:pid/tasks', allow(...WRITE), wrap(async (q, s) => {
  const b = taskIn.parse(q.body);
  const t = await tx(async c => {
    const ok = (await c.query('SELECT 1 FROM projects WHERE id=$1 AND org_id=$2', [q.params.pid, q.user.org])).rowCount;
    if (!ok) return null;
    if (b.assignee_id && !(await c.query('SELECT 1 FROM users WHERE id=$1 AND org_id=$2', [b.assignee_id, q.user.org])).rowCount) return 'bad_assignee';
    const t = (await c.query('INSERT INTO tasks(org_id,project_id,title,description,assignee_id,due_date,parent_id,milestone_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [q.user.org, q.params.pid, b.title, b.description || '', b.assignee_id || null, b.due_date || null, b.parent_id || null, b.milestone_id || null])).rows[0];
    await c.query(`INSERT INTO activity_events(org_id,task_id,actor_id,version,action,changes) VALUES($1,$2,$3,1,'created',$4)`, [q.user.org, t.id, q.user.id, JSON.stringify({ title: b.title })]);
    return t;
  });
  if (!t) return err(q, s, 404, 'not_found', 'Project not found');
  if (t === 'bad_assignee') return err(q, s, 422, 'invalid_assignee', 'Assignee not in organization');
  s.status(201).json(t);
}));
// Optimistic concurrency: client must send the version it read. Stale => 409 with current row.
r.patch('/tasks/:id', allow(...WRITE), wrap(async (q, s) => {
  const b = taskIn.partial().extend({ status: z.enum(['todo', 'in_progress', 'done']).optional(), version: z.number().int().positive() }).parse(q.body);
  const res = await tx(async c => {
    const cur = (await c.query('SELECT * FROM tasks WHERE id=$1 AND org_id=$2', [q.params.id, q.user.org])).rows[0];
    if (!cur) return { s: 404 };
    const f = ['title', 'description', 'status', 'assignee_id', 'due_date', 'milestone_id'].filter(k => b[k] !== undefined);
    const changes = {}; f.forEach(k => changes[k] = { from: cur[k], to: b[k] });
    const sets = f.map((k, i) => `${k}=$${i + 4}`).join(',');
    const u = await c.query(`UPDATE tasks SET ${sets}${sets ? ',' : ''} version=version+1, updated_at=now() WHERE id=$1 AND org_id=$2 AND version=$3 RETURNING *`, [q.params.id, q.user.org, b.version, ...f.map(k => b[k])]);
    if (!u.rowCount) return { s: 409, current: cur };
    const t = u.rows[0];
    await c.query(`INSERT INTO activity_events(org_id,task_id,actor_id,version,action,changes) VALUES($1,$2,$3,$4,'updated',$5)`, [q.user.org, t.id, q.user.id, t.version, JSON.stringify(changes)]);
    if (t.assignee_id && t.assignee_id !== q.user.id) // dedupe_key => retries/dups never double-notify
      await c.query(`INSERT INTO notifications(org_id,user_id,kind,payload,dedupe_key) VALUES($1,$2,'task_updated',$3,$4) ON CONFLICT (dedupe_key) DO NOTHING`, [q.user.org, t.assignee_id, JSON.stringify({ task_id: t.id, title: t.title }), `task:${t.id}:v${t.version}:${t.assignee_id}`]);
    return { s: 200, t };
  });
  if (res.s === 404) return err(q, s, 404, 'not_found', 'Task not found');
  if (res.s === 409) return s.status(409).json({ error: { code: 'stale_version', message: 'Task changed since you loaded it', request_id: q.id, current: res.current } });
  s.json(res.t);
}));
r.get('/tasks/:id/activity', wrap(async (q, s) => s.json((await pool.query('SELECT * FROM activity_events WHERE task_id=$1 AND org_id=$2 ORDER BY version', [q.params.id, q.user.org])).rows)));
r.post('/tasks/:id/comments', allow(...WRITE), wrap(async (q, s) => {
  const b = z.object({ body: z.string().min(1).max(4000) }).parse(q.body);
  const row = await pool.query('INSERT INTO comments(org_id,task_id,author_id,body) SELECT $1,id,$3,$4 FROM tasks WHERE id=$2 AND org_id=$1 RETURNING *', [q.user.org, q.params.id, q.user.id, b.body]);
  row.rows[0] ? s.status(201).json(row.rows[0]) : err(q, s, 404, 'not_found', 'Task not found');
}));
r.get('/tasks/:id/comments', wrap(async (q, s) => s.json((await pool.query('SELECT * FROM comments WHERE task_id=$1 AND org_id=$2 ORDER BY created_at', [q.params.id, q.user.org])).rows)));
r.get('/notifications', wrap(async (q, s) => s.json((await pool.query('SELECT id,kind,payload,status,created_at FROM notifications WHERE user_id=$1 AND org_id=$2 ORDER BY id DESC LIMIT 50', [q.user.id, q.user.org])).rows)));
r.get('/audit', allow('owner', 'auditor', 'platform_admin'), wrap(async (q, s) => { const p = page(q.query);
  s.json((await pool.query('SELECT * FROM audit_logs WHERE org_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3', [q.user.org, p.limit, p.offset])).rows); }));

// ---------- analytics (via FastAPI service) ----------
async function svc(path, body) {
  const res = await fetch(process.env.ANALYTICS_URL + path, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', 'x-service-key': process.env.SERVICE_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw Object.assign(new Error('analytics ' + res.status), { upstream: true });
  return res.json();
}
r.get('/projects/:pid/health', wrap(async (q, s) => {
  const t = (await pool.query('SELECT id,status,assignee_id,due_date,created_at,updated_at FROM tasks WHERE org_id=$1 AND project_id=$2 LIMIT 5000', [q.user.org, q.params.pid])).rows;
  try { s.json(await svc('/v1/project-health', { tasks: t })); } catch { err(q, s, 502, 'analytics_unavailable', 'Analytics service unavailable'); }
}));
module.exports = r;
