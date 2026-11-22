const jwt = require('jsonwebtoken'), crypto = require('crypto');
const secret = () => process.env.JWT_SECRET;
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const sign = u => jwt.sign({ sub: u.id, org: u.org_id, role: u.role }, secret(), { expiresIn: '15m' });
const err = (req, res, s, code, message) => res.status(s).json({ error: { code, message, request_id: req.id } });
function auth(req, res, next) {
  try { const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret());
    req.user = { id: p.sub, org: p.org, role: p.role }; next(); }
  catch { err(req, res, 401, 'unauthorized', 'Invalid or missing token'); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : err(req, res, 403, 'forbidden', 'Insufficient role');
// issue a refresh token in a family; rotation + reuse detection in routes
async function issueRefresh(c, userId, familyId) {
  const raw = crypto.randomBytes(48).toString('hex'), fam = familyId || crypto.randomUUID();
  await c.query(`INSERT INTO refresh_tokens(user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`, [userId, fam, hash(raw)]);
  return raw;
}
module.exports = { hash, sign, auth, allow, issueRefresh, err };
