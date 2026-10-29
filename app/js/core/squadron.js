// Squadron page: the squadron (name, notes, a fixed roster), the pilots that are online (a green circle), the mission sent from one pilot to the others, the logbook of
// each pilot and the squadron in the campaign (kills, aces, contribution).
// Pilots find each other through public torrent-style trackers (WebSocket) that only pass the WebRTC offers and answers of the squadron swarm (its name is the hash of a
// secret that only the squadron knows); everything else goes straight from pilot to pilot (WebRTC data channel). A direct connection by two codes swapped by hand stays
// available when no tracker can be used.

import { medalSvg, rankSvg } from './medals.js';
import {
  orgNewPackageWith,
  orgToTemplate,
  orgFromTemplate,
  newOrg,
  mergeOrg,
  pruneOrg,
  orgReduce,
  orgView,
  orgClock,
  isAdmin,
  flightWarning,
} from './organization.js';
import { orgHtml, wireOrg, lostHtml, wireLost } from './orgpage.js';

// ---------- logbook (.lbk) ----------
// The file is XOR-ed with the text "Falcon is your Master" and chained with the previous encrypted byte (the first one with 0x58).
const LBK_KEY = 'Falcon is your Master';
const lbkXor = (u8, enc) => {
  const out = new Uint8Array(u8.length);
  let prev = 0x58;
  for (let i = 0; i < u8.length; i++) {
    const k = LBK_KEY.charCodeAt(i % LBK_KEY.length);
    if (enc) {
      out[i] = u8[i] ^ prev ^ k;
      prev = out[i];
    } else {
      out[i] = u8[i] ^ prev ^ k;
      prev = u8[i];
    }
  }
  return out;
};
export const decodeLbk = u8 => lbkXor(u8, false);
export const encodeLbk = u8 => lbkXor(u8, true);
const cstr = (u8, o, n) => {
  let s = '';
  for (let i = o; i < Math.min(u8.length, o + n); i++) {
    if (!u8[i]) break;
    s += String.fromCharCode(u8[i]);
  }
  return s.trim();
};
// fields of a BMS 4.38 logbook (372 bytes): name, callsign, commentary (the motto), squadron, the statistics and the medals (the password is not read)
// Medals: six counters, one byte each, from offset 140 in the order of the game's logbook editor. Checked on a logbook edited with the game's logbook editor (2, 1, 2, 9, 8, 15).
export const MEDALS = [
  'Air Force Cross',
  'Silver Star',
  'Distinguished Flying Cross',
  'Air Medal',
  'Korea Campaign',
  'Longevity',
];
export const RANK_AB = [
  '2nd Lt.',
  '1st Lt.',
  'Capt.',
  'Maj.',
  'Lt. Col.',
  'Col.',
  'Brig. Gen.',
  'Maj. Gen.',
  'Lt. Gen.',
  'Gen.',
];
export const RANKS = ['2nd Lt', '1st Lt', 'Capt', 'Maj', 'Lt Col', 'Col', 'Brig Gen', 'Maj Gen', 'Lt Gen', 'Gen'];
export function parseLbk(u8) {
  if (!u8 || u8.length < 366) throw new Error('This does not look like a BMS logbook (.lbk).');
  const d = decodeLbk(u8);
  const o = { name: cstr(d, 0, 21), callsign: cstr(d, 21, 12), motto: cstr(d, 225, 120), squadron: cstr(d, 346, 20) };
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength),
    u16 = a => dv.getUint16(a, true),
    i32 = a => dv.getInt32(a, true),
    f32 = a => Math.round(dv.getFloat32(a, true) * 1000) / 1000;
  // offsets calibrated on a logbook seen in the game (Evil19: 219.3 h, 41 A-A, 553 A-G, 67 static, 1 naval, 127 missions ...)
  o.stats = {
    rank: u16(80),
    hours: f32(72),
    ace: f32(76),
    commissioned: cstr(d, 45, 9),
    campaigns: [u16(100), u16(102), u16(104)],
    missions: u16(106),
    score: i32(108),
    lastMission: i32(112),
    consecutive: u16(116),
    camp: {
      killed: u16(120),
      human: u16(122),
      killedByHuman: u16(124),
      killedBySelf: u16(126),
      frat: u16(134),
      sinceFrat: u16(136),
    },
    medals: MEDALS.map((_, i) => d[140 + i]),
    aa: u16(118),
    ag: u16(128),
    st: u16(130),
    nav: u16(132),
    dog: {
      won: u16(84),
      lost: u16(86),
      onWon: u16(88),
      onLost: u16(90),
      kills: u16(92),
      deaths: u16(94),
      onKills: u16(96),
      onDeaths: u16(98),
    },
  };
  if (!o.name && !o.callsign) throw new Error('The logbook could not be decoded (no name and no callsign).');
  return o;
}

// the logbooks to offer: Viper.lbk is the default of BMS (anyone who flies with it opens it by hand)
// PhoneBkn.ini (User\Config): the servers of the multiplayer phone book, [Contact n] with Description, IPaddress, Voicehostip, VoicehostPwd, SetBwDownload, SetBwUpload
export function parsePhoneBook(text) {
  const out = [];
  let c = null;
  for (const raw of String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const l = raw.trim(),
      h = /^\[contact\s*(\d+)\]$/i.exec(l);
    if (h) {
      c = { n: +h[1], description: '', ip: '', voice: '', voicePwd: '', down: 0, up: 0 };
      out.push(c);
      continue;
    }
    const m = c && /^([^=;#]+?)\s*=\s*(.*)$/.exec(l);
    if (!m) continue;
    const k = m[1].toLowerCase(),
      v = m[2].trim();
    if (k == 'description') c.description = v;
    else if (k == 'ipaddress') c.ip = v;
    else if (k == 'voicehostip') c.voice = v;
    else if (k == 'voicehostpwd') c.voicePwd = v;
    else if (k == 'setbwdownload') c.down = +v || 0;
    else if (k == 'setbwupload') c.up = +v || 0;
  }
  return out;
}
export const lbkChoices = names => names.filter(n => /\.lbk$/i.test(n) && !/^viper\.lbk$/i.test(n));

// ---------- codes (invite / answer) ----------
const b64 = u8 => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  // standard alphabet (A-Z a-z 0-9 + /), no padding: no '_' and no '-', which Discord and other chats take for formatting (italics) and lose when the code is copied; the reader still accepts both alphabets
  return btoa(s).replace(/=+$/, '');
};
const unb64 = t => {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
};
// max: the most bytes the result may have (a block that inflates beyond it is dropped while it is read)
const pipe = async (u8, S, max = Infinity) => {
  const rd = new Blob([u8]).stream().pipeThrough(S).getReader(),
    parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await rd.cancel();
      throw new Error('Too much data.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  parts.forEach(p => {
    out.set(p, o);
    o += p.length;
  });
  return out;
};
export const zip = async text => {
  const u = new TextEncoder().encode(text);
  return typeof CompressionStream == 'function'
    ? 'z' + b64(await pipe(u, new CompressionStream('deflate-raw')))
    : 'p' + b64(u);
};
export const unzip = async (t, max = Infinity) => {
  const u = unb64(t.slice(1));
  if (t[0] != 'z' && u.length > max) throw new Error('Too much data.');
  return new TextDecoder().decode(t[0] == 'z' ? await pipe(u, new DecompressionStream('deflate-raw'), max) : u);
};
export const pack = async (obj, tag = 'BC1') => tag + '.' + (await zip(JSON.stringify(obj)));
export const unpack = async (code, tag = 'BC1') => {
  const c = String(code || '').replace(/[\s\u200b-\u200d\ufeff`<>*|~"'“”]+/g, ''); // spaces, line breaks and the marks a chat may add around or inside the code
  if (!c.startsWith(tag + '.')) throw new Error('This is not a code of this kind.');
  try {
    return JSON.parse(await unzip(c.slice(tag.length + 1)));
  } catch (e) {
    if (e && e.message === 'Too much data.') throw e;
    // the browser says "compressed input was truncated" (or "incorrect header check") when the end of the code is missing or a character was changed
    throw new Error(
      'This code is incomplete or damaged: it was probably cut when it was copied or sent (a chat can shorten a long message, or the end was not selected; Discord removes the "_" of a code made by an older version). Ask for the code again, copy it with its Copy button and paste it whole, from "' +
        tag +
        '." to the last character.'
    );
  }
};
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const bin = u8 => {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return s;
};
const sha1 = async text => bin(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))));
const hmac = async (secret, text) => {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text))));
};

// ---------- one connection ----------
const iceDone = (pc, ms = 5000) =>
  new Promise(res => {
    if (pc.iceGatheringState == 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState == 'complete') {
        clearTimeout(t);
        res();
      }
    });
  });
const CHUNK = 16000;
// A data channel carries about 256 KB in one message (Chrome); a bigger one is lost without any error. Anything above FR_LIMIT characters goes in pieces ('fr') that the other side puts together.
export const FR_LIMIT = 60000,
  FR_PIECE = 48000,
  FR_MAX_PARTS = 200, // 9.6 million characters at most
  FR_MAX_OPEN = 4,
  FR_TTL = 60000;
export function frSplit(text, id = Math.random().toString(36).slice(2, 12)) {
  const n = Math.ceil(text.length / FR_PIECE) || 1,
    out = [];
  for (let i = 0; i < n; i++) out.push({ k: 'fr', id, i, n, d: text.slice(i * FR_PIECE, (i + 1) * FR_PIECE) });
  return out;
}
// a piece in: the message when it is complete (already read), null while pieces are missing or when something is wrong
export function frJoin(buf, m, now = Date.now()) {
  Object.keys(buf).forEach(k => {
    if (now - buf[k].t > FR_TTL) delete buf[k];
  });
  if (typeof m.id != 'string' || !m.id || m.id.length > 40) return null;
  if (!Number.isInteger(m.n) || m.n < 1 || m.n > FR_MAX_PARTS) return null;
  if (!Number.isInteger(m.i) || m.i < 0 || m.i >= m.n || typeof m.d != 'string' || m.d.length > FR_PIECE * 2) {
    delete buf[m.id];
    return null;
  }
  let r = buf[m.id];
  if (!r) {
    if (Object.keys(buf).length >= FR_MAX_OPEN) return null;
    r = buf[m.id] = { n: m.n, parts: [], got: 0, t: now };
  }
  if (r.n !== m.n) {
    delete buf[m.id];
    return null;
  }
  if (r.parts[m.i] === undefined) {
    r.parts[m.i] = m.d;
    r.got++;
  }
  r.t = now;
  if (r.got < r.n) return null;
  delete buf[m.id];
  try {
    const o = JSON.parse(r.parts.join(''));
    return o && typeof o == 'object' && o.k !== 'fr' ? o : null;
  } catch (e) {
    return null;
  }
}
// what a pilot of the squadron can send at most: a mission is a few MB; more, too many at once, or a transfer that stalls is refused
export const RX_MAX_CHUNKS = 1000; // 16 MB compressed
export const RX_MAX_TEXT = 64 * 1024 * 1024; // after unzipping
export const RX_MAX_OPEN = 3; // transfers at the same time
export const RX_TTL = 120000; // ms without a new chunk
/**
 * Waits for the answer of the other pilot to a mission he is being sent. The wait ends with an error when nothing happens for `ms`:
 * `progress()` starts the minute again, so a big picture on a slow line, which is still being sent, is not silence.
 * acks[id] = {res, rej} is what the receiver of the answer calls.
 */
export function ackWait(acks, id, ms = 60000) {
  let timer = 0,
    over = false;
  const promise = new Promise((res, rej) => {
    const end = f => v => {
      over = true;
      clearTimeout(timer);
      delete acks[id];
      f(v);
    };
    acks[id] = { res: end(res), rej: end(rej) };
  });
  promise.catch(() => {}); // it is awaited after the last piece: no "unhandled" error while it is still being sent
  const progress = () => {
    if (over) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (acks[id])
        acks[id].rej(new Error('The other pilot did not confirm within a minute: the mission may not have arrived.'));
    }, ms);
  };
  progress();
  return { promise, progress };
}

export function rxBegin(rx, m, now = Date.now()) {
  Object.keys(rx).forEach(k => {
    if (now - rx[k].t > RX_TTL) delete rx[k];
  });
  if (typeof m.id != 'string' || !m.id || m.id.length > 64) return { error: 'The mission has a bad identifier.' };
  if (!Number.isInteger(m.n) || m.n < 1 || m.n > RX_MAX_CHUNKS)
    return { error: 'The mission is too big or malformed.' };
  if (!rx[m.id] && Object.keys(rx).length >= RX_MAX_OPEN) return { error: 'Too many missions arriving at once.' };
  rx[m.id] = {
    name: String(m.name == null ? '' : m.name).slice(0, 200),
    from: String(m.from == null ? '' : m.from).slice(0, 100),
    mid: typeof m.mid == 'string' ? m.mid.slice(0, 40) : '',
    n: m.n,
    parts: [],
    got: 0,
    t: now,
  };
  return { r: rx[m.id] };
}
// a piece of a mission: null when nobody is waiting for it; {error} (the transfer is dropped) when it is wrong; {r, done} otherwise
export function rxChunk(rx, m, now = Date.now()) {
  const r = rx[m.id];
  if (!r) return null;
  if (!Number.isInteger(m.i) || m.i < 0 || m.i >= r.n || typeof m.d != 'string' || m.d.length > CHUNK * 2) {
    delete rx[m.id];
    return { error: 'A piece of the mission is wrong.' };
  }
  if (r.parts[m.i] === undefined) {
    r.parts[m.i] = m.d;
    r.got++;
  }
  r.t = now;
  return { r, done: r.got == r.n };
}
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
export function parseTurn(text) {
  // one server per line: turn:host:port user credential  (user and credential optional)
  return String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim().split(/\s+/))
    .filter(a => /^turns?:/i.test(a[0] || ''))
    .map(a => (a[1] ? { urls: a[0], username: a[1], credential: a[2] || '' } : { urls: a[0] }));
}
// Network test: asks two public STUN servers (and the TURN server, if any) for the addresses of this computer and tells what can be expected from the direct connection.
export async function testNetwork(turn = []) {
  if (typeof RTCPeerConnection == 'undefined')
    return { ok: false, text: 'This program cannot make direct connections here (no WebRTC).' };
  const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, ...turn],
    }),
    cands = [];
  pc.onicecandidate = e => {
    if (e.candidate) cands.push(e.candidate.candidate);
  };
  pc.createDataChannel('t');
  await pc.setLocalDescription(await pc.createOffer());
  await iceDone(pc, 7000);
  pc.close();
  const P = cands.map(c => {
    const f = c.split(' ');
    const r = /raddr (\S+) rport (\d+)/.exec(c);
    return { type: f[7], addr: f[4], port: f[5], rport: r ? r[2] : '' };
  });
  const host = P.filter(x => x.type == 'host'),
    srf = P.filter(x => x.type == 'srflx'),
    rel = P.filter(x => x.type == 'relay');
  const byLocal = {};
  srf.forEach(x => {
    (byLocal[x.rport] = byLocal[x.rport] || new Set()).add(x.addr + ':' + x.port);
  });
  const symmetric = Object.values(byLocal).some(v => v.size > 1),
    mdns = host.filter(x => /\.local$/.test(x.addr)).length;
  const lines = [];
  lines.push(
    host.length
      ? 'Local addresses: ' +
          host.length +
          (mdns ? ' (hidden by the system as .local names: pilots on a virtual LAN cannot reach them)' : '') +
          '.'
      : 'No local address found.'
  );
  lines.push(
    srf.length
      ? 'Public address seen by the STUN servers: ' + [...new Set(srf.map(x => x.addr))].join(', ') + '.'
      : 'The STUN servers did not answer: a firewall blocks UDP or there is no internet.'
  );
  if (srf.length)
    lines.push(
      symmetric
        ? 'Your router changes the public port for every destination (symmetric NAT, typical of CGNAT): a direct connection with another pilot will probably FAIL. A TURN server is needed.'
        : 'Your router keeps the same public port (a direct connection may work, unless the other pilot has a symmetric NAT).'
    );
  if (turn.length)
    lines.push(
      rel.length
        ? 'TURN server: working (a relayed connection is possible, it works even behind CGNAT).'
        : 'TURN server: no answer. Check address, user name and password.'
    );
  return { ok: true, host: host.length, srflx: srf.length, relay: rel.length, symmetric, mdns, text: lines.join('\n') };
}
export function createLink({
  stun = false,
  turn = [],
  onOpen = () => {},
  onClose = () => {},
  onMessage = () => {},
} = {}) {
  const pc = new RTCPeerConnection({ iceServers: [...(stun ? STUN : []), ...turn] });
  let dc = null,
    rx = {};
  const acks = {},
    frs = {},
    waiters = [];
  // waits until the channel has sent most of what was queued (several messages may wait at once)
  const drain = async () => {
    while (dc && dc.readyState == 'open' && dc.bufferedAmount > 1 << 20) await new Promise(r => waiters.push(r));
  };
  const wire = ch => {
    dc = ch;
    ch.bufferedAmountLowThreshold = 1 << 20;
    ch.onbufferedamountlow = () => waiters.splice(0).forEach(r => r());
    // a channel that arrives already open (the answering side) may never fire 'open': the link would then never send its challenge and the other pilot would never see it as verified
    let opened = false;
    const fire = () => {
      if (opened) return;
      opened = true;
      onOpen();
    };
    ch.onopen = fire;
    if (ch.readyState == 'open') fire();
    ch.onclose = () => {
      waiters.splice(0).forEach(r => r());
      Object.keys(acks).forEach(i => {
        const a = acks[i];
        delete acks[i];
        a.rej(new Error('The connection with the pilot closed before he answered.'));
      });
      onClose();
    };
    ch.onmessage = async e => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (x) {
        return;
      }
      if (!m || typeof m != 'object') return;
      if (m.k == 'fr') {
        m = frJoin(frs, m);
        if (!m) return;
      }
      if (m.k == 'mack') {
        const a = acks[m.id];
        if (a) {
          delete acks[m.id];
          m.ok ? a.res() : a.rej(new Error(m.text || 'The pilot could not read the mission.'));
        }
      } else if (m.k == 'mp' || m.k == 'mc') {
        const refuse = text => {
          onMessage({ k: 'error', text });
          try {
            ch.send(JSON.stringify({ k: 'mack', id: m.id, ok: false, text }));
          } catch (y) {
            /* closed */
          }
        };
        if (m.k == 'mp') {
          const b = rxBegin(rx, m);
          if (b.error) refuse(b.error);
          return;
        }
        const c = rxChunk(rx, m);
        if (!c) return;
        if (c.error) return refuse(c.error);
        const r = c.r;
        if (c.done) {
          delete rx[m.id];
          let txt = null;
          try {
            txt = await unzip(r.parts.join(''), RX_MAX_TEXT);
          } catch (x) {
            onMessage({ k: 'error', text: 'The mission received could not be read.' });
            try {
              ch.send(
                JSON.stringify({
                  k: 'mack',
                  id: m.id,
                  ok: false,
                  text: 'The mission arrived but could not be read by the other pilot.',
                })
              );
            } catch (y) {
              /* closed */
            }
          }
          if (txt !== null) {
            onMessage({ k: 'mission', name: r.name, from: r.from, mid: r.mid, text: txt });
            try {
              ch.send(JSON.stringify({ k: 'mack', id: m.id, ok: true }));
            } catch (y) {
              /* closed */
            }
          }
        }
      } else onMessage(m);
    };
  };
  // 'disconnected' can pass by itself (a busy computer misses a check of the connection): the link counts as lost only if it is still so after a moment
  let dcT = 0;
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    clearTimeout(dcT);
    if (st == 'failed' || st == 'closed') onClose();
    else if (st == 'disconnected')
      dcT = setTimeout(() => {
        if (pc.connectionState == 'disconnected') onClose();
      }, 10000);
  };
  const send = async o => {
    try {
      if (!(dc && dc.readyState == 'open')) return false;
      const t = JSON.stringify(o);
      if (t.length <= FR_LIMIT) {
        dc.send(t);
        return true;
      }
      for (const piece of frSplit(t)) {
        await drain();
        dc.send(JSON.stringify(piece));
      }
      return true;
    } catch (e) {
      return false; // the channel closed while sending
    }
  };
  // the descriptions (what a tracker passes along) and the same wrapped in a code (what a pilot swaps by hand)
  const rawOffer = async () => {
    wire(pc.createDataChannel('bms'));
    await pc.setLocalDescription(await pc.createOffer());
    await iceDone(pc);
    return { type: 'offer', sdp: pc.localDescription.sdp };
  };
  const rawAnswer = async offer => {
    pc.ondatachannel = e => wire(e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await iceDone(pc);
    return { type: 'answer', sdp: pc.localDescription.sdp };
  };
  const rawAccept = async answer => pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
  return {
    pc,
    rawOffer,
    rawAnswer,
    rawAccept,
    async invite() {
      const o = await rawOffer();
      return pack({ t: 'offer', sdp: o.sdp });
    },
    async accept(code) {
      const m = await unpack(code);
      if (m.t != 'answer')
        throw new Error('This is not an answer code (the pilot must send the code made after pasting the invite).');
      await rawAccept(m);
    },
    async join(code) {
      const m = await unpack(code);
      if (m.t != 'offer') throw new Error('This is not an invite code (it comes from the leader).');
      const a = await rawAnswer(m);
      return pack({ t: 'answer', sdp: a.sdp });
    },
    send,
    // opt.z: the mission already compressed (the same for many pilots); opt.mid: one identifier for all the copies of a sending, so a copy that arrives twice is shown once
    async sendMission(text, name, from, opt = {}) {
      if (!dc || dc.readyState != 'open') throw new Error('Not connected.');
      const z = opt.z || (await zip(text)),
        n = Math.ceil(z.length / CHUNK),
        id = Math.random().toString(36).slice(2);
      dc.send(
        JSON.stringify({
          k: 'mp',
          id,
          name,
          n,
          from: from && typeof from == 'object' ? from.callsign || from.name || '' : from,
          mid: opt.mid || '',
        })
      );
      const wait = ackWait(acks, id);
      for (let i = 0; i < n; i++) {
        await drain();
        if (!dc || dc.readyState != 'open') throw new Error('Not connected.');
        dc.send(JSON.stringify({ k: 'mc', id, i, d: z.slice(i * CHUNK, (i + 1) * CHUNK) }));
        wait.progress();
      }
      await wait.promise;
    },
    get open() {
      return !!dc && dc.readyState == 'open';
    },
    close() {
      try {
        pc.close();
      } catch (e) {
        /* closed */
      }
    },
  };
}

// ---------- a session: the leader with one link per pilot, or a pilot with one link to the leader ----------
export function createSession({
  me,
  stun = () => false,
  turn = () => [],
  onChange = () => {},
  onMission = () => {},
} = {}) {
  const S = { role: null, links: [], err: '' };
  const hello = l => l.link.send({ k: 'hello', ...me() });
  const add = () => {
    const l = { id: Math.random().toString(36).slice(2, 7), peer: null, state: 'waiting', link: null };
    l.link = createLink({
      stun: stun(),
      turn: turn(),
      onOpen: () => {
        l.state = 'connected';
        hello(l);
        onChange();
      },
      onClose: () => {
        l.state = 'closed';
        onChange();
      },
      onMessage: m => {
        if (m.k == 'hello') {
          l.peer = { name: m.name, callsign: m.callsign, squadron: m.squadron };
          onChange();
        } else if (m.k == 'mission') onMission({ ...m, who: l.peer });
        else if (m.k == 'error') {
          S.err = m.text;
          onChange();
        }
      },
    });
    S.links.push(l);
    return l;
  };
  Object.assign(S, {
    async lead() {
      S.end();
      S.role = 'lead';
      onChange();
    },
    async invite() {
      const l = add();
      try {
        return { id: l.id, code: await l.link.invite() };
      } catch (e) {
        S.drop(l.id);
        throw e;
      }
    },
    async accept(id, code) {
      const l = S.links.find(x => x.id == id);
      if (!l) throw new Error('Unknown invite.');
      await l.link.accept(code);
      l.state = 'connecting';
      onChange();
    },
    async join(code) {
      S.end();
      S.role = 'join';
      const l = add();
      try {
        const a = await l.link.join(code);
        l.state = 'connecting';
        onChange();
        return a;
      } catch (e) {
        S.end();
        throw e;
      }
    },
    async sendMission(text, name) {
      const who = me();
      let n = 0;
      for (const l of S.links)
        if (l.link.open) {
          await l.link.sendMission(text, name, who);
          n++;
        }
      return n;
    },
    drop(id) {
      const i = S.links.findIndex(x => x.id == id);
      if (i >= 0) {
        S.links[i].link.close();
        S.links.splice(i, 1);
        onChange();
      }
    },
    end() {
      S.links.forEach(l => l.link.close());
      S.links = [];
      S.role = null;
      S.err = '';
      onChange();
    },
  });
  Object.defineProperty(S, 'connected', { get: () => S.links.filter(l => l.link.open).length });
  return S;
}

// ---------- the squadron: invite, roster ----------
export const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
];
export const parseTrackers = text => [
  ...new Set(
    String(text || '')
      .split(/[\s,;]+/)
      .filter(u => /^wss?:\/\/[^\s/]+/i.test(u))
  ),
];
export const newSquadron = (name, owner = '') => ({
  id: randHex(4),
  name: String(name || '').trim() || 'My squadron',
  motto: '',
  notes: '',
  secret: randHex(16),
  owner,
  leader: '',
  mc: '', // the mission commander: has the powers of the commander and takes the command when the commander leaves
  org: newOrg(), // packages, flights and who flies where (core/organization.js)
  ts: Date.now(),
  roster: {},
});
export const squadInvite = sq => pack({ n: sq.name, m: sq.motto, s: sq.secret, o: sq.owner || '' }, 'BCS');
export async function readSquadInvite(code) {
  const o = await unpack(code, 'BCS');
  if (!o.s || typeof o.s != 'string' || o.s.length < 16) throw new Error('This invite is not valid.');
  return { name: o.n || 'Squadron', motto: o.m || '', notes: '', secret: o.s, owner: o.o || '', ts: 0 };
}
// a roster entry: uid (a pilot, stable), name, callsign, role, notes, ts (when it was last edited: the newer one wins when two pilots exchange their rosters)
export function mergeRoster(mine, theirs) {
  const out = { ...mine };
  let changed = false;
  for (const [uid, m0] of Object.entries(theirs || {})) {
    const o = out[uid],
      m = { ...m0 };
    if ('av' in m && !okImg(m.av)) delete m.av;
    delete m.avh; // a fingerprint of the picture (big squadrons), not part of the entry
    if (!o || (m.ts || 0) > (o.ts || 0)) {
      out[uid] = { ...(o || {}), ...m };
      changed = true;
    }
  }
  return { roster: out, changed };
}

// ---------- big squadrons: the roster without the pictures, the pictures on request, one mission for many pilots ----------
// a short fingerprint of a picture: a pilot compares it with his own to know which avatars he still needs
export const avHash = s => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};
export const SYNC_FULL_MAX = 150000; // up to this size the roster travels whole, with the pictures (the form older programs read)
export const rosterOut = roster =>
  Object.fromEntries(
    Object.entries(roster).map(([k, r]) => {
      const { av, ...x } = r;
      return [k, okImg(av) ? { ...x, av } : x];
    })
  ); // the avatars of the pilots travel in the roster too, so the ones of pilots who are offline arrive as well
export const rosterLite = roster =>
  Object.fromEntries(
    Object.entries(roster).map(([k, r]) => {
      const { av, ...x } = r;
      return [k, okImg(av) ? { ...x, avh: avHash(av) } : x];
    })
  );
// the message that brings a pilot up to date: whole when small, without the pictures (each with its fingerprint) when it would be big
export function syncMsg(meta, roster, org) {
  const full = { k: 'sync', squad: meta, roster: rosterOut(roster), ...(org ? { org } : {}) };
  return JSON.stringify(full).length <= SYNC_FULL_MAX
    ? full
    : { k: 'sync', squad: meta, roster: rosterLite(roster), lite: 1, ...(org ? { org } : {}) };
}
// after a roster without pictures: the pilots whose picture is missing or different here; 'pending' keeps what was asked a moment ago, so a picture is not asked to every pilot at once
export function avNeeded(mine, theirs, pending = new Map(), now = Date.now(), retry = 30000) {
  const out = [];
  for (const [uid, t] of Object.entries(theirs || {})) {
    if (!t || typeof t.avh != 'string' || !t.avh || t.avh.length > 16) continue;
    const r = mine[uid];
    if (!r || (r.av && avHash(r.av) === t.avh) || (t.ts || 0) < (r.ts || 0)) continue;
    if (pending.has(uid) && now - pending.get(uid) < retry) continue;
    pending.set(uid, now);
    out.push(uid);
    if (out.length >= 100) break;
  }
  return out;
}
export const avServe = (roster, uids) =>
  (Array.isArray(uids) ? uids.slice(0, 100) : [])
    .filter(u => typeof u == 'string' && roster[u] && okImg(roster[u].av))
    .map(u => ({ k: 'av', uid: u, av: roster[u].av, h: avHash(roster[u].av) }));
// a picture that was asked for: kept only if it looks like a picture, is the one announced, and belongs to a pilot of the roster
export function avAccept(roster, m) {
  const r = typeof m.uid == 'string' && roster[m.uid];
  if (!r || !okImg(m.av) || m.h !== avHash(m.av) || r.av === m.av) return false;
  r.av = m.av;
  return true;
}
// A kneeboard card travels like a mission (same pieces, same acknowledgement); its text is this small JSON, recognised by its beginning.
export const CARD_MAX = 8 * 1024 * 1024; // bytes of the picture
const CARD_HEAD = '{"format":"bms-cards-card"';
export function cardText(name, img) {
  return (
    CARD_HEAD +
    ',"v":1,"name":' +
    JSON.stringify(String(name || 'Card').slice(0, 60)) +
    ',"img":' +
    JSON.stringify(img) +
    '}'
  );
}
/** @returns {{name:string, img:string}|null} the card inside a received text, null when it is not a valid card */
export function parseCard(text) {
  if (typeof text != 'string' || !text.startsWith(CARD_HEAD)) return null;
  try {
    const o = JSON.parse(text);
    if (o.format != 'bms-cards-card' || typeof o.img != 'string') return null;
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(o.img)) return null;
    if ((o.img.length * 3) / 4 > CARD_MAX * 1.02) return null;
    const name = String(o.name || '')
      .replace(/[\u0000-\u001f<>"\\/:|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    return { name: name || 'Card', img: o.img };
  } catch (e) {
    return null;
  }
}
// one mission to many pilots: compressed once, a few at a time, each failure tried once more. targets: [{label, send(text, name, {z, mid})}] (the pilot is looked up when the turn comes, not before)
export async function distribute(
  targets,
  text,
  name,
  { parallel = 4, retries = 1, wait = 1500, onProgress = () => {}, mid = randHex(8) } = {}
) {
  const z = await zip(text),
    ok = [],
    bad = [];
  let next = 0,
    done = 0;
  const one = async t => {
    let err;
    for (let a = 0; a <= retries; a++) {
      try {
        await t.send(text, name, { z, mid });
        ok.push(t.label);
        return;
      } catch (e) {
        err = e;
        if (a < retries) await new Promise(r => setTimeout(r, wait));
      }
    }
    bad.push(t.label + ': ' + ((err && err.message) || err));
  };
  const run = async () => {
    while (next < targets.length) {
      await one(targets[next++]);
      done++;
      onProgress(done, targets.length, ok.length, bad.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, targets.length) }, run));
  return { ok, bad, mid };
}

// ---------- the swarm: trackers pass the offers, the pilots of the squadron connect ----------
// Protocol of the WebTorrent trackers (WebSocket, JSON): announce {action, info_hash, peer_id, offers: [{offer_id, offer}], numwant} -> the tracker hands each offer to another
// peer of the swarm, which answers with {action: 'announce', info_hash, peer_id, to_peer_id, offer_id, answer}; the tracker hands the answer back to the offerer.
// Every pilot announces as a downloader (left > 0): some trackers never match two seeders (left = 0) with each other.
// A peer counts only after it proves it knows the secret of the squadron (HMAC of a challenge): the swarm name alone is not enough.
const MAX_OFFERS = 6, // offers in one announce when many pilots are not linked yet
  FAST_ANNOUNCE = 8000, // ms between announces then
  START_JITTER = 3000; // ms: the first announce of a pilot waits a random part of this, so a whole squadron opening the program together does not hit the trackers at once
// the pace of the announces spread by +-20% (r: 0..1), so the pilots do not stay in step; off (jitter = 0) the time is exact (tests)
export const spread = (ms, on, r = Math.random()) => (on ? Math.round(ms * (0.8 + 0.4 * r)) : ms);
export function createSwarm({
  secret,
  me,
  trackers = TRACKERS,
  stun = true,
  turn = [],
  onPeer = () => {},
  onMessage = () => {},
  onChange = () => {},
  WS = globalThis.WebSocket,
  interval = 25000,
  offers = 3,
  allow = () => true,
  jitter = 0, // ms of random delay before the first announce (0: none); with it the pace of the announces is also spread
}) {
  const S = {
    peers: new Map(),
    socks: [],
    stopped: false,
    trackers: 0,
    tinfo: {},
    diag: {
      err: '',
      rOff: 0,
      rFwd: 0,
      rAns: 0,
      rAcc: 0,
      sent: 0,
      recv: 0,
      ans: 0,
      ansRecv: 0,
      open: 0,
      closed: 0,
      ok: 0,
      wrong: 0,
      ice: {},
    },
  };
  let ih = '',
    myId = '',
    timer = null;
  const pending = new Map(); // offer_id -> {p, t}
  const rnd20 = () => bin(crypto.getRandomValues(new Uint8Array(20)));
  const mkLink = (pid, offerer = false) => {
    let p;
    const link = createLink({
      stun,
      turn,
      onOpen: () => {
        S.diag.open++;
        link.send({ k: 'chal', n: p.challenge });
      },
      onClose: () => {
        S.diag.closed++;
        link.close(); // a link this side forgets is closed for the other side too: otherwise he keeps it and the two never link again
        if (S.peers.get(p.challenge) === p) {
          S.peers.delete(p.challenge);
          if (p.verified) {
            p.verified = false;
            if (!S.online().some(q => q.uid == p.uid)) onPeer(p, 'left');
            gossip();
          }
          onChange();
        }
      },
      onMessage: async m => {
        if (m.k == 'chal') {
          link.send({ k: 'hello', proof: await hmac(secret, 'proof:' + m.n), ...me() });
        } else if (m.k == 'hello') {
          if (p.verified) return;
          if (m.proof !== (await hmac(secret, 'proof:' + p.challenge))) {
            S.diag.wrong++;
            link.close();
            return;
          } // not of the squadron
          // two pilots offer to each other at the same time: both links open, and both must keep the SAME one (the one offered by the pilot with the smaller id)
          if (!allow(m.uid)) {
            link.close();
            return;
          } // removed from the squadron by its leader
          const dup = [...S.peers.values()].find(q => q !== p && q.verified && q.uid == m.uid && q.link.open);
          if (dup) {
            const keepNew = p.offerer ? me().uid < m.uid : m.uid < me().uid;
            if (!keepNew) {
              link.close();
              return;
            }
            dup.verified = false;
            dup.link.close();
          }
          S.diag.ok++;
          p.verified = true;
          p.uid = m.uid;
          p.profile = {
            name: m.name,
            callsign: m.callsign,
            squadron: m.squadron,
            uid: m.uid,
            st: m.st || null,
            av: m.av || '',
          };
          onPeer(p, 'joined');
          p.link.send({ k: 'lk', u: S.online().map(q => q.uid) });
          gossip();
          onChange();
        } else if (p.verified && m.k == 'lk') {
          // the pilots this one is linked with: the way to link with those I am not linked with yet
          p.links = new Set(
            (Array.isArray(m.u) ? m.u : []).filter(u => typeof u == 'string' && u.length <= 64).slice(0, 500)
          );
          relayTick();
        } else if (p.verified && m.k == 'rly') relayMsg(p, m);
        else if (p.verified) onMessage(p, m);
      },
    });
    link.pc.addEventListener('iceconnectionstatechange', () => {
      const st = link.pc.iceConnectionState;
      S.diag.ice[st] = (S.diag.ice[st] || 0) + 1;
      onChange();
    });
    p = { pid, offerer, link, uid: null, profile: null, verified: false, challenge: randHex(16), t: Date.now() };
    S.peers.set(p.challenge, p);
    return p;
  };
  // ---- linking through the pilots already linked: the trackers only bring the first links, the rest goes from pilot to pilot ----
  // 'lk': the list of the pilots I am linked with, told to every pilot when it changes. 'rly': an offer (t 'o') or an answer (t 'a') of two pilots that are not linked yet, passed on by a pilot linked with both.
  let gossipT = 0;
  const gossip = () => {
    clearTimeout(gossipT);
    gossipT = setTimeout(() => {
      if (!S.stopped) S.online().forEach(q => q.link.send({ k: 'lk', u: S.online().map(x => x.uid) }));
    }, 400);
  };
  const relays = new Map(), // offer id -> {p, to, t}: offers sent through another pilot, waiting for the answer
    wantSince = new Map(); // uid -> when I first saw him missing
  let relayBusy = false,
    relayAgain = false;
  const relayTick = async () => {
    if (S.stopped) return;
    if (relayBusy) {
      relayAgain = true; // asked again while working: once more when done
      return;
    }
    relayBusy = true;
    try {
      const mine = me().uid,
        now = Date.now(),
        direct = new Set(S.online().map(q => q.uid)),
        via = new Map();
      for (const q of S.online())
        for (const u of q.links || []) if (u !== mine && !direct.has(u) && allow(u) && !via.has(u)) via.set(u, q);
      for (const u of [...wantSince.keys()]) if (!via.has(u)) wantSince.delete(u);
      for (const [id, r] of relays)
        if (now - r.t > 30000) {
          relays.delete(id);
          if (!r.p.link.open) {
            r.p.link.close();
            S.peers.delete(r.p.challenge);
          }
        }
      const todo = [];
      for (const [u, q] of via) {
        if (!wantSince.has(u)) wantSince.set(u, now);
        // of two pilots that miss each other the one with the smaller id offers; the other one offers too after a while (the first may be an older program)
        if (!(mine < u) && now - wantSince.get(u) < 20000) continue;
        if ([...relays.values()].some(r => r.to === u)) continue;
        if (todo.length >= 10) break;
        todo.push([u, q]);
      }
      // the offers are made together (each waits for the gathering of the addresses of its connection)
      await Promise.all(
        todo.map(async ([u, q]) => {
          const id = rnd20(),
            pl = mkLink(null, true);
          relays.set(id, { p: pl, to: u, t: Date.now() });
          try {
            const offer = await pl.link.rawOffer();
            S.diag.rOff++;
            q.link.send({ k: 'rly', t: 'o', o: mine, d: u, id, sdp: offer });
          } catch (e) {
            S.diag.err = 'relay offer: ' + ((e && e.message) || e);
            relays.delete(id);
            pl.link.close();
            S.peers.delete(pl.challenge);
          }
        })
      );
    } finally {
      relayBusy = false;
      if (relayAgain) {
        relayAgain = false;
        relayTick();
      }
    }
  };
  const sdpOk = (x, type) =>
    x && typeof x == 'object' && x.type === type && typeof x.sdp == 'string' && x.sdp.length < 40000;
  const relayMsg = async (p, m) => {
    const mine = me().uid;
    if (
      typeof m.id != 'string' ||
      m.id.length > 64 ||
      typeof m.o != 'string' ||
      typeof m.d != 'string' ||
      !sdpOk(m.sdp, m.t == 'o' ? 'offer' : 'answer')
    )
      return;
    const dest = m.t == 'o' ? m.d : m.o;
    if (dest !== mine) {
      const t = S.byUid(dest);
      if (t) {
        S.diag.rFwd++;
        t.link.send(m); // I am the pilot in the middle
      }
      return;
    }
    if (m.t == 'o') {
      if (S.online().some(q => q.uid === m.o) || !allow(m.o)) return;
      const pl = mkLink(null, false);
      try {
        S.diag.rAns++;
        const sdp = await pl.link.rawAnswer(m.sdp);
        p.link.send({ k: 'rly', t: 'a', o: m.o, d: mine, id: m.id, sdp });
      } catch (e) {
        S.diag.err = 'relay answer: ' + ((e && e.message) || e);
        pl.link.close();
        S.peers.delete(pl.challenge);
      }
    } else {
      const r = relays.get(m.id);
      if (!r || r.to !== m.d) return;
      relays.delete(m.id);
      S.diag.rAcc++;
      try {
        await r.p.link.rawAccept(m.sdp);
      } catch (e) {
        S.diag.err = 'relay accept: ' + ((e && e.message) || e);
        r.p.link.close();
        S.peers.delete(r.p.challenge);
      }
    }
  };
  // how many pilots the trackers say are in the swarm and are not linked with me yet (-1: no tracker said)
  const missing = () => {
    const now = Date.now();
    let k = -1;
    for (const t of Object.values(S.tinfo))
      if (t && !t.fail && now - t.at < interval * 3 + 5000) k = Math.max(k, t.peers);
    return k < 0 ? -1 : Math.max(0, k - 1 - S.online().length);
  };
  const announce = async ws => {
    if (ws.readyState !== 1 || S.stopped) return;
    const miss = missing(),
      pend = [...S.peers.values()].filter(q => !q.link.open).length,
      want = Math.max(0, Math.min(miss < 0 ? offers : Math.min(MAX_OFFERS, miss), 60 - pend));
    const list = (
      await Promise.all(
        Array.from({ length: want }, async () => {
          const id = rnd20(),
            p = mkLink(null, true);
          pending.set(id, { p, t: Date.now() });
          try {
            return { offer_id: id, offer: await p.link.rawOffer() };
          } catch (e) {
            S.diag.err = 'offer: ' + ((e && e.message) || e);
            pending.delete(id);
            S.peers.delete(p.challenge);
            return null;
          }
        })
      )
    ).filter(Boolean);
    if (ws.readyState === 1 && !S.stopped) {
      S.diag.sent += list.length;
      ws.send(
        JSON.stringify({
          action: 'announce',
          info_hash: ih,
          peer_id: myId,
          uploaded: 0,
          downloaded: 0,
          left: 1,
          numwant: want,
          offers: list,
        })
      );
    }
  };
  const handle = async (ws, text) => {
    let m;
    try {
      m = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (m.info_hash !== ih || S.stopped) {
      if (m.info_hash !== undefined && m.info_hash !== ih) S.diag.badhash = (S.diag.badhash || 0) + 1;
      return;
    }
    if (m.offer && m.peer_id && m.peer_id !== myId) {
      // already linked (or being linked) with this pilot: a second link would only be closed again
      if ([...S.peers.values()].some(q => q.pid === m.peer_id && (q.link.open || Date.now() - q.t < 20000))) {
        S.diag.skipped = (S.diag.skipped || 0) + 1;
        return;
      }
      const p = mkLink(m.peer_id);
      S.diag.recv++;
      try {
        S.diag.ans++;
        const ans = await p.link.rawAnswer(m.offer);
        ws.send(
          JSON.stringify({
            action: 'announce',
            info_hash: ih,
            peer_id: myId,
            to_peer_id: m.peer_id,
            offer_id: m.offer_id,
            answer: ans,
          })
        );
      } catch (e) {
        S.diag.err = 'answer: ' + ((e && e.message) || e);
        p.link.close();
        S.peers.delete(p.challenge);
      }
    } else if (m.answer && pending.has(m.offer_id)) {
      const { p } = pending.get(m.offer_id);
      pending.delete(m.offer_id);
      S.diag.ansRecv++;
      p.pid = m.peer_id;
      try {
        await p.link.rawAccept(m.answer);
      } catch (e) {
        S.diag.err = 'accept: ' + ((e && e.message) || e);
        p.link.close();
        S.peers.delete(p.challenge);
      }
    }
  };
  const sweep = () => {
    // offers nobody took, and links that never opened
    const now = Date.now();
    for (const [id, o] of pending)
      if (now - o.t > 60000) {
        pending.delete(id);
        if (!o.p.link.open) {
          o.p.link.close();
          S.peers.delete(o.p.challenge);
        }
      }
    for (const p of S.peers.values())
      if (p.link.open && !p.verified && now - p.t > 8000 && now - (p.chalAt || 0) > 8000) {
        p.chalAt = now;
        p.link.send({ k: 'chal', n: p.challenge }); // the first one may have been lost
      }
    for (const [k, p] of S.peers)
      if (!p.link.open && now - p.t > 90000) {
        p.link.close();
        S.peers.delete(k);
      }
  };
  Object.assign(S, {
    async start() {
      ih = await sha1('bmscards-squadron:' + secret);
      myId = rnd20();
      const startWait = jitter ? Math.round(Math.random() * jitter) : 0;
      S.socks = trackers
        .map(url => {
          let ws;
          try {
            ws = new WS(url);
          } catch (e) {
            return null;
          }
          const count = () => {
            S.trackers = S.socks.filter(w => w && w.readyState === 1).length;
            onChange();
          };
          ws.onopen = () => {
            count();
            if (!startWait) announce(ws);
            else
              setTimeout(() => {
                if (!S.stopped) announce(ws);
              }, startWait);
          };
          ws.onmessage = e => {
            const t = typeof e.data == 'string' ? e.data : '';
            try {
              const m = JSON.parse(t);
              if (m && m.action == 'announce' && !m.offer && !m.answer)
                S.tinfo[url] = {
                  peers: (m.complete || 0) + (m.incomplete || 0),
                  fail: m['failure reason'] || '',
                  at: Date.now(),
                };
              else if (m && m['failure reason']) S.tinfo[url] = { peers: 0, fail: m['failure reason'], at: Date.now() };
            } catch (x) {
              /* not JSON */
            }
            handle(ws, t);
          };
          ws.onclose = count;
          ws.onerror = () => {};
          return ws;
        })
        .filter(Boolean);
      // quick while somebody of the swarm is not linked yet, then the usual pace
      const tick = () => {
        if (S.stopped) return;
        sweep();
        relayTick();
        S.socks.forEach(announce);
        timer = setTimeout(tick, spread(missing() !== 0 ? Math.min(interval, FAST_ANNOUNCE) : interval, !!jitter));
      };
      timer = setTimeout(tick, spread(Math.min(interval, FAST_ANNOUNCE), !!jitter) + startWait);
    },
    stop() {
      S.stopped = true;
      clearTimeout(timer);
      clearTimeout(gossipT);
      S.socks.forEach(w => {
        try {
          w.close();
        } catch (e) {
          /* closed */
        }
      });
      [...S.peers.values()].forEach(p => p.link.close());
      S.peers.clear();
      pending.clear();
    },
    online() {
      return [...S.peers.values()].filter(p => p.verified && p.link.open);
    },
    byUid(uid) {
      return S.online().find(p => p.uid == uid) || null;
    },
    broadcast(o) {
      S.online().forEach(p => p.link.send(o));
    },
  });
  return S;
}

// ---------- the squadron in a campaign ----------
// Every squadron of the campaign has 48 pilot records (kills in the air, on the ground, at sea, on land, missions flown). The names of the pilots are not in the file.
const sum = (a, k) => a.reduce((s, p) => s + (p[k] || 0), 0);
export function campaignSquadrons(C) {
  if (!C || !C.units) return [];
  const sqs = C.units
    .filter(u => u.kind == 'sqd' && u.pil)
    .map(u => {
      const pil = u.pil.map((p, slot) => ({ ...p, slot })).filter(p => p.ms || p.aa || p.ag || p.as || p.an);
      const k = { aa: sum(pil, 'aa'), ag: sum(pil, 'ag'), as: sum(pil, 'as'), an: sum(pil, 'an') };
      return {
        id: u.id.n,
        u,
        sqs: u.sqs || null,
        pilotsN: u.pil.length,
        name: (C.squads && C.squads[u.id.n]) || 'Squadron ' + u.id.n,
        owner: u.owner,
        mine: u.id.n == C.playerSq,
        pilots: pil.sort((a, b) => b.aa + b.ag + b.as + b.an - (a.aa + a.ag + a.as + a.an)),
        kills: k,
        total: k.aa + k.ag + k.as + k.an,
        missions: sum(pil, 'ms'),
        aces: pil.filter(p => p.aa >= 5),
      };
    });
  const team = {};
  sqs.forEach(s => {
    team[s.owner] = (team[s.owner] || 0) + s.total;
  });
  sqs.forEach(s => {
    s.share = team[s.owner] ? s.total / team[s.owner] : 0;
  });
  return sqs.sort((a, b) => b.mine - a.mine || b.total - a.total);
}

// ---------- images: the logo of a squadron and the avatar of a pilot ----------
// A picture picked by the user (JPG, PNG or WebP) is shrunk to a small data URL (so it can travel with the roster); one received from another pilot is accepted only if it looks like one.
export const okImg = u =>
  typeof u == 'string' && u.length < 90000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(u);
// A window to place the picture before it is shrunk: drag it, zoom with the slider or the wheel, "Whole picture" or "Fill" as starting points; OK gives a square (round = shown as a circle).
// Resolves to the data URL, or null when cancelled.
export async function cropImage(file, size = 128, round = false, title = 'Picture') {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type || '') && !/\.(jpe?g|png|webp)$/i.test(file.name || ''))
    throw new Error('Pick a JPG, PNG or WebP image.');
  const bmp = await createImageBitmap(file),
    P = 260,
    fitK = Math.min(P / bmp.width, P / bmp.height),
    fillK = Math.max(P / bmp.width, P / bmp.height);
  let k = fitK,
    ox = (P - bmp.width * k) / 2,
    oy = (P - bmp.height * k) / 2;
  const w = document.createElement('div');
  w.className = 'sqcrop';
  w.innerHTML = `<div class="sqcbox" role="dialog" aria-label="${title}"><h3>${title}</h3><div class="sqcv${round ? ' round' : ''}"><canvas width="${P}" height="${P}"></canvas></div>
    <div class="hint" style="min-height:0">Drag the picture to move it, use the slider or the wheel to zoom.</div>
    <input type="range" class="sqcz" min="0" max="1000" value="0" aria-label="Zoom">
    <div class="bar"><button class="btn g" data-m="fit">Whole picture</button><button class="btn g" data-m="fill">Fill</button></div>
    <div class="bar" style="justify-content:flex-end"><button class="btn g" data-m="no">Cancel</button><button class="btn gn" data-m="ok">OK</button></div></div>`;
  document.body.append(w);
  const cv = w.querySelector('canvas'),
    x = cv.getContext('2d'),
    zs = w.querySelector('.sqcz'),
    maxK = fillK * 4;
  const toZ = () => {
    zs.value = Math.round((1000 * Math.log(k / fitK)) / Math.log(maxK / fitK));
  };
  const paint = () => {
    x.clearRect(0, 0, P, P);
    x.drawImage(bmp, ox, oy, bmp.width * k, bmp.height * k);
  };
  const zoomTo = (nk, cx = P / 2, cy = P / 2) => {
    nk = Math.min(maxK, Math.max(fitK / 2, nk));
    ox = cx - ((cx - ox) * nk) / k;
    oy = cy - ((cy - oy) * nk) / k;
    k = nk;
    toZ();
    paint();
  };
  const place = m => {
    k = m == 'fit' ? fitK : fillK;
    ox = (P - bmp.width * k) / 2;
    oy = (P - bmp.height * k) / 2;
    toZ();
    paint();
  };
  zs.max = 1000;
  zs.oninput = () => zoomTo(fitK * Math.pow(maxK / fitK, zs.value / 1000));
  let drag = null;
  cv.onpointerdown = e => {
    drag = [e.clientX, e.clientY, ox, oy];
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = e => {
    if (!drag) return;
    ox = drag[2] + e.clientX - drag[0];
    oy = drag[3] + e.clientY - drag[1];
    paint();
  };
  cv.onpointerup = cv.onpointercancel = () => {
    drag = null;
  };
  cv.onwheel = e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomTo(
      k * (e.deltaY < 0 ? 1.1 : 1 / 1.1),
      ((e.clientX - r.left) * P) / r.width,
      ((e.clientY - r.top) * P) / r.height
    );
  };
  paint();
  return new Promise((res, rej) => {
    const done = v => {
      document.removeEventListener('keydown', key);
      w.remove();
      res(v);
    };
    const key = e => {
      if (e.key == 'Escape') done(null);
    };
    document.addEventListener('keydown', key);
    w.onclick = e => {
      const m = e.target.closest && e.target.closest('[data-m]');
      if (e.target == w) done(null);
      if (!m) return;
      const a = m.dataset.m;
      if (a == 'fit' || a == 'fill') return place(a);
      if (a == 'no') return done(null);
      const o = document.createElement('canvas');
      o.width = o.height = size;
      const f = size / P;
      o.getContext('2d').drawImage(bmp, ox * f, oy * f, bmp.width * k * f, bmp.height * k * f);
      let u = o.toDataURL('image/webp', 0.85);
      if (!u.startsWith('data:image/webp')) u = o.toDataURL('image/png');
      // a small avatar stays small (24 KB at most): it travels to every pilot of the squadron
      const cap = size > 160 ? 60000 : 24000;
      for (const qv of [0.7, 0.55, 0.4, 0.3]) {
        if (u.length <= cap || !u.startsWith('data:image/webp')) break;
        u = o.toDataURL('image/webp', qv);
      }
      if (!okImg(u)) {
        w.remove();
        document.removeEventListener('keydown', key);
        return rej(new Error('The image is too big or could not be read.'));
      }
      done(u);
    };
  });
}

// ---------- the page ----------
// Three sections: Members (the roster of a squadron, who is online, the mission, the squadron in the campaign), Me (my logbook, my squadrons and their moderation)
// and Settings (invite codes, trackers, phone book, direct connection).
// deps: {root, esc, store: {load() -> Promise<obj|null>, save(obj)}, lbk: {list(), read(name)} | null, phonebook: {read()} | null, campaign() -> C | null, squadInfo(unit) -> {owner, base},
//        trackers() -> text, openSettings(), buildMission() -> {name, ...}, loadMission(text) -> false when it was not opened, toast(msg), swarm: {trackers, WS, interval} (tests)}
export function createSquadronPage(deps) {
  const { root, esc } = deps;
  const $ = s => root.querySelector(s);
  let pilot = null,
    lbkErr = '',
    recv = [],
    log = [],
    saveT = null,
    PB = null,
    pbErr = '';
  let DB = { uid: randHex(8), squads: [], cur: '', cs: '', stun: false, turn: '', lbk: '', av: '', tab: 'members' };
  const swarms = new Map(); // squadron id -> swarm
  const say = t => {
    log.unshift(new Date().toTimeString().slice(0, 8) + '  ' + t);
    log = log.slice(0, 40);
    const l = $('#sqlog');
    if (l) l.textContent = log.join('\n');
  };
  let savePending = false;
  const writeNow = () => {
    savePending = false;
    try {
      deps.store && deps.store.save(DB);
    } catch (e) {
      /* not saved */
    }
  };
  const save = () => {
    clearTimeout(saveT);
    savePending = true;
    saveT = setTimeout(writeNow, 300);
  };
  const cur = () => DB.squads.find(q => q.id == DB.cur) || DB.squads[0] || null;
  const owns = q => !!q && q.owner == DB.uid;
  const live = q => Object.values(q.roster).filter(r => !r.removed);
  // order of the members: the commander (creator of the squadron), the mission leader, me, then the others (online first, then by callsign)
  const rankOf = (q, uid) => (uid == q.owner ? 0 : uid == q.leader ? 1 : uid == DB.uid ? 2 : 3);
  const orderRoster = (q, arr, onUid) =>
    arr
      .map((r, i) => [r, i])
      .sort(
        (a, b) =>
          rankOf(q, a[0].uid) - rankOf(q, b[0].uid) ||
          (onUid.has(b[0].uid) || b[0].uid == DB.uid) - (onUid.has(a[0].uid) || a[0].uid == DB.uid) ||
          String(a[0].callsign || a[0].name || '').localeCompare(String(b[0].callsign || b[0].name || '')) ||
          a[1] - b[1]
      )
      .map(x => x[0]);
  const mini = () => {
    const t = pilot && pilot.stats;
    return t ? { rk: t.rank, h: t.hours, m: t.missions, aa: t.aa, ag: t.ag, st: t.st, nav: t.nav, ace: t.ace } : null;
  };
  const me = () => ({
    uid: DB.uid,
    name: pilot ? pilot.name : '',
    callsign: DB.cs || (pilot ? pilot.callsign : ''),
    squadron: pilot ? pilot.squadron : '',
    st: mini(),
    av: DB.av || '',
  });
  const label = p => (p ? (p.callsign || p.name || 'Pilot') + (p.name && p.callsign ? ' · ' + p.name : '') : '…');
  const statLine = t =>
    t ? (RANKS[t.rk] || '') + ' · ' + Math.round(t.h) + ' h · ' + t.aa + ' A-A · ' + t.ag + ' A-G' : '';
  const copy = async t => {
    try {
      await navigator.clipboard.writeText(t);
      deps.toast && deps.toast('Copied.');
    } catch (e) {
      deps.toast && deps.toast('Could not copy: select the text and copy it by hand.');
    }
  };
  const ago = t => {
    if (!t) return 'never';
    const s = (Date.now() - t) / 1000;
    return s < 90
      ? 'a moment ago'
      : s < 5400
        ? Math.round(s / 60) + ' min ago'
        : s < 129600
          ? Math.round(s / 3600) + ' h ago'
          : Math.round(s / 86400) + ' days ago';
  };
  const seenMid = new Set();
  const onRecv = (m, who, sqName) => {
    if (m.mid) {
      if (seenMid.has(m.mid)) return; // the same sending arrived twice (a retry): shown once
      seenMid.add(m.mid);
      if (seenMid.size > 50) seenMid.delete(seenMid.values().next().value);
    }
    const from = who && (who.callsign || who.name) ? label(who) : (typeof m.from == 'string' && m.from) || 'a pilot';
    const card = parseCard(m.text);
    if (card) {
      // a kneeboard card: among the unused cards of the Kneeboard, nothing else changes
      if (deps.receiveCard)
        deps
          .receiveCard(card, from)
          .then(() => {
            say('Card "' + card.name + '" received from ' + from + '.');
            deps.toast && deps.toast('Card received from ' + from + ': ' + card.name + ' (Kneeboard, unused cards)');
          })
          .catch(e => say('The received card could not be kept: ' + ((e && e.message) || e)));
      return;
    }
    recv.unshift({ text: m.text, name: m.name, from, squad: sqName || '' });
    say('Mission "' + m.name + '" received from ' + from + '.');
    drawMis();
    deps.toast && deps.toast('Mission received: ' + m.name);
    const r0 = recv[0];
    if (deps.saveReceived)
      deps
        .saveReceived(m.text, m.name)
        .then(d => {
          if (d) {
            r0.saved = d;
            say('Mission "' + m.name + '" saved in ' + d);
            deps.toast && deps.toast('Saved in your missions folder: ' + d);
          }
        })
        .catch(e => say('The received mission could not be saved: ' + ((e && e.message) || e)));
    pop(
      `<h3 style="margin:0 0 8px;font-size:15px">Mission received</h3><div style="margin-bottom:12px">"${esc(m.name)}" from ${esc(from)}.<br>Load it now? (it opens the mission and puts its DTC data, steerpoints, lines, targets and offsets, into your own DTC after showing what changes)</div><div class="bar" style="justify-content:flex-end;gap:8px"><button class="btn g" data-x>Later</button><button class="btn g gn" data-ok>Load now</button></div>`,
      (o, c) => {
        o.querySelector('[data-x]').onclick = c;
        o.querySelector('[data-ok]').onclick = async () => {
          c();
          try {
            const ok = await deps.loadMission(r0.text);
            say('Mission "' + r0.name + '" ' + (ok === false ? 'not opened.' : 'loaded.'));
          } catch (e) {
            result(false, 'Mission not loaded', String((e && e.message) || e));
          }
        };
      }
    );
  };
  const mkMe = q => {
    const m = me(),
      r = q.roster[DB.uid];
    if (!r)
      q.roster[DB.uid] = {
        uid: DB.uid,
        name: m.name,
        callsign: m.callsign,
        pilotSquadron: m.squadron,
        stats: m.st,
        av: m.av,
        role: '',
        notes: '',
        ts: orgClock(q),
        lastSeen: Date.now(),
      };
    else Object.assign(r, { name: m.name, callsign: m.callsign, pilotSquadron: m.squadron, stats: m.st, av: m.av });
  };

  const avDraw = () => {
    const b = $('#sqavbox');
    if (b)
      b.innerHTML = okImg(DB.av) ? `<img class="sqav big" src="${DB.av}" alt="">` : '<span class="sqav big"></span>';
  };
  const avDone = () => {
    avDraw();
    DB.squads.forEach(q => {
      mkMe(q);
      q.roster[DB.uid].ts = orgClock(q);
      const w = swarms.get(q.id);
      if (w) w.broadcast({ k: 'hello2', ...me() });
    });
    save();
    drawAll();
  };

  // ----- direct session (two codes swapped by hand) -----
  const S = createSession({
    me,
    stun: () => !!DB.stun,
    turn: () => parseTurn(DB.turn),
    onChange: () => drawSession(),
    onMission: m => onRecv(m, m.who, ''),
  });

  // ----- the swarms: one per squadron -----
  const meta = q => ({
    name: q.name,
    motto: q.motto,
    notes: q.notes,
    owner: q.owner,
    leader: q.leader,
    mc: q.mc || '',
    logo: q.logo || '',
    ts: q.ts,
  });
  function swarmStart(q) {
    swarmStop(q.id);
    if (typeof RTCPeerConnection == 'undefined') return;
    const sw = createSwarm({
      secret: q.secret,
      me,
      stun: !!DB.stun,
      turn: parseTurn(DB.turn),
      trackers: trackerList(),
      WS: (deps.swarm && deps.swarm.WS) || globalThis.WebSocket,
      interval: (deps.swarm && deps.swarm.interval) || 25000,
      jitter: deps.swarm ? 0 : START_JITTER,
      allow: uid => !(q.roster[uid] && q.roster[uid].removed),
      onPeer: (p, ev) => {
        if (ev == 'joined') {
          const r = q.roster[p.uid],
            pr = p.profile,
            now = Date.now();
          if (!r) {
            q.roster[p.uid] = {
              uid: p.uid,
              name: pr.name,
              callsign: pr.callsign,
              pilotSquadron: pr.squadron,
              stats: pr.st,
              av: okImg(pr.av) ? pr.av : '',
              role: '',
              notes: '',
              ts: now,
              lastSeen: now,
            };
            say(label(pr) + ' joined ' + q.name + '.');
          } else {
            Object.assign(r, {
              name: pr.name || r.name,
              callsign: pr.callsign || r.callsign,
              pilotSquadron: pr.squadron || r.pilotSquadron,
              stats: pr.st || r.stats,
              av: okImg(pr.av) ? pr.av : r.av,
              lastSeen: now,
            });
            say(label(pr) + ' is online (' + q.name + ').');
          }
          p.link.send(syncMsg(meta(q), q.roster, q.org));
          save();
        } else if (q.roster[p.uid]) {
          q.roster[p.uid].lastSeen = Date.now();
          say(label(p.profile) + ' went offline (' + q.name + ').');
          save();
        }
        drawAll();
      },
      onMessage: (p, m) => {
        if (m.k == 'sync') {
          let ch = false;
          if (m.squad && (m.squad.ts || 0) > (q.ts || 0)) {
            // the commander can change (he hands over the command, or the mission commander gives the seat back): the newest news wins
            Object.assign(q, {
              name: m.squad.name,
              motto: m.squad.motto,
              notes: m.squad.notes,
              owner: m.squad.owner || q.owner,
              leader: m.squad.leader || '',
              mc: typeof m.squad.mc == 'string' ? m.squad.mc : '',
              logo: okImg(m.squad.logo) ? m.squad.logo : '',
              ts: m.squad.ts,
            });
            ch = true;
          }
          if (!q.owner && m.squad && m.squad.owner) {
            q.owner = m.squad.owner;
            ch = true;
          }
          const r = mergeRoster(q.roster, m.roster);
          if (r.changed) {
            q.roster = r.roster;
            ch = true;
          }
          if (m.org) {
            const g = mergeOrg(q.org || newOrg(), m.org);
            if (g.changed) {
              q.org = g.org;
              ch = true;
            }
          }
          if (q.roster[DB.uid] && q.roster[DB.uid].removed) {
            leave(q, 'You were removed from ' + q.name + ' by its leader.');
            return;
          }
          if (ch) {
            save();
            drawAll();
          }
          if (m.lite) {
            // the roster came without the pictures: ask this pilot for the ones missing here
            const need = avNeeded(q.roster, m.roster, avPending(q.id));
            if (need.length) p.link.send({ k: 'avq', uids: need });
          }
        } else if (m.k == 'avq') {
          (async () => {
            for (const a of avServe(q.roster, m.uids)) if (!(await p.link.send(a))) break;
          })();
        } else if (m.k == 'av') {
          if (avAccept(q.roster, m)) {
            avPending(q.id).delete(m.uid);
            laterSave();
          }
        } else if (m.k == 'hello2') {
          const r = q.roster[p.uid];
          if ((r && okImg(m.av)) || (r && !m.av)) {
            r.av = m.av || '';
            drawAll();
          }
        } else if (m.k == 'mission') onRecv(m, p.profile, q.name);
        else if (m.k == 'gone') {
          if (q.owner && p.uid == q.owner) leave(q, 'The leader deleted the squadron ' + q.name + '.');
        } else if (m.k == 'error') {
          S.err = m.text;
          drawSession();
        }
      },
      onChange: () => drawAll(),
    });
    swarms.set(q.id, sw);
    sw.start();
    say('Looking for the pilots of ' + q.name + '…');
  }
  function swarmStop(id) {
    const w = swarms.get(id);
    if (w) {
      w.stop();
      swarms.delete(id);
    }
  }
  const trackerList = () => {
    if (deps.swarm && deps.swarm.trackers) return deps.swarm.trackers;
    const l = parseTrackers(deps.trackers && deps.trackers());
    return l.length ? l : TRACKERS;
  };
  const startAll = () => {
    DB.squads.forEach(swarmStart);
    DB.gone = (DB.gone || []).filter(g => Date.now() - g.ts < 120 * 864e5);
    [...gsw.values()].forEach(w => w.stop());
    gsw.clear();
    DB.gone.forEach(goneStart);
  };
  // pictures asked for (per squadron) and a save that waits a moment, because many pictures can arrive one after the other
  const avAsk = new Map();
  const avPending = id => avAsk.get(id) || avAsk.set(id, new Map()).get(id);
  let avT = 0,
    avLate = false;
  const laterSave = () => {
    clearTimeout(avT);
    avLate = true;
    avT = setTimeout(() => {
      avLate = false;
      save();
      drawAll();
    }, 800);
  };
  // closing the program: what waits for its few hundred milliseconds is handed to the store now
  const flush = () => {
    if (avLate) {
      clearTimeout(avT);
      avLate = false;
      save();
    }
    if (savePending) {
      clearTimeout(saveT);
      writeNow();
    }
  };
  const pushSync = q => {
    const w = swarms.get(q.id);
    if (w) w.broadcast(syncMsg(meta(q), q.roster, q.org));
  };
  // every time stamp of a change goes through orgClock: never before what this pilot has already seen (a late clock must not lose)
  const touchSquad = q => {
    q.ts = orgClock(q);
    save();
    pushSync(q);
  };
  const touchMember = (q, uid, f) => {
    const r = q.roster[uid];
    if (!r) return;
    f(r);
    r.ts = orgClock(q);
    save();
    pushSync(q);
  };
  // one change of the organisation made by this pilot (see orgReduce for the rules); {ok:false, error} when it is not allowed
  // what an action would do, asked to the rules with the same actor and clock as orgAct, without changing anything (the board asks it while a pilot is dragged)
  const orgTry = (q, a) => {
    if (!q) return { ok: false, error: 'No squadron.' };
    const sw = swarms.get(q.id),
      online = new Set(sw ? sw.online().map(p => p.uid) : []);
    online.add(DB.uid);
    const ctx = { now: orgClock(q), rid: () => randHex(6), online };
    return typeof a == 'function' ? a(q, DB.uid, ctx) : orgReduce(q, DB.uid, a, ctx);
  };
  const orgAct = (q, a) => {
    const r = orgTry(q, a);
    if (!q) return r;
    if (!r.ok || r.q === q) return r;
    Object.assign(q, { org: r.q.org, owner: r.q.owner, mc: r.q.mc, roster: r.q.roster, ts: r.q.ts });
    save();
    pushSync(q);
    drawAll();
    return r;
  };
  function leave(q, why) {
    swarmStop(q.id);
    DB.squads = DB.squads.filter(x => x !== q);
    if (DB.cur == q.id) DB.cur = DB.squads[0] ? DB.squads[0].id : '';
    save();
    say(why || 'You left ' + q.name + '.');
    if (why && deps.toast) deps.toast(why);
    drawAll();
  }
  // deleting a squadron: the pilots online are told at once; the others when they next come online (the program keeps a small watch on the old squadron for 120 days)
  const gsw = new Map();
  function goneStart(g) {
    if (gsw.has(g.secret) || typeof RTCPeerConnection == 'undefined') return;
    const sw = createSwarm({
      secret: g.secret,
      me,
      stun: !!DB.stun,
      turn: parseTurn(DB.turn),
      trackers: trackerList(),
      WS: (deps.swarm && deps.swarm.WS) || globalThis.WebSocket,
      interval: (deps.swarm && deps.swarm.interval) || 25000,
      jitter: deps.swarm ? 0 : START_JITTER,
      onPeer: (p, ev) => {
        if (ev == 'joined') p.link.send({ k: 'gone' });
      },
    });
    gsw.set(g.secret, sw);
    sw.start();
  }
  async function deleteSquad(q) {
    if (
      !(await confirm(
        'Delete the squadron "' +
          q.name +
          '"?\n\nIt is removed for all its pilots: those online now at once, the others the next time they come online. No file on your computer is deleted.'
      ))
    )
      return;
    const w = swarms.get(q.id);
    if (w) w.broadcast({ k: 'gone' });
    const g = { secret: q.secret, name: q.name, ts: Date.now() };
    DB.gone = [...(DB.gone || []), g];
    save();
    setTimeout(() => {
      leave(q, 'Squadron "' + q.name + '" deleted.');
      goneStart(g);
    }, 400);
  }
  const kick = (q, uid) => {
    const r = q.roster[uid];
    if (!r) return;
    const p = swarms.get(q.id) && swarms.get(q.id).byUid(uid);
    const t = orgClock(q);
    r.removed = true;
    r.ts = t;
    if (q.leader == uid) {
      q.leader = '';
      q.ts = t;
    }
    if (q.mc == uid) {
      q.mc = '';
      q.ts = t;
    }
    save();
    pushSync(q);
    say(label(r) + ' was removed from ' + q.name + '.');
    if (p) setTimeout(() => p.link.close(), 800);
    drawAll();
  };

  // ----- my pilot (logbook) -----
  const pilotBox = () => {
    const b = $('#sqpilot');
    if (!b) return;
    if (!pilot) {
      b.innerHTML = `<div class="hint">${esc(lbkErr || 'No logbook read yet.')}</div>`;
      return;
    }
    const t = pilot.stats,
      d = t && t.dog,
      c = t && t.camp,
      rk = t ? t.rank : -1;
    const tile = (v, l, tip) => `<div${tip ? ` title="${esc(tip)}"` : ''}><b>${v}</b><span>${l}</span></div>`,
      grp = (h, tiles) => `<div class="pilg"><h4>${h}</h4><div class="sqcards">${tiles}</div></div>`;
    const sub = [RANKS[rk], pilot.squadron, t && t.commissioned ? 'commissioned ' + t.commissioned : '']
      .filter(Boolean)
      .map(esc)
      .join(' · ');
    let h = `<div class="pilhead">${t ? rankSvg(rk) : ''}<div class="pilname"><b>${esc(pilot.callsign || '—')}</b><span>${esc(pilot.name || '—')}</span><div class="hint" style="min-height:0">${sub}${pilot.motto ? ` · <i>“${esc(pilot.motto)}”</i>` : ''}</div></div></div>`;
    if (t) {
      h += grp(
        'Flying',
        tile(t.hours.toFixed(1), 'Hours') +
          tile(t.missions, 'Missions') +
          tile(t.score, 'Score') +
          tile(t.ace.toFixed(3), 'Ace factor')
      );
      h += grp(
        'Kills',
        tile(t.aa, 'Air-to-air') + tile(t.ag, 'Air-to-ground') + tile(t.st, 'Static') + tile(t.nav, 'Naval')
      );
      h += grp(
        'Dogfights',
        tile(d.won + ' / ' + d.lost, 'Won / lost') +
          tile(d.kills + ' / ' + d.deaths, 'Kills / deaths') +
          tile(d.onWon + ' / ' + d.onLost, 'Online won / lost', 'Dogfights flown online') +
          tile(d.onKills + ' / ' + d.onDeaths, 'Online kills / deaths', 'Dogfights flown online')
      );
      h += grp(
        'Campaigns',
        tile(
          t.campaigns.join(' / '),
          'Campaigns',
          'The three campaign counters of the logbook, in the order of the file'
        ) +
          tile(c.killed, 'Times killed') +
          tile(c.killedByHuman, '… by a human pilot') +
          tile(c.killedBySelf, '… by self') +
          tile(c.human, 'Human pilots killed') +
          tile(c.frat, 'Friendly kills') +
          tile(c.sinceFrat, 'Missions since the last friendly kill')
      );
      h += `<div class="pilg"><h4>Medals</h4><div class="sqmed">${MEDALS.map((n, i) => `<div class="sqmd${t.medals[i] ? '' : ' no'}" title="${esc(n)}: ${t.medals[i]}">${medalSvg(i, 'p')}<b>${t.medals[i] ? '× ' + t.medals[i] : '—'}</b><span>${esc(n)}</span></div>`).join('')}</div></div>`;
    }
    b.innerHTML = h;
  };
  async function readLbk(name, u8) {
    try {
      pilot = parseLbk(u8 || (await deps.lbk.read(name)));
      DB.lbk = name;
      if (!DB.cs) DB.cs = pilot.callsign;
      lbkErr = '';
      if ($('#sqcs')) $('#sqcs').value = DB.cs;
      DB.squads.forEach(q => {
        mkMe(q);
        q.roster[DB.uid].ts = orgClock(q);
        pushSync(q);
      });
      save();
    } catch (e) {
      pilot = null;
      lbkErr = String((e && e.message) || e);
    }
    pilotBox();
    drawAll();
  }
  async function loadLbks() {
    let names = [];
    try {
      names = deps.lbk ? lbkChoices(await deps.lbk.list()) : [];
    } catch (e) {
      names = [];
    }
    const sel = $('#sqlbk');
    sel.innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
    sel.style.display = names.length > 1 ? '' : 'none';
    if (!names.length) {
      lbkErr = deps.lbk
        ? 'No personal logbook (.lbk, other than the default Viper.lbk) in the Config folder of Falcon BMS: use "Open logbook…".'
        : 'Use "Open logbook…" and pick your .lbk file (User\\Config of Falcon BMS).';
      pilotBox();
      return;
    }
    const pick = names.includes(DB.lbk) ? DB.lbk : names[0];
    sel.value = pick;
    await readLbk(pick);
  }

  // ----- MEMBERS: the roster -----
  // compact roster on the left of the Members page: search, online dot, leader tag; a click shows the pilot in the table
  // ---- the members table: search, filter, sort, and only the first rows of a big squadron ----
  let memCtx = null,
    findT = 0;
  const mem = { filter: 'all', sort: 'online', limit: 40 };
  const MEM_STEP = 40;
  // the flight of a pilot with his roles, for the table
  const flightCell = (ov, q, uid) => {
    const s = ov.seat[uid],
      p = s && ov.packages.find(x => x.id === s.pk),
      f = p && p.flights.find(x => x.id === s.fl),
      tags = [
        uid === q.mc ? 'MISSION CMD' : '',
        ov.packages.some(x => x.lead === uid) ? 'PACKAGE LEAD' : '',
        f && f.lead === uid ? 'LEAD' : '',
      ].filter(Boolean);
    return (
      (f ? esc(p.n + ' · ' + f.n) : '—') +
      tags
        .map(t => ` <span class="ogtag ${t == 'LEAD' ? 'fl' : t == 'PACKAGE LEAD' ? 'pk' : 'mc'}">${t}</span>`)
        .join('')
    );
  };
  function drawTable() {
    const c = memCtx,
      tb = $('#sqtabbox');
    if (!c || !tb) return;
    if (typing(tb)) {
      late(tb);
      return;
    }
    const { q, list, onUid, m, row } = c,
      ov = orgView(q),
      f = (($('#sqfind') && $('#sqfind').value) || '').trim().toLowerCase();
    const flts = ov.packages.flatMap(p => p.flights.map(x => [x.id, p.n + ' · ' + x.n])),
      opts = [
        ['all', 'All pilots'],
        ['online', 'Online'],
        ['offline', 'Offline'],
        ...(flts.length ? [['free', 'No flight'], ...flts] : []),
      ];
    if (!opts.some(o => o[0] == mem.filter)) mem.filter = 'all';
    const sel = $('#sqflt');
    if (sel)
      sel.innerHTML = opts
        .map(o => `<option value="${esc(o[0])}"${o[0] == mem.filter ? ' selected' : ''}>${esc(o[1])}</option>`)
        .join('');
    const srt = $('#sqsrt');
    if (srt) srt.value = mem.sort;
    const isOn = u => u == DB.uid || onUid.has(u);
    let all = orderRoster(q, [q.roster[DB.uid] || { uid: DB.uid }, ...list], onUid);
    const total = all.length;
    all = all.filter(r => {
      const x = r.uid == DB.uid ? m : r;
      if (f && !((x.callsign || '') + ' ' + (x.name || '')).toLowerCase().includes(f)) return false;
      if (mem.filter == 'online') return isOn(r.uid);
      if (mem.filter == 'offline') return !isOn(r.uid);
      if (mem.filter == 'free') return !ov.seat[r.uid];
      if (mem.filter != 'all') return !!ov.seat[r.uid] && ov.seat[r.uid].fl == mem.filter;
      return true;
    });
    const nm = r => String((r.uid == DB.uid ? m.callsign : r.callsign) || (r.uid == DB.uid ? m.name : r.name) || '');
    if (mem.sort == 'callsign') all.sort((a, b) => nm(a).localeCompare(nm(b)));
    else if (mem.sort == 'seen')
      all.sort((a, b) => (isOn(b.uid) ? Infinity : b.lastSeen || 0) - (isOn(a.uid) ? Infinity : a.lastSeen || 0));
    else if (mem.sort == 'flight') {
      const ix = new Map(ov.packages.flatMap(p => p.flights).map((x, i) => [x.id, i]));
      const k = r => (ov.seat[r.uid] ? ix.get(ov.seat[r.uid].fl) : 1e6);
      all.sort((a, b) => k(a) - k(b) || nm(a).localeCompare(nm(b)));
    }
    const shown = all.slice(0, mem.limit);
    $('#sqshown') &&
      ($('#sqshown').textContent = all.length == total ? total + ' pilots' : all.length + ' of ' + total + ' pilots');
    const back = formKeep(tb);
    tb.innerHTML = `<table class="sqt"><thead><tr><th></th><th>Pilot</th><th>Flight</th><th>Logbook</th><th>Role</th><th>Notes</th><th>Seen</th><th></th></tr></thead><tbody id="sqros">${shown.map(r => row(r, r.uid == DB.uid)).join('')}</tbody></table>
      ${all.length > shown.length ? `<div class="bar" style="margin-top:6px"><button class="btn g" id="sqmore">Show ${Math.min(MEM_STEP, all.length - shown.length)} more (${all.length - shown.length} left)</button></div>` : ''}
      ${!all.length ? '<div class="hint">No pilot found.</div>' : list.length ? '' : '<div class="hint">Nobody else yet: give your invite code to the pilots.</div>'}`;
    back();
    const more = $('#sqmore');
    if (more)
      more.onclick = () => {
        mem.limit += MEM_STEP;
        drawTable();
      };
    tb.querySelectorAll('tr[data-uid]').forEach(tr => {
      const uid = tr.dataset.uid;
      tr.querySelectorAll('input[data-f]').forEach(
        i =>
          (i.onchange = () => {
            i.defaultValue = i.value; // saved: it is not "typed and waiting" any more
            mkMe(q);
            touchMember(q, uid, r => {
              r[i.dataset.f] = i.value;
            });
          })
      );
      const ld = tr.querySelector('[data-lead]');
      if (ld)
        ld.onclick = () => {
          q.leader = q.leader == uid ? '' : uid;
          touchSquad(q);
          drawAll();
        };
      const sd = tr.querySelector('[data-send]');
      if (sd)
        sd.onclick = () => {
          const p = swarms.get(q.id) && swarms.get(q.id).byUid(uid);
          if (!p) return result(false, 'Mission not sent', 'This pilot is not online any more.');
          sendFlow([toTarget(q.id, p)]);
        };
    });
    drawList(q, list, onUid, m);
  }
  function drawList(q, list, onUid, m) {
    const box = $('#sqlist');
    if (!box) return;
    const all = orderRoster(q, [q.roster[DB.uid] || { uid: DB.uid }, ...list], onUid),
      f = (($('#sqfind') && $('#sqfind').value) || '').trim().toLowerCase();
    $('#sqcount').textContent = onUid.size + 1 + ' online · ' + all.length + ' member' + (all.length == 1 ? '' : 's');
    const shown = all.filter(r => {
      const isMe = r.uid == DB.uid,
        x = isMe ? m : r;
      return !f || ((x.callsign || '') + ' ' + (x.name || '')).toLowerCase().includes(f);
    });
    box.innerHTML =
      shown
        .slice(0, 60)
        .map(r => {
          const isMe = r.uid == DB.uid,
            x = isMe ? m : r,
            o = isMe || onUid.has(r.uid);
          return `<div class="sqrow" data-pick="${esc(r.uid)}">${okImg(isMe ? m.av : r.av) ? `<img class="sqav" src="${isMe ? m.av : r.av}" alt="">` : '<span class="sqav"></span>'}<span class="sqrn"><b>${esc(x.callsign || '—')}</b>${isMe ? ' <em>(you)</em>' : ''}${q.owner == r.uid ? ' <span class="sqace" title="Created the squadron">COMMANDER</span>' : ''}<div class="hint" style="min-height:0">${esc(
            [
              x.name,
              (isMe ? m.st : r.stats)
                ? statLine(isMe ? m.st : r.stats)
                    .split(' · ')
                    .slice(0, 2)
                    .join(' · ')
                : '',
            ]
              .filter(Boolean)
              .join(' · ')
          )}</div></span><i class="sqd ${o ? 'connected' : 'closed off'}" title="${o ? 'Online' : 'Offline'}"></i></div>`;
        })
        .join('') || '<div class="hint">No pilot found.</div>';
    if (shown.length > 60)
      box.insertAdjacentHTML(
        'beforeend',
        `<div class="hint">${shown.length - 60} more: type in the search to find them.</div>`
      );
    box.querySelectorAll('[data-pick]').forEach(
      el =>
        (el.onclick = () => {
          let tr = $('#sqtabbox').querySelector('tr[data-uid="' + el.dataset.pick + '"]');
          if (!tr) {
            // hidden by the filter or beyond the first rows of the table: show it
            mem.filter = 'all';
            mem.limit = 1e6;
            drawTable();
            tr = $('#sqtabbox').querySelector('tr[data-uid="' + el.dataset.pick + '"]');
          }
          if (!tr) return;
          $('#sqtabbox')
            .querySelectorAll('tr.sel')
            .forEach(x => x.classList.remove('sel'));
          tr.classList.add('sel');
          tr.scrollIntoView({ block: 'nearest' });
        })
    );
  }
  // Somebody is typing in a field of this box: it is not drawn again (his text and his cursor would be lost) until he leaves the field.
  const typing = box => {
    const a = document.activeElement;
    return !!a && box.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName);
  };
  const late = box => {
    const b = /** @type {any} */ (box);
    if (b._late) return;
    b._late = true;
    box.addEventListener(
      'focusout',
      () =>
        setTimeout(() => {
          b._late = false;
          drawAll();
        }, 0),
      { once: true }
    );
  };
  // Draws a box again without losing what was typed in its fields and not saved yet (and the edit box that was open).
  // Use: `const back = formKeep(box); box.innerHTML = …; back();`
  const formKeep = box => {
    const key = e => {
      const r = e.closest('[data-uid]');
      return e.id || (e.dataset.f && r ? r.dataset.uid + '/' + e.dataset.f : '');
    };
    const fields = () =>
      [...box.querySelectorAll('input,textarea')].filter(e => /** @type {any} */ (e).type != 'file' && key(e));
    const dirty = fields()
        .filter(e => /** @type {any} */ (e).value !== /** @type {any} */ (e).defaultValue)
        .map(e => [key(e), /** @type {any} */ (e).value]),
      open = [...box.querySelectorAll('.sqedit')].filter(e => e.id && !(/** @type {any} */ (e).hidden)).map(e => e.id);
    return () => {
      const now = new Map(fields().map(e => [key(e), /** @type {any} */ (e)]));
      for (const [k, v] of dirty) if (now.has(k)) now.get(k).value = v;
      for (const id of open) {
        const e = /** @type {any} */ (box.querySelector('#' + id));
        if (e) e.hidden = false;
      }
    };
  };
  function drawMembers() {
    const box = $('#sqhead');
    if (!box) return;
    if (typing(box)) {
      late(box);
      return;
    }
    const q = cur();
    if (!q) {
      memCtx = null;
      if ($('#sqtabbox')) $('#sqtabbox').innerHTML = '';
      // nothing of the squadron that was removed stays on the screen
      ['#sqlist', '#sqflt', '#sqshown', '#sqcount'].forEach(i => {
        const e = $(i);
        if (e) e[e.tagName == 'DIV' || e.tagName == 'SELECT' ? 'innerHTML' : 'textContent'] = '';
      });
      if ($('#sqhead3')) $('#sqhead3').textContent = 'My squadrons';
      const back = formKeep(box);
      box.innerHTML =
        '<div class="hint">You are not in a squadron yet: create one or join with an invite code.</div>' +
        startHtml('m');
      back();
      startWire(box, 'm');
      return;
    }
    if ($('#sqhead3')) $('#sqhead3').textContent = 'Squadron';
    const sw = swarms.get(q.id),
      on = sw ? sw.online() : [],
      onUid = new Set(on.map(p => p.uid)),
      m = me(),
      own = owns(q);
    const list = live(q)
      .filter(r => r.uid != DB.uid)
      .sort(
        (a, b) =>
          onUid.has(b.uid) - onUid.has(a.uid) ||
          String(a.callsign || a.name).localeCompare(String(b.callsign || b.name))
      );
    const ov = orgView(q),
      canSend = canSendAll(q),
      flights = ov.packages.some(p => p.flights.length > 0); // with flights the leaders are the flight leads: the star of the mission leader is not shown
    if ($('#sqleg')) $('#sqleg').hidden = flights; // the star exists only while the squadron has no flights
    const row = (r, isMe) => {
      const o = isMe || onUid.has(r.uid),
        ed = own || isMe;
      return `<tr data-uid="${esc(r.uid)}"><td><i class="sqd ${o ? 'connected' : 'closed off'}" title="${o ? 'Online' : 'Offline'}"></i></td><td class="sqpl">${okImg(isMe ? m.av : r.av) ? `<img class="sqav" src="${isMe ? m.av : r.av}" alt="">` : '<span class="sqav"></span>'}<span><b>${esc((isMe ? m.callsign : r.callsign) || '—')}</b>${isMe ? ' <em>(you)</em>' : ''}${q.owner == r.uid ? ' <span class="sqace" title="Created the squadron">COMMANDER</span>' : ''}<div class="hint" style="min-height:0">${esc(isMe ? m.name : r.name || '')}</div></span></td><td class="sqs">${flightCell(ov, q, r.uid)}</td><td class="sqs">${esc(statLine(isMe ? m.st : r.stats))}</td>
      <td><input data-f="role" value="${esc(r.role || '')}" placeholder="Role"${ed ? '' : ' disabled'}></td><td><input data-f="notes" value="${esc(r.notes || '')}" placeholder="Notes"${ed ? '' : ' disabled'}></td><td class="sqs">${o ? 'online' : esc(ago(r.lastSeen))}</td>
      <td class="sqa">${flights ? '' : `<button class="btn g ${q.leader == r.uid ? 'gn' : ''}" data-lead title="${own ? 'Mission leader: the pilot who sends the mission to the others' : 'Mission leader'}"${own ? '' : ' disabled'}>${q.leader == r.uid ? '★ Mission leader' : '☆'}</button>`}${!isMe && o ? `<button class="btn g gn" data-send title="Send the mission to this pilot"${canSend ? '' : ' disabled'}>Send mission</button>` : ''}</td></tr>`;
    };
    const back = formKeep(box);
    box.innerHTML = `<div class="bar" style="margin-bottom:8px"><select id="sqsel" ${DB.squads.length > 1 ? '' : 'style="display:none"'}>${DB.squads.map(x => `<option value="${esc(x.id)}"${x.id == q.id ? ' selected' : ''}>${esc(x.name)}${owns(x) ? ' (yours)' : ''}</option>`).join('')}</select></div>
      <div class="sqhead">${okImg(q.logo) ? `<img class="sqlogo" src="${q.logo}" alt="">` : '<span class="sqlogo"></span>'}<div class="sqtt"><div class="sqtitle" id="sqtitle">${esc(q.name)}</div><div class="hint" id="sqmottot" style="min-height:0">${esc(q.motto || (own ? 'No motto yet' : ''))}</div></div></div>
      ${own ? `<div class="sqedit" id="sqedit" hidden><input id="sqname" value="${esc(q.name)}" maxlength="40" placeholder="Name of the squadron"><input id="sqmotto" value="${esc(q.motto || '')}" placeholder="Motto" maxlength="80"><button class="btn g gn" id="sqeditok">Save</button><button class="btn g" id="sqeditx">Cancel</button></div>` : ''}
      <textarea id="sqnotes" rows="2" placeholder="Information about the squadron (briefing place, Discord, schedule …)"${own ? '' : ' disabled'}>${esc(q.notes || '')}</textarea>
      <div class="sqstat" id="sqstat">${sw ? (sw.trackers ? sw.trackers + ' tracker' + (sw.trackers == 1 ? '' : 's') + ' connected · ' + on.length + ' pilot' + (on.length == 1 ? '' : 's') + ' online' : 'Connecting to the trackers…') : 'Not connected'}</div>
      <div class="bar" style="margin-top:10px"><button class="btn g gn" id="sqcopyinv">Copy the invite code</button>${own ? '<button class="btn g" id="sqrename">Rename…</button><button class="btn g" id="sqlogo">Squadron logo…</button>' + (q.logo ? '<button class="btn g" id="sqlogox">Remove the logo</button>' : '') + '<button class="btn g rd" id="sqdelete">Delete the squadron</button>' : ''}</div>`;
    back();
    memCtx = { q, list, onUid, m, row };
    drawTable();
    $('#sqsel').onchange = e => {
      DB.cur = e.target.value;
      save();
      drawAll();
    };
    const st = (id, f) => {
      $(id).onchange = e => {
        e.target.defaultValue = e.target.value; // saved
        q[f] = e.target.value;
        touchSquad(q);
      };
    };
    st('#sqnotes', 'notes');
    if (own) {
      $('#sqrename').onclick = () => {
        $('#sqedit').hidden = false;
        $('#sqname').focus();
        $('#sqname').select();
      };
      $('#sqeditx').onclick = () => {
        $('#sqedit').hidden = true;
      };
      $('#sqeditok').onclick = () => {
        const n = $('#sqname').value.trim();
        if (!n) {
          $('#sqname').focus();
          return;
        }
        q.name = n.slice(0, 40);
        q.motto = $('#sqmotto').value.trim().slice(0, 80);
        touchSquad(q);
        drawAll();
      };
      $('#sqdelete').onclick = () => deleteSquad(q);
    }
    $('#sqcopyinv').onclick = async () => copy(await squadInvite(q));
    if (own) {
      $('#sqlogo').onclick = () => $('#sqlogofile').click();
      const lx = $('#sqlogox');
      if (lx)
        lx.onclick = () => {
          q.logo = '';
          touchSquad(q);
          drawAll();
        };
    }
  }
  function drawMis() {
    const box = $('#sqrecv');
    if (!box) return;
    box.innerHTML = recv.length
      ? recv
          .map(
            (r, i) =>
              `<div class="sqm"><span><b>${esc(r.name)}</b> from ${esc(r.from)}${r.squad ? ' · ' + esc(r.squad) : ''}</span><button class="btn g gn" data-load="${i}">Load</button></div>`
          )
          .join('')
      : '<div class="hint">No mission received.</div>';
    box.querySelectorAll('[data-load]').forEach(
      b =>
        (b.onclick = async () => {
          const r = recv[+b.dataset.load];
          try {
            const ok = await deps.loadMission(r.text);
            say('Mission "' + r.name + '" ' + (ok === false ? 'not opened.' : 'loaded.'));
          } catch (e) {
            S.err = String((e && e.message) || e);
          }
          drawSession();
        })
    );
  }

  // ----- MEMBERS: the squadron of the player in the campaign -----
  function drawCamp() {
    const box = $('#sqcamp');
    if (!box) return;
    const C = deps.campaign && deps.campaign(),
      list = campaignSquadrons(C),
      s = list.find(x => x.mine);
    if (!s && C && C.isTe) {
      box.innerHTML =
        '<div class="hint">Tactical Engagement: there is no player squadron and no campaign record (kills, losses, missions).</div>';
      return;
    }
    if (!s) {
      box.innerHTML =
        '<div class="hint">Open a campaign (Map or Datacard tab) to see the squadron of the player: base, losses, missions and kills.</div>';
      return;
    }
    const info = (deps.squadInfo && deps.squadInfo(s.u)) || {},
      k = s.kills,
      q = s.sqs,
      n = v => (v === undefined || v === null ? '—' : esc(v));
    box.innerHTML = `<div style="overflow-x:auto"><table class="dt sqdt"><tr><th rowspan="2">Squadron</th><th colspan="4" class="gc">Squadron</th><th colspan="3" class="gc">Losses and missions</th><th colspan="5" class="gf">Kills</th></tr>
      <tr><th class="gc">Owner</th><th class="gc">Base</th><th class="gc">Pilots</th><th class="gc">Aces</th><th class="gc">Missions</th><th class="gc">Aircraft lost</th><th class="gc">Pilots lost</th><th class="gf">A-A</th><th class="gf">A-G</th><th class="gf">Naval</th><th class="gf">Stationary</th><th class="gf">Share</th></tr>
      <tr><td><b>${esc(s.name)}</b></td><td>${n(info.owner)}</td><td>${n(info.base)}</td><td>${s.pilotsN}</td><td>${s.aces.length}</td><td>${n(q && q.missions)}</td><td>${n(q && q.acLoss)}</td><td>${n(q && q.pilotLoss)}</td><td>${k.aa}</td><td>${k.ag}</td><td>${k.as}</td><td>${k.an}</td><td>${Math.round(s.share * 1000) / 10}%</td></tr></table></div>
      <div class="hint">Kills are the sum of the pilot records of the squadron (aces: 5 or more air kills). Aircraft, experience, morale, supply and mission rating are not read yet.</div>`;
  }

  // ----- ME: my squadrons -----
  // create a squadron or join one with an invite code: shown in My squadrons (Me) and, while there is no squadron, in Members (k tells them apart)
  const startHtml = k =>
    `<div class="sqone"><input id="sqnew${k}" placeholder="Create: name of the new squadron" maxlength="40"><button class="btn g gn" id="sqcreate${k}">Create</button></div>
      <div class="sqone"><input id="sqinvin${k}" placeholder="Join: squadron invite code (BCS.…)"><button class="btn g gn" id="sqjoinsq${k}">Join</button></div><div class="err" id="sqsqerr${k}"></div>`;
  const startWire = (root, k) => {
    const g = id => root.querySelector('#' + id + k);
    g('sqcreate').onclick = () => {
      const q = newSquadron(g('sqnew').value, DB.uid);
      mkMe(q);
      DB.squads.push(q);
      DB.cur = q.id;
      save();
      swarmStart(q);
      g('sqnew').value = '';
      drawAll();
      say('Squadron "' + q.name + '" created.');
    };
    g('sqjoinsq').onclick = async () => {
      try {
        const q = await readSquadInvite(g('sqinvin').value);
        if (DB.squads.some(x => x.secret == q.secret)) throw new Error('You are already in this squadron.');
        q.id = randHex(4);
        q.roster = {};
        q.mc = '';
        q.org = newOrg();
        mkMe(q);
        DB.squads.push(q);
        DB.cur = q.id;
        save();
        swarmStart(q);
        g('sqinvin').value = '';
        drawAll();
        say('You joined ' + q.name + '.');
      } catch (e) {
        g('sqsqerr').textContent = String((e && e.message) || e);
      }
    };
  };
  function drawMine() {
    const box = $('#sqmine');
    if (!box) return;
    if (typing(box)) {
      late(box);
      return;
    }
    const rows = DB.squads
      .map(q => {
        const sw = swarms.get(q.id),
          on = sw ? sw.online().length : 0,
          own = owns(q),
          mem = live(q).filter(r => r.uid != DB.uid);
        return `<div class="sqsqr" data-sid="${esc(q.id)}"><div class="sqm"><span><b>${esc(q.name)}</b> <em>${own ? 'you created it' : 'member'} · ${live(q).length} pilot${live(q).length == 1 ? '' : 's'} · ${on} online</em></span><button class="btn g bl" data-inv title="Copy the invite code of this squadron">Invite</button><button class="btn g" data-open title="Show this squadron in Members and Organization">Open</button>${own && q.mc && q.roster[q.mc] ? `<button class="btn g rd sm" data-handleave title="You leave the squadron and the mission commander becomes the commander">Leave · hand to ${esc(label(q.roster[q.mc]))}</button>` : ''}<button class="btn g rd" data-leave>${own ? 'Delete' : 'Leave'}</button></div>
      ${own && mem.length ? `<details class="sqmod"><summary>Moderation</summary><div class="hint">Remove a pilot from this squadron (he can no longer join with the invite code).</div>${mem.map(r => `<div class="sqm" data-uid="${esc(r.uid)}"><i class="sqd ${sw && sw.byUid(r.uid) ? 'connected' : 'closed off'}"></i><span>${esc(label(r))}</span><button class="btn g rd" data-kick>Remove</button></div>`).join('')}</details>` : ''}</div>`;
      })
      .join('');
    const back = formKeep(box);
    box.innerHTML = (rows || '<div class="hint">You are not in any squadron.</div>') + startHtml('');
    back();
    box.querySelectorAll('.sqsqr').forEach(el => {
      const q = DB.squads.find(x => x.id == el.dataset.sid);
      el.querySelector('[data-open]').onclick = () => {
        DB.cur = q.id;
        DB.tab = 'members';
        save();
        drawAll();
      };
      el.querySelector('[data-inv]').onclick = async () => copy(await squadInvite(q));
      const hl = el.querySelector('[data-handleave]');
      if (hl) hl.onclick = () => leaveHandover(q);
      el.querySelector('[data-leave]').onclick = async () => {
        if (owns(q)) {
          deleteSquad(q);
          return;
        }
        if (
          await confirm(
            'Leave the squadron "' +
              q.name +
              '"?\n\nYou stop seeing its members and receiving its missions. No file on your computer is deleted, and you can come back with the invite code.' +
              (owns(q) ? '' : '')
          )
        ) {
          const r = orgAct(q, { t: 'leave' }); // the seat is freed for the others before the links close
          if (r.ok) setTimeout(() => leave(q), 400);
          else leave(q);
        }
      };
      el.querySelectorAll('[data-kick]').forEach(
        b =>
          (b.onclick = async () => {
            const uid = b.closest('[data-uid]').dataset.uid;
            if (await confirm('Remove ' + label(q.roster[uid]) + ' from "' + q.name + '"?')) kick(q, uid);
          })
      );
    });
    startWire(box, '');
  }

  // ----- SETTINGS -----
  const trk = (sw, u) => {
    const i = sw && (sw.tinfo[u] || sw.tinfo[u.replace(/\/$/, '')] || sw.tinfo[u + '/']);
    return i ? (i.fail ? ' · refused: ' + esc(i.fail) : ' · ' + i.peers + ' in the swarm') : ' · no reply yet';
  };
  const diagBox = () => {
    const all = [...swarms.values()];
    if (!all.length) return '';
    const D = all.reduce(
      (a, w) => {
        for (const k of ['sent', 'recv', 'ans', 'ansRecv', 'open', 'closed', 'ok', 'wrong']) a[k] += w.diag[k];
        a.badhash += w.diag.badhash || 0;
        for (const [k, v] of Object.entries(w.diag.ice)) a.ice[k] = (a.ice[k] || 0) + v;
        return a;
      },
      { sent: 0, recv: 0, ans: 0, ansRecv: 0, open: 0, closed: 0, ok: 0, wrong: 0, badhash: 0, ice: {} }
    );
    const ice =
      Object.entries(D.ice)
        .map(([k, v]) => k + ' ' + v)
        .join(', ') || '—';
    const sizes = all.flatMap(w => Object.values(w.tinfo).map(i => i.peers)),
      alone = sizes.length && Math.max(...sizes) <= 1;
    const why = D.ok
      ? 'Pilots found and connected.'
      : alone
        ? 'The trackers see only you in this squadron: the other pilots are not online right now, or joined with a different invite code (copy it whole and join again).'
        : !D.recv && !D.ansRecv
          ? 'The trackers see other pilots but none has answered yet: wait a minute; if it persists the trackers may be dropping the offers (try other trackers in Settings).'
          : !D.open
            ? 'Pilots were found but the direct connection did not open: a router or a mobile network (CGNAT) is blocking it. Add a TURN server below.'
            : D.wrong
              ? 'A connection opened but the squadron code does not match.'
              : 'Connection opened but the pilot was not verified yet.';
    return `<div class="sqdiag"><b>Diagnostics</b> <span class="hint" style="min-height:0">${esc(why)}</span><div class="hint" style="min-height:0">offers sent ${D.sent} · offers received ${D.recv} · answers sent ${D.ans} · answers received ${D.ansRecv} · links opened ${D.open} · closed ${D.closed} · verified ${D.ok} · wrong code ${D.wrong}<br>ICE states: ${esc(ice)}${D.badhash ? '<br>Messages of another swarm: ' + D.badhash : ''}${all.some(w => w.diag.err) ? '<br>Last error: ' + esc(all.map(w => w.diag.err).find(Boolean)) : ''}</div></div>`;
  };
  function drawSettings() {
    const inv = $('#sqinvs');
    if (inv) {
      inv.innerHTML = DB.squads.length
        ? '<div class="hint">Give the code of a squadron to the pilots who must join it.</div>' +
          DB.squads
            .map(
              q =>
                `<div class="sqi" data-sid="${esc(q.id)}"><b>${esc(q.name)}</b><textarea rows="2" readonly data-code placeholder="…"></textarea><div class="bar"><button class="btn g gn" data-cp>Copy the invite code</button></div></div>`
            )
            .join('')
        : '<div class="hint">No squadron yet.</div>';
      inv.querySelectorAll('.sqi').forEach(async el => {
        const q = DB.squads.find(x => x.id == el.dataset.sid),
          code = await squadInvite(q);
        el.querySelector('[data-code]').value = code;
        el.querySelector('[data-cp]').onclick = () => copy(code);
      });
    }
    const cn = $('#sqconn');
    if (cn) {
      const l = trackerList(),
        sw = [...swarms.values()][0],
        up = new Set(sw ? sw.socks.filter(w => w.readyState == 1).map(w => w.url.replace(/\/$/, '')) : []);
      cn.innerHTML = `<div class="hint">Trackers in use (the pilots of a squadron find each other through them):</div>${l.map(u => `<div class="sqm"><i class="sqd ${up.has(u.replace(/\/$/, '')) ? 'connected' : 'closed off'}"></i><span>${esc(u)}</span><em>${up.has(u.replace(/\/$/, '')) ? 'connected' + trk(sw, u) : sw ? 'not connected' : '—'}</em></div>`).join('')}<div class="bar" style="margin-top:8px"><button class="btn g" id="sqtrk">Change the trackers in Settings…</button></div>${diagBox()}`;
      $('#sqtrk').onclick = () => deps.openSettings && deps.openSettings();
    }
  }
  const bw = v => (v ? (v >= 1e6 ? (v / 1e6).toFixed(1) + ' Mb/s' : Math.round(v / 1000) + ' kb/s') : '—');
  function drawPb() {
    const box = $('#sqpb');
    if (!box) return;
    if (!PB) {
      box.innerHTML = `<div class="hint">${esc(pbErr || 'No phone book read yet.')}</div>`;
      return;
    }
    box.innerHTML = PB.length
      ? `<table class="sqt"><thead><tr><th>Server</th><th>Address</th><th>Voice</th><th>Download</th><th>Upload</th><th></th></tr></thead><tbody>${PB.map((c, i) => `<tr><td><b>${esc(c.description || 'Contact ' + c.n)}</b></td><td>${esc(c.ip)}</td><td>${esc(c.voice)}${c.voicePwd ? ' 🔒' : ''}</td><td class="sqs">${bw(c.down)}</td><td class="sqs">${bw(c.up)}</td><td class="sqa"><button class="btn g" data-pb="${i}" title="Copy the address of the server">Copy address</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="hint">The phone book has no contacts.</div>';
    box.querySelectorAll('[data-pb]').forEach(b => (b.onclick = () => copy(PB[+b.dataset.pb].ip)));
  }
  async function loadPb() {
    try {
      const t = deps.phonebook ? await deps.phonebook.read() : null;
      if (t != null) {
        PB = parsePhoneBook(t);
        pbErr = '';
      } else
        pbErr = deps.phonebook
          ? 'PhoneBkn.ini not found in the Config folder of Falcon BMS: use "Open phone book…".'
          : 'Use "Open phone book…" and pick PhoneBkn.ini (User\\Config of Falcon BMS).';
    } catch (e) {
      pbErr = 'PhoneBkn.ini could not be read: use "Open phone book…".';
    }
    drawPb();
  }
  function drawSession() {
    if (!$('#sqrole')) return;
    const members = S.links
      .map(
        l =>
          `<div class="sqm"><i class="sqd ${l.state}"></i><span>${esc(label(l.peer) === '…' ? 'Pilot ' + l.id : label(l.peer))}</span><em>${l.state}</em><button class="btn g" data-drop="${l.id}">Remove</button></div>`
      )
      .join('');
    $('#sqrole').textContent =
      S.role == 'lead' ? 'You lead this session' : S.role == 'join' ? 'You joined a session' : 'No session';
    $('#sqlead').style.display = S.role ? 'none' : '';
    $('#sqjoinb').style.display = S.role ? 'none' : '';
    $('#sqend').style.display = S.role ? '' : 'none';
    $('#sqleadp').style.display = S.role == 'lead' ? '' : 'none';
    $('#sqjoinp').style.display = S.role == 'join' ? '' : 'none';
    $('#sqmem').innerHTML = members || '<div class="hint">Nobody connected yet.</div>';
    $('#sqmem')
      .querySelectorAll('[data-drop]')
      .forEach(b => (b.onclick = () => S.drop(b.dataset.drop)));
    $('#sqerr').textContent = S.err || '';
    $('#sqsend').style.display = S.role == 'lead' ? '' : 'none';
    $('#sqsend').disabled = !S.connected;
  }

  const TABS = [
    ['members', 'Members'],
    ['org', 'Organization'],
    ['me', 'Me'],
    ['settings', 'Settings'],
  ];
  const showTab = () => {
    const t = TABS.some(x => x[0] == DB.tab) ? DB.tab : 'members';
    root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab == t));
    root.querySelectorAll('.sqpane').forEach(x => x.classList.toggle('hide', x.dataset.pane != t));
  };
  const drawAll = () => {
    showTab();
    avDraw();
    drawMembers();
    drawOrg();
    drawLost();
    drawMis();
    drawCamp();
    drawMine();
    drawSettings();
    drawSession();
    drawPb();
  };
  const guard = fn => async () => {
    try {
      S.err = '';
      await fn();
    } catch (e) {
      S.err = String((e && e.message) || e);
      say('Error: ' + S.err);
    }
    drawSession();
  };

  // ---- the Organization section ----
  const orgHasFlights = q => orgView(q).packages.some(p => p.flights.length > 0);
  // who may send to everybody: the commanders when the squadron works in flights, else the mission leader (or anybody while none is chosen)
  const canSendAll = q => (orgHasFlights(q) ? isAdmin(q, DB.uid) : !q.leader || q.leader == DB.uid);
  const nameOfIn = q => u => {
    const r = q.roster[u] || (u == DB.uid ? me() : null);
    return (r && (r.callsign || r.name)) || 'Pilot';
  };
  const onlineSet = q => {
    const sw = swarms.get(q.id),
      s = new Set(sw ? sw.online().map(p => p.uid) : []);
    s.add(DB.uid);
    return s;
  };
  let orgPending = false;
  // names offered by the open campaign, TE or mission (null when none is open)
  // the first package and flight name the open mission offers that the squadron does not use yet
  const hintNames = q => {
    const t = hint(),
      v = orgView(q),
      used = new Set(v.packages.map(p => p.n.toLowerCase()));
    return t && !used.has(('Package ' + t.pk).toLowerCase()) ? { pk: 'Package ' + t.pk, fl: t.fl } : null;
  };
  const hint = () => {
    try {
      return (deps.mission && deps.mission.ident && deps.mission.ident()) || null;
    } catch (e) {
      return null;
    }
  };
  function drawOrg() {
    const box = $('#sqorg');
    if (!box) return;
    const q = cur();
    if (!q) {
      box.innerHTML = '<div class="hint">You are not in a squadron yet.</div>';
      return;
    }
    // not while somebody types, chooses or drags in it: it is drawn again when he is done
    const a = document.activeElement;
    if (box.dataset.drag || (a && box.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName))) {
      orgPending = true;
      return;
    }
    orgPending = false;
    mkMe(q);
    box.innerHTML = orgHtml(q, orgView(q), DB.uid, onlineSet(q), esc, nameOfIn(q), hint());
  }
  function drawLost() {
    const box = $('#sqlost');
    if (!box) return;
    const q = cur(),
      a = document.activeElement;
    if (a && box.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName)) return; // not while somebody chooses in it
    box.hidden = !q;
    const h = q ? lostHtml(q, orgView(q), DB.uid, onlineSet(q), esc, nameOfIn(q)) : '';
    box.innerHTML = h;
    box.hidden = !h;
  }
  const sendFlight = fid => {
    const q = cur(),
      f =
        q &&
        orgView(q)
          .packages.flatMap(p => p.flights)
          .find(x => x.id === fid);
    if (!f) return;
    const sw = swarms.get(q.id),
      ps = f.members
        .filter(u => u != DB.uid)
        .map(u => sw && sw.byUid(u))
        .filter(Boolean);
    if (!ps.length) return result(false, 'Mission not sent', 'Nobody of this flight is online.');
    sendFlow(
      ps.map(p => toTarget(q.id, p)),
      { check: m => flightWarning(f.n, m) }
    );
  };
  const leaveHandover = async (sq = cur()) => {
    const q = sq && sq.id ? sq : cur();
    if (!q || q.owner != DB.uid || !q.mc || !q.roster[q.mc]) return;
    const to = nameOfIn(q)(q.mc);
    if (!(await confirm('Leave "' + q.name + '" and hand the command to ' + to + '?'))) return;
    const r = orgAct(q, { t: 'leave' });
    if (!r.ok) return deps.toast ? deps.toast(r.error) : say(r.error);
    setTimeout(() => leave(q, 'You left ' + q.name + ': ' + to + ' is the commander now.'), 600);
  };

  // ---- sending a mission: choose the mission and the DTC groups, then progress / result popups ----
  const pop = (html, wire) => {
    const o = document.createElement('div');
    o.className = 'sqpop';
    o.style.cssText =
      'position:fixed;inset:0;z-index:2100;background:#000b;display:flex;align-items:center;justify-content:center';
    o.innerHTML =
      '<div style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 22px;max-width:560px;width:92%;max-height:86vh;overflow:auto;color:var(--tx);font:13px system-ui,sans-serif;box-shadow:0 10px 30px #000a">' +
      html +
      '</div>';
    const close = () => o.remove();
    wire && wire(o, close);
    document.body.append(o);
    return { o, close };
  };
  const diag = extra =>
    [
      'BMS Cards diagnostics',
      'version: ' + (deps.version || ''),
      'time: ' + new Date().toISOString(),
      'me: ' + JSON.stringify({ callsign: me().callsign, uid: DB.uid }),
      'stun: ' + (DB.stun ? 'yes' : 'no') + ' · turn: ' + (DB.turn ? 'yes' : 'no'),
      'agent: ' + (typeof navigator != 'undefined' ? navigator.userAgent : ''),
      'log:',
      ...log.slice(0, 15),
      extra ? 'detail: ' + extra : '',
    ]
      .filter(Boolean)
      .join('\n');
  const result = (ok, title, text, extra) =>
    pop(
      `<h3 style="margin:0 0 8px;font-size:15px;color:${ok ? 'var(--gn,#4c4)' : 'var(--rd,#e55)'}">${esc(title)}</h3><div style="margin-bottom:12px;white-space:pre-wrap">${esc(text)}</div><div class="bar" style="justify-content:flex-end;gap:8px">${ok ? '' : '<button class="btn g" data-dg>Copy diagnostics</button>'}<button class="btn g gn" data-ok>OK</button></div>`,
      (o, c) => {
        o.querySelector('[data-ok]').onclick = c;
        const d = o.querySelector('[data-dg]');
        if (d) d.onclick = () => copy(diag(extra || text));
      }
    );
  // targets: async list of {label, send(text, name)}; resolves when done
  const sendFlow = async (targets, opts = {}) => {
    const T = typeof targets == 'function' ? targets : () => targets;
    if (!deps.mission) {
      const m = await deps.buildMission(),
        t = JSON.stringify(m);
      return doSend(T(), t, m.name);
    }
    let src = [{ id: '', label: 'Current mission' }],
      info = '';
    try {
      src = await deps.mission.sources();
    } catch (e) {}
    const ld = async id => {
      try {
        const g = await deps.mission.groups(id);
        info = g.length
          ? 'DTC data sent with it: ' +
            g[0].label +
            ' (' +
            g[0].count +
            ' lines). The receiver applies it to his own DTC.'
          : 'This mission has no DTC data: it goes without steerpoints.';
      } catch (e) {
        info = 'The mission could not be read: ' + ((e && e.message) || e);
      }
    };
    await ld(src[0].id);
    const go = await new Promise(res => {
      pop(
        `<h3 style="margin:0 0 6px;font-size:15px">Send mission</h3><label class="hint">Mission</label><select data-src style="width:100%;margin:2px 0 10px">${src.map((x, i) => `<option value="${i}">${esc(x.label)}</option>`).join('')}</select><div class="hint" data-info style="margin-bottom:4px"></div><div class="bar" style="margin-top:14px;justify-content:flex-end;gap:8px"><button class="btn g" data-x>Cancel</button><button class="btn g gn" data-ok>Send</button></div>`,
        (o, c) => {
          const show = () => {
            o.querySelector('[data-info]').textContent = info;
          };
          show();
          o.querySelector('[data-src]').onchange = async e => {
            await ld(src[+e.target.value].id);
            show();
          };
          o.querySelector('[data-x]').onclick = () => {
            c();
            res(null);
          };
          o.querySelector('[data-ok]').onclick = () => {
            const id = src[+o.querySelector('[data-src]').value].id;
            c();
            res({ id });
          };
        }
      );
    });
    if (!go) return;
    let m;
    try {
      m = await deps.mission.forSend(go.id);
    } catch (e) {
      return result(false, 'Mission not sent', 'The mission could not be prepared: ' + ((e && e.message) || e));
    }
    const warn = opts.check ? opts.check(m) : '';
    if (warn && !(await confirm(warn))) return;
    return doSend(T(), JSON.stringify(m), m.name);
  };
  // a pilot to send to: looked up by his id when the turn comes (the link seen first may have been replaced meanwhile by another one to the same pilot)
  const toTarget = (qid, p) => ({
    label: label(p.profile),
    send: (t, n, opt) => {
      const sw = swarms.get(qid),
        cur = sw && sw.byUid(p.uid);
      if (!cur) throw new Error('Not connected.');
      return cur.link.sendMission(t, n, me(), opt);
    },
  });
  // the pilots to choose from: the packages and flights when the squadron has them, the pilots online, "everybody online"
  const sendCard = async item => {
    const q = cur();
    if (!q) return result(false, 'Card not sent', 'Join or create a squadron first.');
    if (!item || !item.blob) return;
    if (item.blob.size > CARD_MAX)
      return result(
        false,
        'Card not sent',
        'This card is too big (' + Math.round(item.blob.size / 1048576) + ' MB, the limit is 8 MB).'
      );
    const sw = swarms.get(q.id),
      onl = new Map((sw ? sw.online() : []).map(p => [p.uid, p])),
      v = orgView(q),
      nm = nameOfIn(q),
      pil = [...onl.keys()].filter(u => u != DB.uid);
    const onlyOn = us => us.filter(u => onl.has(u) && u != DB.uid);
    if (!pil.length) return result(false, 'Card not sent', 'Nobody else of this squadron is online.');
    const pk = v.packages.filter(p => p.flights.some(f => f.members.length));
    const row = (k, id, text, n, sub) =>
      `<label class="sqm" style="gap:8px;${n ? '' : 'opacity:.5'}"><span><input type="checkbox" data-k="${k}" data-id="${esc(id)}"${n ? '' : ' disabled'} style="width:auto"> ${text}${sub ? ' <em>' + sub + '</em>' : ''}</span><span class="hint" style="min-height:0">${n} online</span></label>`;
    const html =
      `<h3 style="margin:0 0 6px;font-size:15px">Send card</h3><div class="hint" style="min-height:0;margin-bottom:8px">"${esc(item.name)}" goes among the unused cards of each pilot you choose. It never replaces a card of his kneeboard.</div>` +
      row('all', '', '<b>Everybody online</b>', pil.length) +
      (pk.length
        ? '<h4>Packages and flights</h4>' +
          pk
            .map(
              p =>
                row('pk', p.id, '<b>' + esc(p.n) + '</b>', onlyOn(p.flights.flatMap(f => f.members)).length) +
                p.flights
                  .filter(f => f.members.length)
                  .map(
                    f =>
                      '<div style="margin-left:22px">' + row('fl', f.id, esc(f.n), onlyOn(f.members).length) + '</div>'
                  )
                  .join('')
            )
            .join('')
        : '') +
      '<h4>Pilots</h4>' +
      (live(q).length > 1 || pil.length
        ? [
            ...new Set([
              ...pil,
              ...live(q)
                .map(r => r.uid)
                .filter(u => u != DB.uid),
            ]),
          ]
            .sort((a, b) => nm(a).localeCompare(nm(b)))
            .map(u =>
              row('p', u, esc(nm(u)), onl.has(u) ? 1 : 0).replace(
                /<span class="hint"[^>]*>\d+ online<\/span>/,
                `<span class="hint" style="min-height:0">${onl.has(u) ? 'online' : 'offline'}</span>`
              )
            )
            .join('')
        : '<div class="hint">Nobody else is in the squadron.</div>') +
      '<div class="bar" style="margin-top:12px;justify-content:flex-end"><button class="btn g" data-x>Cancel</button><button class="btn g gn" data-ok disabled>Send</button></div>';
    const pick = await new Promise(res => {
      pop(html, (o, c) => {
        const ok = o.querySelector('[data-ok]');
        const sel = () => {
          const set = new Set();
          o.querySelectorAll('input:checked').forEach(i => {
            const { k, id } = i.dataset;
            if (k == 'all') pil.forEach(u => set.add(u));
            else if (k == 'p') set.add(id);
            else if (k == 'pk')
              v.packages
                .filter(p => p.id == id)
                .forEach(p => onlyOn(p.flights.flatMap(f => f.members)).forEach(u => set.add(u)));
            else
              v.packages
                .flatMap(p => p.flights)
                .filter(f => f.id == id)
                .forEach(f => onlyOn(f.members).forEach(u => set.add(u)));
          });
          return set;
        };
        o.onchange = () => (ok.disabled = !sel().size);
        o.querySelector('[data-x]').onclick = () => {
          c();
          res(null);
        };
        ok.onclick = () => {
          const set = sel();
          c();
          res([...set]);
        };
      });
    });
    if (!pick || !pick.length) return;
    let text;
    try {
      const img = await new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => no(new Error('The card could not be read.'));
        r.readAsDataURL(item.blob);
      });
      text = cardText(item.name, img);
      if (!parseCard(text)) throw new Error('Only PNG, JPG and WebP cards can be sent.');
    } catch (e) {
      return result(false, 'Card not sent', String((e && e.message) || e));
    }
    const tg = pick
      .map(u => sw && sw.byUid(u))
      .filter(Boolean)
      .map(p => toTarget(q.id, p));
    return doSend(tg, text, item.name, 'Card');
  };
  const doSend = async (tg, text, name, what = 'Mission') => {
    if (!tg.length) return result(false, what + ' not sent', 'Nobody is online to receive it.');
    const w = pop(
      '<h3 style="margin:0 0 8px;font-size:15px">Sending…</h3><div>' +
        what +
        ' "' +
        esc(name) +
        '" is going to ' +
        tg.length +
        ' pilot' +
        (tg.length == 1 ? '' : 's') +
        '. Please wait.</div><div data-prog class="hint" style="margin-top:6px"></div>'
    );
    const prog = (d, n, a, b) => {
      const e = w.o.querySelector('[data-prog]');
      if (e) e.textContent = d + ' of ' + n + ' done' + (b ? ' · ' + b + ' failed' : '');
    };
    const { ok, bad } = await distribute(tg, text, name, { onProgress: prog });
    w.close();
    if (ok.length) say(what + ' "' + name + '" sent to ' + ok.join(', ') + '.');
    if (bad.length) {
      say('Error: ' + bad.join(' | '));
      result(
        false,
        ok.length ? what + ' partly sent' : what + ' not sent',
        (ok.length ? 'Sent to: ' + ok.join(', ') + '\n\n' : '') + 'Failed:\n' + bad.join('\n'),
        bad.join(' | ')
      );
    } else result(true, what + ' delivered', what + ' "' + name + '" was received by ' + ok.join(', ') + '.');
    drawSession();
  };
  function build() {
    root.innerHTML = `<div class="sqw">
<div class="wtabs" role="tablist" id="sqtabs">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
<div class="sqpane sqmem" data-pane="members">
<div class="sqside"><div class="sqc"><h3>Pilot roster <small id="sqcount"></small></h3><input id="sqfind" class="sqfind" type="search" placeholder="Search pilot…" autocomplete="off"><div id="sqlist"></div></div></div>
<div class="sqmain">
<div class="sqc"><h3 id="sqhead3">Squadron</h3><div id="sqhead"></div></div>
<div class="sqc"><h3>Members <small id="sqleg">☆ = mission leader</small></h3><div class="bar sqtool"><select id="sqflt" aria-label="Show"></select><select id="sqsrt" aria-label="Sort by"><option value="online">Online first</option><option value="callsign">Callsign</option><option value="flight">Flight</option><option value="seen">Last seen</option></select><span class="hint" id="sqshown" style="min-height:0"></span></div><div id="sqtabbox" style="overflow-x:auto"></div></div>
<div class="sqc"><h3>Received missions</h3><div id="sqrecv"></div></div>
<div class="sqc" id="sqlost" hidden></div>
</div>
</div><div class="sqpane" data-pane="org"><div id="sqorg" class="sqorg"></div>
</div><div class="sqpane" data-pane="me">
<div class="sqc"><h3>My pilot</h3><div class="pil"><div class="pilav"><span id="sqavbox"></span><div><button class="btn g" id="sqavb">Avatar…</button> <button class="btn g" id="sqavx">Remove</button></div></div><div id="sqpilot" class="pilmain"></div><div class="sqhr"><select id="sqlbk" style="display:none"></select><button class="btn g" id="sqopen">Open logbook…</button><label class="sqlb">Callsign in the squadrons <input id="sqcs" maxlength="12" placeholder="callsign"></label></div></div><input type="file" id="sqavfile" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden><input type="file" id="sqlogofile" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden><input type="file" id="sqfile" accept=".lbk" hidden></div>
<div class="sqc"><h3>Squadron in the campaign</h3><div id="sqcamp"></div></div>
<div class="sqtwo">
<div class="sqc"><h3>My squadrons</h3><div id="sqmine"></div></div>
<div class="sqc"><div class="sqhd"><h3>Servers <small>PhoneBkn.ini</small></h3><div class="sqhr"><button class="btn g" id="sqpbopen">Open phone book…</button></div></div><div id="sqpb" class="sqpbbox"></div><input type="file" id="sqpbfile" accept=".ini" hidden></div>
</div>
</div><div class="sqpane" data-pane="settings"><div class="sqcols"><div class="sqcol">
<div class="sqc"><h3>Invite codes</h3><div id="sqinvs"></div></div>
<div class="sqc"><h3>Connection</h3><div id="sqconn"></div><div class="hint" style="margin-top:8px">TURN server (optional, one per line: <code>turn:host:port user password</code>). It relays the connection when the routers block the direct one; free accounts exist (for example Metered or Cloudflare).</div><textarea id="sqturn" rows="2" placeholder="turn:example.com:3478 username password"></textarea><div class="bar"><button class="btn g" id="sqturnsave">Save the TURN server</button><button class="btn g" id="sqnettest">Test my network</button><button class="btn g" id="sqdiag" title="Copies a technical report to paste when something does not work">Copy diagnostics</button></div><pre class="sqlog" id="sqnet" style="display:none;white-space:pre-wrap"></pre><div class="bar" style="margin-top:8px"><label class="sqlb" title="Needed to reach pilots behind a router (the public address is asked to a public STUN server, Google's). Without it only pilots on the same network or VPN can connect."><input type="checkbox" id="sqstun"> Use a public STUN server</label><span class="hint" style="min-height:0"> Default server: <code>stun.l.google.com:19302</code> (it only tells your public address, no data goes through it).</span></div></div>
</div><div class="sqcol">
<div class="sqc"><details id="sqdirect"><summary>Direct connection with two codes (no trackers)</summary>
 <div class="hint" style="margin-top:8px">When the trackers cannot be used: the pilots connect straight to each other by swapping two codes. Whoever creates the session leads it.</div>
 <h3 style="margin-top:10px">Session <small id="sqrole"></small></h3>
 <div class="bar"><button class="btn g gn" id="sqlead">Lead a session</button><button class="btn g" id="sqjoinb">Join a session</button><button class="btn g rd" id="sqend" style="display:none">Leave</button></div>
 <div id="sqleadp" style="display:none"><div class="bar" style="margin:10px 0 6px"><button class="btn g" id="sqadd">＋ Add a pilot</button></div><div id="sqinv"></div></div>
 <div id="sqjoinp" style="display:none"><div class="hint" style="margin:10px 0 4px">1. Paste the invite code of the leader. 2. Send the answer code back to the leader.</div>
  <textarea id="sqincode" rows="3" placeholder="Invite code from the leader"></textarea><div class="bar"><button class="btn g gn" id="sqmk">Create the answer code</button></div>
  <textarea id="sqanscode" rows="3" readonly placeholder="Your answer code appears here" style="display:none"></textarea><div class="bar"><button class="btn g" id="sqcpa" style="display:none">Copy the answer code</button></div></div>
 <h4>Connected</h4><div id="sqmem"></div><div class="bar"><button class="btn g gn" id="sqsend" style="display:none">Send my mission to the session</button></div><div class="err" id="sqerr"></div></details></div>
<div class="sqc"><h3>Activity</h3><pre id="sqlog" class="sqlog"></pre></div></div></div></div></div>`;
    wireLost($('#sqlost'), {
      act: a => orgAct(cur(), a),
      tryAct: a => orgTry(cur(), a),
      toast: t => (deps.toast ? deps.toast(t) : say(t)),
      confirm: t => Promise.resolve(confirm(t)),
    });
    const og = $('#sqorg');
    wireOrg(og, {
      q: cur,
      me: DB.uid,
      online: () => onlineSet(cur()),
      view: () => orgView(cur()),
      act: a => orgAct(cur(), a),
      tryAct: a => orgTry(cur(), a),
      send: sendFlight,
      sendAll: () => {
        const q = cur(),
          sw = q && swarms.get(q.id);
        if (sw) sendFlow(() => sw.online().map(p => toTarget(q.id, p)));
      },
      canAll: () => canSendAll(cur()),
      newPack: uid =>
        orgAct(cur(), (q, actor, ctx) => orgNewPackageWith(q, actor, uid, { ...ctx, names: hintNames(q) })),
      hint,
      handover: () => {
        const q = cur(),
          nm = nameOfIn(q),
          list = live(q).filter(r => r.uid != DB.uid);
        if (!q || !list.length) return;
        pop(
          `<h3>Hand over the command</h3><div class="hint" style="min-height:0">Choose the pilot who becomes the commander of the squadron.</div>${list.map(r => `<div class="sqm"><span>${esc(nm(r.uid))}</span><button class="btn g gn" data-to="${esc(r.uid)}">Give the command</button></div>`).join('')}<div class="bar" style="margin-top:10px"><button class="btn g" data-x>Cancel</button></div>`,
          (o, close) => {
            o.onclick = e => {
              const b = e.target.closest('button');
              if (!b) return;
              if (b.dataset.to) {
                const r = orgAct(cur(), { t: 'cmd', uid: b.dataset.to });
                if (!r.ok) deps.toast ? deps.toast(r.error) : say(r.error);
              }
              if (b.dataset.to || 'x' in b.dataset) close();
            };
          }
        );
      },
      saveTpl: () => {
        const q = cur();
        pop(
          `<h3>Save template</h3><div class="hint" style="min-height:0">Saves the packages, flights, leads and pilots as they are now, so you can load them another night.</div><div class="sqone"><input id="sqtplname" maxlength="24" placeholder="Name of the template"><button class="btn g gn" data-ok>Save</button><button class="btn g" data-x>Cancel</button></div>`,
          (o, close) => {
            o.onclick = e => {
              const b = e.target.closest('button');
              if (!b) return;
              if ('ok' in b.dataset) {
                const n = o.querySelector('#sqtplname').value.trim().slice(0, 24);
                if (!n) return;
                q.tpl = (q.tpl || []).filter(t => t.name.toLowerCase() != n.toLowerCase());
                q.tpl.unshift({ name: n, ts: Date.now(), ...orgToTemplate(q) });
                q.tpl = q.tpl.slice(0, 20);
                save();
                deps.toast && deps.toast('Template saved: ' + n);
              }
              close();
            };
          }
        );
      },
      loadTpl: () => {
        const q = cur(),
          list = q.tpl || [];
        pop(
          `<h3>Load template</h3>${list.length ? '<div class="hint" style="min-height:0">Loading replaces the packages and flights you have now.</div>' + list.map((t, i) => `<div class="sqm"><span><b>${esc(t.name)}</b> <em>${t.pk.length} package${t.pk.length == 1 ? '' : 's'} · ${t.pk.reduce((n, p) => n + p.fl.length, 0)} flights</em></span><span><button class="btn g gn" data-use="${i}">Load</button> <button class="btn g rd" data-del="${i}">Delete</button></span></div>`).join('') : '<div class="hint">No template saved yet.</div>'}<div class="bar" style="margin-top:10px"><button class="btn g" data-x>Close</button></div>`,
          (o, close) => {
            o.onclick = async e => {
              const b = e.target.closest('button');
              if (!b) return;
              const d = b.dataset;
              if (d.use != null) {
                if (!(await confirm('Replace the packages and flights with this template?'))) return;
                const t = list[+d.use],
                  r = orgAct(q, (qq, actor, ctx) => orgFromTemplate(qq, actor, t, ctx));
                if (!r.ok) deps.toast ? deps.toast(r.error) : say(r.error);
                close();
              } else if (d.del != null) {
                list.splice(+d.del, 1);
                q.tpl = list;
                save();
                close();
                $('#sqorg [data-loadtpl]').click();
              } else close();
            };
          }
        );
      },
      leave: () => leaveHandover(),
      toast: t => (deps.toast ? deps.toast(t) : say(t)),
      confirm: t => Promise.resolve(confirm(t)),
    });
    og.addEventListener('focusout', () => setTimeout(() => orgPending && drawOrg(), 80));
    og.addEventListener('dragend', () => setTimeout(() => orgPending && drawOrg(), 80));
    $('#sqtabs').onclick = e => {
      const b = e.target.closest('[data-tab]');
      if (b) {
        DB.tab = b.dataset.tab;
        save();
        showTab();
      }
    };
    $('#sqlogofile').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      const q = cur();
      if (!f || !owns(q)) return;
      try {
        const u = await cropImage(f, 192, false, 'Squadron logo');
        if (!u) return;
        q.logo = u;
        touchSquad(q);
        drawAll();
      } catch (x) {
        deps.toast && deps.toast(String((x && x.message) || x));
      }
    };
    $('#sqavb').onclick = () => $('#sqavfile').click();
    $('#sqavfile').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const u = await cropImage(f, 128, true, 'Avatar');
        if (!u) return;
        DB.av = u;
        avDone();
      } catch (x) {
        deps.toast && deps.toast(String((x && x.message) || x));
      }
    };
    $('#sqavx').onclick = () => {
      DB.av = '';
      avDone();
    };
    $('#sqopen').onclick = () => $('#sqfile').click();
    $('#sqfile').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) await readLbk(f.name, new Uint8Array(await f.arrayBuffer()));
    };
    $('#sqlbk').onchange = () => readLbk($('#sqlbk').value);
    $('#sqcs').onchange = () => {
      DB.cs = $('#sqcs').value.trim();
      save();
      DB.squads.forEach(q => {
        mkMe(q);
        touchMember(q, DB.uid, () => {});
      });
      drawAll();
    };
    $('#sqnettest').onclick = async () => {
      const b = $('#sqnet');
      b.style.display = '';
      b.textContent = 'Testing…';
      try {
        b.textContent = (await testNetwork(parseTurn($('#sqturn').value))).text;
      } catch (e) {
        b.textContent = 'Test failed: ' + ((e && e.message) || e);
      }
    };
    $('#sqturnsave').onclick = () => {
      DB.turn = $('#sqturn').value;
      save();
      startAll();
      say('TURN server saved.');
    };
    $('#sqstun').onchange = () => {
      DB.stun = $('#sqstun').checked;
      save();
      startAll();
    };
    $('#sqpbopen').onclick = () => $('#sqpbfile').click();
    $('#sqpbfile').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) {
        PB = parsePhoneBook(await f.text());
        pbErr = '';
        drawPb();
      }
    };
    $('#sqfind').oninput = () => {
      mem.limit = MEM_STEP;
      clearTimeout(findT);
      findT = setTimeout(drawTable, 120);
    };
    $('#sqflt').onchange = e => {
      mem.filter = e.target.value;
      mem.limit = MEM_STEP;
      drawTable();
    };
    $('#sqsrt').onchange = e => {
      mem.sort = e.target.value;
      drawTable();
    };
    $('#sqdiag').onclick = () => copy(diag(S.err));
    // direct connection
    $('#sqlead').onclick = guard(async () => {
      await S.lead();
      say('Direct session started: you are the leader.');
    });
    $('#sqjoinb').onclick = () => {
      S.end();
      S.role = 'join';
      drawSession();
    };
    $('#sqend').onclick = () => {
      S.end();
      say('You left the direct session.');
    };
    $('#sqadd').onclick = guard(async () => {
      const r = await S.invite();
      const d = document.createElement('div');
      d.className = 'sqi';
      d.innerHTML = `<div class="hint">Invite for a new pilot: send him this code, then paste the answer he sends back.</div><textarea rows="3" readonly>${esc(r.code)}</textarea><div class="bar"><button class="btn g" data-c>Copy the invite</button></div><textarea rows="3" data-a placeholder="Answer code of the pilot"></textarea><div class="bar"><button class="btn g gn" data-k>Connect</button><button class="btn g" data-x>Cancel</button></div><div class="err" data-e></div>`;
      d.querySelector('[data-c]').onclick = () => copy(r.code);
      d.querySelector('[data-x]').onclick = () => {
        S.drop(r.id);
        d.remove();
      };
      d.querySelector('[data-k]').onclick = async () => {
        try {
          await S.accept(r.id, d.querySelector('[data-a]').value);
          say('Answer accepted: connecting…');
          d.remove();
        } catch (e) {
          d.querySelector('[data-e]').textContent = String((e && e.message) || e);
        }
      };
      $('#sqinv').append(d);
      say('Invite created.');
    });
    $('#sqmk').onclick = guard(async () => {
      const a = await S.join($('#sqincode').value);
      $('#sqanscode').value = a;
      $('#sqanscode').style.display = '';
      $('#sqcpa').style.display = '';
      S.role = 'join';
      say('Answer created: send it to the leader.');
    });
    $('#sqcpa').onclick = () => copy($('#sqanscode').value);
    $('#sqsend').onclick = () =>
      sendFlow(() => [
        {
          label: 'the session',
          send: async (t, n) => {
            if (!(await S.sendMission(t, n))) throw new Error('nobody connected');
          },
        },
      ]);
    $('#sqlog').textContent = log.join('\n');
    drawAll();
  }
  build();
  // the saved squadrons, rosters and settings; the swarms start as soon as they are known
  async function init() {
    try {
      const o = deps.store && (await deps.store.load());
      if (o && o.uid) {
        DB = { ...DB, ...o, squads: o.squads || [] };
        if (o.squad && !DB.squads.length) {
          DB.squads = [{ ...o.squad, id: randHex(4), owner: DB.uid, leader: '', roster: o.roster || {} }];
          DB.cur = DB.squads[0].id;
        } // the first version kept one squadron
        if (!DB.stunv) {
          DB.stun = false;
          DB.stunv = 1;
        } // STUN is off by default (earlier versions had it on)
        delete DB.squad;
        delete DB.roster;
        DB.squads.forEach(q => {
          q.roster = q.roster || {};
          q.mc = typeof q.mc == 'string' ? q.mc : '';
          q.org = pruneOrg(mergeOrg(newOrg(), q.org).org); // shapes checked, old deleted items forgotten
        });
      }
    } catch (e) {
      /* first start */
    }
    if ($('#sqturn')) $('#sqturn').value = DB.turn || '';
    if ($('#sqstun')) $('#sqstun').checked = !!DB.stun;
    if ($('#sqcs')) $('#sqcs').value = DB.cs || '';
    save();
    drawAll();
    startAll();
  }
  const ready = init();
  return {
    S,
    ready,
    received: () => recv,
    sendCard,
    canSendCard: () => !!cur(),
    roster: () => {
      const q = cur();
      if (!q) return [];
      const seen = new Set();
      return live(q)
        .filter(r => r.name && String(r.name).trim())
        .map(r => {
          const rk = r.stats && r.stats.rk;
          const ab = RANK_AB[rk] || '';
          return (ab ? ab + ' ' : '') + String(r.name).trim();
        })
        .filter(l => !seen.has(l) && seen.add(l))
        .sort((a, b) => a.localeCompare(b));
    },
    flush,
    refresh: () => {
      if (!pilot) loadLbks();
      if (!PB) loadPb();
      drawAll();
    },
    pilot: () => pilot,
    me,
    db: () => DB,
    swarm: () => {
      const q = cur();
      return q ? swarms.get(q.id) : null;
    },
    swarms: () => swarms,
    phonebook: () => PB,
    stop: () => {
      [...swarms.keys()].forEach(swarmStop);
      [...gsw.values()].forEach(w => w.stop());
      gsw.clear();
    },
    restart: startAll,
    org: {
      act: a => orgAct(cur(), a),
      view: () => (cur() ? orgView(cur()) : null),
    },
  };
}
