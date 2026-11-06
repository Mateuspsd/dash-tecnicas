const crypto = require('crypto');
const { COOKIE, token, readJson, send } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  const pass = process.env.DASH_PASSWORD;
  if (!pass) return send(res, 500, { error: 'DASH_PASSWORD não configurada no Vercel.' });
  const { senha } = await readJson(req);
  const a = Buffer.from(String(senha || ''));
  const b = Buffer.from(pass);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600));
    return send(res, 401, { error: 'Senha incorreta' });
  }
  const maxAge = 60 * 60 * 24 * 30;
  return send(res, 200, { ok: true }, {
    'Set-Cookie': `${COOKIE}=${token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  });
};
