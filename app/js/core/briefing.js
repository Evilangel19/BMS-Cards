// Squadron > Briefing: a room where the pilots online look at the same map and draw on it, live (pen, marker, arrows, shapes, text, the NATO symbols and the radar tracks
// of the map, ruler and compass), see the mouse of the others and the view of the briefer. The briefer (a leader: commander, mission commander, package or flight lead)
// opens the room and gives the pen to whom he wants. Nothing is saved: a kneeboard card keeps what is inside its frame.
// The map is the one of the Map page, borrowed while the tab is open (as the Weapons and Weather pages do): its base, filters and flight plan, not editable.
// The messages go to the pilots of the squadron through its peer-to-peer swarm (core/squadron.js), {k: 'brf', t: ...}. The rules are in core/briefroom.js.
//
// deps: {root, esc, me() -> uid, name(uid), role(uid) -> {role, lead}, online() -> [uid], send(msg), sendTo(uid, msg), attach(el) -> Promise<{L, map} | null>,
//        detach(), shot({toast}) (the kneeboard frame of the map), mission() -> text, theater() -> text, toast(text), wide(bool), squad() -> id | null}
import {
  NM,
  dist,
  brg,
  dest,
  pad3,
  fmtNm,
  fmtKm,
  fmtFt,
  listOrder,
  nextBriefer,
  roomNewer,
  canDraw,
  cleanObj,
  shiftObj,
  pilotColour,
  MAX_OBJS,
  cleanWx,
} from './briefroom.js';
import { WX_MODES, legend as wxLegend, drawWx } from './wxlayer.js';
import { WX_ALT, wxLevel } from '../parsers/fmap.js';
import { symbolSvg, airbaseSvg, SIDE_COL } from './mapsymbols.js';

const rad = d => (d * Math.PI) / 180;
const hhmm = ms => {
  const s = Math.floor(ms / 1000);
  return (
    String(Math.floor((s % 86400) / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  );
};
const TRK = { hostile: '#ff5d5d', friend: '#3ddc84', neutral: '#9aa4b2', unknown: '#f5d742' }; // the radar tracks of the map (dark palette)
const RINGC = { hostile: '#ff9f1a', friend: '#4f8cff', neutral: '#4cc38a', unknown: '#f5d742' }; // the SAM rings of the map
const UNITS = [
  ['armor', 'Armor'],
  ['mech', 'Mech. inf.'],
  ['inf', 'Infantry'],
  ['art', 'Artillery'],
  ['rocket', 'Rocket art.'],
  ['missile', 'SSM'],
  ['ad', 'SAM'],
  ['shorad', 'SHORAD'],
  ['aaa', 'AAA'],
  ['hq', 'HQ'],
  ['sup', 'Supply'],
  ['eng', 'Engineer'],
  ['ship', 'Ship'],
  ['carrier', 'Carrier'],
  ['sub', 'Submarine'],
];
const CTRL = [
  ['trk', 'Radar track'],
  ['ab', 'Airbase'],
  ['IP', 'IP'],
  ['CP', 'CP'],
  ['tgt', 'Target'],
  ['bull', 'Bullseye'],
  ['orbit', 'CAP orbit'],
  ['hold', 'Holding'],
  ['ring', 'Threat ring'],
];
// [key, label, svg, who may use it: 0 everybody (ruler and compass only for himself without the pen), 1 who can draw, 2 the briefer]
const TOOLS = [
  [
    'pan',
    'Move map',
    '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    0,
  ],
  ['sel', 'Select', '<path d="M5 3l12 8-5.5 1.2L9 18z"/>', 1],
  '|',
  [
    'laser',
    'Laser',
    '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5"/>',
    1,
  ],
  ['pen', 'Pen', '<path d="M4 20l1.2-4.4L16 4.8l3.2 3.2L8.4 18.8z M14 6.8l3.2 3.2"/>', 1],
  [
    'mark',
    'Marker',
    '<path d="M5 15l8-8 4 4-8 8H5z" fill="currentColor" fill-opacity=".25"/><path d="M5 15l8-8 4 4-8 8H5zM13 7l2-2 4 4-2 2"/>',
    1,
  ],
  ['arrow', 'Arrow', '<path d="M5 19L19 5M10 5h9v9"/>', 1],
  ['line', 'Line', '<path d="M5 19L19 5"/>', 1],
  ['circle', 'Circle', '<circle cx="12" cy="12" r="8"/>', 1],
  ['box', 'Box', '<rect x="4" y="6" width="16" height="12" rx="1"/>', 1],
  ['text', 'Text', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', 1],
  ['sym', 'Symbol', '<path d="M12 3l9 9-9 9-9-9z"/>', 1],
  '|',
  ['erase', 'Eraser', '<path d="M8 20h12M5 15l9-9 5 5-7 7H8z"/><path d="M9.5 10.5l5 5"/>', 1],
  ['undo', 'Undo', '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', 1],
  ['clear', 'Clear', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', 2],
  '|',
  ['ruler', 'Ruler', '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>', 0],
  [
    'comp',
    'Compass',
    '<circle cx="12" cy="12" r="9"/><path d="M12 6l2 6-2 6-2-6z" fill="currentColor" fill-opacity=".35"/>',
    0,
  ],
  '|',
  ['wx', 'Weather', '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5 4.25 4.25 0 0 0 7 18z"/>', 2],
  '|',
  ['curs', 'Cursors: all', '<path d="M5 3v14l4-3.5 3 6.5 2.5-1.2-3-6.3H17z"/>', 0],
];
const COLORS = ['#f5c842', '#ef4444', '#38bdf8', '#4ade80', '#ffffff'];
const WIDTHS = [2, 4, 7];
const HEARTBEAT = 2000,
  GONE = 7000,
  CUR_MS = 66,
  DRAFT_MS = 50;
function segD(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = dx * dx + dy * dy;
  let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// the symbols are SVG pictures drawn on the canvas: made once, then reused
const IMG = new Map();
let onImg = () => {};
function img(svg) {
  let i = IMG.get(svg);
  if (!i) {
    i = new Image();
    i.onload = () => {
      i.ok = 1;
      onImg();
    };
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    IMG.set(svg, i);
  }
  return i.ok ? i : null;
}

export function createBriefing(deps) {
  const R = new Room(deps);
  onImg = () => R.redraw();
  return {
    show: () => R.show(),
    hide: () => R.hide(),
    onMessage: (uid, m) => R.on(uid, m),
    peerLeft: uid => R.gone(uid),
    squadChanged: () => R.squadChanged(),
    refresh: () => R.ui(),
    joined: () => !!R.me,
    room: () => R.room,
    objects: () => [...R.objs.values()],
    members: () => [...R.members.keys()],
    _r: R, // for the tests
  };
}

class Room {
  constructor(deps) {
    this.d = deps;
    this.esc = deps.esc;
    this.me = null; // {uid, joined} while in the room
    this.members = new Map(); // uid -> {uid, joined, t}: the pilots in the room (me too)
    this.objs = new Map();
    this.drafts = new Map();
    this.lasers = new Map();
    this.curs = new Map();
    this.room = { v: 0, briefer: null, pens: [], follow: true };
    this.tool = 'pan';
    this.col = COLORS[0];
    this.wi = 1;
    this.side = 'hostile';
    this.symk = 'trk';
    this.cursAll = true;
    this.undoS = [];
    this.seq = 0;
    this.free = false;
    this.sel = null;
    this.local = null;
    this.M = null; // the borrowed map {L, map, box, ...} while the tab is open
    this.built = false;
    this.squad = null;
    setInterval(() => this.beat(), HEARTBEAT);
  }
  // ------------------------------------------------------------------- helpers
  uid() {
    return this.d.me();
  }
  info(uid) {
    const r = this.d.role(uid) || { role: 'Pilot', lead: false };
    return { uid, n: this.d.name(uid), role: r.role, lead: !!r.lead, col: pilotColour(uid) };
  }
  isBriefer() {
    return !!this.me && this.room.briefer === this.me.uid;
  }
  hasPen(u) {
    return (this.room.pens || []).includes(u);
  }
  can() {
    return !!this.me && canDraw(this.room, this.me.uid);
  }
  writer(u) {
    return canDraw(this.room, u);
  }
  brieferHere() {
    return !!this.room.briefer && this.members.has(this.room.briefer);
  }
  following() {
    return !!this.me && !this.isBriefer() && this.room.follow && !this.free && this.brieferHere();
  }
  send(m) {
    this.d.send({ k: 'brf', ...m });
  }
  sendTo(uid, m) {
    this.d.sendTo(uid, { k: 'brf', ...m });
  }
  toast(t, ms = 2600) {
    const w = this.M && this.visible && this.wrap;
    if (!w) return this.d.toast && this.d.toast(t);
    const d = document.createElement('div');
    d.className = 'brtoast';
    d.textContent = t;
    w.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .3s';
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 320);
    }, ms);
  }
  // ------------------------------------------------------------------- the page
  build() {
    const r = this.d.root;
    r.innerHTML = `<div class="brw"><div class="brside"><div class="brtop"><h3>BRIEFING ROOM</h3><div class="brmis"></div></div>
      <div class="brlh"><span class="brcnt">IN THE ROOM</span><input class="brfind" type="search" placeholder="Find a pilot" aria-label="Find a pilot"></div><div class="brlist"></div><div class="bracts"></div></div>
      <div class="brmain"><div class="brtools"></div><div class="brmapw"><div class="brmap"></div><div class="brhdr"></div><div class="brcurs"></div></div></div></div>`;
    this.$ = s => r.querySelector(s);
    this.list = this.$('.brlist');
    this.acts = this.$('.bracts');
    this.toolsEl = this.$('.brtools');
    this.box = this.$('.brmap');
    this.wrap = this.$('.brmapw');
    this.hdr = this.$('.brhdr');
    this.cursL = this.$('.brcurs');
    this.$('.brfind').oninput = () => this.renderList();
    this.buildTools();
    this.bindPointer();
    this.ro = new ResizeObserver(() => {
      this.toolsEl.classList.toggle('narrow', this.toolsEl.clientWidth < 900);
      if (this.M) this.M.map.invalidateSize();
    });
    this.ro.observe(this.toolsEl);
    this.ro.observe(this.wrap);
    this.built = true;
    this.loop();
  }
  async show() {
    if (!this.built) this.build();
    this.visible = true;
    this.d.wide && this.d.wide(true);
    this.squadChanged();
    this.ui();
    if (this.M || this.attaching) return; // shown again while the map is being borrowed: once is enough
    const tok = (this.tok = (this.tok || 0) + 1);
    this.attaching = true;
    let o = null;
    try {
      o = await this.d.attach(this.box);
    } finally {
      this.attaching = false;
    }
    if (tok !== this.tok || !this.visible) {
      if (o) this.d.detach();
      return;
    }
    if (!o) {
      this.box.innerHTML = '<p class="hint" style="padding:12px">The map could not be loaded.</p>';
      return;
    }
    const { L, map } = o;
    if (!map.getPane('brfP')) {
      const p = map.createPane('brfP');
      p.style.zIndex = 640;
      p.style.pointerEvents = 'none';
    }
    if (!map._brR) map._brR = L.canvas({ pane: 'brfP', padding: 0.5 });
    const room = this;
    const BoardPath = L.Path.extend({
      _project() {
        this._pxBounds = L.bounds([-1e7, -1e7], [1e7, 1e7]);
      },
      _update() {},
      _updatePath() {
        room.paint(this._renderer._ctx);
      },
      _containsPoint() {
        return false;
      },
    });
    const board = new BoardPath();
    // its own canvas (pane brfP): on the canvas of the map the dashes of the other layers were left on the drawings
    L.setOptions(board, { interactive: false, renderer: map._brR });
    board.addTo(map);
    const onMove = () => this.sendView(false),
      onEnd = () => this.sendView(true),
      onZa = () => this.wrap.classList.add('zooming'),
      onZe = () => {
        this.wrap.classList.remove('zooming');
        this.sendView(true);
        if (this.room.wx && this.room.wx.mode == 'wind') this.wxSync(true); // the barbs follow the zoom
      },
      onDrag = () => this.goFree();
    map.on('move', onMove);
    map.on('moveend', onEnd);
    map.on('zoomanim', onZa);
    map.on('zoomend', onZe);
    map.on('dragstart', onDrag);
    this.M = {
      L,
      map,
      board,
      off: () => map.off({ move: onMove, moveend: onEnd, zoomanim: onZa, zoomend: onZe, dragstart: onDrag }),
    };
    this.map = map;
    this.setTool(this.tool);
    if (this.following() && this.lastView) this.applyView(this.lastView, true);
    this.redraw();
    this.wxSig = '';
    this.wxSync(true);
  }
  hide() {
    this.visible = false;
    this.tok = (this.tok || 0) + 1;
    this.d.wide && this.d.wide(false);
    this.closePal();
    this.closeEd();
    this.closeWx();
    if (this.me) this.send({ t: 'cur', ll: null });
    if (!this.M) return;
    const { map, board } = this.M;
    try {
      this.M.off();
      board.remove();
      if (this.M.wxg) this.M.wxg.remove();
      const pn = map.getPane('wxP');
      if (pn) pn.style.opacity = '';
      this.wxSig = '';
      map.dragging.enable();
      this.box.classList.remove('brdraw', 'brerase', 'brsel', 'brpan');
    } catch (e) {
      /* the map went away */
    }
    this.M = null;
    this.map = null;
    try {
      this.d.detach();
    } catch (e) {
      /* none */
    }
  }
  // another squadron chosen (or none): the room of the old one is left
  squadChanged() {
    const s = this.d.squad();
    if (s === this.squad) return;
    if (this.me) this.leave();
    this.squad = s;
    this.members.clear();
    this.room = { v: 0, briefer: null, pens: [], follow: true };
    this.ui();
  }
  // ------------------------------------------------------------------- join / leave
  join() {
    if (this.me || !this.d.squad()) return;
    this.me = { uid: this.uid(), joined: Date.now() };
    this.closedMsg = null;
    this.members.set(this.me.uid, { uid: this.me.uid, joined: this.me.joined, t: Date.now() });
    this.objs.clear();
    this.undoS = [];
    this.free = false;
    this.send({ t: 'hello', joined: this.me.joined });
    setTimeout(() => {
      if (this.me && !this.brieferHere()) this.elect();
    }, 1200);
    this.setTool(this.can() ? 'laser' : 'pan');
    this.ui();
    this.redraw();
  }
  leave(closed) {
    if (!this.me) return;
    this.send({ t: 'bye' });
    this.me = null;
    this.members.delete(this.uid());
    this.objs.clear();
    this.drafts.clear();
    this.lasers.clear();
    this.sel = null;
    this.local = null;
    if (closed) this.members.clear();
    this.room = { v: 0, briefer: null, pens: [], follow: true };
    this.curs.forEach(c => c.el.remove());
    this.curs.clear();
    this.closePal();
    this.closeEd();
    this.closedMsg = closed
      ? closed + ' closed the room. The drawings are gone; the cards saved stay in each kneeboard.'
      : null;
    this.setTool('pan');
    this.ui();
    this.redraw();
  }
  elect() {
    if (!this.me || this.brieferHere()) return;
    const list = [...this.members.values()].map(m => ({ ...m, lead: this.info(m.uid).lead }));
    if (nextBriefer(list) === this.me.uid) {
      this.setRoom({
        briefer: this.me.uid,
        pens: (this.room.pens || []).filter(u => u !== this.me.uid && this.members.has(u)),
      });
      this.toast('You are the briefer');
      if (this.tool == 'pan') this.setTool('laser');
    }
  }
  setRoom(ch) {
    Object.assign(this.room, ch);
    this.room.v = (this.room.v || 0) + 1;
    this.room.by = this.uid();
    this.room.mis = this.isBriefer() ? this.d.mission() || '' : this.room.mis;
    this.room.th = this.isBriefer() ? this.d.theater() || '' : this.room.th;
    this.send({ t: 'room', room: this.room });
    this.ui();
  }
  // ------------------------------------------------------------------- the network
  beat() {
    const now = Date.now();
    if (this.me) {
      this.members.set(this.me.uid, { uid: this.me.uid, joined: this.me.joined, t: now });
      this.send({ t: 'here', joined: this.me.joined, ...(this.isBriefer() ? { v: this.room.v } : {}) });
      // the briefer keeps the mission line up to date (he may choose another flight)
      if (this.isBriefer() && (this.room.mis !== (this.d.mission() || '') || this.room.th !== (this.d.theater() || '')))
        this.setRoom({});
    }
    let ch = false;
    const online = new Set(this.d.online());
    for (const [u, m] of this.members)
      if (!this.me || u !== this.me.uid)
        if (now - m.t > GONE || !online.has(u)) {
          this.members.delete(u);
          this.dropPilot(u);
          ch = true;
        }
    if (ch) this.afterGone();
  }
  gone(uid) {
    if (!this.members.has(uid)) return;
    this.members.delete(uid);
    this.dropPilot(uid);
    this.afterGone();
  }
  dropPilot(u) {
    const c = this.curs.get(u);
    if (c) {
      c.el.remove();
      this.curs.delete(u);
    }
    this.lasers.delete(u);
    if (this.drafts.delete(u)) this.redraw();
  }
  afterGone() {
    if (this.me) {
      if (this.room.briefer && !this.members.has(this.room.briefer)) setTimeout(() => this.elect(), 300);
      if (this.isBriefer() && (this.room.pens || []).some(u => !this.members.has(u)))
        this.setRoom({ pens: this.room.pens.filter(u => this.members.has(u)) });
    }
    this.ui();
  }
  on(from, m) {
    if (!m || typeof m != 'object' || !from) return;
    const t = m.t;
    if (t == 'here' || t == 'hello') {
      const had = this.members.has(from);
      this.members.set(from, { uid: from, joined: +m.joined || Date.now(), t: Date.now() });
      if (!this.me) {
        if (!had) this.ui();
        if (m.v && from && this.info(from).lead && !this.room.briefer) this.room.briefer = from; // the join screen says who is briefing
        return;
      }
      if (t == 'hello' && this.isBriefer())
        this.sendTo(from, { t: 'state', room: this.room, objs: [...this.objs.values()], view: this.viewNow() });
      if (t == 'hello' && !had && this.members.size < 14) this.toast(this.d.name(from) + ' joined the room', 1800);
      if (!had) this.ui();
      return;
    }
    if (t == 'bye') {
      if (!this.members.has(from)) return;
      const name = this.d.name(from);
      this.gone(from);
      if (this.me && this.members.size < 14) this.toast(name + ' left the room', 1800);
      return;
    }
    if (!this.me || !this.members.has(from)) {
      if (t == 'room' && m.room && !this.me) {
        if (m.room.closed) {
          this.members.clear();
          this.room = { v: 0, briefer: null, pens: [], follow: true };
        } else if (roomNewer(this.room, m.room)) this.room = { ...m.room };
        this.ui();
      }
      return;
    }
    switch (t) {
      case 'state': {
        if (m.room && (from === m.room.briefer || roomNewer(this.room, m.room)))
          this.room = { ...m.room, wx: cleanWx(m.room.wx) };
        (Array.isArray(m.objs) ? m.objs : []).slice(0, MAX_OBJS).forEach(x => {
          const o = cleanObj(x);
          if (o) this.objs.set(o.id, o);
        });
        if (m.view) this.lastView = m.view;
        if (m.view && this.following()) this.applyView(m.view, true);
        this.ui();
        this.redraw();
        break;
      }
      case 'room': {
        const n = m.room;
        if (!n || typeof n != 'object') break;
        // only the briefer changes the room; when there is none, a leader takes it
        const ok =
          from === this.room.briefer ||
          ((!this.brieferHere() || n.v > this.room.v) && this.info(from).lead && n.briefer === from);
        if (!ok) break;
        const old = this.room;
        this.room = { ...n, pens: Array.isArray(n.pens) ? n.pens.slice(0, 64) : [], wx: cleanWx(n.wx) };
        if (n.closed) return this.leave(this.d.name(from));
        const me = this.me.uid,
          had = (old.pens || []).includes(me),
          has = this.hasPen(me);
        if (!had && has) {
          this.toast(this.d.name(from) + ' gave you the pen');
          this.setTool('pen');
        }
        if (had && !has && !this.isBriefer()) {
          this.toast('The pen went back to ' + this.d.name(this.room.briefer));
          this.setTool('pan');
        }
        if (old.briefer !== me && this.room.briefer === me) {
          this.toast('You are the briefer now');
          this.free = false;
        }
        if (old.briefer === me && this.room.briefer !== me && !this.can()) this.setTool('pan');
        if (!old.follow && n.follow && !this.isBriefer()) this.free = false;
        this.ui();
        break;
      }
      case 'penback':
        if (this.isBriefer() && this.hasPen(from)) this.setRoom({ pens: this.room.pens.filter(u => u !== from) });
        break;
      case 'add':
      case 'upd': {
        if (!this.writer(from)) break;
        const o = cleanObj(m.o);
        if (!o || (t == 'add' && this.objs.size >= MAX_OBJS)) break;
        this.objs.set(o.id, o);
        if (this.sel && this.sel.id == o.id) this.sel = o;
        this.redraw();
        break;
      }
      case 'del':
        if (!this.writer(from)) break;
        this.objs.delete(m.id);
        if (this.sel && this.sel.id == m.id) this.sel = null;
        this.redraw();
        break;
      case 'clear':
        if (from !== this.room.briefer) break;
        this.objs.clear();
        this.undoS = [];
        this.sel = null;
        this.redraw();
        this.toast(this.d.name(from) + ' cleared the board');
        break;
      case 'draft': {
        if (!this.writer(from) && !(m.o && (m.o.k == 'ruler' || m.o.k == 'comp'))) break;
        const o = m.o ? cleanObj(m.o) : null;
        if (o && this.writer(from)) this.drafts.set(from, o);
        else this.drafts.delete(from);
        this.redraw();
        break;
      }
      case 'las': {
        if (!this.writer(from)) break;
        let l = this.lasers.get(from);
        if (!l) this.lasers.set(from, (l = []));
        const ll = Array.isArray(m.ll) && m.ll.length == 2 && m.ll.every(Number.isFinite) ? m.ll : null;
        l.push({ ll, t: performance.now() });
        if (l.length > 200) l.splice(0, l.length - 200);
        break;
      }
      case 'cur':
        this.cursor(from, Array.isArray(m.ll) && m.ll.length == 2 && m.ll.every(Number.isFinite) ? m.ll : null);
        break;
      case 'view':
        if (from === this.room.briefer && Array.isArray(m.c) && Number.isFinite(m.z)) {
          this.lastView = { c: m.c, z: m.z };
          if (this.following()) this.applyView(this.lastView, false);
        }
        break;
    }
  }
  // ------------------------------------------------------------------- the view of the briefer
  viewNow() {
    if (!this.map) return this.lastView || null;
    const c = this.map.getCenter();
    return { c: [c.lat, c.lng], z: this.map.getZoom() };
  }
  sendView(end) {
    if (this.applying || !this.isBriefer() || !this.room.follow || !this.map) return;
    const now = performance.now();
    if (!end && now - (this.lastV || 0) < 80) return;
    this.lastV = now;
    this.send({ t: 'view', ...this.viewNow() });
  }
  applyView(v, snap) {
    if (!this.map || !v || this.box.classList.contains('shoting')) return;
    this.applying = true;
    if (snap || Math.abs(v.z - this.map.getZoom()) > 0.01) this.map.setView(v.c, v.z, { animate: !snap });
    else this.map.panTo(v.c, { animate: true, duration: 0.1, easeLinearity: 1, noMoveStart: true });
    clearTimeout(this.apT);
    this.apT = setTimeout(() => (this.applying = false), snap ? 50 : 400);
  }
  goFree() {
    if (!this.following() || this.applying) return;
    this.free = true;
    this.renderHdr();
    this.toast('Free view: you move the map on your own');
  }
  // ------------------------------------------------------------------- the left column and the header of the map
  ui() {
    if (!this.built) return;
    this.renderTop();
    this.renderList();
    this.renderActs();
    this.renderTools();
    this.renderHdr();
    this.renderJoin();
    this.wxSync();
  }
  renderTop() {
    const e = this.esc,
      el = this.$('.brmis'),
      mis = this.room.mis,
      mine = this.d.theater() || '';
    const b = this.room.briefer && this.members.has(this.room.briefer) ? this.d.name(this.room.briefer) : '';
    el.innerHTML = b
      ? `Briefer <b>${e(b)}</b>${mis ? '<br>' + e(mis) : ''}${this.me && this.room.th && mine && this.room.th !== mine ? `<br><span class="brwarn">The briefer is on the theater ${e(this.room.th)}: choose it to see the drawings in place.</span>` : ''}`
      : this.me
        ? 'Waiting for a leader to open the room'
        : 'Nobody is briefing now';
  }
  renderList() {
    const e = this.esc,
      L = this.list,
      q = (this.$('.brfind').value || '').toLowerCase();
    const ms = [...this.members.values()].map(m => ({ ...this.info(m.uid), joined: m.joined }));
    this.$('.brlh').classList.toggle('many', ms.length > 10);
    this.$('.brcnt').textContent = 'IN THE ROOM · ' + ms.length;
    const meU = this.me && this.me.uid,
      brf = this.isBriefer();
    const rows = listOrder(this.room, meU, ms).filter(m => !q || m.n.toLowerCase().includes(q));
    const out = this.me
      ? this.d
          .online()
          .filter(u => !this.members.has(u))
          .map(u => this.info(u))
      : [];
    L.innerHTML =
      rows
        .map(m => {
          const isB = m.uid === this.room.briefer,
            isP = this.hasPen(m.uid),
            me = m.uid === meU;
          const bd = isB ? '<span class="bdg brf">briefer</span>' : isP ? '<span class="bdg pen">✎ pen</span>' : '';
          let act = '';
          if (brf && !me)
            act = `<span class="act">${isP ? '<button class="mini" data-a="take">Take the pen</button>' : '<button class="mini" data-a="give">Give the pen</button>'}${m.lead ? '<button class="mini" data-a="brf">Make briefer</button>' : ''}</span>`;
          return `<div class="pil ${me ? 'me' : ''}" data-u="${e(m.uid)}"><span class="dot" style="background:${m.col}"></span><div class="n"><i>${e(m.n)}${me ? ' (you)' : ''}</i><small>${e(m.role)}</small></div>${bd}${act}</div>`;
        })
        .join('') +
      out
        .filter(m => !q || m.n.toLowerCase().includes(q))
        .map(
          m =>
            `<div class="pil off"><span class="dot"></span><div class="n"><i>${e(m.n)}</i><small>online · not in the room</small></div></div>`
        )
        .join('');
    L.querySelectorAll('.mini').forEach(
      b =>
        (b.onclick = () => {
          const u = b.closest('.pil').dataset.u,
            a = b.dataset.a;
          if (a == 'give') {
            this.setRoom({ pens: [...(this.room.pens || []), u] });
            this.toast('You gave the pen to ' + this.d.name(u));
          }
          if (a == 'take') this.setRoom({ pens: this.room.pens.filter(x => x !== u) });
          if (a == 'brf') {
            this.setRoom({ briefer: u, pens: (this.room.pens || []).filter(x => x !== u) });
            this.toast(this.d.name(u) + ' is the briefer now');
            if (!this.can()) this.setTool('pan');
          }
        })
    );
  }
  renderActs() {
    const A = this.acts;
    if (!this.me) {
      A.innerHTML = '';
      return;
    }
    const card = `<button class="btn g gn" data-a="card">Save a kneeboard card</button>`;
    const note = `<div class="brnote">Drawings live only in the room: a card keeps them.</div>`;
    if (this.isBriefer()) {
      A.innerHTML = `<div class="brtog"><span>Everyone follows my view</span><button class="brsw ${this.room.follow ? 'on' : ''}" aria-label="Everyone follows my view"></button></div>${card}<button class="btn g brred" data-a="close">Close the room</button>${note}`;
      A.querySelector('.brsw').onclick = () => {
        this.setRoom({ follow: !this.room.follow });
        if (this.room.follow) this.send({ t: 'view', ...this.viewNow() });
      };
    } else
      A.innerHTML = `${this.hasPen(this.me.uid) ? `<button class="btn g" data-a="back">Give the pen back to ${this.esc(this.d.name(this.room.briefer))}</button>` : ''}${card}<button class="btn g" data-a="leave">Leave the room</button>${note}`;
    A.querySelectorAll('[data-a]').forEach(
      b =>
        (b.onclick = () => {
          const a = b.dataset.a;
          if (a == 'card') this.startCard();
          if (a == 'close')
            this.ask(
              'Close the room for everyone?',
              `${this.members.size > 1 ? 'All the ' + this.members.size + ' pilots in the room leave it' : 'The room closes'} and the drawings are lost. Save a kneeboard card first if you need one.`,
              'Close the room',
              () => {
                this.setRoom({ closed: true });
                this.leave('You');
              }
            );
          if (a == 'leave')
            this.ask(
              'Leave the room?',
              'The briefing goes on without you. You can come back while the room is open and you will find the drawings as they are.',
              'Leave the room',
              () => this.leave()
            );
          if (a == 'back') {
            this.sendTo(this.room.briefer, { t: 'penback' });
            this.toast('The pen goes back to ' + this.d.name(this.room.briefer));
          }
        })
    );
  }
  renderHdr() {
    const h = this.hdr,
      e = this.esc;
    h.innerHTML = '';
    if (!this.me) return;
    const b = this.brieferHere() ? this.d.name(this.room.briefer) : null;
    if (!b) {
      h.innerHTML = '<div class="chip">Waiting for a leader to open the room</div>';
      return;
    }
    if (this.isBriefer()) {
      h.innerHTML = `<div class="chip">You are the briefer${this.room.follow ? ' · everyone sees your view' : ''}</div>`;
      return;
    }
    if (!this.room.follow) return;
    h.innerHTML = this.free
      ? `<div class="chip"><span>Free view</span><button class="btn g">Back to ${e(b)}'s view</button></div>`
      : `<div class="chip"><span>Following <b>${e(b)}</b>'s view</span><button class="btn g">Free view</button></div>`;
    h.querySelector('button').onclick = () => {
      if (this.free) {
        this.free = false;
        if (this.lastView) this.applyView(this.lastView, true);
        this.renderHdr();
      } else this.goFree();
    };
  }
  // the screen over the map while one is not in the room
  renderJoin() {
    let j = this.wrap.querySelector('.brjoin');
    if (this.me) {
      if (j) j.remove();
      return;
    }
    if (!j) {
      j = document.createElement('div');
      j.className = 'brjoin';
      this.wrap.appendChild(j);
    }
    const e = this.esc,
      sq = this.d.squad(),
      mine = this.info(this.uid()),
      n = this.members.size,
      b = this.room.briefer && this.members.has(this.room.briefer) ? this.d.name(this.room.briefer) : '';
    let msg, btn;
    if (!sq) {
      msg = 'Join or create a squadron first (Members or Me): the room is shared with the pilots of the squadron.';
      btn = '';
    } else if (n) {
      msg = (b ? e(b) + ' is briefing' : 'The room is open') + ` · ${n} pilot${n == 1 ? '' : 's'} in the room.`;
      btn = '<button class="btn g gn" data-a="join">Join the room</button>';
    } else if (mine.lead) {
      msg = 'Nobody is in the room. As ' + e(mine.role.toLowerCase()) + ' you can open it: you become the briefer.';
      btn = '<button class="btn g gn" data-a="join">Open the room</button>';
    } else {
      msg =
        'Nobody is in the room. A leader (commander, mission commander, package or flight lead) opens it; you can wait inside.';
      btn = '<button class="btn g gn" data-a="join">Join the room</button>';
    }
    j.innerHTML = `<div class="box"><h2>Briefing room</h2>${this.closedMsg ? `<p class="brwarn">${e(this.closedMsg)}</p>` : ''}<p>${msg}</p>${btn}</div>`;
    const bt = j.querySelector('[data-a=join]');
    if (bt) bt.onclick = () => this.join();
  }
  ask(title, text, ok, fn) {
    const e = this.esc,
      m = document.createElement('div');
    m.className = 'brmodal';
    m.innerHTML = `<div class="box"><b>${e(title)}</b><span>${e(text)}</span><div class="row2"><button class="btn g" data-a="no">Cancel</button><button class="btn g brdanger" data-a="ok">${e(ok)}</button></div></div>`;
    m.querySelector('[data-a=no]').onclick = () => m.remove();
    m.querySelector('[data-a=ok]').onclick = () => {
      m.remove();
      fn();
    };
    m.onclick = ev => {
      if (ev.target == m) m.remove();
    };
    this.d.root.querySelector('.brw').appendChild(m);
  }
  clearBoard() {
    this.ask(
      'Clear the board for everyone?',
      'All the drawings, symbols and texts go away, for every pilot in the room. The map and the flight plan stay.',
      'Clear the board',
      () => {
        this.objs.clear();
        this.undoS = [];
        this.sel = null;
        this.send({ t: 'clear' });
        this.redraw();
      }
    );
  }
  // ------------------------------------------------------------------- the weather (the filters of the Weather page, chosen by the briefer for everybody)
  // every pilot draws it from the weather files of his own campaign: only the choice travels (filter, hour, layer of the wind, opacity)
  wxNow() {
    return cleanWx(this.room.wx);
  }
  setWx(ch) {
    if (!this.isBriefer()) return;
    this.room.wx = cleanWx({ ...this.wxNow(), ...ch });
    this.wxSync();
    this.renderWxPanel();
    // a slider sends at most 8 times a second, the last position always
    clearTimeout(this.wxT);
    const now = performance.now();
    if (now - (this.wxLast || 0) > 120) {
      this.wxLast = now;
      this.setRoom({});
    } else
      this.wxT = setTimeout(() => {
        this.wxLast = performance.now();
        this.setRoom({});
      }, 120);
  }
  async wxSync(force) {
    const M = this.M;
    if (!M || !this.d.wx) return;
    const w = this.me ? this.wxNow() : { mode: 'off' },
      sig = JSON.stringify(w);
    if (!force && sig === this.wxSig) return;
    this.wxSig = sig;
    if (!M.wxg) M.wxg = M.L.layerGroup().addTo(M.map);
    const tag = this.wrap.querySelector('.brwxtag');
    if (w.mode == 'off') {
      M.wxg.clearLayers();
      const pn = M.map.getPane('wxP');
      if (pn) pn.style.opacity = '';
      if (tag) tag.remove();
      return;
    }
    const tok = (this.wxTok = (this.wxTok || 0) + 1);
    try {
      if (w.ms != null && this.d.wx.load) await this.d.wx.load(w.ms);
    } catch (e) {
      /* the campaign map is used */
    }
    if (tok !== this.wxTok || this.M !== M) return;
    const W = this.d.wx.at(w.ms);
    let t = this.wrap.querySelector('.brwxtag');
    if (!t) {
      t = document.createElement('div');
      t.className = 'brwxtag';
      this.wrap.appendChild(t);
    }
    const name = (WX_MODES.find(m => m[0] == w.mode) || [, ''])[1],
      when =
        w.ms != null ? ' · day ' + (Math.floor(w.ms / 864e5) + 1) + ' · ' + hhmm(w.ms) + 'Z' : ' · campaign weather',
      at = w.mode == 'wind' ? ' · ' + (WX_ALT[w.lv] ? WX_ALT[w.lv].toLocaleString('en-US') + ' ft' : 'surface') : '';
    if (!W) {
      M.wxg.clearLayers();
      t.innerHTML = `<b>${name}</b>${when}<br><span class="brwarn">No weather map here: open the campaign or the mission of the briefer.</span>`;
      return;
    }
    drawWx({ L: M.L, map: M.map, group: M.wxg, W, lv: w.lv, mode: w.mode, op: w.op, toLL: this.d.wx.toLL });
    t.innerHTML = `<b>${name}</b>${at}${when}<div class="wxleg">${wxLegend(w.mode, W, w.lv)}</div>`;
  }
  closeWx() {
    if (this.wxPanel) {
      this.wxPanel.remove();
      this.wxPanel = null;
    }
  }
  openWx(btn) {
    this.closeWx();
    this.closePal();
    const host = this.d.root.querySelector('.brw'),
      r = btn.getBoundingClientRect(),
      H = host.getBoundingClientRect(),
      p = (this.wxPanel = document.createElement('div'));
    p.className = 'brpal brwxp';
    p.style.left = Math.max(6, Math.min(r.left - H.left - 160, H.width - 360)) + 'px';
    p.style.top = r.bottom - H.top + 6 + 'px';
    host.appendChild(p);
    this.renderWxPanel(true);
  }
  // the panel of the briefer: the filters, the hour (the hours of his flight), the layer of the wind, the opacity
  renderWxPanel(full) {
    const p = this.wxPanel;
    if (!p) return;
    const w = this.wxNow(),
      fl = (this.d.wx && this.d.wx.flight && this.d.wx.flight()) || null,
      hrs = fl && fl.hours && fl.hours.length ? fl.hours : [],
      t0 = hrs.length ? hrs[0] : null,
      t1 = hrs.length ? hrs[hrs.length - 1] + 3599000 : null;
    if (!full && p.querySelector('[data-wx]')) {
      p.querySelectorAll('[data-wx]').forEach(b => b.classList.toggle('on', b.dataset.wx == w.mode));
      const tl = p.querySelector('.brwxt');
      if (tl)
        tl.textContent =
          w.ms != null ? 'day ' + (Math.floor(w.ms / 864e5) + 1) + ' · ' + hhmm(w.ms) + 'Z' : 'campaign weather';
      const ll = p.querySelector('.brwxl');
      if (ll) ll.textContent = WX_ALT[w.lv] ? WX_ALT[w.lv].toLocaleString('en-US') + ' ft' : 'surface';
      const ol = p.querySelector('.brwxo');
      if (ol) ol.textContent = w.op + '%';
      p.querySelector('.brwxlv').style.display = w.mode == 'wind' ? '' : 'none';
      return;
    }
    const ms = w.ms != null && t0 != null ? Math.min(t1, Math.max(t0, w.ms)) : w.ms;
    p.innerHTML = `<div class="ph">WEATHER · everybody in the room sees it</div><div class="rw">${[
      ['off', 'Off'],
      ...WX_MODES,
    ]
      .map(([k, n]) => `<button class="it brwxm ${k == w.mode ? 'on' : ''}" data-wx="${k}">${n}</button>`)
      .join('')}</div>
      <div class="ph">TIME <b class="brwxt">${ms != null ? 'day ' + (Math.floor(ms / 864e5) + 1) + ' · ' + hhmm(ms) + 'Z' : 'campaign weather'}</b></div>
      ${
        t0 != null
          ? `<input type="range" class="brwxs" min="${t0}" max="${t1}" step="60000" value="${ms != null ? ms : fl.tot || fl.dep || t0}" aria-label="Time of the weather">${[
              ['DEP', fl.dep],
              ['TOT', fl.tot],
              ['LAND', fl.land],
            ]
              .filter(x => x[1] != null && x[1] >= t0 && x[1] <= t1)
              .map(([n, v]) => `<button class="mini" data-at="${v}">${n} ${hhmm(v)}</button>`)
              .join(' ')}`
          : '<div class="tip">No hourly weather maps for your flight: the campaign map is used.</div>'
      }
      <div class="brwxlv" style="${w.mode == 'wind' ? '' : 'display:none'}"><div class="ph">WIND AT <b class="brwxl">${WX_ALT[w.lv] ? WX_ALT[w.lv].toLocaleString('en-US') + ' ft' : 'surface'}</b></div><input type="range" class="brwxa" min="0" max="${WX_ALT.length - 1}" step="1" value="${w.lv}" aria-label="Altitude of the wind"></div>
      <div class="ph">OPACITY <b class="brwxo">${w.op}%</b></div><input type="range" class="brwxop" min="10" max="100" step="5" value="${w.op}" aria-label="Opacity of the weather">`;
    p.querySelectorAll('[data-wx]').forEach(
      b =>
        (b.onclick = () => {
          const m = b.dataset.wx,
            cur = this.wxNow();
          // the first time on: the hour of the flight (TOT, else the take-off) and the layer nearest to its altitude
          const first = cur.mode == 'off' && m != 'off';
          this.setWx({
            mode: m,
            ...(first && cur.ms == null && fl ? { ms: fl.tot || fl.dep || null } : {}),
            ...(first && fl && fl.alt ? { lv: wxLevel(fl.alt) } : {}),
          });
        })
    );
    const sl = p.querySelector('.brwxs');
    if (sl) sl.oninput = () => this.setWx({ ms: +sl.value });
    p.querySelectorAll('[data-at]').forEach(
      b =>
        (b.onclick = () => {
          this.setWx({ ms: +b.dataset.at });
          if (sl) sl.value = b.dataset.at;
        })
    );
    const al = p.querySelector('.brwxa');
    al.oninput = () => this.setWx({ lv: +al.value });
    const op = p.querySelector('.brwxop');
    op.oninput = () => this.setWx({ op: +op.value });
  }
  // ------------------------------------------------------------------- the tools
  buildTools() {
    const T = this.toolsEl;
    T.innerHTML =
      TOOLS.map(t =>
        t == '|'
          ? '<span class="vs"></span>'
          : `<button class="t" data-t="${t[0]}" title="${t[1]}"><svg viewBox="0 0 24 24">${t[2]}</svg><span>${t[1]}</span></button>`
      ).join('') +
      `<span class="vs"></span><span class="cols">${COLORS.map(c => `<button class="col" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</span><span class="wd">${WIDTHS.map((w, i) => `<button data-w="${i}" title="${['Thin', 'Medium', 'Thick'][i]}"><i style="height:${w}px"></i></button>`).join('')}</span>`;
    T.querySelectorAll('.t').forEach(
      b =>
        (b.onclick = () => {
          const k = b.dataset.t,
            d = TOOLS.find(t => t[0] == k);
          if (k == 'curs') {
            this.cursAll = !this.cursAll;
            this.renderTools();
            return this.toast(
              this.cursAll ? 'You see the cursors of everyone' : 'You see only the cursors of who can draw'
            );
          }
          if (!this.me) return this.toast('Join the room first');
          if (d[3] && !this.can()) return this.toast('Ask the briefer for the pen');
          if (k == 'undo') return this.undo();
          if (k == 'clear') return this.clearBoard();
          if (k == 'wx') return this.wxPanel ? this.closeWx() : this.openWx(b);
          if (k == 'sym') {
            if (this.tool == 'sym' && this.palEl) return this.closePal();
            this.setTool('sym');
            return this.openPal(b);
          }
          this.setTool(k);
        })
    );
    T.querySelectorAll('.col').forEach(
      b =>
        (b.onclick = () => {
          this.col = b.dataset.c;
          this.renderTools();
          if (this.textEd) {
            this.textEd.style.color = this.textEd.style.borderColor = this.textObj.col = this.col;
            this.draft({ ...this.textObj });
          }
        })
    );
    T.querySelectorAll('.wd button').forEach(
      b =>
        (b.onclick = () => {
          this.wi = +b.dataset.w;
          this.renderTools();
        })
    );
    this.renderTools();
  }
  renderTools() {
    if (!this.built) return;
    if (!this.isBriefer()) this.closeWx();
    const can = this.can();
    this.toolsEl.querySelectorAll('.t').forEach(b => {
      const d = TOOLS.find(t => t[0] == b.dataset.t),
        k = d[0];
      b.classList.toggle('on', k == this.tool || (k == 'curs' && !this.cursAll));
      b.classList.toggle('dis', d[3] == 1 && !can);
      b.classList.toggle('hide', d[3] == 2 && !this.isBriefer());
      b.classList.toggle('er', k == 'erase');
      b.classList.toggle('cl', k == 'clear');
      b.classList.toggle('solo', !d[3] && !can && !!this.me && !['pan', 'curs'].includes(k));
      if (k == 'curs') {
        b.querySelector('span').textContent = this.cursAll ? 'Cursors: all' : 'Cursors: pens';
        b.title = this.cursAll ? 'Show only the cursors of who can draw' : 'Show the cursors of everyone';
        return;
      }
      b.title =
        d[1] +
        (k == 'clear'
          ? ' the board for everyone'
          : d[3] == 1 && !can
            ? ' (ask the briefer for the pen)'
            : !d[3] && !can && k != 'pan'
              ? ' (only you see it)'
              : '');
    });
    this.toolsEl.querySelectorAll('.col').forEach(b => b.classList.toggle('on', b.dataset.c == this.col));
    this.toolsEl.querySelectorAll('.wd button').forEach(b => b.classList.toggle('on', +b.dataset.w == this.wi));
  }
  setTool(k) {
    if (this.tool == 'laser' && k != 'laser' && this.me) this.send({ t: 'las', ll: null });
    if (!this.can() && !['pan', 'ruler', 'comp'].includes(k)) k = 'pan';
    this.tool = k;
    this.closeEd();
    if (k != 'sym') this.closePal();
    if (k != 'sel') this.sel = null;
    if (this.map) {
      if (k == 'pan') this.map.dragging.enable();
      else this.map.dragging.disable();
    }
    if (this.box) {
      const cl = this.box.classList;
      ['brpan', 'brerase', 'brsel', 'brdraw'].forEach(c => cl.remove(c));
      cl.add(k == 'pan' ? 'brpan' : k == 'erase' ? 'brerase' : k == 'sel' ? 'brsel' : 'brdraw');
    }
    this.renderTools();
    this.redraw();
  }
  openPal(btn) {
    this.closePal();
    const p = (this.palEl = document.createElement('div'));
    p.className = 'brpal';
    const host = this.d.root.querySelector('.brw'),
      r = btn.getBoundingClientRect(),
      H = host.getBoundingClientRect();
    p.style.left = Math.max(6, Math.min(r.left - H.left - 140, H.width - 350)) + 'px';
    p.style.top = r.bottom - H.top + 6 + 'px';
    const draw = () => {
      const ic = k => {
        const c = SIDE_COL[this.side];
        if (k == 'trk')
          return `<svg width="26" height="18" viewBox="-4 -9 26 18"><path d="M3 0L17 -6" stroke="${TRK[this.side]}" stroke-width="1.6"/><rect x="-3" y="-5" width="10" height="10" fill="none" stroke="${TRK[this.side]}" stroke-width="1.8"/></svg>`;
        if (k == 'ab') return airbaseSvg(this.side, 20).svg;
        if (k == 'IP' || k == 'CP')
          return `<svg width="20" height="24" viewBox="-10 -22 20 24"><path d="M0 0L-7 -12A8 8 0 1 1 7 -12Z" fill="#0d1b2ad9" stroke="${c}" stroke-width="1.6"/><text y="-11" fill="${c}" font-size="7.5" font-weight="800" text-anchor="middle" font-family="system-ui">${k}</text></svg>`;
        if (k == 'tgt')
          return `<svg width="22" height="22" viewBox="-11 -11 22 22"><circle r="6" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M0 -10V10M-10 0H10" stroke="${c}" stroke-width="1.4"/></svg>`;
        if (k == 'bull')
          return '<svg width="22" height="22" viewBox="-11 -11 22 22" stroke="#c9a7ff" fill="none" stroke-width="1.3"><circle r="10"/><circle r="6.5"/><circle r="3"/><path d="M0 -10V10M-10 0H10"/></svg>';
        if (k == 'orbit')
          return `<svg width="34" height="18" viewBox="-17 -9 34 18"><rect x="-15" y="-7" width="30" height="14" rx="7" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M3 -7l-5 -3v6z" fill="${c}"/></svg>`;
        if (k == 'hold')
          return `<svg width="34" height="18" viewBox="-17 -9 34 18"><path d="M-8 7H8A7 7 0 0 0 8 -7H-8A7 7 0 0 0 -8 7" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M10 7l-5 -3v6z" fill="${c}"/><path d="M14 4l3 3-3 3z" fill="${c}"/></svg>`;
        if (k == 'ring')
          return `<svg width="24" height="24" viewBox="-12 -12 24 24"><circle r="10" fill="${RINGC[this.side]}22" stroke="${RINGC[this.side]}" stroke-width="1.4" stroke-dasharray="3 2"/></svg>`;
        return symbolSvg(k, this.side, 26).svg;
      };
      p.innerHTML = `<div class="ph">FRAME</div><div class="rw fr">${['hostile', 'friend', 'neutral', 'unknown']
        .map(
          s =>
            `<button class="it ${s == this.side ? 'on' : ''}" data-s="${s}">${symbolSvg('unk', s, 24).svg.replace(/<text[^]*?<\/text>/, '')}${s[0].toUpperCase() + s.slice(1)}</button>`
        )
        .join('')}</div>
        <div class="ph">GROUND AND SEA UNITS · as on the map</div><div class="rw">${UNITS.map(([k, n]) => `<button class="it ${k == this.symk ? 'on' : ''}" data-k="${k}">${ic(k)}${n}</button>`).join('')}</div>
        <div class="ph">AIR AND CONTROL MEASURES</div><div class="rw">${CTRL.map(([k, n]) => `<button class="it ${k == this.symk ? 'on' : ''}" data-k="${k}">${ic(k)}${n}</button>`).join('')}</div>
        <div class="tip">${this.symTip()}</div>`;
      p.querySelectorAll('[data-s]').forEach(
        b =>
          (b.onclick = () => {
            this.side = b.dataset.s;
            draw();
          })
      );
      p.querySelectorAll('[data-k]').forEach(
        b =>
          (b.onclick = () => {
            this.symk = b.dataset.k;
            this.closePal();
            this.toast(this.symTip(), 2400);
          })
      );
    };
    draw();
    host.appendChild(p);
  }
  symTip() {
    const k = this.symk;
    return k == 'trk'
      ? 'Click where the aircraft is and drag toward its heading'
      : k == 'hold'
        ? 'Drag from the start of the inbound leg to the holding fix'
        : k == 'orbit'
          ? 'Drag from one end of the orbit to the other'
          : k == 'ring'
            ? 'Click the centre and drag out the range'
            : 'Click on the map to place it';
  }
  closePal() {
    if (this.palEl) {
      this.palEl.remove();
      this.palEl = null;
    }
  }
  // ------------------------------------------------------------------- objects
  nid() {
    return this.uid() + '-' + Date.now().toString(36) + '-' + ++this.seq;
  }
  add(o) {
    if (this.objs.size >= MAX_OBJS) return this.toast('The board is full: clear something first');
    this.objs.set(o.id, o);
    this.send({ t: 'add', o });
    this.undoS.push({ t: 'add', id: o.id });
    this.redraw();
  }
  upd(o, prev) {
    this.objs.set(o.id, o);
    this.send({ t: 'upd', o });
    if (prev) this.undoS.push({ t: 'upd', o: prev });
    this.redraw();
  }
  del(id) {
    const o = this.objs.get(id);
    if (!o) return;
    this.objs.delete(id);
    this.send({ t: 'del', id });
    this.undoS.push({ t: 'del', o });
    if (this.sel && this.sel.id == id) this.sel = null;
    this.redraw();
  }
  undo() {
    const u = this.undoS.pop();
    if (!u) return this.toast('Nothing to undo');
    if (u.t == 'add' && this.objs.has(u.id)) {
      this.objs.delete(u.id);
      this.send({ t: 'del', id: u.id });
    }
    if (u.t == 'del') {
      this.objs.set(u.o.id, u.o);
      this.send({ t: 'add', o: u.o });
    }
    if (u.t == 'upd') {
      this.objs.set(u.o.id, u.o);
      this.send({ t: 'upd', o: u.o });
    }
    this.sel = null;
    this.redraw();
  }
  draft(o) {
    if (o && o.solo) {
      this.local = o;
      this.redraw();
      return;
    }
    this.myDraft = o;
    this.redraw();
    const now = performance.now();
    clearTimeout(this.dT);
    if (!o || now - (this.lastD || 0) > DRAFT_MS) {
      this.lastD = now;
      this.send({ t: 'draft', o });
    } else
      // the last change of a quick series still goes (the others see the text as it is when the typing stops)
      this.dT = setTimeout(() => {
        if (this.myDraft !== o) return;
        this.lastD = performance.now();
        this.send({ t: 'draft', o });
      }, DRAFT_MS);
  }
  // ------------------------------------------------------------------- the mouse (on the element round the map, before Leaflet sees it)
  bindPointer() {
    const el = this.box;
    const cp = e => {
      const c = this.map.getContainer().getBoundingClientRect();
      return this.M.L.point(e.clientX - c.left, e.clientY - c.top);
    };
    const llOf = p => {
      const l = this.map.containerPointToLatLng(p);
      return [l.lat, l.lng];
    };
    let drag = null,
      rpan = null,
      space = false;
    const skip = e =>
      !this.map ||
      !this.me ||
      this.box.classList.contains('shoting') ||
      (e.target.closest && e.target.closest('.leaflet-control,.brtx,.bred'));
    // with a drawing tool the clicks are for the board: Leaflet (and the popups of the map) do not get them
    const block = e => {
      if (skip(e)) return;
      if (this.tool != 'pan' || e.button == 2) e.stopPropagation();
    };
    ['mousedown', 'click', 'dblclick'].forEach(t => el.addEventListener(t, block, true));
    el.addEventListener('contextmenu', e => {
      if (this.map && this.me) e.preventDefault();
    });
    el.addEventListener('wheel', () => this.goFree(), { passive: true, capture: true });
    el.addEventListener(
      'pointerdown',
      e => {
        if (skip(e)) return;
        if (e.button == 2 || e.button == 1 || (space && e.button == 0)) {
          rpan = cp(e);
          el.setPointerCapture(e.pointerId);
          this.goFree();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.button != 0 || this.tool == 'pan') return;
        e.stopPropagation();
        const p = cp(e),
          ll = llOf(p),
          solo = !this.can();
        if (solo && !['ruler', 'comp'].includes(this.tool)) return;
        el.setPointerCapture(e.pointerId);
        const base = { by: this.d.name(this.me.uid), col: this.col, w: WIDTHS[this.wi] },
          t = this.tool;
        if (t == 'laser') {
          drag = { t };
          this.send({ t: 'las', ll });
          this.myLaser(ll);
          return;
        }
        if (t == 'pen' || t == 'mark') {
          drag = { t, o: { ...base, id: this.nid(), k: t, pts: [ll] } };
          return;
        }
        if (['arrow', 'line', 'box', 'circle'].includes(t)) {
          drag = { t, o: { ...base, id: this.nid(), k: t, a: ll, b: ll } };
          return;
        }
        if (t == 'ruler' || t == 'comp') {
          drag = { t, o: { ...base, id: this.nid(), k: t, a: ll, b: ll, solo } };
          return;
        }
        if (t == 'text') {
          drag = null;
          setTimeout(() => this.textAt(ll), 0);
          return;
        }
        if (t == 'erase') {
          drag = { t };
          this.eraseAt(p);
          return;
        }
        if (t == 'sel') {
          const h = this.sel && this.handleAt(this.sel, p);
          if (h) {
            drag = { t: 'handle', h, prev: JSON.parse(JSON.stringify(this.sel)) };
            return;
          }
          const o = this.pick(p);
          this.sel = o;
          this.redraw();
          if (o) drag = { t: 'move', o, start: ll, prev: JSON.parse(JSON.stringify(o)), moved: false };
          return;
        }
        if (t == 'sym') {
          this.closePal();
          const k = this.symk,
            sd = this.side;
          if (k == 'trk') {
            drag = {
              t,
              o: { ...base, id: this.nid(), k: 'trk', side: sd, at: ll, hdg: 90, cs: '', fl: 300, spd: 450 },
              start: p,
            };
            return;
          }
          if (k == 'orbit' || k == 'hold') {
            drag = { t, o: { ...base, id: this.nid(), k, side: sd, a: ll, b: ll, lab: '' } };
            return;
          }
          if (k == 'ring') {
            drag = { t, o: { ...base, id: this.nid(), k: 'ring', side: sd, c: ll, r: 0, lab: '' } };
            return;
          }
          let o;
          if (k == 'ab') o = { ...base, id: this.nid(), k: 'ab', side: sd, at: ll, lab: '' };
          else if (k == 'IP' || k == 'CP') o = { ...base, id: this.nid(), k: 'pt', code: k, side: sd, at: ll, lab: '' };
          else if (k == 'tgt') o = { ...base, id: this.nid(), k: 'tgt', side: sd, at: ll, lab: '' };
          else if (k == 'bull') o = { ...base, id: this.nid(), k: 'bull', at: ll, lab: '' };
          else o = { ...base, id: this.nid(), k: 'sym', g: k, side: sd, at: ll, lab: '' };
          this.add(o);
          setTimeout(() => this.editLabel(o, true), 0);
        }
      },
      true
    );
    el.addEventListener('pointermove', e => {
      if (!this.map || !this.me) return;
      const p = cp(e);
      const now = performance.now();
      if (now - (this.lastC || 0) > CUR_MS && !this.box.classList.contains('shoting')) {
        this.lastC = now;
        this.send({ t: 'cur', ll: llOf(p) });
      }
      if (rpan) {
        this.map.panBy([rpan.x - p.x, rpan.y - p.y], { animate: false });
        rpan = p;
        return;
      }
      if (!drag) return;
      const ll = llOf(p),
        o = drag.o;
      if (drag.t == 'laser') {
        this.send({ t: 'las', ll });
        this.myLaser(ll);
        return;
      }
      if (drag.t == 'pen' || drag.t == 'mark') {
        const last = this.map.latLngToContainerPoint(o.pts[o.pts.length - 1]);
        if (last.distanceTo(p) > 2.5 && o.pts.length < 4000) o.pts.push(ll);
        this.draft(o);
        return;
      }
      if (drag.t == 'erase') return this.eraseAt(p);
      if (drag.t == 'move') {
        const n = shiftObj(drag.prev, ll[0] - drag.start[0], ll[1] - drag.start[1]);
        Object.assign(drag.o, n);
        drag.moved = true;
        this.objs.set(o.id, drag.o);
        this.redraw();
        if (now - (this.lastU || 0) > DRAFT_MS) {
          this.lastU = now;
          this.send({ t: 'upd', o: drag.o });
        }
        return;
      }
      if (drag.t == 'handle') {
        drag.h.set(ll);
        this.redraw();
        if (now - (this.lastU || 0) > DRAFT_MS) {
          this.lastU = now;
          this.send({ t: 'upd', o: this.sel });
        }
        return;
      }
      if (drag.t == 'sym' && o.k == 'trk') {
        if (drag.start.distanceTo(p) > 6) o.hdg = brg(o.at, ll);
        this.draft(o);
        return;
      }
      if (drag.t == 'sym' && o.k == 'ring') {
        o.r = dist(o.c, ll);
        this.draft(o);
        return;
      }
      o.b = ll;
      this.draft(o);
    });
    const up = () => {
      if (rpan) {
        rpan = null;
        return;
      }
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.t == 'laser') {
        this.send({ t: 'las', ll: null });
        this.myLaser(null);
        return;
      }
      if (d.t == 'erase') return;
      if (d.t == 'move') {
        if (d.moved) {
          this.send({ t: 'upd', o: d.o });
          this.undoS.push({ t: 'upd', o: d.prev });
        }
        return;
      }
      if (d.t == 'handle') return this.upd(this.sel, d.prev);
      const o = d.o;
      if (o.solo) {
        this.local = o;
        this.redraw();
        return;
      }
      this.draft(null);
      if ((o.k == 'pen' || o.k == 'mark') && o.pts.length < 2) o.pts.push([o.pts[0][0] + 1e-6, o.pts[0][1] + 1e-6]);
      if (o.b && dist(o.a, o.b) < 1) {
        if (o.k == 'orbit' || o.k == 'hold') o.b = dest(o.a, 90, 25 * NM);
        else return;
      }
      if (o.k == 'ring' && o.r < 500) o.r = 20 * NM;
      this.add(o);
      if (['trk', 'orbit', 'hold', 'ring'].includes(o.k)) this.editLabel(o, true);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => {
      if (this.me) this.send({ t: 'cur', ll: null });
    });
    el.addEventListener('dblclick', e => {
      if (skip(e) || this.tool != 'sel' || !this.can()) return;
      const o = this.pick(cp(e));
      if (!o) return;
      if (o.k == 'text') this.textAt(o.at, o);
      else if (o.lab !== undefined || o.k == 'trk') this.editLabel(o);
    });
    const root = this.d.root;
    root.tabIndex = -1;
    root.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      if (!this.visible) return;
      if (e.code == 'Space' && !space && this.tool != 'pan') {
        space = true;
        el.classList.add('brpan2');
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() == 'z' && this.can()) {
        this.undo();
        e.preventDefault();
      }
      if ((e.key == 'Delete' || e.key == 'Backspace') && this.sel && this.can()) {
        this.del(this.sel.id);
        this.sel = null;
      }
      if (e.key == 'Escape') {
        this.local = null;
        this.sel = null;
        this.closePal();
        this.closeEd();
        this.redraw();
      }
    });
    root.addEventListener('keyup', e => {
      if (e.code == 'Space') {
        space = false;
        el.classList.remove('brpan2');
      }
    });
    root.addEventListener(
      'pointerdown',
      e => {
        if (!(e.target.closest && e.target.closest('input,textarea,select,.col'))) root.focus({ preventScroll: true });
      },
      true
    );
  }
  myLaser(ll) {
    let l = this.lasers.get('me');
    if (!l) this.lasers.set('me', (l = []));
    l.push({ ll, t: performance.now() });
  }
  eraseAt(p) {
    for (const o of [...this.objs.values()].reverse()) if (this.hit(o, p) < 9) this.del(o.id);
  }
  pick(p) {
    let best = null,
      bd = 10;
    for (const o of this.objs.values()) {
      const d = this.hit(o, p);
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }
  // ------------------------------------------------------------------- labels and text
  closeEd() {
    if (this.edEl) {
      this.edEl.remove();
      this.edEl = null;
    }
    if (this.textEd) this.commitText();
  }
  editLabel(o, fresh) {
    this.closeEd();
    if (!this.map) return;
    const e = this.esc,
      pt = this.map.latLngToContainerPoint(o.at || o.c || o.b || o.a);
    const ed = (this.edEl = document.createElement('div'));
    ed.className = 'bred';
    ed.innerHTML =
      o.k == 'trk'
        ? `<label>Callsign / name<input data-f="cs" value="${e(o.cs)}" placeholder="${o.side == 'hostile' ? 'BANDIT' : o.side == 'unknown' ? 'BOGEY' : 'Viper 2'}"></label><label>FL<input class="s" data-f="fl" value="${o.fl}"></label><label>Speed kt<input class="s" data-f="spd" value="${o.spd}"></label><button class="btn g gn">OK</button>`
        : `<label>${o.k == 'ring' ? 'System (the range is added)' : 'Label'}<input data-f="lab" value="${e(o.lab || '')}" placeholder="${{ orbit: 'CAP Viper 2 · FL250', hold: 'HOLD A · FL200', ring: 'SA-6', pt: 'IP CHARLIE', tgt: 'TGT bridge', bull: 'BULLSEYE', ab: 'Osan' }[o.k] || 'optional'}" style="width:150px"></label><button class="btn g gn">OK</button>`;
    ed.style.left = Math.max(6, Math.min(pt.x + 18, this.wrap.clientWidth - 330)) + 'px';
    ed.style.top = Math.max(6, Math.min(pt.y + 10, this.wrap.clientHeight - 70)) + 'px';
    this.wrap.appendChild(ed);
    const prev = JSON.parse(JSON.stringify(o));
    const ok = () => {
      const n = { ...(this.objs.get(o.id) || o) };
      ed.querySelectorAll('input').forEach(
        i =>
          (n[i.dataset.f] =
            i.dataset.f == 'fl' || i.dataset.f == 'spd'
              ? Math.max(0, parseInt(i.value) || 0)
              : i.value.trim().slice(0, 60))
      );
      if (this.objs.has(o.id)) {
        this.objs.set(n.id, n);
        this.send({ t: 'upd', o: n });
        if (!fresh) this.undoS.push({ t: 'upd', o: prev });
      }
      ed.remove();
      this.edEl = null;
      this.redraw();
    };
    ed.querySelector('button').onclick = ok;
    ed.querySelectorAll('input').forEach(
      i =>
        (i.onkeydown = ev => {
          if (ev.key == 'Enter') ok();
          if (ev.key == 'Escape') {
            ed.remove();
            this.edEl = null;
          }
          ev.stopPropagation();
        })
    );
    setTimeout(() => ed.querySelector('input').focus(), 30);
  }
  textAt(ll, o) {
    this.closeEd();
    if (!this.map) return;
    const size = o ? o.size : [14, 18, 24][this.wi],
      col = o ? o.col : this.col;
    const t = (this.textEd = document.createElement('textarea'));
    t.className = 'brtx';
    t.value = o ? o.txt : '';
    t.style.color = col;
    t.style.borderColor = col;
    t.style.fontSize = size + 'px';
    t.maxLength = 600;
    this.textObj = o
      ? { ...o }
      : { id: this.nid(), k: 'text', by: this.d.name(this.me.uid), at: ll, col, size, txt: '', w: 2 };
    this.textPrev = o ? JSON.parse(JSON.stringify(o)) : null;
    if (o) {
      this.objs.delete(o.id);
      this.redraw();
    }
    const fit = () => {
      t.style.height = 'auto';
      t.style.height = t.scrollHeight + 2 + 'px';
      t.style.width = 'auto';
      t.style.width = Math.max(140, Math.min(420, t.scrollWidth + 4)) + 'px';
    };
    t.oninput = () => {
      fit();
      this.textObj.txt = t.value;
      this.draft({ ...this.textObj });
    };
    t.onkeydown = e => {
      e.stopPropagation();
      if (e.key == 'Escape' || (e.key == 'Enter' && (e.ctrlKey || e.metaKey))) this.commitText();
    };
    t.onblur = () => setTimeout(() => this.commitText(), 0);
    this.wrap.appendChild(t);
    this.placeText();
    t.rows = 1;
    fit();
    setTimeout(() => t.focus(), 20);
  }
  placeText() {
    if (!this.textEd || !this.map) return;
    const p = this.map.latLngToContainerPoint(this.textObj.at);
    this.textEd.style.left = p.x - 7 + 'px';
    this.textEd.style.top = p.y - 4 + 'px';
  }
  commitText() {
    const t = this.textEd;
    if (!t) return;
    this.textEd = null;
    const o = this.textObj;
    o.txt = t.value.replace(/\s+$/, '');
    t.remove();
    this.draft(null);
    if (!o.txt) {
      if (this.textPrev) {
        this.objs.set(o.id, this.textPrev);
        this.del(o.id);
      }
      return;
    }
    if (this.textPrev) this.upd(o, this.textPrev);
    else this.add(o);
  }
  // ------------------------------------------------------------------- the cursors of the others (smoothed between two messages)
  cursor(from, ll) {
    let c = this.curs.get(from);
    if (!c) {
      const i = this.info(from),
        el = document.createElement('div');
      el.className = 'brcur';
      el.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1L1 17L5.5 13L9 21L12 19.6L8.6 12H15Z" fill="${i.col}" stroke="#0f1318" stroke-width="1.3" stroke-linejoin="round"/></svg><b style="background:${i.col}">${this.esc(i.n)}</b>`;
      this.cursL.appendChild(el);
      c = { el, ll: null, cur: null };
      this.curs.set(from, c);
    }
    c.ll = ll;
    c.el.style.opacity = ll ? '1' : '0';
    c.seen = performance.now();
  }
  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.map || !this.visible) return;
      const now = performance.now(),
        zooming = this.wrap.classList.contains('zooming'),
        shot = this.box.classList.contains('shoting');
      for (const [id, c] of this.curs) {
        if (!c.ll) continue;
        const tp = this.map.latLngToContainerPoint(c.ll);
        if (!c.cur || now - c.seen > 3000) c.cur = { x: tp.x, y: tp.y };
        c.cur.x += (tp.x - c.cur.x) * 0.35;
        c.cur.y += (tp.y - c.cur.y) * 0.35;
        c.el.style.transform = `translate(${c.cur.x - 1}px,${c.cur.y - 1}px)`;
        c.el.style.visibility = zooming || shot || (!this.cursAll && !this.writer(id)) ? 'hidden' : 'visible';
      }
      let las = false;
      for (const [k, l] of this.lasers) {
        while (l.length && now - l[0].t > 900) l.shift();
        if (l.length) las = true;
        else this.lasers.delete(k);
      }
      if (las || this.hadLas) this.redraw();
      this.hadLas = las;
      if (this.textEd) this.placeText();
      // the kneeboard frame closed: the tool chosen before it comes back
      if (this.shotTool && !shot) {
        this.setTool(this.shotTool);
        this.shotTool = null;
      }
    };
    requestAnimationFrame(tick);
  }
  redraw() {
    if (this.M && this.M.board && this.M.board._renderer) this.M.board._renderer._requestRedraw(this.M.board);
  }
  // ------------------------------------------------------------------- the kneeboard card: the frame of the map page, over this map (with the drawings, without the cursors)
  startCard() {
    if (!this.map) return;
    this.closePal();
    this.closeEd();
    this.shotTool = this.tool;
    this.setTool('pan');
    this.d.shot({ toast: t => this.toast(t, 4000) });
  }
  // ------------------------------------------------------------------- painting
  P(ll) {
    return this.map.latLngToLayerPoint(ll);
  }
  paint(ctx) {
    if (!this.map) return;
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const o of this.objs.values()) this.draw(ctx, o);
    for (const o of this.drafts.values()) this.draw(ctx, o);
    if (this.myDraft) this.draw(ctx, this.myDraft);
    if (this.local) this.draw(ctx, this.local);
    if (this.sel && this.objs.has(this.sel.id)) this.drawSel(ctx, this.objs.get(this.sel.id));
    this.paintLasers(ctx);
  }
  halo(ctx, f) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.lineWidth = ctx.lineWidth + 3;
    f();
    ctx.restore();
  }
  text(ctx, s, x, y, col, font, align = 'left', base = 'alphabetic') {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.lineWidth = 3.5;
    x = Math.round(x);
    y = Math.round(y); // whole pixels: sharp letters
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  paintLasers(ctx) {
    const now = performance.now();
    for (const l of this.lasers.values()) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < l.length; i++) {
        if (!l[i].ll || !l[i - 1].ll) continue;
        const a = this.P(l[i - 1].ll),
          b = this.P(l[i].ll),
          f = Math.max(0, 1 - (now - l[i].t) / 900);
        ctx.strokeStyle = `rgba(255,40,40,${0.25 * f})`;
        ctx.lineWidth = 12 * f + 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,90,90,${0.9 * f})`;
        ctx.lineWidth = 3 * f + 0.5;
        ctx.stroke();
      }
      const h = l[l.length - 1];
      if (h && h.ll && now - h.t < 900) {
        const p = this.P(h.ll);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,60,60,.95)');
        g.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  draw(ctx, o) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.col;
    ctx.fillStyle = o.col;
    ctx.lineWidth = o.w || 3;
    const k = o.k;
    if (k == 'pen' || k == 'mark') {
      const p = o.pts.map(ll => this.P(ll));
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length - 1; i++) {
          const mx = (p[i].x + p[i + 1].x) / 2,
            my = (p[i].y + p[i + 1].y) / 2;
          ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
        }
        const l = p[p.length - 1];
        ctx.lineTo(l.x, l.y);
      };
      if (k == 'mark') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = o.w * 4 + 6;
        path();
        ctx.stroke();
      } else {
        path();
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = o.w + 2.5;
        ctx.stroke();
        ctx.restore();
        path();
        ctx.stroke();
      }
    } else if (k == 'line' || k == 'arrow') {
      const a = this.P(o.a),
        b = this.P(o.b);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (k == 'arrow') {
          const an = Math.atan2(b.y - a.y, b.x - a.x),
            L2 = 10 + o.w * 2.2;
          ctx.moveTo(b.x - L2 * Math.cos(an - 0.45), b.y - L2 * Math.sin(an - 0.45));
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b.x - L2 * Math.cos(an + 0.45), b.y - L2 * Math.sin(an + 0.45));
        }
      };
      path();
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = o.w + 2.5;
      ctx.stroke();
      ctx.restore();
      path();
      ctx.stroke();
    } else if (k == 'box') {
      const a = this.P(o.a),
        b = this.P(o.b);
      ctx.beginPath();
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = o.w + 2.5;
      ctx.stroke();
      ctx.restore();
      ctx.stroke();
    } else if (k == 'circle') {
      const a = this.P(o.a),
        r = a.distanceTo(this.P(o.b));
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, 7);
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = o.w + 2.5;
      ctx.stroke();
      ctx.restore();
      ctx.stroke();
    } else if (k == 'text') {
      const p = this.P(o.at);
      const lines = (o.txt || '').split('\n');
      lines.forEach((s, i) =>
        this.text(
          ctx,
          s,
          p.x,
          p.y + i * o.size * 1.25,
          o.col,
          `italic 700 ${o.size}px Inter,system-ui,sans-serif`,
          'left',
          'top'
        )
      );
    } else if (k == 'sym') {
      const s = symbolSvg(o.g, o.side, 30),
        i = img(s.svg),
        p = this.P(o.at);
      if (i) ctx.drawImage(i, p.x - s.w / 2, p.y - s.h / 2, s.w, s.h);
      if (o.lab) this.text(ctx, o.lab, p.x, p.y + s.h / 2 + 12, SIDE_COL[o.side], '700 11px system-ui', 'center');
    } else if (k == 'ab') {
      const s = airbaseSvg(o.side, 22),
        i = img(s.svg),
        p = this.P(o.at);
      if (i) ctx.drawImage(i, p.x - 11, p.y - 11, 22, 22);
      if (o.lab) this.text(ctx, o.lab, p.x, p.y + 24, '#e6edf3', '600 10.5px system-ui', 'center');
    } else if (k == 'trk') this.drawTrk(ctx, o);
    else if (k == 'pt') {
      const p = this.P(o.at),
        c = SIDE_COL[o.side];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 9, p.y - 15);
      ctx.arc(p.x, p.y - 21, 10.5, Math.PI * 0.82, Math.PI * 0.18);
      ctx.closePath();
      ctx.fillStyle = '#0d1b2ad9';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      this.text(ctx, o.code, p.x, p.y - 17, c, '800 10px system-ui', 'center');
      if (o.lab) this.text(ctx, o.lab, p.x + 14, p.y - 18, c, '700 11px system-ui');
    } else if (k == 'tgt') {
      const p = this.P(o.at),
        c = SIDE_COL[o.side];
      const path = () => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 7);
        ctx.moveTo(p.x, p.y - 14);
        ctx.lineTo(p.x, p.y + 14);
        ctx.moveTo(p.x - 14, p.y);
        ctx.lineTo(p.x + 14, p.y);
      };
      path();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 4;
      ctx.stroke();
      path();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      if (o.lab) this.text(ctx, o.lab, p.x + 17, p.y - 9, c, '700 11px system-ui');
    } else if (k == 'bull') {
      const p = this.P(o.at),
        c = '#c9a7ff';
      const path = () => {
        ctx.beginPath();
        [16, 10.5, 5].forEach(r => {
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, 7);
        });
        ctx.moveTo(p.x, p.y - 20);
        ctx.lineTo(p.x, p.y + 20);
        ctx.moveTo(p.x - 20, p.y);
        ctx.lineTo(p.x + 20, p.y);
      };
      path();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      path();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (o.lab) this.text(ctx, o.lab, p.x + 22, p.y - 12, c, '700 11px system-ui');
    } else if (k == 'orbit' || k == 'hold') this.drawTrack(ctx, o);
    else if (k == 'ring') {
      const c = this.P(o.c),
        r = c.distanceTo(this.P(dest(o.c, 90, o.r))),
        col = RINGC[o.side];
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, 7);
      ctx.fillStyle = col + '1a';
      ctx.fill();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5, 0, 7);
      ctx.fillStyle = col;
      ctx.fill();
      this.text(ctx, (o.lab ? o.lab + ' · ' : '') + fmtNm(o.r), c.x, c.y - r - 5, col, '700 11px system-ui', 'center');
    } else if (k == 'ruler') this.drawRuler(ctx, o);
    else if (k == 'comp') this.drawComp(ctx, o);
    ctx.restore();
  }
  // the radar track of the map: hollow square, speed vector (2 minutes of flight), dotted track behind (90 s), callsign, FL and speed
  drawTrk(ctx, o) {
    const col = TRK[o.side],
      p = this.P(o.at);
    const ahead = dest(o.at, o.hdg, (Math.max(o.spd, 60) * NM * 2) / 60),
      back = dest(o.at, o.hdg + 180, (Math.max(o.spd, 60) * NM * 1.5) / 60);
    const e = this.P(ahead),
      b = this.P(back);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.setLineDash([0.1, 7]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d1b2a00';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
    ctx.font = '600 11px ui-monospace,Consolas,monospace';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const l1 = o.cs || (o.side == 'hostile' ? 'BANDIT' : o.side == 'unknown' ? 'BOGEY' : ''),
      l2 = String(Math.round(o.fl)).padStart(3, '0') + ' ' + Math.round(o.spd);
    [
      [l1, 0],
      [l2, 12],
    ].forEach(([s, dy]) => {
      if (!s) return;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3.5;
      ctx.strokeText(s, p.x + 9, p.y - 15 + dy);
      ctx.fillStyle = col;
      ctx.fillText(s, p.x + 9, p.y - 15 + dy);
    });
    ctx.restore();
  }
  // orbit (racetrack between a and b, flown clockwise) and holding (inbound leg a -> b, fix at b, right turns)
  drawTrack(ctx, o) {
    const a = this.P(o.a),
      b = this.P(o.b),
      col = SIDE_COL[o.side];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      ux = dx / len,
      uy = dy / len,
      nx = -uy,
      ny = ux;
    const r = Math.max(7, len * 0.22),
      off = o.k == 'hold' ? r : 0;
    const A = { x: a.x + nx * off, y: a.y + ny * off },
      B = { x: b.x + nx * off, y: b.y + ny * off },
      an = Math.atan2(uy, ux);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(A.x - nx * r, A.y - ny * r);
      ctx.lineTo(B.x - nx * r, B.y - ny * r);
      ctx.arc(B.x, B.y, r, an - Math.PI / 2, an + Math.PI / 2);
      ctx.lineTo(A.x + nx * r, A.y + ny * r);
      ctx.arc(A.x, A.y, r, an + Math.PI / 2, an + Math.PI * 1.5);
    };
    ctx.save();
    ctx.lineWidth = 2;
    path();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 5;
    ctx.stroke();
    path();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    // the arrow of the direction, on the leg a -> b
    const m = { x: (A.x + B.x) / 2 - nx * r, y: (A.y + B.y) / 2 - ny * r };
    ctx.beginPath();
    ctx.moveTo(m.x + ux * 7, m.y + uy * 7);
    ctx.lineTo(m.x - ux * 5 + nx * 5, m.y - uy * 5 + ny * 5);
    ctx.lineTo(m.x - ux * 5 - nx * 5, m.y - uy * 5 - ny * 5);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    if (o.k == 'hold') {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 7);
      ctx.lineTo(b.x + 6, b.y + 4);
      ctx.lineTo(b.x - 6, b.y + 4);
      ctx.closePath();
      ctx.fillStyle = '#0d1b2a';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    const lab =
      (o.lab || (o.k == 'hold' ? 'HOLD' : 'CAP')) + ' · ' + pad3(brg(o.a, o.b)) + '° · ' + fmtNm(dist(o.a, o.b));
    const lo = (o.k == 'hold' ? 0 : r) + 16,
      sg = o.k == 'hold' ? -1 : 1;
    this.text(
      ctx,
      lab,
      (a.x + b.x) / 2 + sg * nx * lo,
      (a.y + b.y) / 2 + sg * ny * lo + 4,
      col,
      '700 11px system-ui',
      'center'
    );
    ctx.restore();
  }
  drawRuler(ctx, o) {
    const a = this.P(o.a),
      b = this.P(o.b),
      d = dist(o.a, o.b),
      br = brg(o.a, o.b);
    ctx.save();
    ctx.lineCap = 'butt';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };
    path();
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 5;
    ctx.stroke();
    path();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // a tick every NM (every 5 or 10 when they are close together)
    const nm = d / NM,
      pxNm = a.distanceTo(b) / (nm || 1),
      step = pxNm > 9 ? 1 : pxNm > 2 ? 5 : 10;
    for (let i = step; i < nm; i += step) {
      const f = i / nm,
        x = a.x + (b.x - a.x) * f,
        y = a.y + (b.y - a.y) * f,
        an = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2,
        L2 = i % (step * 5) == 0 ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(x - L2 * Math.cos(an), y - L2 * Math.sin(an));
      ctx.lineTo(x + L2 * Math.cos(an), y + L2 * Math.sin(an));
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    [a, b].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 7);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    const l1 = fmtNm(d) + ' · ' + pad3(br) + '°',
      l2 = fmtKm(d) + ' · ' + fmtFt(d);
    ctx.font = '700 12px system-ui';
    const w = Math.max(ctx.measureText(l1).width, ((ctx.font = '500 11px system-ui'), ctx.measureText(l2).width)) + 16;
    const x = Math.round(b.x + 12),
      y = Math.round(b.y - 34);
    ctx.fillStyle = 'rgba(15,19,24,.92)';
    ctx.strokeStyle = '#3a4452';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 36, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px system-ui';
    ctx.textBaseline = 'top';
    ctx.fillText(l1, x + 8, y + 4);
    ctx.fillStyle = '#aab4c0';
    ctx.font = '500 11px system-ui';
    ctx.fillText(l2, x + 8, y + 20);
    if (o.solo) {
      ctx.fillStyle = '#8b95a3';
      ctx.font = 'italic 10px system-ui';
      ctx.fillText('only you see it · Esc', x + 2, y + 40);
    }
    ctx.restore();
  }
  drawComp(ctx, o) {
    const c = this.P(o.a),
      e = this.P(o.b),
      r = c.distanceTo(e),
      d = dist(o.a, o.b),
      br = brg(o.a, o.b),
      col = '#7dd3fc';
    if (r < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, 7);
    ctx.fillStyle = 'rgba(13,27,42,.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // the rose: a tick every 10°, longer every 30°, N E S W (true north: up on this map)
    const up = this.P(dest(o.a, 0, d)),
      nAng = Math.atan2(up.y - c.y, up.x - c.x);
    for (let i = 0; i < 36; i++) {
      const an = nAng + rad(i * 10),
        L2 = i % 3 == 0 ? Math.min(12, r * 0.18) : Math.min(6, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(c.x + (r - L2) * Math.cos(an), c.y + (r - L2) * Math.sin(an));
      ctx.lineTo(c.x + r * Math.cos(an), c.y + r * Math.sin(an));
      ctx.strokeStyle = col;
      ctx.lineWidth = i % 9 == 0 ? 2 : 1.2;
      ctx.stroke();
    }
    if (r > 40)
      ['N', 'E', 'S', 'W'].forEach((s, i) => {
        const an = nAng + rad(i * 90);
        this.text(
          ctx,
          s,
          c.x + (r - 22) * Math.cos(an),
          c.y + (r - 22) * Math.sin(an) + 4,
          '#fff',
          '800 11px system-ui',
          'center'
        );
      });
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    const an = Math.atan2(e.y - c.y, e.x - c.x);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - 10 * Math.cos(an - 0.4), e.y - 10 * Math.sin(an - 0.4));
    ctx.lineTo(e.x - 10 * Math.cos(an + 0.4), e.y - 10 * Math.sin(an + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, 7);
    ctx.fillStyle = '#fff';
    ctx.fill();
    this.text(
      ctx,
      pad3(br) + '° · ' + fmtNm(d),
      e.x + 12 * Math.cos(an),
      e.y + 12 * Math.sin(an) + 4,
      '#fff',
      '700 12px system-ui',
      Math.cos(an) < -0.3 ? 'right' : 'left'
    );
    if (o.solo)
      this.text(ctx, 'only you see it · Esc', c.x, c.y + r + 14, '#8b95a3', 'italic 10px system-ui', 'center');
    ctx.restore();
  }
  // ------------------------------------------------------------------- hit test, selection, handles (container points)
  C(ll) {
    return this.map.latLngToContainerPoint(ll);
  }
  hit(o, p) {
    const k = o.k;
    if (k == 'pen' || k == 'mark') {
      let d = 1e9;
      const q = o.pts.map(ll => this.C(ll));
      for (let i = 1; i < q.length; i++) d = Math.min(d, segD(p, q[i - 1], q[i]));
      return d - (k == 'mark' ? o.w * 2 : 0);
    }
    if (k == 'line' || k == 'arrow' || k == 'ruler') return segD(p, this.C(o.a), this.C(o.b));
    if (k == 'box') {
      const a = this.C(o.a),
        b = this.C(o.b),
        c = this.M.L.point(a.x, b.y),
        d = this.M.L.point(b.x, a.y);
      return Math.min(segD(p, a, c), segD(p, c, b), segD(p, b, d), segD(p, d, a));
    }
    if (k == 'circle' || k == 'comp') {
      const a = this.C(o.a),
        r = a.distanceTo(this.C(o.b));
      return Math.min(Math.abs(p.distanceTo(a) - r), k == 'comp' ? segD(p, a, this.C(o.b)) : 1e9);
    }
    if (k == 'ring') {
      const a = this.C(o.c),
        r = a.distanceTo(this.C(dest(o.c, 90, o.r)));
      return Math.min(Math.abs(p.distanceTo(a) - r), p.distanceTo(a) - 4);
    }
    if (k == 'text') {
      const a = this.C(o.at),
        ls = o.txt.split('\n'),
        w = Math.max(...ls.map(s => s.length)) * o.size * 0.55,
        h = ls.length * o.size * 1.25;
      return p.x >= a.x - 3 && p.x <= a.x + w && p.y >= a.y - 3 && p.y <= a.y + h ? 0 : 99;
    }
    if (k == 'orbit' || k == 'hold') {
      const a = this.C(o.a),
        b = this.C(o.b),
        r = Math.max(7, a.distanceTo(b) * 0.22);
      return Math.max(0, segD(p, a, b) - r - (k == 'hold' ? r : 0));
    }
    if (k == 'pt') return this.C(o.at).add([0, -18]).distanceTo(p) - 12;
    return this.C(o.at).distanceTo(p) - 13;
  }
  handles(o) {
    const H = [];
    if (o.k == 'trk') {
      const e = dest(o.at, o.hdg, (Math.max(o.spd, 60) * NM * 2) / 60);
      H.push({ ll: e, set: ll => (o.hdg = brg(o.at, ll)) });
    }
    if (['orbit', 'hold', 'line', 'arrow', 'ruler', 'box', 'circle', 'comp'].includes(o.k)) {
      H.push({ ll: o.a, set: ll => (o.a = ll) });
      H.push({ ll: o.b, set: ll => (o.b = ll) });
    }
    if (o.k == 'ring') H.push({ ll: dest(o.c, 90, o.r), set: ll => (o.r = dist(o.c, ll)) });
    return H;
  }
  handleAt(o, p) {
    const cur = this.objs.get(o.id);
    if (!cur) return null;
    this.sel = cur;
    return this.handles(cur).find(h => this.C(h.ll).distanceTo(p) < 9);
  }
  drawSel(ctx, o) {
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    const pts = o.pts || [o.a, o.b, o.at, o.c].filter(Boolean);
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    pts.forEach(ll => {
      const p = this.P(ll);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    });
    if (o.k == 'ring') {
      const c = this.P(o.c),
        r = c.distanceTo(this.P(dest(o.c, 90, o.r)));
      x0 = c.x - r;
      x1 = c.x + r;
      y0 = c.y - r;
      y1 = c.y + r;
    }
    if (o.k == 'circle' || o.k == 'comp') {
      const c = this.P(o.a),
        r = c.distanceTo(this.P(o.b));
      x0 = c.x - r;
      x1 = c.x + r;
      y0 = c.y - r;
      y1 = c.y + r;
    }
    if (o.k == 'text') {
      const ls = o.txt.split('\n');
      x1 = x0 + Math.max(...ls.map(s => s.length)) * o.size * 0.55;
      y1 = y0 + ls.length * o.size * 1.25;
    }
    ctx.strokeRect(x0 - 16, y0 - 16, x1 - x0 + 32, y1 - y0 + 32);
    ctx.setLineDash([]);
    this.handles(o).forEach(h => {
      const p = this.P(h.ll);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0f1318';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
    });
    ctx.restore();
  }
  // ------------------------------------------------------------------- the kneeboard card (the frame of "Screenshot for kneeboard")
}
