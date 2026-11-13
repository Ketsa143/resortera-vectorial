(function () {
  const cfg = window.APP_CONFIG || {};
  const LS_DATA = 'rv_resultados_local';
  const LS_QUEUE = 'rv_cola_pendiente';
  let client = null;
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    try { client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); } catch (e) { client = null; }
  }

  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  async function insertRemote(row) {
    const { error } = await client.from('resultados').insert(row);
    // 23505 = ya existe (run_id + nivel): lo damos por guardado
    if (error && error.code !== '23505') throw error;
  }

  async function guardar(row) {
    row = { ...row, created_at: row.created_at || new Date().toISOString() };
    if (!client) {
      const all = lsGet(LS_DATA);
      if (!all.some((r) => r.run_id === row.run_id && r.nivel === row.nivel)) all.push(row);
      lsSet(LS_DATA, all);
      return { ok: true, modo: 'local' };
    }
    try {
      await insertRemote(row);
      flush();
      return { ok: true, modo: 'nube' };
    } catch (e) {
      const q = lsGet(LS_QUEUE); q.push(row); lsSet(LS_QUEUE, q);
      return { ok: false, modo: 'nube', error: e.message || String(e) };
    }
  }

  let flushing = false;
  async function flush() {
    if (!client || flushing) return pendientes();
    flushing = true;
    let q = lsGet(LS_QUEUE);
    const rest = [];
    for (const row of q) {
      try { await insertRemote(row); } catch (e) { rest.push(row); }
    }
    lsSet(LS_QUEUE, rest);
    flushing = false;
    return rest.length;
  }
  const pendientes = () => lsGet(LS_QUEUE).length;

  // Lista resultados entre dos fechas (Date)
  async function listar({ desde, hasta }) {
    if (!client) {
      return lsGet(LS_DATA).filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= desde.getTime() && t < hasta.getTime();
      });
    }
    const out = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
      const { data, error } = await client
        .from('resultados')
        .select('*')
        .gte('created_at', desde.toISOString())
        .lt('created_at', hasta.toISOString())
        .order('created_at', { ascending: true })
        .range(from, from + page - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < page) break;
    }
    return out;
  }

  function borrarLocal() { lsSet(LS_DATA, []); }

  window.RVStore = { guardar, listar, flush, pendientes, borrarLocal, modo: client ? 'nube' : 'local' };
  if (client) setInterval(flush, 15000);
})();
