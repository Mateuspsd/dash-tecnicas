// Busca os dados do painel na API de Marketing da Meta.
// O navegador só escolhe a fonte (ds), a conta e o período; as consultas ficam definidas aqui.
const { isAuthed, readJson, send } = require('./_lib');

const API = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}`;

// Contas que o painel pode consultar (BM 01 - Técnicas para Concursos).
const CONTAS = (process.env.META_ACCOUNTS || '268664780005258,1049900431171398,2293124358186724,1609678830686048')
  .split(',').map((s) => s.trim()).filter(Boolean);

const DATE = /^20\d{2}-[01]\d-[0-3]\d$/;

const M_TOTAIS = ['amount_spent', 'impressions', 'reach', 'frequency', 'clicks', 'link_click', 'landing_page_view',
  'omni_initiated_checkout', 'omni_purchase', 'omni_purchase_values', 'video_play_actions',
  'video_p25_watched_actions', 'video_p75_watched_actions', 'video_thruplay_watched_actions'];
const M_BASE = ['amount_spent', 'impressions', 'link_click', 'omni_purchase', 'omni_purchase_values'];
const M_FUNIL = ['amount_spent', 'impressions', 'link_click', 'landing_page_view', 'omni_initiated_checkout', 'omni_purchase', 'omni_purchase_values'];

// Definição de cada fonte do painel.
const DATASETS = {
  totais: { kind: 'insights', level: 'account', metrics: M_TOTAIS },
  totais_ant: { kind: 'insights', level: 'account', metrics: M_TOTAIS },
  diario: { kind: 'insights', level: 'account', metrics: M_BASE, daily: true },
  idade: { kind: 'insights', level: 'account', metrics: M_BASE, breakdowns: ['age'] },
  genero: { kind: 'insights', level: 'account', metrics: M_BASE, breakdowns: ['gender'] },
  posicao: { kind: 'insights', level: 'account', metrics: M_BASE, breakdowns: ['publisher_platform', 'platform_position'] },
  dispositivo: { kind: 'insights', level: 'account', metrics: M_BASE, breakdowns: ['impression_device'] },
  campanhas: { kind: 'entities', level: 'campaign', metrics: M_BASE },
  conjuntos: { kind: 'entities', level: 'adset', metrics: [...M_FUNIL, 'frequency'], budget: true },
  anuncios: { kind: 'entities', level: 'ad', metrics: [...M_FUNIL, 'video_play_actions', 'video_thruplay_watched_actions'] },
  mes: { kind: 'insights', level: 'account', metrics: ['amount_spent'], daily: true, preset: 'this_month' },
  orc_conj: { kind: 'budgets', edge: 'adsets' },
  orc_camp: { kind: 'budgets', edge: 'campaigns' },
};

// Métrica do painel -> campo da API.
function apiFields(metrics) {
  const f = new Set();
  for (const m of metrics) {
    if (m === 'amount_spent') f.add('spend');
    else if (m === 'link_click') f.add('inline_link_clicks');
    else if (m === 'landing_page_view' || m === 'omni_initiated_checkout' || m === 'omni_purchase') f.add('actions');
    else if (m === 'omni_purchase_values') f.add('action_values');
    else f.add(m); // impressions, reach, frequency, clicks e os campos de vídeo
  }
  return [...f];
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const act = (arr, type) => {
  const x = (arr || []).find((a) => a.action_type === type);
  return x ? Number(x.value) : null;
};

function normaliza(r, metrics) {
  const o = {};
  for (const k of ['date_start', 'date_stop', 'age', 'gender', 'publisher_platform', 'platform_position', 'impression_device']) {
    if (r[k] != null) o[k] = String(r[k]);
  }
  for (const m of metrics) {
    if (m === 'amount_spent') o[m] = num(r.spend);
    else if (m === 'link_click') o[m] = num(r.inline_link_clicks);
    else if (m === 'landing_page_view' || m === 'omni_initiated_checkout' || m === 'omni_purchase') o[m] = act(r.actions, m);
    else if (m === 'omni_purchase_values') o[m] = act(r.action_values, 'omni_purchase');
    else if (m.startsWith('video_')) o[m] = act(r[m], 'video_view');
    else o[m] = num(r[m]);
  }
  return o;
}

async function graph(path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  url.searchParams.set('access_token', process.env.META_TOKEN || '');
  const out = [];
  let next = url.toString();
  for (let page = 0; next && page < 10; page++) {
    const r = await fetch(next);
    const j = await r.json();
    if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'Erro da Meta');
    if (Array.isArray(j.data)) out.push(...j.data); else return j;
    next = j.paging && j.paging.next;
  }
  return out;
}

async function porIds(ids, fields) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await graph('/', { ids: ids.slice(i, i + 50).join(','), fields });
    Object.assign(out, j);
  }
  return out;
}

async function run(def, conta, tr) {
  const act_ = `/act_${conta}`;
  if (def.kind === 'budgets') {
    const rows = await graph(`${act_}/${def.edge}`, {
      fields: 'id,name,daily_budget', effective_status: ['ACTIVE'], limit: '200',
    });
    return rows.map((r) => ({ id: r.id, name: r.name, daily_budget: r.daily_budget ? Number(r.daily_budget) / 100 : null }));
  }
  const periodo = def.preset ? { date_preset: def.preset } : { time_range: tr };
  const extra = {};
  if (def.daily) extra.time_increment = '1';
  if (def.breakdowns) extra.breakdowns = def.breakdowns.join(',');

  if (def.kind === 'insights') {
    const rows = await graph(`${act_}/insights`, {
      level: 'account', fields: ['account_id', 'account_name', ...apiFields(def.metrics)].join(','), limit: '500', ...periodo, ...extra,
    });
    return rows.map((r) => ({ id: r.account_id, name: r.account_name, ...normaliza(r, def.metrics) }));
  }

  // Campanhas, conjuntos ou anúncios com gasto no período, com status (e orçamento) atuais.
  const lv = def.level;
  const idF = `${lv}_id`, nameF = `${lv}_name`;
  const base = [idF, nameF];
  if (lv === 'ad') base.push('adset_name');
  const rows = await graph(`${act_}/insights`, {
    level: lv, fields: [...base, ...apiFields(def.metrics)].join(','), limit: '500', ...periodo,
  });
  const list = rows.map((r) => ({
    id: r[idF], name: r[nameF], ...(lv === 'ad' ? { adset_name: r.adset_name } : {}), ...normaliza(r, def.metrics),
  })).filter((r) => (r.amount_spent || 0) > 0);
  const info = await porIds(list.map((r) => r.id), def.budget ? 'effective_status,daily_budget' : 'effective_status');
  for (const r of list) {
    const x = info[r.id] || {};
    r.effective_status = x.effective_status || null;
    if (def.budget) r.daily_budget = x.daily_budget ? Number(x.daily_budget) / 100 : null;
  }
  return list.sort((a, b) => (b.amount_spent || 0) - (a.amount_spent || 0));
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'Faça login' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!process.env.META_TOKEN) return send(res, 500, { error: 'META_TOKEN não configurado no Vercel.' });
  const { ds, conta, tr } = await readJson(req);
  const def = DATASETS[ds];
  if (!def) return send(res, 400, { error: 'Fonte desconhecida' });
  if (!CONTAS.includes(String(conta))) return send(res, 400, { error: 'Conta não permitida' });
  let range = null;
  if (def.kind !== 'budgets' && !def.preset) {
    try { range = JSON.parse(tr); } catch { range = null; }
    if (!range || !DATE.test(range.since) || !DATE.test(range.until)) return send(res, 400, { error: 'Período inválido' });
    range = { since: range.since, until: range.until };
  }
  try {
    const rows = await run(def, String(conta), range);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return send(res, 200, { rows }, { 'Cache-Control': 'private, max-age=300' });
  } catch (e) {
    return send(res, 502, { error: String(e.message || e) });
  }
};
