process.env.JWT_SECRET = 'test'; process.env.DATABASE_URL = 'postgres://x:x@127.0.0.1:1/x';
const test = require('node:test'), assert = require('node:assert'), request = require('supertest'), jwt = require('jsonwebtoken');
const app = require('../src/app');
test('healthz ok', async () => assert.equal((await request(app).get('/healthz')).status, 200));
test('protected route needs token', async () => assert.equal((await request(app).get('/api/v1/projects')).status, 401));
test('register validates input', async () => {
  const r = await request(app).post('/api/v1/auth/register').send({ email: 'bad', password: 'x' });
  assert.equal(r.status, 422); assert.equal(r.body.error.code, 'validation_error');
});
test('member cannot create project (RBAC)', async () => {
  const t = jwt.sign({ sub: 'u', org: 'o', role: 'member' }, 'test');
  assert.equal((await request(app).post('/api/v1/projects').set('Authorization', 'Bearer ' + t).send({ name: 'x' })).status, 403);
});
test('auditor cannot write tasks', async () => {
  const t = jwt.sign({ sub: 'u', org: 'o', role: 'auditor' }, 'test');
  assert.equal((await request(app).post('/api/v1/projects/abc/tasks').set('Authorization', 'Bearer ' + t).send({ title: 'x' })).status, 403);
});
test('readyz reports failure path when DB down', async () => assert.equal((await request(app).get('/readyz')).status, 503));
