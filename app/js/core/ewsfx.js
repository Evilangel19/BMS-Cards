// Preview of an EWS program: every chaff / flare released is a small circular burst on a time line.
// Meaning of the values (user's description): BQ = pieces per sequence, BI = time between two pieces; SQ = number of sequences, SI = time between the end of a sequence and the start of the next.
export const CAP = 300;
// g(type, field) -> number; the release times (ms) of each type and the total length of the program
export function ewsEvents(g) {
  const one = type => {
    const bq = Math.max(0, Math.round(g(type, 'BQ'))),
      bi = Math.max(0, g(type, 'BI')),
      si = Math.max(0, g(type, 'SI')),
      sq = bq > 0 ? Math.max(1, Math.round(g(type, 'SQ'))) : 0,
      t = [];
    let start = 0;
    for (let s = 0; s < sq && t.length < CAP; s++) {
      for (let i = 0; i < bq && t.length < CAP; i++) t.push(start + i * bi);
      start += (bq - 1) * bi + si;
    }
    return { t, bq, bi, si, sq };
  };
  const c = one('Chaff'),
    f = one('Flare'),
    last = Math.max(0, ...c.t, ...f.t);
  return { chaff: c, flare: f, total: Math.max(1500, last + 600) };
}
const sec = ms => (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s';
export function ewsSummary(ev) {
  const p = (n, x) =>
    x.bq
      ? `${n}: ${x.bq}${x.bq > 1 ? ' ' + sec(x.bi) + ' apart' : ''}${x.sq > 1 ? ` × ${x.sq} sequences, ${sec(x.si)} apart` : ''}`
      : `${n}: off`;
  return `${p('Chaff', ev.chaff)} · ${p('Flare', ev.flare)} · ${sec(Math.round(Math.max(0, ...ev.chaff.t, ...ev.flare.t)))} long`;
}
const KIND = {
  chaff: { col: [74, 163, 255], n: 18, v: [18, 46], life: 1.5, drag: 1.3, g: 0, ring: 15 },
  flare: { col: [240, 176, 64], n: 24, v: [34, 80], life: 0.95, drag: 1.8, g: 22, ring: 12 },
};
export function createEwsFx(cv, o = {}) {
  const ctx = cv.getContext('2d'),
    lanes = { chaff: 0.3, flare: 0.72 },
    ML = 64,
    MR = 18;
  let ev = ewsEvents(() => 0),
    parts = [],
    raf = 0,
    t0 = 0,
    playing = false,
    done = false,
    nxt = { chaff: 0, flare: 0 },
    last = 0;
  const size = () => {
    const dpr = window.devicePixelRatio || 1,
      w = cv.clientWidth || 600,
      h = cv.clientHeight || 150;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  };
  const xOf = (t, w) => ML + (t / ev.total) * (w - ML - MR);
  function spawn(kind, x, y) {
    const k = KIND[kind];
    for (let i = 0; i < k.n; i++) {
      const a = (i / k.n) * Math.PI * 2 + Math.random() * 0.3,
        v = k.v[0] + Math.random() * (k.v[1] - k.v[0]);
      parts.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        age: 0,
        life: k.life * (0.7 + Math.random() * 0.5),
      });
    }
    parts.push({ kind, x, y, ring: true, age: 0, life: 0.45 });
  }
  function draw(now) {
    const [w, h] = size();
    ctx.clearRect(0, 0, w, h);
    const el = playing ? now - t0 : done ? ev.total : -1;
    ctx.font = '600 11px system-ui';
    ctx.textBaseline = 'middle';
    for (const [kind, ly] of Object.entries(lanes)) {
      const y = ly * h,
        k = KIND[kind],
        c = `rgb(${k.col})`;
      ctx.fillStyle = c;
      ctx.fillText(kind == 'chaff' ? 'CHAFF' : 'FLARE', 8, y);
      ctx.strokeStyle = '#2a3442';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ML, y);
      ctx.lineTo(w - MR, y);
      ctx.stroke();
      ev[kind].t.forEach(t => {
        const x = xOf(t, w),
          on = el >= t;
        ctx.beginPath();
        ctx.arc(x, y, on ? 2.5 : 3, 0, 7);
        if (on) {
          ctx.fillStyle = `rgba(${k.col},.9)`;
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(${k.col},.55)`;
          ctx.stroke();
        }
      });
    }
    ctx.strokeStyle = '#2a3442';
    ctx.fillStyle = '#7d8a9a';
    ctx.textAlign = 'center';
    const step = ev.total > 12000 ? 2000 : ev.total > 5000 ? 1000 : 500;
    for (let t = 0; t <= ev.total; t += step) {
      const x = xOf(t, w);
      ctx.beginPath();
      ctx.moveTo(x, h - 16);
      ctx.lineTo(x, h - 12);
      ctx.stroke();
      ctx.fillText(sec(t), x, h - 5);
    }
    ctx.textAlign = 'left';
    if (playing) {
      const x = xOf(Math.min(el, ev.total), w);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x, h - 18);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = KIND[p.kind],
        a = Math.max(0, 1 - p.age / p.life);
      if (p.ring) {
        ctx.strokeStyle = `rgba(${k.col},${0.8 * a})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, k.ring * (p.age / p.life), 0, 7);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${k.col},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.kind == 'flare' ? 1.6 + a : 1.2 + a * 0.6, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function frame(now) {
    if (!cv.isConnected) {
      playing = false;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const el = now - t0,
      [w, h] = size();
    for (const kind of ['chaff', 'flare']) {
      const a = ev[kind].t;
      while (nxt[kind] < a.length && a[nxt[kind]] <= el) spawn(kind, xOf(a[nxt[kind]++], w), lanes[kind] * h);
    }
    parts.forEach(p => {
      p.age += dt;
      if (!p.ring) {
        const k = KIND[p.kind],
          d = Math.exp(-k.drag * dt);
        p.vx *= d;
        p.vy = p.vy * d + k.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    });
    parts = parts.filter(p => p.age < p.life);
    draw(now);
    if (el > ev.total && !parts.length) {
      playing = false;
      done = true;
      draw(now);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  return {
    load(e) {
      cancelAnimationFrame(raf);
      ev = e;
      parts = [];
      playing = false;
      done = false;
      draw(0);
    },
    play() {
      cancelAnimationFrame(raf);
      parts = [];
      nxt = { chaff: 0, flare: 0 };
      done = false;
      if (o.anim && !o.anim()) {
        done = true;
        playing = false;
        draw(0);
        return;
      }
      playing = true;
      t0 = performance.now();
      last = t0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      playing = false;
    },
    get playing() {
      return playing;
    },
    get events() {
      return ev;
    },
  };
}
