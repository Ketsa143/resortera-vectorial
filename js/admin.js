(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const NIVELES = 10;
  const NOMBRES = ['Calentamiento vectorial', 'Energía de la resortera', '¿Qué tan elástica?', 'Elige tu pajarito', 'Muro en el camino', 'Desde la plataforma', 'Calcula el trabajo', 'Otro planeta', 'Campo de viento', 'Jefe final: tiro óptimo'];
  let filas = [], ranking = [], timer = null, ultimaCarga = 0;

  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
  const n = (v) => Number(v || 0).toLocaleString('es-CO');
  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  /* ---------- PIN ---------- */
  function entrar() {
    document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === 'sPanel'));
    iniciar();
  }
  if (ssGet('rv_admin') === '1') entrar();
  $('formPin').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('inPin').value === String(cfg.ADMIN_PIN || '')) { ssSet('rv_admin', '1'); entrar(); }
    else $('errPin').textContent = 'PIN incorrecto.';
  });

  /* ---------- inicio ---------- */
  function hoyLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function iniciar() {
    if (window.RVStore.modo === 'local') { $('pModo').hidden = false; $('zonaLocal').hidden = false; }
    $('fFecha').value = hoyLocal();
    const base = location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
    const actualizarLink = () => { $('urlJuego').textContent = base + ($('fSala').value ? '?sala=' + encodeURIComponent($('fSala').value) : ''); };
    actualizarLink();
    $('fFecha').addEventListener('change', cargar);
    $('fSala').addEventListener('change', () => { actualizarLink(); render(); });
    $('fModo').addEventListener('change', render);
    $('fBuscar').addEventListener('input', render);
    $('fAuto').addEventListener('change', programar);
    $('btnRefrescar').addEventListener('click', cargar);
    $('btnCSV').addEventListener('click', exportarCSV);
    $('btnProy').addEventListener('click', () => { $('proyector').classList.add('on'); renderProyector(); });
    $('btnCerrarProy').addEventListener('click', () => $('proyector').classList.remove('on'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('proyector').classList.remove('on'); });
    $('btnCopiar').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('urlJuego').textContent); $('btnCopiar').textContent = '¡Copiado!'; setTimeout(() => ($('btnCopiar').textContent = 'Copiar'), 1500); } catch (e) {}
    });
    $('btnBorrar').addEventListener('click', () => {
      if ($('btnBorrar').dataset.confirm === '1') { window.RVStore.borrarLocal(); $('btnBorrar').dataset.confirm = ''; $('btnBorrar').textContent = 'Borrar datos locales de prueba'; cargar(); }
      else { $('btnBorrar').dataset.confirm = '1'; $('btnBorrar').textContent = '¿Seguro? Clic otra vez para borrar'; }
    });
    setInterval(() => { if (ultimaCarga) $('estado').textContent = 'Actualizado hace ' + Math.round((Date.now() - ultimaCarga) / 1000) + ' s'; }, 1000);
    cargar();
    programar();
  }
  function programar() {
    clearInterval(timer);
    const s = Number($('fAuto').value);
    if (s > 0) timer = setInterval(cargar, s * 1000);
  }

  /* ---------- datos ---------- */
  let cargando = false;
  async function cargar() {
    if (cargando) return;
    cargando = true;
    const [y, m, d] = $('fFecha').value.split('-').map(Number);
    const desde = new Date(y, m - 1, d, 0, 0, 0);
    const hasta = new Date(y, m - 1, d + 1, 0, 0, 0);
    try {
      filas = await window.RVStore.listar({ desde, hasta });
      ultimaCarga = Date.now();
      actualizarSalas();
      render();
    } catch (e) {
      $('estado').textContent = 'Error cargando datos: ' + (e.message || e);
    } finally { cargando = false; }
  }

  function actualizarSalas() {
    const sel = $('fSala'), actual = sel.value;
    const salas = [...new Set(filas.map((r) => r.sala))].sort();
    if (actual && !salas.includes(actual)) salas.push(actual);
    sel.innerHTML = '';
    sel.appendChild(new Option('Todas', ''));
    salas.forEach((s) => sel.appendChild(new Option(s, s)));
    sel.value = actual;
  }

  function filtradas() {
    const sala = $('fSala').value;
    return filas.filter((r) => !sala || r.sala === sala);
  }

  function calcular(rows) {
    // agrupar por partida (run)
    const runs = new Map();
    for (const r of rows) {
      let run = runs.get(r.run_id);
      if (!run) { run = { run_id: r.run_id, jugador: r.jugador, sala: r.sala, key: norm(r.jugador) + '|' + r.sala, total: 0, niveles: 0, aciertos: 0, segundos: 0, inicio: r.created_at, fin: r.created_at, vistos: new Set() }; runs.set(r.run_id, run); }
      if (run.vistos.has(r.nivel)) continue;
      run.vistos.add(r.nivel);
      run.total += r.puntos; run.niveles++; run.aciertos += r.acierto ? 1 : 0; run.segundos += r.segundos || 0;
      if (r.created_at < run.inicio) run.inicio = r.created_at;
      if (r.created_at > run.fin) run.fin = r.created_at;
    }
    // un jugador (nombre + sala) puede tener varias partidas
    const jug = new Map();
    for (const run of runs.values()) {
      const j = jug.get(run.key) || { runs: [] };
      j.runs.push(run); jug.set(run.key, j);
    }
    const modo = $('fModo').value;
    const out = [];
    for (const j of jug.values()) {
      j.runs.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
      const elegido = modo === 'primera' ? j.runs[0]
        : j.runs.reduce((a, b) => (b.total > a.total || (b.total === a.total && b.segundos < a.segundos) ? b : a));
      out.push({ ...elegido, partidas: j.runs.length, ultima: j.runs.reduce((m, r) => (r.fin > m ? r.fin : m), '') });
    }
    // desempate: más puntos, más niveles, menos tiempo
    out.sort((a, b) => b.total - a.total || b.niveles - a.niveles || a.segundos - b.segundos);
    return { runs: [...runs.values()], ranking: out };
  }

  /* ---------- render ---------- */
  function render() {
    const rows = filtradas();
    const { runs, ranking: rk } = calcular(rows);
    ranking = rk;
    $('kJug').textContent = n(rk.length);
    $('kPar').textContent = n(runs.length);
    $('kComp').textContent = n(runs.filter((r) => r.niveles >= NIVELES).length);
    $('kAci').textContent = rows.length ? Math.round((100 * rows.filter((r) => r.acierto).length) / rows.length) + '%' : '0%';
    $('kProm').textContent = rk.length ? n(Math.round(rk.reduce((s, r) => s + r.total, 0) / rk.length)) : '0';
    renderRanking();
    renderNiveles(rows);
    renderFeed(rows);
    if ($('proyector').classList.contains('on')) renderProyector();
  }

  function renderRanking() {
    const t = $('tRanking'); t.innerHTML = '';
    const q = norm($('fBuscar').value);
    const head = el('tr');
    ['#', 'Jugador', 'Sala', 'Puntos', 'Niveles', 'Dianas', 'Tiempo', 'Partidas', 'Última'].forEach((h, i) => { const th = el('th', i >= 3 ? 'num' : '', h); head.appendChild(th); });
    t.appendChild(head);
    if (!ranking.length) { const tr = el('tr'); const td = el('td', 'vacio', 'Todavía no hay partidas para este filtro.'); td.colSpan = 9; tr.appendChild(td); t.appendChild(tr); return; }
    ranking.forEach((r, i) => {
      if (q && !norm(r.jugador).includes(q)) return;
      const tr = el('tr');
      const pos = el('td'); const med = el('span', 'medalla' + (i < 3 ? ' m' + (i + 1) : ''), String(i + 1)); pos.appendChild(med);
      tr.append(pos, el('td', '', r.jugador), el('td', '', r.sala), el('td', 'num', n(r.total)));
      const nv = el('td', 'num', r.niveles + '/' + NIVELES); if (r.niveles < NIVELES) nv.style.color = 'var(--tinta-suave)';
      tr.append(nv, el('td', 'num', String(r.aciertos)), el('td', 'num', mmss(r.segundos)), el('td', 'num', String(r.partidas)), el('td', 'num', hora(r.ultima)));
      tr.querySelector('td:nth-child(4)').style.fontWeight = '900';
      t.appendChild(tr);
    });
  }

  function renderNiveles(rows) {
    const c = $('porNivel'); c.innerHTML = '';
    if (!rows.length) { c.appendChild(el('div', 'vacio', 'Sin datos aún.')); return; }
    for (let lv = 1; lv <= NIVELES; lv++) {
      const rs = rows.filter((r) => r.nivel === lv);
      const pct = rs.length ? Math.round((100 * rs.filter((r) => r.acierto).length) / rs.length) : 0;
      const prom = rs.length ? Math.round(rs.reduce((s, r) => s + r.puntos, 0) / rs.length) : 0;
      const tProm = rs.length ? Math.round(rs.reduce((s, r) => s + (r.segundos || 0), 0) / rs.length) : 0;
      const intProm = rs.filter((r) => r.acierto).length ? (rs.filter((r) => r.acierto).reduce((s, r) => s + r.intentos, 0) / rs.filter((r) => r.acierto).length).toFixed(1) : '–';
      const fila = el('div', 'barra-n');
      fila.appendChild(el('div', '', lv + '. ' + NOMBRES[lv - 1]));
      const tr = el('div', 'track'); const f = el('div', 'fill'); f.style.width = pct + '%';
      f.style.background = pct >= 60 ? 'var(--verde)' : pct >= 35 ? 'var(--amarillo)' : 'var(--rojo)';
      tr.appendChild(f); fila.appendChild(tr);
      fila.appendChild(el('div', 'num', rs.length ? pct + '%' : '–'));
      fila.appendChild(el('div', 'sub', rs.length + ' jugados · ' + n(prom) + ' pts prom. · ' + intProm + ' tiros por diana · ' + mmss(tProm) + ' prom.'));
      c.appendChild(fila);
    }
  }

  function renderFeed(rows) {
    const c = $('feed'); c.innerHTML = '';
    const ult = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 25);
    if (!ult.length) { c.appendChild(el('div', 'vacio', 'Esperando jugadores…')); return; }
    for (const r of ult) {
      const d = el('div');
      d.appendChild(el('span', 'hora', hora(r.created_at)));
      const txt = el('span');
      const b = el('b', '', r.jugador); txt.appendChild(b);
      txt.appendChild(document.createTextNode(r.acierto ? ' dio en la diana del nivel ' + r.nivel + ' (' + r.intentos + ' tiro' + (r.intentos > 1 ? 's' : '') + ')' : ' falló el nivel ' + r.nivel));
      d.appendChild(txt);
      d.appendChild(el('span', r.acierto ? 'ok' : 'no', (r.acierto ? '+' : '') + n(r.puntos)));
      d.lastChild.style.marginLeft = 'auto';
      c.appendChild(d);
    }
  }

  function renderProyector() {
    const sala = $('fSala').value;
    $('proySub').textContent = ($('fFecha').value) + (sala ? ' · sala ' + sala : ' · todas las salas') + ' · ' + ranking.length + ' jugadores';
    const pod = $('podio'); pod.innerHTML = '';
    const orden = [1, 0, 2];
    const alturas = [210, 160, 120];
    const colores = ['#ffd54a', '#d5dbe2', '#e6b183'];
    for (const i of orden) {
      const r = ranking[i];
      const col = el('div', 'col');
      col.appendChild(el('div', 'nom', r ? r.jugador : '—'));
      col.appendChild(el('div', 'pts', r ? n(r.total) + ' pts' : ''));
      const b = el('div', 'bloque', String(i + 1)); b.style.height = alturas[i] + 'px'; b.style.background = colores[i];
      col.appendChild(b); pod.appendChild(col);
    }
    const l = $('listaProy'); l.innerHTML = '';
    ranking.slice(3, 15).forEach((r, k) => {
      const d = el('div');
      d.append(el('span', '', String(k + 4)), el('span', '', r.jugador + ' (' + r.niveles + '/' + NIVELES + ')'), el('b', '', n(r.total)));
      l.appendChild(d);
    });
  }

  /* ---------- CSV ---------- */
  function exportarCSV() {
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [['posicion', 'jugador', 'sala', 'puntos', 'niveles', 'dianas', 'segundos', 'partidas', 'ultima_actividad'].join(',')];
    ranking.forEach((r, i) => lines.push([i + 1, esc(r.jugador), esc(r.sala), r.total, r.niveles, r.aciertos, r.segundos, r.partidas, esc(r.ultima)].join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ranking_' + $('fFecha').value + ($('fSala').value ? '_' + $('fSala').value : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
})();
