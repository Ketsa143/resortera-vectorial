(function (root) {
  const G_TIERRA = 9.8;
  const BIRD_R = 0.25;      // radio del proyectil (m)
  const TARGET_R = 0.8;     // radio de la diana (m)
  const HIT_TOL = TARGET_R + BIRD_R;
  const TOWER_W = 1.2;
  const WALL_W = 0.7;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- Física ---------- */
  // p = { v0, th (rad), h, g, w (aceleración horizontal del viento) }
  function pos(p, t) {
    return {
      x: p.v0 * Math.cos(p.th) * t + 0.5 * (p.w || 0) * t * t,
      y: p.h + p.v0 * Math.sin(p.th) * t - 0.5 * p.g * t * t,
    };
  }
  function vel(p, t) {
    return {
      x: p.v0 * Math.cos(p.th) + (p.w || 0) * t,
      y: p.v0 * Math.sin(p.th) - p.g * t,
    };
  }
  // Tiempo en que x(t) = X (primera vez), o null
  function timeAtX(p, X) {
    const c = p.v0 * Math.cos(p.th);
    const w = p.w || 0;
    if (Math.abs(w) < 1e-9) return c > 1e-9 ? X / c : null;
    const disc = c * c + 2 * w * X;
    if (disc < 0) return null;
    const t = (-c + Math.sqrt(disc)) / w;
    return t > 0 ? t : null;
  }
  function yAtX(p, X) {
    const t = timeAtX(p, X);
    return t == null ? null : pos(p, t).y;
  }
  function landingTime(p) {
    const vy = p.v0 * Math.sin(p.th);
    return (vy + Math.sqrt(vy * vy + 2 * p.g * p.h)) / p.g;
  }

  /* Simulación con colisiones contra diana, torre y muro */
  function simulate(p, escena) {
    const { D, H } = escena;
    const towerTop = H - TARGET_R;
    const path = [];
    const dt = 0.002;
    let minDist = Infinity;
    let result = 'suelo';
    let tEnd = 0;
    const xMax = escena.xMax || D + 30;
    for (let t = 0; t < 30; t += dt) {
      const q = pos(p, t);
      if (path.length === 0 || t - path[path.length - 1].t >= 0.02) path.push({ t, x: q.x, y: q.y });
      const d = Math.hypot(q.x - D, q.y - H);
      if (d < minDist) minDist = d;
      tEnd = t;
      if (d <= HIT_TOL) { result = 'diana'; break; }
      if (q.x + BIRD_R >= D - TOWER_W / 2 && q.x - BIRD_R <= D + TOWER_W / 2 && q.y - BIRD_R <= towerTop) { result = 'torre'; break; }
      if (escena.muro) {
        const m = escena.muro;
        if (q.x + BIRD_R >= m.x - WALL_W / 2 && q.x - BIRD_R <= m.x + WALL_W / 2 && q.y - BIRD_R <= m.H) { result = 'muro'; break; }
      }
      if (q.y <= 0 && t > 0.01) { result = 'suelo'; break; }
      if (q.x > xMax || q.x < -10) { result = 'fuera'; break; }
    }
    const qEnd = pos(p, tEnd);
    path.push({ t: tEnd, x: qEnd.x, y: qEnd.y });
    // distancia de paso: qué tan cerca del centro pasa la curva completa (para el bono de precisión)
    let pasada = Infinity;
    const tl = landingTime(p);
    for (let t = 0; t <= tl; t += 0.001) {
      const q = pos(p, t);
      const d = Math.hypot(q.x - D, q.y - H);
      if (d < pasada) pasada = d;
    }
    return { result, path, tEnd, minDist, pasada, yEnD: yAtX(p, D) };
  }

  /* Busca raíces de f en [a,b] escaneando y biseccionando */
  function roots(f, a, b, n = 400) {
    const out = [];
    let x0 = a, f0 = f(a);
    for (let i = 1; i <= n; i++) {
      const x1 = a + ((b - a) * i) / n;
      const f1 = f(x1);
      if (f0 != null && f1 != null && isFinite(f0) && isFinite(f1) && f0 * f1 <= 0) {
        let lo = x0, hi = x1, flo = f0;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2, fm = f(mid);
          if (fm == null || !isFinite(fm)) break;
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        out.push((lo + hi) / 2);
      }
      x0 = x1; f0 = f1;
    }
    return out;
  }

  // Velocidad para un alcance aproximado R (para que los escenarios tengan escala jugable)
  const v0ForRange = (R, th, g) => Math.sqrt((R * g) / Math.sin(2 * th));

  // Ubica la diana sobre la trayectoria solución, en una fracción del vuelo
  function placeTarget(p, fa = 0.55, fb = 0.85) {
    const tl = landingTime(p);
    const t = rand(fa, fb) * tl;
    const q = pos(p, t);
    return { D: round(q.x, 1), H: round(q.y, 1) };
  }

  /* ---------- Fragmentos de fórmula (KaTeX) ---------- */
  const F_R = String.raw`\vec r(t)=\big\langle v_0\cos\theta\,t,\;\; h+v_0\sin\theta\,t-\tfrac12 g t^2\big\rangle`;
  const F_Y = String.raw`y(D)=h+D\tan\theta-\dfrac{g\,D^2}{2v_0^2\cos^2\theta}=H`;
  const F_V0 = String.raw`v_0^2=\dfrac{g\,D^2}{2\cos^2\theta\,\big(h+D\tan\theta-H\big)}`;
  const F_W = String.raw`W=\int_C \vec F\cdot d\vec r=\int_0^{x} k\,s\,ds=\tfrac12 k x^2=\tfrac12 m v_0^2`;
  const F_X = String.raw`v_0=x\sqrt{\dfrac{k}{m}}`;

  /* ---------- Definición de niveles ---------- */
  // Cada gen() devuelve un nivel concreto con valores al azar.
  // fisica(fijo, inp) convierte las respuestas del jugador en parámetros de vuelo.
  const LEVELS = [
    {
      n: 1, nombre: 'Calentamiento vectorial', tema: 'Sesión 10 · Funciones vectoriales',
      gen() {
        const h = round(rand(0.8, 1.6), 1);
        const th = rad(rand(25, 65));
        const v0 = round(v0ForRange(rand(18, 34), th, G_TIERRA), 1);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA });
        return {
          fijo: { v0, h, g: G_TIERRA },
          escena: { D, H, h },
          dados: [['Velocidad inicial v₀', v0, 'm/s'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm'], ['Gravedad g', G_TIERRA, 'm/s²']],
          incognitas: [{ key: 'theta', label: 'Ángulo θ', unidad: '°', min: 1, max: 89, step: 0.1 }],
          explicacion: 'La posición del pajarito es una <b>función vectorial</b>. Despeja el tiempo de la componente x (t = D / (v₀ cos θ)), reemplázalo en y, e iguala a la altura de la diana. Tip: usa 1/cos²θ = 1 + tan²θ y te queda una cuadrática en tan θ.',
          formulas: [F_R, F_Y],
        };
      },
      fisica: (f, i) => ({ v0: f.v0, th: rad(i.theta), h: f.h, g: f.g, w: 0 }),
      despeje: 'theta',
    },
    {
      n: 2, nombre: 'Energía de la resortera', tema: 'Sesión 13 · Integral de línea y trabajo',
      gen() {
        const h = round(rand(0.8, 1.5), 1);
        const thDeg = randInt(30, 55);
        const th = rad(thDeg);
        const k = randInt(30, 70) * 10;
        const m = round(randInt(6, 16) * 0.05, 2);
        const v0 = v0ForRange(rand(18, 34), th, G_TIERRA);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA });
        return {
          fijo: { k, m, thDeg, h, g: G_TIERRA },
          escena: { D, H, h },
          dados: [['Constante elástica k', k, 'N/m'], ['Masa del pajarito m', m, 'kg'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'x', label: 'Estiramiento x', unidad: 'm', min: 0.01, max: 2, step: 0.001 }],
          explicacion: 'El trabajo que hace la resortera es una <b>integral de línea</b> del campo elástico F = −k·s. Toda esa energía se vuelve cinética. Primero halla qué v₀ necesitas para llegar a la diana y luego despeja cuánto estirar.',
          formulas: [F_W, F_X, F_V0],
        };
      },
      fisica: (f, i) => ({ v0: i.x * Math.sqrt(f.k / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'x',
    },
    {
      n: 3, nombre: '¿Qué tan elástica?', tema: 'Sesión 13 · Trabajo de un campo',
      gen() {
        const h = round(rand(0.8, 1.5), 1);
        const thDeg = randInt(30, 60);
        const th = rad(thDeg);
        const m = round(randInt(6, 20) * 0.05, 2);
        const x = round(randInt(30, 70) / 100, 2);
        const v0 = v0ForRange(rand(18, 34), th, G_TIERRA);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA });
        return {
          fijo: { m, x, thDeg, h, g: G_TIERRA },
          escena: { D, H, h },
          dados: [['Masa del pajarito m', m, 'kg'], ['Estiramiento x', x, 'm'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'k', label: 'Constante elástica k', unidad: 'N/m', min: 1, max: 5000, step: 0.1 }],
          explicacion: 'Ahora tú eliges la <b>elasticidad</b> de la banda. Calcula la v₀ necesaria con la ecuación de la trayectoria y despeja k de ½kx² = ½mv₀².',
          formulas: [F_W, String.raw`k=\dfrac{m\,v_0^2}{x^2}`, F_V0],
        };
      },
      fisica: (f, i) => ({ v0: f.x * Math.sqrt(i.k / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'k',
    },
    {
      n: 4, nombre: 'Elige tu pajarito', tema: 'Sesión 13 · Trabajo y energía',
      gen() {
        const h = round(rand(0.8, 1.5), 1);
        const thDeg = randInt(30, 60);
        const th = rad(thDeg);
        const x = round(randInt(30, 70) / 100, 2);
        const v0 = v0ForRange(rand(18, 34), th, G_TIERRA);
        const mSol = rand(0.3, 1.5);
        const k = Math.max(50, Math.round((mSol * v0 * v0) / (x * x) / 10) * 10);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA });
        return {
          fijo: { k, x, thDeg, h, g: G_TIERRA },
          escena: { D, H, h },
          dados: [['Constante elástica k', k, 'N/m'], ['Estiramiento x', x, 'm'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'm', label: 'Masa del pajarito m', unidad: 'kg', min: 0.01, max: 10, step: 0.001 }],
          explicacion: 'Con la misma resortera, un pajarito más pesado sale más lento. Calcula la v₀ que necesitas y despeja la <b>masa</b> ideal.',
          formulas: [F_W, String.raw`m=\dfrac{k\,x^2}{v_0^2}`, F_V0],
        };
      },
      fisica: (f, i) => ({ v0: f.x * Math.sqrt(f.k / i.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'm',
    },
    {
      n: 5, nombre: 'Muro en el camino', tema: 'Sesión 10 · Dos soluciones de r(t)',
      gen() {
        for (let tries = 0; tries < 200; tries++) {
          const h = round(rand(0.8, 1.5), 1);
          const thHi = rad(rand(58, 72));
          const v0 = round(v0ForRange(rand(22, 34), thHi, G_TIERRA), 1);
          const { D, H } = placeTarget({ v0, th: thHi, h, g: G_TIERRA }, 0.72, 0.88);
          const yOf = (thDeg) => yAtX({ v0, th: rad(thDeg), h, g: G_TIERRA, w: 0 }, D);
          const sols = roots((a) => { const y = yOf(a); return y == null ? null : y - H; }, 1, 89);
          if (sols.length < 2) continue;
          const lo = Math.min(...sols), hi = Math.max(...sols);
          const wx = round(D * rand(0.4, 0.6), 1);
          const yLo = yAtX({ v0, th: rad(lo), h, g: G_TIERRA }, wx);
          const yHi = yAtX({ v0, th: rad(hi), h, g: G_TIERRA }, wx);
          const Hw = round(yLo + 0.55 * (yHi - yLo), 1);
          if (yHi - Hw < 1.5 || Hw - yLo < 1.2 || Hw < 2) continue;
          return {
            fijo: { v0, h, g: G_TIERRA },
            escena: { D, H, h, muro: { x: wx, H: Hw } },
            dados: [['Velocidad inicial v₀', v0, 'm/s'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm'], ['Muro: distancia', wx, 'm'], ['Muro: altura', Hw, 'm']],
            incognitas: [{ key: 'theta', label: 'Ángulo θ', unidad: '°', min: 1, max: 89, step: 0.1 }],
            explicacion: 'La ecuación en tan θ tiene <b>dos soluciones</b>: un tiro bajo y uno alto. Las dos llegan a la diana, pero solo una pasa por encima del muro. Comprueba y(x_muro) para elegir la correcta.',
            formulas: [F_R, F_Y],
          };
        }
        return LEVELS[0].gen();
      },
      fisica: (f, i) => ({ v0: f.v0, th: rad(i.theta), h: f.h, g: f.g, w: 0 }),
      despeje: 'theta',
    },
    {
      n: 6, nombre: 'Desde la plataforma', tema: 'Sesión 10 · Funciones vectoriales',
      gen() {
        const h = round(rand(6, 12), 1);
        const thDeg = randInt(10, 35);
        const th = rad(thDeg);
        const k = randInt(30, 70) * 10;
        const m = round(randInt(6, 16) * 0.05, 2);
        const v0 = v0ForRange(rand(14, 26), th, G_TIERRA);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA }, 0.6, 0.85);
        return {
          fijo: { k, m, thDeg, h, g: G_TIERRA },
          escena: { D, H, h, plataforma: true },
          dados: [['Altura de la plataforma h', h, 'm'], ['Constante elástica k', k, 'N/m'], ['Masa del pajarito m', m, 'kg'], ['Ángulo θ', thDeg, '°'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'x', label: 'Estiramiento x', unidad: 'm', min: 0.01, max: 2, step: 0.001 }],
          explicacion: 'La resortera está en lo alto. La componente vertical de r(t) arranca en <b>h</b>, que ahora pesa mucho. Halla v₀ y luego el estiramiento.',
          formulas: [F_R, F_V0, F_X],
        };
      },
      fisica: (f, i) => ({ v0: i.x * Math.sqrt(f.k / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'x',
    },
    {
      n: 7, nombre: 'Calcula el trabajo', tema: 'Sesiones 11–12 · Campos conservativos',
      gen() {
        const h = round(rand(0.8, 1.5), 1);
        const thDeg = randInt(30, 60);
        const th = rad(thDeg);
        const m = round(randInt(6, 20) * 0.05, 2);
        const v0 = v0ForRange(rand(18, 34), th, G_TIERRA);
        const { D, H } = placeTarget({ v0, th, h, g: G_TIERRA });
        return {
          fijo: { m, thDeg, h, g: G_TIERRA },
          escena: { D, H, h },
          dados: [['Masa del pajarito m', m, 'kg'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'W', label: 'Trabajo de la resortera W', unidad: 'J', min: 0.1, max: 2000, step: 0.01 }],
          explicacion: 'El campo elástico es <b>conservativo</b> (F = −∇U con U = ½ks²), así que el trabajo solo depende del punto inicial y final, no del camino con que estiras. Dinos cuántos joules debe entregar la resortera.',
          formulas: [F_W, String.raw`W=\tfrac12 m v_0^2`, F_V0],
        };
      },
      fisica: (f, i) => ({ v0: Math.sqrt((2 * i.W) / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'W',
    },
    {
      n: 8, nombre: 'Otro planeta', tema: 'Sesión 10 · r(t) con otra g',
      gen() {
        const planeta = pick([['la Luna', 1.62, 'luna'], ['Marte', 3.71, 'marte'], ['Júpiter', 24.79, 'jupiter']]);
        const g = planeta[1];
        const h = round(rand(0.8, 1.5), 1);
        const thDeg = randInt(30, 55);
        const th = rad(thDeg);
        const m = round(randInt(6, 16) * 0.05, 2);
        const v0 = v0ForRange(rand(20, 36), th, g);
        const x = rand(0.35, 0.7);
        const k = Math.max(10, Math.round((m * v0 * v0) / (x * x) / 10) * 10);
        const { D, H } = placeTarget({ v0, th, h, g });
        return {
          fijo: { k, m, thDeg, h, g },
          escena: { D, H, h, planeta: planeta[2] },
          dados: [['Planeta', planeta[0], ''], ['Gravedad g', g, 'm/s²'], ['Constante elástica k', k, 'N/m'], ['Masa del pajarito m', m, 'kg'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [{ key: 'x', label: 'Estiramiento x', unidad: 'm', min: 0.01, max: 3, step: 0.001 }],
          explicacion: 'Mismo modelo, otra aceleración: r″(t) = ⟨0, −g⟩ con la <b>g de ' + planeta[0] + '</b>. Cambia todo el cálculo.',
          formulas: [String.raw`\vec r\,''(t)=\langle 0,\,-g\rangle`, F_V0, F_X],
        };
      },
      fisica: (f, i) => ({ v0: i.x * Math.sqrt(f.k / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: 0 }),
      despeje: 'x',
    },
    {
      n: 9, nombre: 'Campo de viento', tema: 'Sesión 11 · Campos vectoriales',
      gen() {
        for (let tries = 0; tries < 200; tries++) {
          const h = round(rand(0.8, 1.5), 1);
          const thDeg = randInt(35, 60);
          const th = rad(thDeg);
          const w = round((Math.random() < 0.5 ? -1 : 1) * rand(1, 3), 1);
          const m = round(randInt(6, 16) * 0.05, 2);
          const v0 = v0ForRange(rand(18, 32), th, G_TIERRA);
          const p = { v0, th, h, g: G_TIERRA, w };
          const { D, H } = placeTarget(p, 0.55, 0.82);
          if (D < 6 || H < 1.5) continue;
          const x = rand(0.35, 0.7);
          const k = Math.round((m * v0 * v0) / (x * x) / 10) * 10;
          const t2 = (2 * (h + D * Math.tan(th) - H)) / (G_TIERRA + w * Math.tan(th));
          if (!(t2 > 0)) continue;
          return {
            fijo: { k, m, thDeg, h, g: G_TIERRA, w },
            escena: { D, H, h, viento: w },
            dados: [['Viento (aceleración horizontal) a_w', w, 'm/s²'], ['Constante elástica k', k, 'N/m'], ['Masa del pajarito m', m, 'kg'], ['Ángulo θ', thDeg, '°'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
            incognitas: [{ key: 'x', label: 'Estiramiento x', unidad: 'm', min: 0.01, max: 3, step: 0.001 }],
            explicacion: 'El viento es un <b>campo vectorial</b> constante que acelera al pajarito en x (' + (w > 0 ? 'a favor' : 'en contra') + '). Ahora r″(t) = ⟨a_w, −g⟩. Usa las fórmulas para despejar el tiempo de vuelo t y luego v₀.',
            formulas: [String.raw`\vec r(t)=\big\langle v_0\cos\theta\,t+\tfrac12 a_w t^2,\;\; h+v_0\sin\theta\,t-\tfrac12 g t^2\big\rangle`, String.raw`t^2=\dfrac{2\,(h+D\tan\theta-H)}{g+a_w\tan\theta}`, String.raw`v_0=\dfrac{D-\tfrac12 a_w t^2}{t\cos\theta},\qquad x=v_0\sqrt{\dfrac{m}{k}}`],
          };
        }
        return LEVELS[1].gen();
      },
      fisica: (f, i) => ({ v0: i.x * Math.sqrt(f.k / f.m), th: rad(f.thDeg), h: f.h, g: f.g, w: f.w }),
      despeje: 'x',
    },
    {
      n: 10, nombre: 'Jefe final: tiro óptimo', tema: 'Sesión 4 · Optimización',
      gen() {
        const h = round(rand(0.8, 1.5), 1);
        const D = round(rand(20, 34), 1);
        const H = round(rand(3, 10), 1);
        const m = round(randInt(6, 16) * 0.05, 2);
        const dy = H - h;
        const v0min2 = G_TIERRA * (dy + Math.sqrt(dy * dy + D * D));
        const xmin = rand(0.4, 0.7);
        const k = Math.round((m * v0min2) / (xmin * xmin) / 10) * 10;
        return {
          fijo: { k, m, h, g: G_TIERRA },
          escena: { D, H, h },
          optimo: { Wmin: 0.5 * m * v0min2, thOpt: deg(Math.atan((dy + Math.sqrt(dy * dy + D * D)) / D)) },
          dados: [['Constante elástica k', k, 'N/m'], ['Masa del pajarito m', m, 'kg'], ['Altura de la resortera h', h, 'm'], ['Distancia a la torre D', D, 'm'], ['Altura de la diana H', H, 'm']],
          incognitas: [
            { key: 'theta', label: 'Ángulo θ', unidad: '°', min: 1, max: 89, step: 0.1 },
            { key: 'x', label: 'Estiramiento x', unidad: 'm', min: 0.01, max: 3, step: 0.001 },
          ],
          explicacion: 'Tú eliges θ y x. Cualquier tiro que pegue suma, pero hay <b>bono de hasta 300 pts</b> si usas la mínima energía posible. Minimiza v₀²(θ): deriva respecto a θ e iguala a cero.',
          formulas: [F_V0, String.raw`\dfrac{d\,(v_0^2)}{d\theta}=0\;\Rightarrow\;\theta^*=45^\circ+\tfrac12\arctan\!\Big(\dfrac{H-h}{D}\Big)`, F_X],
        };
      },
      fisica: (f, i) => ({ v0: i.x * Math.sqrt(f.k / f.m), th: rad(i.theta), h: f.h, g: f.g, w: 0 }),
      despeje: null,
    },
  ];

  /* Solución numérica de un nivel (para mostrarla al fallar 3 veces y para pruebas) */
  function solve(level, inst) {
    const inc = inst.incognitas;
    const fHit = (inp) => {
      const p = level.fisica(inst.fijo, inp);
      if (!(p.v0 > 0)) return null;
      const y = yAtX(p, inst.escena.D);
      return y == null ? null : y - inst.escena.H;
    };
    if (level.n === 10) {
      const th = inst.optimo.thOpt;
      const p0 = { th: rad(th) };
      const v0 = Math.sqrt((2 * inst.optimo.Wmin) / inst.fijo.m);
      const x = v0 * Math.sqrt(inst.fijo.m / inst.fijo.k);
      return [{ theta: th, x }];
    }
    const key = inc[0].key;
    const rs = roots((u) => fHit({ [key]: u }), inc[0].min, inc[0].max, 2000);
    return rs.map((u) => ({ [key]: u }));
  }

  /* Genera una instancia garantizando que tenga solución */
  function generate(level) {
    for (let i = 0; i < 50; i++) {
      const inst = level.gen();
      const sols = solve(level, inst);
      if (sols.length) { inst.soluciones = sols; return inst; }
    }
    const inst = level.gen();
    inst.soluciones = solve(level, inst);
    return inst;
  }

  /* Puntaje de un nivel */
  function score({ intento, minDist, segundos, nivel, inst, inp }) {
    const base = [1000, 650, 350][intento - 1] || 0;
    const precision = Math.round(200 * Math.max(0, 1 - minDist / HIT_TOL));
    const tiempo = Math.round(100 * Math.max(0, 1 - segundos / 300));
    let optimo = 0;
    if (nivel === 10 && inst.optimo) {
      const W = 0.5 * inst.fijo.k * inp.x * inp.x;
      const e = inst.optimo.Wmin / W;
      optimo = Math.round(300 * Math.max(0, Math.min(1, (e - 0.6) / 0.38)));
    }
    return { base, precision, tiempo, optimo, total: base + precision + tiempo + optimo };
  }

  const API = { LEVELS, generate, simulate, solve, score, pos, vel, yAtX, landingTime, rad, deg, round, consts: { BIRD_R, TARGET_R, HIT_TOL, TOWER_W, WALL_W, G_TIERRA } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RV = API;
})(typeof window !== 'undefined' ? window : globalThis);
