// Aircraft performance data of BMS 4.38: Data\Sim\Acdata\<aircraft>.txtpb (protobuf text).
// What the Performance page needs is read from it: airframe numbers, lift and drag tables (Mach x alpha), thrust and fuel flow tables
// (altitude x Mach, idle / military / afterburner), the stores drag line, the gear / air brake drag and the friction of the wheels.
// Units are those of the files: ft, lb, kt, degrees, lb/h.

// ---- a small reader for the text format: name { ... }, name: value, name: [a, b], # comments. A name that is repeated becomes an array.
export function parseTxtpb(text) {
  const re = /#[^\n]*|"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,#"]+/g,
    tk = [];
  let m;
  while ((m = re.exec(text))) {
    const s = m[0];
    if (s[0] != '#') tk.push(s);
  }
  let i = 0;
  const val = s => {
    if (s[0] == '"') return s.slice(1, -1);
    const n = Number(s);
    return s !== '' && !isNaN(n) ? n : s == 'true' ? true : s == 'false' ? false : s;
  };
  const put = (o, k, v, rep) => {
    if (k in o) {
      if (!rep.has(o)) rep.set(o, new Set());
      if (!rep.get(o).has(k)) {
        o[k] = [o[k]];
        rep.get(o).add(k);
      }
      o[k].push(v);
    } else o[k] = v;
  };
  const rep = new Map();
  function msg(end) {
    const o = {};
    while (i < tk.length && tk[i] != end) {
      const k = tk[i++];
      let v;
      if (tk[i] == ':') i++;
      if (tk[i] == '{') {
        i++;
        v = msg('}');
        i++;
      } else if (tk[i] == '[') {
        i++;
        v = [];
        while (tk[i] != ']') {
          if (tk[i] != ',') v.push(val(tk[i]));
          i++;
        }
        i++;
      } else v = val(tk[i++]);
      put(o, k, v, rep);
    }
    return o;
  }
  return msg(null);
}
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

// table: x_axis / y_axis breakpoints and one "data" block of values per x breakpoint, z[ix][iy]. Axes missing in a table are those of `like`.
function table(t, like) {
  if (!t) return null;
  const x = (t.x_axis && t.x_axis.breakpoints) || (like && like.x),
    y = (t.y_axis && t.y_axis.breakpoints) || (like && like.y);
  const z = arr(t.data).map(d => arr(d.values));
  if (!x || !y || !z.length || z.length != x.length || z.some(r => r.length != y.length)) return null;
  return { x, y, z, mult: t.multiplier == null ? 1 : t.multiplier };
}

// -> {name, fm, af:{...}, cl, cd, clTef, cdTef, thrust:{idle,mil,ab}, flow:{idle,mil,ab}|null, ...}
export function parseAcPerf(text, name = '') {
  const o = parseTxtpb(text),
    af = o.airframe || {},
    ae = o.aero || {},
    en = o.engine || {},
    ax = o.auxaero || {};
  const cl = table(ae.mach_alpha_cl_table),
    cd = table(ae.mach_alpha_cd_table, cl);
  if (!cl || !cd || !af.area_sqft) return null;
  const th = { idle: table(en.alt_mach_thrust_idle_table) };
  th.mil = table(en.alt_mach_thrust_mil_table, th.idle);
  th.ab = table(en.alt_mach_thrust_ab_table, th.idle);
  if (!th.idle || !th.mil || !th.ab) return null;
  const fl = en.has_fuel_flow ? { idle: table(en.alt_mach_fuel_flow_idle_table, th.idle) } : null;
  if (fl) {
    fl.mil = table(en.alt_mach_fuel_flow_mil_table, th.idle);
    fl.ab = table(en.alt_mach_fuel_flow_ab_table, th.idle);
    if (!fl.mil || !fl.ab || !fl.idle) fl.idle = null;
  }
  const lim = {};
  arr(o.limits && o.limits.limit).forEach(l => {
    if (l.key) lim[l.key] = arr(l.data && l.data.values);
  });
  const fd = ax.flight_dynamics || {},
    tef = ax.tef || {},
    gear = ax.gear_nws || {},
    ab = ax.air_brakes || {},
    fuel = ax.fuel || {},
    chute = ax.drag_chute || {};
  const wheels = [];
  const walk = n => {
    if (n && typeof n == 'object') {
      if ('wheel_friction' in n) wheels.push(n);
      Object.values(n).forEach(walk);
    }
  };
  walk(o);
  const mains = wheels.filter(w => (w.brake_friction || 0) > 0),
    brk = mains.length ? mains[0].brake_friction : 0,
    roll = (mains[0] || wheels[0] || {}).wheel_friction;
  const key = (n, d) => {
    let r = d;
    const f = o2 => {
      if (o2 && typeof o2 == 'object') {
        if (n in o2) r = o2[n];
        else Object.values(o2).forEach(f);
      }
    };
    f(ax);
    return r;
  };
  return {
    name,
    fm: o.fmtype || '',
    ac: { type: (ax.aircraft || {}).type_ac || '', engine: (ax.engine || {}).type_engine || '' },
    af: {
      emptyLb: af.empty_weight_lbs,
      area: af.area_sqft,
      fuelLb: af.internal_fuel_lbs,
      aoaMax: af.aoa_max_player_deg,
      aoaMin: af.aoa_min_deg,
      maxG: af.max_g,
      minKt: af.min_vcas_kts,
      maxKt: af.max_vcas_kts,
      cornerKt: af.corner_vcas_kts,
      span: af.span_ft,
      length: af.length_ft,
    },
    cl,
    cd,
    clTef: table(ae.mach_alpha_cl_tef_table, cl),
    cdTef: table(ae.mach_alpha_cd_tef_table, cl),
    rpm: { max: table(en.alt_mach_max_rpm_chart), maxAb: table(en.alt_mach_max_rpm_ab_chart) },
    thrust: th,
    flow: fl,
    thrustFactor: en.thrust_factor == null ? 1 : en.thrust_factor,
    flowFactor: en.fuel_flow_factor == null ? 1 : en.fuel_flow_factor,
    simpleFuel: { normal: fuel.fuel_flow_factor_normal, ab: fuel.fuel_flow_factor_ab, min: fuel.min_fuel_flow },
    lim: { posG: lim.LIM_POS_G || [], storesDrag: lim.LIM_STORES_DRAG || [], aoa: (lim.LIM_AOA || [])[0] },
    drag: { gear: gear.cd_ldg_factor || 0, brake: ab.cd_spdb_factor || 0, chuteCd: chute.drag_chute_cd || 0 },
    tef: { cl: tef.afm_cl_tef_factor, cd: tef.afm_cd_tef_factor },
    ground: {
      roll: roll || 0.022,
      brake: brk || 0.3,
      optTakeoffPitch: key('opt_takeoff_pitch', 0),
      critAoa: fd.afm_critical_aoa || 0,
    },
  };
}
