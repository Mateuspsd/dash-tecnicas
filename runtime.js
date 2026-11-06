// Mini-runtime do painel: oferece o objeto `dash` que a página usa
// (dados, cálculos, desenhos e filtros), buscando os dados em /api/meta.
(function () {
  const DEFAULTS = { conta: '268664780005258', periodo: 'd30' };
  // Quais filtros cada fonte usa (conta + qual período).
  const KEYS = {
    totais: 'tr', totais_ant: 'tr_ant', diario: 'tr', campanhas: 'tr', anuncios: 'tr', conjuntos: 'tr',
    idade: 'tr', genero: 'tr', posicao: 'tr', dispositivo: 'tr', mes: null, orc_conj: null, orc_camp: null,
  };
  const COLORS = ['#7c6cf6', '#22c3a6', '#f5a524', '#ec5c9a', '#3b8cf6', '#4ccb6f', '#b46cf6', '#f2614c'];

  const state = { params: { ...DEFAULTS }, cache: new Map(), calcs: {}, onData: [], draws: {}, calcMemo: new Map(), queued: false };

  const keyFor = (id) => `${id}|${state.params.conta}|${KEYS[id] ? state.params[KEYS[id]] : ''}`;

  function load(id, force) {
    const key = keyFor(id);
    let e = state.cache.get(key);
    if (e && !force) return e;
    const prev = e && e.status === 'ok' ? e : null;
    e = { status: prev ? 'ok' : 'loading', data: prev ? prev.data : [], refreshing: !!prev };
    state.cache.set(key, e);
    const tr = KEYS[id] ? state.params[KEYS[id]] : null;
    if (KEYS[id] && !tr) { e.status = 'loading'; return e; }
    fetch('/api/meta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ ds: id, conta: state.params.conta, tr }),
    }).then(async (r) => {
      if (r.status === 401) { state.cache.delete(key); window.dashLogin && window.dashLogin(); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
      e.status = 'ok'; e.data = j.rows || []; e.refreshing = false;
    }).catch((err) => {
      e.status = 'error'; e.message = String(err.message || err); e.refreshing = false;
      console.warn('[painel] fonte', id, e.message);
    }).finally(schedule);
    return e;
  }

  function calcResult(id) {
    if (state.calcMemo.has(id)) return state.calcMemo.get(id);
    const c = state.calcs[id];
    const ins = c.inputs.map((i) => api.data(i));
    let out;
    const bad = ins.find((x) => x.status !== 'ok');
    if (bad) out = { status: bad.status, data: [], message: bad.message };
    else {
      try { out = { status: 'ok', data: c.fn(...ins.map((x) => x.data)) }; }
      catch (err) { out = { status: 'error', data: [], message: String(err.message || err) }; console.warn('[painel] cálculo', id, err); }
    }
    state.calcMemo.set(id, out);
    return out;
  }

  function wrap(x) {
    const data = Array.isArray(x.data) ? x.data : [];
    return { status: x.status, data, rows: data, columns: data[0] ? Object.keys(data[0]) : [], message: x.message || '', refreshing: !!x.refreshing, meta: [] };
  }

  const isHidden = (el) => !!el.closest('[hidden]');

  function render() {
    state.queued = false;
    state.calcMemo.clear();
    for (const fn of state.onData) { try { fn(); } catch (err) { console.warn('[painel] onData', err); } }
    for (const name of Object.keys(state.draws)) drawName(name);
  }
  function drawName(name) {
    const fn = state.draws[name];
    document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
      if (isHidden(el)) return;
      try { fn(el); } catch (err) { console.warn('[painel] desenho', name, err); }
    });
  }
  function schedule() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(render);
  }

  const api = {
    colors: COLORS,
    data(id) {
      if (state.calcs[id]) return wrap(calcResult(id));
      if (id in KEYS) return wrap(load(id));
      return wrap({ status: 'missing', data: [] });
    },
    onData(fn) { state.onData.push(fn); try { fn(); } catch (err) { console.warn(err); } },
    calc(id, def) { state.calcs[id] = def; },
    loader() {}, // a normalização é feita no servidor
    draw(name, fn) {
      if (fn) { state.draws[name] = fn; schedule(); }
      else if (state.draws[name]) { state.calcMemo.clear(); drawName(name); }
    },
    params() { return { ...state.params }; },
    setParams(p) {
      for (const [k, v] of Object.entries(p || {})) { if (v == null) delete state.params[k]; else state.params[k] = v; }
      schedule();
    },
    resetParams() { state.params = { ...DEFAULTS }; schedule(); },
    refresh(id) { if (id) load(id, true); else for (const k of Object.keys(KEYS)) if (state.cache.has(keyFor(k))) load(k, true); schedule(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    rerender: schedule,
    resetCache() { state.cache.clear(); schedule(); },
  };
  window.dash = api;

  let w = 0;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 4) { w = window.innerWidth; schedule(); } });
  // Ao trocar de aba, os desenhos que estavam ocultos passam a ser feitos.
  document.addEventListener('DOMContentLoaded', () => {
    const mo = new MutationObserver(schedule);
    document.querySelectorAll('[data-panel]').forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
  });
})();
