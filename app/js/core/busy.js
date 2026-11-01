// A loading bar for what takes a while (changing the theater, opening a campaign, the heavy map layers): a small bar at the top of the window that says what is going on.
// It appears only after a short moment (a quick load never flashes it) and goes away by itself when the last task is over.
// busyStart(label) -> id; busySet(id, percent 0-100, label?); busyEnd(id); busyRun(label, async id => ...). Without a percent the bar moves back and forth.
const TASKS = new Map(),
  DELAY = 300;
let seq = 0,
  box = null,
  timer = 0,
  shown = 0;
function draw() {
  if (!TASKS.size) {
    clearInterval(timer);
    timer = 0;
    if (box) box.classList.remove('on');
    return;
  }
  if (!document.body) return;
  if (!box) {
    box = document.createElement('div');
    box.id = 'busybar';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<span></span><div class="ldb"><i></i></div>';
    document.body.append(box);
  }
  const t = [...TASKS.values()].pop(),
    bar = box.querySelector('.ldb'),
    i = bar.firstChild;
  box.firstChild.textContent = t.label;
  bar.classList.toggle('ind', t.pct < 0);
  if (t.pct >= 0) {
    // between two reports the bar creeps on slowly, so a long step does not look stuck
    shown = Math.max(shown, t.pct);
    i.style.width = Math.round(Math.min(97, shown)) + '%';
  }
  box.classList.add('on');
}
function tick() {
  const t = [...TASKS.values()].pop();
  if (t && t.pct >= 0 && Date.now() - t.t0 >= DELAY) shown += Math.max(0, Math.min(97, t.pct + 12) - shown) * 0.06;
  draw();
}
export function busyStart(label) {
  const id = ++seq;
  if (!TASKS.size) shown = 0;
  TASKS.set(id, { label, pct: -1, t0: Date.now() });
  if (!timer)
    timer = setInterval(() => {
      if ([...TASKS.values()].some(t => Date.now() - t.t0 >= DELAY)) tick();
    }, 100);
  return id;
}
export function busySet(id, pct, label) {
  const t = TASKS.get(id);
  if (!t) return;
  t.pct = pct;
  if (label) t.label = label;
  if (pct >= 0) shown = Math.max(shown, pct);
  if (Date.now() - t.t0 >= DELAY) draw();
}
export function busyEnd(id) {
  TASKS.delete(id);
  if (!TASKS.size) {
    clearInterval(timer);
    timer = 0;
    if (box) {
      const i = box.querySelector('.ldb i'); // a moment at 100% before it goes away
      box.querySelector('.ldb').classList.remove('ind');
      if (box.classList.contains('on')) {
        i.style.width = '100%';
        setTimeout(() => !TASKS.size && draw(), 250);
        return;
      }
    }
  }
  draw();
}
export async function busyRun(label, fn) {
  const id = busyStart(label);
  try {
    return await fn(id);
  } finally {
    busyEnd(id);
  }
}
// a promise that is already running: the bar is there until it is settled
export function busyWrap(label, promise) {
  const id = busyStart(label);
  const end = () => busyEnd(id);
  promise.then(end, end);
  return promise;
}
