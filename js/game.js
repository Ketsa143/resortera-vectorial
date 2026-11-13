(function () {
  const { LEVELS, generate, simulate, score, vel, round, consts } = window.RV;
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const S = {
    jugador: '', sala: '', runId: '', idx: 0, inst: null, intento: 1, tInicio: 0,
    tiros: [], resultados: [], total: 0, animando: false, anim: null,
  };

  /* ---------- utilidades ---------- */
  const fmt = (v, d = 2) => (typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: d }) : v);
  const parseNum = (s) => { const v = parseFloat(String(s).trim().replace(',', '.')); return isFinite(v) ? v : NaN; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  function tex(el, src) {
    if (window.katex) { try { katex.render(src, el, { throwOnError: false, displayMode: true }); return; } catch (e) {} }
    el.textContent = src;
  }
  function mostrar(id) {
    document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
    window.scrollTo(0, 0);
  }

  /* ---------- inicio ---------- */
  const params = new URLSearchParams(location.search);
  $('inSala').value = (params.get('sala') || lsGet('rv_sala') || cfg.SALA_POR_DEFECTO || '').toUpperCase();
  $('inNombre').value = lsGet('rv_nombre');
  if (window.RVStore.modo === 'local') $('pModo').hidden = false;

  $('formInicio').addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = $('inNombre').value.trim().replace(/\s+/g, ' ');
    const sala = $('inSala').value.trim().toUpperCase().replace(/\s+/g, '-');
    if (nombre.length < 2) { $('errInicio').textContent = 'Escribe tu nombre.'; return; }
    if (!sala) { $('errInicio').textContent = 'Escribe el código de la sala.'; return; }
    lsSet('rv_nombre', nombre); lsSet('rv_sala', sala);
    S.jugador = nombre; S.sala = sala;
    nuevaPartida();
  });

  function nuevaPartida() {
    S.runId = uid(); S.idx = 0; S.resultados = []; S.total = 0;
    $('pJugador').textContent = S.jugador + ' · ' + S.sala;
    ['pJugador', 'pNivel', 'pPuntos'].forEach((id) => ($(id).hidden = false));
    $('puntosTotal').textContent = '0';
    mostrar('sJuego');
    cargarNivel();
  }

  /* ---------- nivel ---------- */
  function cargarNivel() {
    const L = LEVELS[S.idx];
    S.inst = generate(L);
    S.intento = 1; S.tiros = []; S.ultimo = null; S.tInicio = performance.now();
    $('pNivel').textContent = 'Nivel ' + L.n + ' / ' + LEVELS.length;
    $('lvTema').textContent = L.tema;
    $('lvTitulo').textContent = L.n + '. ' + L.nombre;
    $('lvIdea').innerHTML = S.inst.explicacion;

    const datos = $('lvDatos'); datos.innerHTML = '';
    for (const [lab, v, u] of S.inst.dados) {
      const a = document.createElement('div'); a.textContent = lab;
      const b = document.createElement('div'); b.className = 'v';
      b.textContent = fmt(v);
      if (u) { const s = document.createElement('span'); s.className = 'u'; s.textContent = u; b.appendChild(s); }
      datos.append(a, b);
    }
    const fx = $('lvFormulas'); fx.innerHTML = '';
    for (const f of S.inst.formulas) { const d = document.createElement('div'); d.className = 'f'; tex(d, f); fx.appendChild(d); }

    const ent = $('lvEntradas'); ent.innerHTML = '';
    for (const inc of S.inst.incognitas) {
      const row = document.createElement('div'); row.className = 'entrada';
      const lab = document.createElement('label'); lab.htmlFor = 'in_' + inc.key; lab.textContent = inc.label;
      const caja = document.createElement('div'); caja.className = 'caja';
      const inp = document.createElement('input'); inp.id = 'in_' + inc.key; inp.inputMode = 'decimal'; inp.placeholder = '0'; inp.required = true;
      const un = document.createElement('span'); un.className = 'unidad'; un.textContent = inc.unidad;
      caja.append(inp, un); row.append(lab, caja); ent.appendChild(row);
    }
    $('lvFeedback').className = 'feedback'; $('lvFeedback').innerHTML = '';
    $('btnSiguiente').hidden = true;
    $('btnLanzar').disabled = false;
    pintarIntentos();
    dibujar();
    const first = ent.querySelector('input'); if (first && window.innerWidth > 960) first.focus();
  }

  function pintarIntentos() {
    const c = $('lvIntentos'); c.innerHTML = 'Tiros: ';
    for (let i = 1; i <= 3; i++) { const s = document.createElement('span'); if (i < S.intento) s.className = 'usado'; c.appendChild(s); }
  }

  function feedback(tipo, html) { const f = $('lvFeedback'); f.className = 'feedback on ' + tipo; f.innerHTML = html; }

  /* ---------- tiro ---------- */
  $('formTiro').addEventListener('submit', (e) => {
    e.preventDefault();
    if (S.animando || $('btnLanzar').disabled) return;
    const L = LEVELS[S.idx];
    const inp = {};
    for (const inc of S.inst.incognitas) {
      const v = parseNum($('in_' + inc.key).value);
      if (!isFinite(v)) { feedback('info', 'Escribe un número en «' + inc.label + '».'); return; }
      if (v < inc.min || v > inc.max) { feedback('info', inc.label + ' debe estar entre ' + fmt(inc.min) + ' y ' + fmt(inc.max) + ' ' + inc.unidad + '.'); return; }
      inp[inc.key] = v;
    }
    const p = L.fisica(S.inst.fijo, inp);
    const sim = simulate(p, { ...S.inst.escena, xMax: vista().xmax + 5 });
    $('btnLanzar').disabled = true;
    animar(p, sim, () => resolverTiro(L, inp, p, sim));
  });

  function resolverTiro(L, inp, p, sim) {
    S.tiros.push({ path: sim.path, inp, result: sim.result });
    const seg = Math.round((performance.now() - S.tInicio) / 1000);
    const { D, H } = S.inst.escena;
    const v0txt = 'v₀ = ' + fmt(p.v0, 2) + ' m/s';
    if (sim.result === 'diana') {
      const sc = score({ intento: S.intento, minDist: sim.pasada, segundos: seg, nivel: L.n, inst: S.inst, inp });
      let html = '¡Diana! (' + v0txt + ')<div class="desglose">' +
        '<span>Tiro ' + S.intento + ' de 3</span><span>' + sc.base + '</span>' +
        '<span>Precisión</span><span>+' + sc.precision + '</span>' +
        '<span>Rapidez (' + seg + ' s)</span><span>+' + sc.tiempo + '</span>' +
        (L.n === 10 ? '<span>Tiro óptimo (energía mínima ' + fmt(S.inst.optimo.Wmin, 1) + ' J, usaste ' + fmt(0.5 * S.inst.fijo.k * inp.x * inp.x, 1) + ' J)</span><span>+' + sc.optimo + '</span>' : '') +
        '<span class="tot">Total del nivel</span><span class="tot">' + sc.total + '</span></div>';
      feedback('bien', html);
      terminarNivel(L, true, sc, inp, seg);
      return;
    }
    // fallo
    let razon;
    if (sim.result === 'muro') razon = 'Chocaste con el muro.';
    else if (sim.yEnD == null || (sim.result === 'suelo' && sim.path[sim.path.length - 1].x < D - consts.TOWER_W / 2)) {
      const xf = sim.path[sim.path.length - 1].x;
      razon = 'Te quedaste corto: cayó a ' + fmt(xf, 1) + ' m (la torre está a ' + fmt(D, 1) + ' m).';
    } else {
      const dif = sim.yEnD - H;
      razon = dif > 0
        ? 'Pasaste ' + fmt(Math.abs(dif), 2) + ' m por encima del centro de la diana.'
        : 'Pasaste ' + fmt(Math.abs(dif), 2) + ' m por debajo del centro de la diana' + (sim.result === 'torre' ? ' y le pegaste a la torre.' : '.');
    }
    if (S.intento < 3) {
      S.intento++;
      pintarIntentos();
      feedback('mal', razon + ' <br>' + v0txt + '. Revisa tus cuentas e inténtalo otra vez.');
      $('btnLanzar').disabled = false;
    } else {
      S.intento = 4; pintarIntentos(); S.intento = 3;
      feedback('mal', razon + '<br><br><b>Sin tiros.</b> ' + textoSolucion(L));
      terminarNivel(L, false, { base: 0, precision: 0, tiempo: 0, optimo: 0, total: 0 }, inp, seg);
    }
  }

  function textoSolucion(L) {
    const sols = S.inst.soluciones || [];
    if (!sols.length) return '';
    const inc = S.inst.incognitas;
    const partes = sols.map((s) => inc.map((i) => i.label + ' ≈ ' + fmt(s[i.key], i.key === 'theta' ? 1 : 3) + ' ' + i.unidad).join(', '));
    if (L.n === 5) return 'La respuesta era el tiro alto: ' + partes[partes.length - 1] + '. (El tiro bajo, ' + partes[0] + ', choca con el muro.)';
    return 'Una respuesta correcta era: ' + partes.join(' o ') + '.';
  }

  async function terminarNivel(L, acierto, sc, inp, seg) {
    S.total += sc.total;
    $('puntosTotal').textContent = S.total.toLocaleString('es-CO');
    const row = {
      run_id: S.runId, jugador: S.jugador, sala: S.sala, nivel: L.n, nivel_nombre: L.nombre,
      acierto, intentos: Math.min(S.intento, 3), puntos: sc.total, segundos: seg,
      detalle: { dados: S.inst.dados, respuestas: S.tiros.map((t) => ({ ...t.inp, resultado: t.result })), desglose: sc },
    };
    S.resultados.push(row);
    $('btnSiguiente').hidden = false;
    $('btnSiguiente').textContent = S.idx < LEVELS.length - 1 ? 'Siguiente nivel →' : 'Ver resultado final';
    $('btnSiguiente').focus();
    row._guardado = (await window.RVStore.guardar(row)).ok;
  }

  $('btnSiguiente').addEventListener('click', () => {
    if (S.idx < LEVELS.length - 1) { S.idx++; cargarNivel(); }
    else finalizar();
  });

  async function finalizar() {
    mostrar('sFinal');
    $('finNombre').textContent = S.jugador + ' · sala ' + S.sala;
    $('finTotal').textContent = S.total.toLocaleString('es-CO') + ' pts';
    const t = $('finTabla');
    t.innerHTML = '<tr><th>Nivel</th><th>Resultado</th><th class="num">Tiros</th><th class="num">Tiempo</th><th class="num">Puntos</th></tr>';
    for (const r of S.resultados) {
      const tr = document.createElement('tr');
      const cells = [r.nivel + '. ' + r.nivel_nombre, r.acierto ? 'Diana' : 'Falló', r.intentos, r.segundos + ' s', r.puntos.toLocaleString('es-CO')];
      cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i >= 2) td.className = 'num'; if (i === 1) td.className = r.acierto ? 'ok' : 'no'; tr.appendChild(td); });
      t.appendChild(tr);
    }
    const est = $('finEstado');
    if (window.RVStore.modo === 'local') { est.textContent = 'Modo local: el puntaje quedó guardado solo en este navegador.'; return; }
    est.textContent = 'Sincronizando puntajes…';
    const pend = await window.RVStore.flush();
    est.textContent = pend ? 'Quedan ' + pend + ' resultados sin enviar (revisa el wifi). Se reintentan solos; no cierres esta página.' : '✓ Puntaje enviado al ranking.';
  }

  $('btnOtra').addEventListener('click', () => nuevaPartida());

  /* =========================================================
     DIBUJO
     ========================================================= */
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const ML = 56, MB = 44, MT = 18, MR = 18;

  function ajustarCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 1200;
    const h = Math.round(w * (window.innerWidth < 600 ? 0.68 : 0.6));
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv._w = w; cv._h = h;
  }

  function vista() {
    const e = S.inst ? S.inst.escena : { D: 20, H: 5, h: 1 };
    let xmax = Math.max(e.D + 6, 14);
    let ymax = Math.max(e.H + 4, e.h + 4, e.muro ? e.muro.H + 3 : 0, 8);
    const W = (cv._w || 1200) - ML - MR, Hh = (cv._h || 700) - MB - MT;
    const s = Math.min(W / (xmax + 3), Hh / ymax);
    xmax = W / s - 3; ymax = Hh / s;
    return { s, xmax, ymax, X: (x) => ML + (x + 3) * s, Y: (y) => (cv._h || 700) - MB - y * s };
  }

  function fondo(v, e) {
    const w = cv._w, h = cv._h;
    const temas = {
      luna: ['#1b2036', '#3a4268', '#8d93a6', '#6f7487'],
      marte: ['#f6c79f', '#fbe3cf', '#c4643a', '#9e4a26'],
      jupiter: ['#e8c99e', '#f6e6cf', '#b98b5c', '#8e6740'],
    };
    const [c1, c2, g1, g2] = temas[e.planeta] || ['#a8dcff', '#e9f7ff', '#7cc96b', '#5aa24c'];
    const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    if (e.planeta === 'luna') { ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 60; i++) { const x = (i * 97) % w, y = (i * 53) % (h * 0.6); ctx.fillRect(x, y, 1.5, 1.5); } }
    if (e.planeta === 'jupiter') { ctx.fillStyle = 'rgba(180,120,70,.12)'; for (let i = 0; i < 5; i++) ctx.fillRect(0, 40 + i * 70, w, 22); }
    // rejilla
    const paso = v.xmax > 45 ? 10 : 5;
    ctx.strokeStyle = e.planeta === 'luna' ? 'rgba(255,255,255,.08)' : 'rgba(29,42,58,.07)'; ctx.lineWidth = 1;
    ctx.fillStyle = e.planeta === 'luna' ? 'rgba(255,255,255,.6)' : 'rgba(29,42,58,.55)';
    ctx.font = '600 11px Nunito, sans-serif'; ctx.textAlign = 'center';
    for (let x = 0; x <= v.xmax; x += paso) { ctx.beginPath(); ctx.moveTo(v.X(x), v.Y(0)); ctx.lineTo(v.X(x), MT); ctx.stroke(); ctx.fillText(x + ' m', v.X(x), h - MB + 30); }
    ctx.textAlign = 'right';
    for (let y = paso; y <= v.ymax; y += paso) { ctx.beginPath(); ctx.moveTo(v.X(-3), v.Y(y)); ctx.lineTo(w - MR, v.Y(y)); ctx.stroke(); ctx.fillText(y + ' m', ML - 6, v.Y(y) + 4); }
    // suelo
    ctx.fillStyle = g1; ctx.fillRect(0, v.Y(0), w, MB);
    ctx.fillStyle = g2; ctx.fillRect(0, v.Y(0), w, 5);
  }

  function flecha(x1, y1, x2, y2, color, ancho = 3) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 2) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = ancho; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const t = Math.min(10, L * 0.4);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - t * Math.cos(a - 0.45), y2 - t * Math.sin(a - 0.45));
    ctx.lineTo(x2 - t * Math.cos(a + 0.45), y2 - t * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }

  function cota(x1, y1, x2, y2, texto, color = 'rgba(29,42,58,.75)') {
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    ctx.font = '800 12px Nunito, sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center';
    const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2;
    const m = ctx.measureText(texto).width;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(tx - m / 2 - 4, ty - 9, m + 8, 17);
    ctx.fillStyle = color; ctx.fillText(texto, tx, ty + 4);
  }

  function pajaro(px, py, r) {
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd7b0'; ctx.beginPath(); ctx.arc(px - r * 0.15, py + r * 0.35, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + r * 0.35, py - r * 0.2, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d2a3a'; ctx.beginPath(); ctx.arc(px + r * 0.42, py - r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.moveTo(px + r * 0.9, py); ctx.lineTo(px + r * 1.35, py + r * 0.15); ctx.lineTo(px + r * 0.9, py + r * 0.32); ctx.closePath(); ctx.fill();
  }

  function escena(v, e) {
    const s = v.s;
    // plataforma
    if (e.h > 2) {
      ctx.fillStyle = '#8a8f98'; ctx.fillRect(v.X(-2.2), v.Y(e.h - 0.35), v.X(0.8) - v.X(-2.2), v.Y(0) - v.Y(e.h - 0.35));
      ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 1; y < e.h; y += 1) ctx.fillRect(v.X(-2.2), v.Y(y), v.X(0.8) - v.X(-2.2), 1);
    }
    // resortera
    const bx = v.X(0), by = v.Y(e.h);
    const base = e.h > 2 ? v.Y(e.h - 0.35) : v.Y(0);
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = Math.max(4, s * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, base); ctx.lineTo(bx, by + s * 0.5); ctx.lineTo(bx - s * 0.45, by - s * 0.1);
    ctx.moveTo(bx, by + s * 0.5); ctx.lineTo(bx + s * 0.45, by - s * 0.1); ctx.stroke();
    // torre
    const tw = consts.TOWER_W, top = e.H - consts.TARGET_R;
    for (let y = 0, i = 0; y < top - 1e-6; y += 1, i++) {
      const hh = Math.min(1, top - y);
      ctx.fillStyle = i % 2 ? '#c99a62' : '#b5844d';
      ctx.fillRect(v.X(e.D - tw / 2), v.Y(y + hh), tw * s, hh * s);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(v.X(e.D - tw / 2), v.Y(y + hh), tw * s, hh * s);
    }
    // diana
    const R = consts.TARGET_R, cx = v.X(e.D), cy = v.Y(e.H);
    [['#e04848', 1], ['#fff', 0.72], ['#e04848', 0.46], ['#fff', 0.22]].forEach(([c, f]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, R * s * f, 0, Math.PI * 2); ctx.fill(); });
    // muro
    if (e.muro) {
      const m = e.muro, ww = consts.WALL_W;
      for (let y = 0, i = 0; y < m.H; y += 0.5, i++) {
        const hh = Math.min(0.5, m.H - y);
        ctx.fillStyle = i % 2 ? '#9a6b5b' : '#a87768';
        ctx.fillRect(v.X(m.x - ww / 2), v.Y(y + hh), ww * s, hh * s);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.strokeRect(v.X(m.x - ww / 2), v.Y(m.H), ww * s, m.H * s);
      cota(v.X(m.x + ww / 2 + 0.6), v.Y(0), v.X(m.x + ww / 2 + 0.6), v.Y(m.H), fmt(m.H, 1) + ' m', '#7a3e2c');
    }
    // viento
    if (e.viento) {
      const dir = Math.sign(e.viento);
      ctx.globalAlpha = 0.5;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
        const x0 = v.X(v.xmax * (0.12 + i * 0.22)), y0 = v.Y(v.ymax * (0.55 + j * 0.13));
        flecha(x0 - dir * 22, y0, x0 + dir * 22, y0, '#2b6fd6', 2);
      }
      ctx.globalAlpha = 1;
      ctx.font = '800 13px Nunito, sans-serif'; ctx.fillStyle = '#234b8f'; ctx.textAlign = 'left';
      ctx.fillText('Viento a_w = ' + fmt(e.viento, 1) + ' m/s²', v.X(0), v.Y(v.ymax) + 20);
    }
    // cotas
    cota(v.X(0), v.Y(0) - 14, v.X(e.D), v.Y(0) - 14, 'D = ' + fmt(e.D, 1) + ' m');
    cota(v.X(e.D + tw / 2 + 1.1), v.Y(0), v.X(e.D + tw / 2 + 1.1), v.Y(e.H), 'H = ' + fmt(e.H, 1) + ' m');
    if (e.h > 0) cota(v.X(-1.4), v.Y(0), v.X(-1.4), v.Y(e.h), 'h = ' + fmt(e.h, 1));
  }

  function trazo(path, v, color, ancho, hasta = Infinity, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let first = true;
    for (const q of path) { if (q.t > hasta) break; const X = v.X(q.x), Y = v.Y(Math.max(q.y, -1)); if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.restore();
  }

  function dibujar(estado) {
    if (!cv._w) ajustarCanvas();
    const v = vista();
    const e = S.inst ? S.inst.escena : { D: 20, H: 5, h: 1 };
    ctx.clearRect(0, 0, cv._w, cv._h);
    fondo(v, e);
    escena(v, e);
    S.tiros.forEach((t) => trazo(t.path, v, 'rgba(110,122,138,.55)', 2, Infinity, [6, 5]));
    const rPx = Math.max(7, consts.BIRD_R * v.s);
    if (estado) {
      const { p, sim, t } = estado;
      trazo(sim.path, v, '#ff7a1a', 3, t);
      const q = window.RV.pos(p, Math.min(t, sim.tEnd));
      const vv = vel(p, Math.min(t, sim.tEnd));
      const k = 0.22; // escala de vectores (s)
      flecha(v.X(q.x), v.Y(q.y), v.X(q.x + vv.x * k), v.Y(q.y + vv.y * k), '#2b6fd6', 3);
      flecha(v.X(q.x), v.Y(q.y), v.X(q.x + (p.w || 0) * k * 3), v.Y(q.y - p.g * k * 3 * (p.g > 15 ? 0.4 : 1)), '#e04848', 2.5);
      pajaro(v.X(q.x), v.Y(q.y), rPx);
      if (estado.fin) {
        ctx.font = '900 20px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        const msg = { diana: '¡DIANA!', torre: '¡Torre!', muro: '¡Muro!', suelo: 'Al suelo', fuera: 'Fuera' }[sim.result];
        ctx.fillStyle = sim.result === 'diana' ? '#1b8a52' : '#b83232';
        ctx.fillText(msg, v.X(q.x), v.Y(q.y) - rPx - 12);
        ctx.font = '700 12px Nunito, sans-serif'; ctx.fillStyle = '#1d2a3a';
        ctx.fillText('|r′| = ' + fmt(Math.hypot(vv.x, vv.y), 1) + ' m/s', v.X(q.x), v.Y(q.y) + rPx + 18);
      }
    } else {
      pajaro(v.X(0), v.Y(e.h), rPx);
    }
  }

  function animar(p, sim, done) {
    S.animando = true;
    const dur = Math.min(2.8, Math.max(1.1, sim.tEnd * 0.9)) * 1000;
    const t0 = performance.now();
    function frame(now) {
      const f = Math.min(1, (now - t0) / dur);
      dibujar({ p, sim, t: f * sim.tEnd, fin: f >= 1 });
      if (f < 1) S.anim = requestAnimationFrame(frame);
      else { S.animando = false; S.ultimo = { p, sim }; done(); }
    }
    S.anim = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    ajustarCanvas();
    if (!S.animando) S.ultimo && S.tiros.length ? dibujar({ ...S.ultimo, t: S.ultimo.sim.tEnd, fin: true }) : dibujar();
  });
  document.fonts && document.fonts.ready.then(() => { if (S.inst && !S.animando) dibujar(); });
})();
