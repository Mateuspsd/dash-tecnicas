// Funções compartilhadas pelas rotas da API (arquivos com "_" não viram rota no Vercel).
const crypto = require('crypto');

const COOKIE = 'dash_auth';

function token() {
  const pass = process.env.DASH_PASSWORD || '';
  return crypto.createHmac('sha256', pass).update('dash-tecnicas-ok').digest('hex');
}

function isAuthed(req) {
  if (!process.env.DASH_PASSWORD) return false;
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!m) return false;
  const got = Buffer.from(m.slice(COOKIE.length + 1));
  const want = Buffer.from(token());
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  });
}

function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

module.exports = { COOKIE, token, isAuthed, readJson, send };
