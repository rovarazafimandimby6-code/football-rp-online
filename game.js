/* Football RP Online — P3 (2D). Trois couches : 1) CORE (logique pure, sans DOM, déterministe,
   exportable pour un futur serveur Node.js) 2) RENDER (canvas 2D) 3) UI/Session (tactile, HUD). */
(function (root) {
"use strict";
/* ======================= 1) CORE ======================= */
const W = 876, H = 444, GH = 124, GD = 26, PR = 12, BR = 5.5, STEP = 1 / 60, HALF = 150;
const GY0 = H / 2 - GH / 2, GY1 = H / 2 + GH / 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, hyp = Math.hypot;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turn = (a, t, m) => { const d = angDiff(a, t); return Math.abs(d) < m ? t : a + Math.sign(d) * m; };
function rngMake(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SLOTS = [["GK", .5, 1], ["DEF", .3, 4], ["DEF", .7, 5], ["MID", .4, 8], ["ATT", .62, 9]];
const NUMS1 = [1, 3, 2, 6, 10];

function createMatch(o) {
  o = o || {};
  const m = { v: 3, rng: rngMake(o.seed || 7), t: 0, period: 1, clock: HALF, phase: "kickoff", pt: 1.6, score: [0, 0],
    events: [], ball: { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, target: null, roll: 0 },
    players: [], byId: {}, tm: [[], []], humans: {} };
  for (let team = 0; team < 2; team++) SLOTS.forEach((s, i) => {
    const p = { id: (team ? "r" : "b") + i, team, role: s[0], hy: s[1], num: team ? NUMS1[i] : s[2], i, x: 0, y: 0, vx: 0, vy: 0,
      f: team ? Math.PI : 0, st: "idle", stT: 0, stD: 1, ph: 0, sp: 0, stam: 100, noPick: 0, cd: 0, tk: 0, hold: 0, think: 0,
      shield: false, spr: false, tkHit: false, pp: { pass: false, shoot: false, def: false } };
    m.players.push(p); m.byId[p.id] = p; m.tm[team].push(p);
  });
  m.humans[o.human === undefined ? "b3" : o.human] = true; delete m.humans.null;
  placeKickoff(m, 0);
  return m;
}
function home(m, p) {
  const b = m.ball, prog = clamp((p.team ? W - b.x : b.x) / W, 0, 1);
  const R = { GK: [.05, 0], DEF: [.2, .26], MID: [.34, .4], ATT: [.48, .4] }[p.role], fx = R[0] + R[1] * prog;
  let y = H * p.hy; y += (b.y - y) * { GK: 0, DEF: .22, MID: .35, ATT: .3 }[p.role];
  return { x: p.team ? W * (1 - fx) : W * fx, y: clamp(y, 30, H - 30) };
}
function placeKickoff(m, team) {
  const b = m.ball; b.x = W / 2; b.y = H / 2; b.z = b.vx = b.vy = b.vz = 0; b.owner = null; b.target = null;
  for (const p of m.players) {
    const h = home(m, p); p.x = p.team ? Math.max(h.x, W / 2 + 16) : Math.min(h.x, W / 2 - 16); p.y = h.y;
    p.vx = p.vy = 0; p.st = "idle"; p.stT = 0; p.f = p.team ? Math.PI : 0; p.hold = 0; p.shield = false; p.stam = Math.min(100, p.stam + 15);
  }
  const k = m.tm[team][4], s = team ? 1 : -1; k.x = W / 2 + s * (PR + BR + 3); k.y = H / 2; b.owner = k.id; k.hold = 0;
}
const ev = (m, t, p, x) => m.events.push(Object.assign({ t, id: p && p.id, x: p ? p.x : 0, y: p ? p.y : 0 }, x));
const canTouch = (m, p) => !m.ball.owner && hyp(m.ball.x - p.x, m.ball.y - p.y) < PR + BR + 16 && m.ball.z < 16;

function laneClear(m, a, bx, by, w) {
  for (const q of m.tm[1 - a.team]) {
    const dx = bx - a.x, dy = by - a.y, L = dx * dx + dy * dy || 1, t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L;
    if (t < .08 || t > 1) continue;
    const px = a.x + dx * t - q.x, py = a.y + dy * t - q.y; if (px * px + py * py < w * w) return false;
  } return true;
}
function pickMate(m, p, dir, ai) {
  let best = null, bs = -1e9, ba = 0; const s = p.team ? -1 : 1;
  for (const q of m.tm[p.team]) {
    if (q === p || (q.role === "GK" && p.role !== "GK")) continue;
    const d = hyp(q.x - p.x, q.y - p.y); if (d < 35 || d > 340) continue;
    const ang = Math.abs(angDiff(dir, Math.atan2(q.y - p.y, q.x - p.x)));
    let o = 1e9; for (const r of m.tm[1 - p.team]) o = Math.min(o, hyp(r.x - q.x, r.y - q.y));
    const sc = -ang * (ai ? 30 : 90) - d * .08 + Math.min(o, 90) * .45 + (laneClear(m, p, q.x, q.y, 16) ? 25 : -40) + (ai ? (q.x - p.x) * s * .12 : 0);
    if (sc > bs) { bs = sc; best = q; ba = ang; }
  }
  if (best && !ai && ba > 1.1) best = null;
  return best;
}
function doPass(m, p, inp) {
  const b = m.ball, hasDir = inp.aim !== undefined || inp.mx || inp.my;
  const dir = inp.aim !== undefined ? inp.aim : (hasDir ? Math.atan2(inp.my, inp.mx) : p.f);
  const q = pickMate(m, p, dir, inp.aim !== undefined);
  let ang = dir, v = 260, vz = 0;
  if (q) {
    const d = hyp(q.x - p.x, q.y - p.y); v = clamp(170 + d * 1.45, 230, 430);
    const t = d / v, tx = q.x + q.vx * t * .6, ty = q.y + q.vy * t * .6; ang = Math.atan2(ty - p.y, tx - p.x);
    if (d > 120 && !laneClear(m, p, q.x, q.y, 16)) vz = 190;
  }
  b.owner = null; b.target = q ? q.id : null; b.last = p.id; b.x = p.x + Math.cos(ang) * (PR + BR); b.y = p.y + Math.sin(ang) * (PR + BR);
  b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = vz; p.f = ang; p.noPick = .3; p.st = "pass"; p.stT = p.stD = .25; p.hold = 0; ev(m, "pass", p);
}
function doShoot(m, p, inp) {
  const b = m.ball, gx = p.team ? 0 : W, K = m.tm[1 - p.team][0], human = !!m.humans[p.id];
  const ay = human ? H / 2 + clamp(inp.my || 0, -1, 1) * (GH / 2 - 14) : H / 2 + (K.y > H / 2 ? -1 : 1) * (GH / 2 - 18);
  const a0 = Math.atan2(ay - p.y, gx - p.x), facing = Math.abs(angDiff(p.f, a0)) < 1.1;
  const err = (m.rng() - .5) * (.1 + (p.spr ? .04 : 0) + hyp(p.vx, p.vy) / 150 * .03), ang = (facing ? a0 : p.f) + err, pw = human ? 470 : 430;
  b.owner = null; b.target = null; b.last = p.id; b.x = p.x + Math.cos(ang) * (PR + BR); b.y = p.y + Math.sin(ang) * (PR + BR);
  b.vx = Math.cos(ang) * pw; b.vy = Math.sin(ang) * pw; b.vz = 30 + m.rng() * 70; p.f = ang; p.noPick = .35; p.st = "shoot"; p.stT = p.stD = .32; p.hold = 0; ev(m, "shot", p);
}
function startTackle(m, p) {
  const b = m.ball, o = b.owner && m.byId[b.owner];
  if (o && o.team !== p.team && hyp(o.x - p.x, o.y - p.y) < 90) p.f = Math.atan2(o.y - p.y, o.x - p.x);
  else if (!b.owner && hyp(b.x - p.x, b.y - p.y) < 70) p.f = Math.atan2(b.y - p.y, b.x - p.x);
  p.st = "tackle"; p.stT = p.stD = .5; p.tk = 1.1; p.tkHit = false; p.vx = Math.cos(p.f) * 250; p.vy = Math.sin(p.f) * 250; p.stam = Math.max(0, p.stam - 6); ev(m, "tkstart", p);
}
function tackleCheck(m, p) {
  const prog = 1 - p.stT / p.stD, b = m.ball; if (p.tkHit || prog < .1 || prog > .85) return;
  if (!b.owner && hyp(b.x - p.x, b.y - p.y) < PR + BR + 10) { b.owner = p.id; p.hold = 0; p.tkHit = true; ev(m, "intercept", p); return; }
  const q = b.owner && m.byId[b.owner]; if (!q || q.team === p.team || hyp(q.x - p.x, q.y - p.y) > PR * 2 + 9) return;
  p.tkHit = true;
  const behind = Math.cos(p.f) * Math.cos(q.f) + Math.sin(p.f) * Math.sin(q.f) > .3;
  const ch = .6 - (q.shield ? .28 : 0) + (behind ? .12 : 0);
  if (m.rng() < ch) {
    b.owner = null; b.last = p.id; b.vx = Math.cos(p.f) * 140 + q.vx * .3; b.vy = Math.sin(p.f) * 140 + q.vy * .3; b.vz = 60;
    q.st = "stun"; q.stT = q.stD = .6; q.noPick = .6; q.vx *= .3; q.vy *= .3; ev(m, "tackle", p);
  } else { p.stT += .35; p.stD += .35; q.vx += Math.cos(p.f) * 60; q.vy += Math.sin(p.f) * 60; ev(m, "tkfail", p); }
}
function upPlayer(m, p, inp, dt) {
  const b = m.ball, has = b.owner === p.id;
  p.cd = Math.max(0, p.cd - dt); p.noPick = Math.max(0, p.noPick - dt); p.tk = Math.max(0, p.tk - dt);
  if (p.stT > 0) { p.stT -= dt; if (p.stT <= 0) { p.stT = 0; p.st = "idle"; } }
  const lock = () => p.st === "tackle" || p.st === "dive" || p.st === "stun";
  const e = { pass: !!inp.pass && !p.pp.pass, shoot: !!inp.shoot && !p.pp.shoot, def: !!inp.def && !p.pp.def };
  p.pp = { pass: !!inp.pass, shoot: !!inp.shoot, def: !!inp.def };
  p.shield = has && !!inp.def && !lock();
  if (!lock()) {
    if (inp.dive != null && p.role === "GK" && !has) { p.st = "dive"; p.stT = p.stD = .55; p.vx = 0; p.vy = inp.dive; p.f = inp.dive > 0 ? Math.PI / 2 : -Math.PI / 2; ev(m, "dive", p); }
    else if (e.shoot && (has || canTouch(m, p))) doShoot(m, p, inp);
    else if (e.pass && (has || canTouch(m, p))) doPass(m, p, inp);
    else if (e.def && !has && p.tk <= 0) startTackle(m, p);
  }
  const lk = lock(); let mx = inp.mx || 0, my = inp.my || 0, l = hyp(mx, my);
  if (l > 1) { mx /= l; my /= l; l = 1 } if (l < .12) { mx = my = 0; l = 0 }
  const spr = !!inp.sprint && l > 0 && p.stam > 3 && !lk && !p.shield; p.spr = spr;
  if (lk) { const k = Math.exp(-(p.st === "dive" ? 2.5 : p.st === "tackle" ? 3.5 : 9) * dt); p.vx *= k; p.vy *= k; }
  else {
    const top = (p.role === "GK" ? 112 : 150) * (spr ? 1.38 : 1) * (p.shield ? .72 : 1) * (p.stam < 15 ? .85 : 1) * (p.st === "pass" || p.st === "shoot" ? .55 : 1) * (has ? .95 : 1) * (m.humans[p.id] ? 1 : .94);
    const k = Math.min(1, dt * (has ? 8 : 10)); p.vx += (mx * top - p.vx) * k; p.vy += (my * top - p.vy) * k;
    if (l > 0) p.f = turn(p.f, Math.atan2(my, mx), dt * 13);
  }
  p.x = clamp(p.x + p.vx * dt, 10, W - 10); p.y = clamp(p.y + p.vy * dt, 10, H - 10);
  p.sp = hyp(p.vx, p.vy); p.ph += p.sp * dt * .085; p.stam = clamp(p.stam + (spr ? -21 : p.sp < 20 ? 14 : 8) * dt, 0, 100);
  if (p.st === "tackle") tackleCheck(m, p);
}
function updateBall(m, dt) {
  const b = m.ball, o = b.owner && m.byId[b.owner];
  if (o) {
    o.hold += dt; const reach = PR + BR + 2 + Math.max(0, Math.sin(o.ph * Math.PI * .5)) * 3.5, k = Math.min(1, dt * 18);
    b.x += (o.x + Math.cos(o.f) * reach - b.x) * k; b.y += (o.y + Math.sin(o.f) * reach - b.y) * k;
    b.vx = o.vx; b.vy = o.vy; b.z = b.vz = 0; b.roll += o.sp * dt * .12; return;
  }
  const sp0 = hyp(b.vx, b.vy), inNet = b.x < 0 || b.x > W, kf = b.z > 0 ? .12 : (inNet ? 5 : .8);
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 900 * dt;
  if (b.z < 0) { b.z = 0; if (Math.abs(b.vz) > 60) { b.vz = -b.vz * .55; b.vx *= .9; b.vy *= .9; } else b.vz = 0; }
  const f = Math.exp(-kf * dt); b.vx *= f; b.vy *= f; if (hyp(b.vx, b.vy) < 6 && b.z === 0) b.vx = b.vy = 0;
  b.roll += sp0 * dt * .12;
  if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * .6; } if (b.y > H - BR) { b.y = H - BR; b.vy = -Math.abs(b.vy) * .6; }
  for (const gx of [0, W]) for (const py of [GY0, GY1]) {
    const dx = b.x - gx, dy = b.y - py, d = hyp(dx, dy);
    if (d < BR + 3.5 && d > 0) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; b.x = gx + nx * (BR + 3.6); b.y = py + ny * (BR + 3.6); ev(m, "post", null, { x: b.x, y: b.y }); } }
  }
  const mouth = b.y > GY0 + BR && b.y < GY1 - BR;
  if (b.x < 0 || b.x > W) { if (!mouth) { b.y = clamp(b.y, GY0 + BR, GY1 - BR); b.vy *= -.2; } }
  if (m.phase === "play" && (b.x < 0 || b.x > W) && mouth) {
    if (b.z < 42) { const team = b.x > W ? 0 : 1; m.score[team]++; m.phase = "goal"; m.pt = 2.4; m.lastScorer = team; ev(m, "goal", null, { team, by: b.last }); return; }
    b.vx *= -.4; b.x = b.x > W ? W - BR : BR;
  } else if (!mouth || m.phase === "play") {
    if (b.x < BR && !(b.x < 0)) { b.x = BR; b.vx = Math.abs(b.vx) * .6; } if (b.x > W - BR && !(b.x > W)) { b.x = W - BR; b.vx = -Math.abs(b.vx) * .6; }
  }
  if (b.x < -GD + BR) { b.x = -GD + BR; b.vx *= -.15; } if (b.x > W + GD - BR) { b.x = W + GD - BR; b.vx *= -.15; }
  if (m.phase !== "play") return;
  // contacts : réception, interception, gardiens
  const spd = hyp(b.vx, b.vy); let best = null, bd = 1e9;
  for (const p of m.players) {
    if (p.noPick > 0 || p.st === "stun") continue;
    const reach = PR + BR + (p.role === "GK" ? (p.st === "dive" ? 24 : 10) : 3), d = hyp(b.x - p.x, b.y - p.y);
    if (d < reach && b.z < (p.role === "GK" ? 52 : 16) && d < bd) { best = p; bd = d; }
  }
  if (!best) return;
  const p = best, mine = m.byId[b.last] && m.byId[b.last].team === p.team;
  if (p.role === "GK") {
    if (spd < 380 || mine) { b.owner = p.id; b.target = null; p.hold = 0; p.st = "recv"; p.stT = p.stD = .25; ev(m, "catch", p); }
    else { const s = p.team ? 1 : -1; b.vx = -b.vx * .35; b.vy += Math.sign(b.y - p.y || 1) * 110; b.vz = 80; b.last = p.id; p.noPick = .3; ev(m, "save", p); }
  } else if (spd <= (b.target === p.id ? 460 : 300)) {
    b.owner = p.id; b.target = null; p.hold = 0; if (spd > 110) { p.st = "recv"; p.stT = p.stD = .22; ev(m, "recv", p); }
  } else if (!mine && bd < PR + BR && m.rng() < .4) {
    const nx = (b.x - p.x) / (bd || 1), ny = (b.y - p.y) / (bd || 1); b.vx = nx * spd * .45; b.vy = ny * spd * .45; b.last = p.id; p.noPick = .25; b.target = null; ev(m, "intercept", p);
  }
}
/* ---------- IA tactique (pas de mouvements aléatoires) ---------- */
function steer(out, p, tx, ty, spr) {
  const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy); if (d < 4) return;
  const mag = clamp(d / 40, 0, 1); out.mx = dx / d * mag; out.my = dy / d * mag; out.sprint = !!spr && d > 60 && p.stam > 30;
}
function aiKeeper(m, p, out) {
  const b = m.ball, inw = p.team ? -1 : 1, ox = p.team ? W : 0;
  if (b.owner === p.id) { if (p.hold > 1) { out.pass = true; out.aim = inw > 0 ? 0 : Math.PI; } return out; }
  if (!b.owner && p.st !== "dive" && b.vx * -inw > 60) {
    const dx = ox - b.x, r = dx * .8 / b.vx;
    if (r < .98 && r > 0) {
      const t = -Math.log(1 - r) / .8, yc = b.y + b.vy / b.vx * dx;
      if (Math.abs(yc - H / 2) < GH / 2 + 14 && t < .5 && Math.abs(yc - p.y) > 16 && Math.abs(b.x - p.x) < 260) { out.dive = clamp((yc - p.y) * 3.2, -420, 420); return out; }
      if (t < .7) { steer(out, p, p.x, clamp(yc, GY0 + 8, GY1 - 8)); return out; }
    }
  }
  const bd = hyp(b.x - p.x, b.y - p.y), inBox = Math.abs(b.x - ox) < 120 && Math.abs(b.y - H / 2) < 105;
  let nearest = true; for (const q of m.players) if (q !== p && hyp(q.x - b.x, q.y - b.y) < bd - 6) nearest = false;
  if (!b.owner && inBox && bd < 110 && nearest) { steer(out, p, b.x, b.y, true); return out; }
  const gd = hyp(b.x - ox, b.y - H / 2);
  steer(out, p, ox + inw * (14 + Math.min(30, Math.max(0, (gd - 150) * .12))), clamp(H / 2 + (b.y - H / 2) * .45, GY0 + 10, GY1 - 10));
  return out;
}
function ai(m, p, dt) {
  const out = { mx: 0, my: 0, sprint: false, pass: false, shoot: false, def: false }, b = m.ball, T = p.team, dg = T ? -1 : 1;
  if (p.role === "GK") return aiKeeper(m, p, out);
  p.think -= dt; const o = b.owner && m.byId[b.owner], opp = m.tm[1 - T], own = m.tm[T], h = home(m, p), gx = dg > 0 ? W : 0;
  let tx = h.x, ty = h.y, spr = false;
  if (o === p) {
    const dGoal = hyp(gx - p.x, H / 2 - p.y); let near = 1e9, rx = 0, ry = 0;
    for (const q of opp) { const d = hyp(q.x - p.x, q.y - p.y); near = Math.min(near, d); if (d < 75) { rx += (p.x - q.x) / d * (1 - d / 75) * 1.4; ry += (p.y - q.y) / d * (1 - d / 75) * 1.4; } }
    if (p.think <= 0) {
      p.think = .18; const toG = Math.atan2(H / 2 - p.y, gx - p.x);
      if (dGoal < (p.role === "ATT" ? 300 : 250) && Math.abs(angDiff(p.f, toG)) < .7 && laneClear(m, p, gx, H / 2, 16)) out.shoot = true;
      else if (p.hold > .9 && (near < 42 || p.hold > 2.4)) { out.pass = true; out.aim = toG; }
    }
    let vx = dg + rx, vy = (H / 2 - p.y) / H * .8 + ry; const L = hyp(vx, vy) || 1; tx = p.x + vx / L * 100; ty = clamp(p.y + vy / L * 100, 28, H - 28); spr = near > 90 && p.stam > 40;
  } else if (o && o.team === T) {
    tx = h.x + (p.role === "DEF" ? 0 : dg * 50); ty = h.y; if (p.role === "ATT") ty = H / 2 + (o.y < H / 2 ? 1 : -1) * 70;
    const dc = hyp(tx - o.x, ty - o.y); if (dc < 60) { tx = o.x + (tx - o.x) / (dc || 1) * 60; ty = o.y + (ty - o.y) / (dc || 1) * 60; }
    let mk = null, md = 35; for (const q of opp) { const d = hyp(q.x - tx, q.y - ty); if (d < md) { md = d; mk = q; } } if (mk) ty += Math.sign(ty - mk.y || 1) * 40;
    ty = clamp(ty, 28, H - 28); spr = hyp(tx - p.x, ty - p.y) > 120;
  } else if (o) {
    const out5 = own.filter(q => q.role !== "GK").sort((a, c) => hyp(a.x - o.x, a.y - o.y) - hyp(c.x - o.x, c.y - o.y));
    if (out5[0] === p) {
      tx = o.x + o.vx * .2; ty = o.y + o.vy * .2; spr = hyp(tx - p.x, ty - p.y) > 60;
      if (hyp(o.x - p.x, o.y - p.y) < PR * 2 + 12 && p.tk <= 0 && p.think <= 0) { p.think = .5; if (m.rng() < .5) { out.def = true; p.think = 1.2; } }
    } else if (out5[1] === p) { const gxo = T ? W : 0, ux = (gxo - o.x), uy = (H / 2 - o.y), L = hyp(ux, uy) || 1; tx = o.x + ux / L * 70; ty = o.y + uy / L * 70; }
    else {
      let mk = null, md = 1e9; for (const q of opp) { if (q === o || q.role === "GK") continue; const d = hyp(q.x - h.x, q.y - h.y); if (d < md) { md = d; mk = q; } }
      if (mk && md < 170) { tx = mk.x - dg * 26; ty = mk.y + (H / 2 - mk.y) * .18; }
    }
    spr = hyp(tx - p.x, ty - p.y) > 120;
  } else {
    const pred = { x: b.x + b.vx * .3, y: b.y + b.vy * .3 };
    const ch = own.filter(q => q.role !== "GK").sort((a, c) => hyp(a.x - pred.x, a.y - pred.y) - hyp(c.x - pred.x, c.y - pred.y))[0];
    if (ch === p || b.target === p.id) { tx = pred.x; ty = pred.y; spr = hyp(tx - p.x, ty - p.y) > 50; }
  }
  steer(out, p, tx, ty, spr); return out;
}
const NEUTRAL = { mx: 0, my: 0, sprint: false, pass: false, shoot: false, def: false };
function step(m, inputs, dt) {
  m.events.length = 0; m.t += dt; inputs = inputs || {};
  const ball = m.ball;
  if (m.phase === "kickoff") { m.pt -= dt; if (m.pt <= 0) m.phase = "play"; return; }
  if (m.phase === "full") return;
  if (m.phase === "halftime") { m.pt -= dt; if (m.pt <= 0) { m.period = 2; m.clock = HALF; placeKickoff(m, 1); m.phase = "kickoff"; m.pt = 1.6; ev(m, "second"); } return; }
  if (m.phase === "goal") { updateBall(m, dt); for (const p of m.players) { p.vx *= .9; p.vy *= .9; p.sp = hyp(p.vx, p.vy); } m.pt -= dt; if (m.pt <= 0) { placeKickoff(m, 1 - m.lastScorer); m.phase = "kickoff"; m.pt = 1.6; } return; }
  m.clock -= dt;
  if (m.clock <= 0) { m.clock = 0; if (m.period === 1) { m.phase = "halftime"; m.pt = 3.5; ev(m, "half"); } else { m.phase = "full"; ev(m, "full"); } return; }
  const ins = m.players.map(p => m.humans[p.id] ? (inputs[p.id] || NEUTRAL) : ai(m, p, dt));
  m.players.forEach((p, i) => upPlayer(m, p, ins[i], dt));
  updateBall(m, dt);
  for (let i = 0; i < m.players.length; i++) for (let j = i + 1; j < m.players.length; j++) {
    const a = m.players[i], c = m.players[j], dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy), md = PR * 2 - 2;
    if (d < md && d > .01) { const ps = (md - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * ps; a.y -= ny * ps; c.x += nx * ps; c.y += ny * ps; }
  }
}
function snapshot(m) {
  const b = m.ball; return { t: m.t, phase: m.phase, period: m.period, clock: m.clock, score: m.score.slice(),
    ball: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, owner: b.owner },
    players: m.players.map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, f: p.f, st: p.st, stT: p.stT, stD: p.stD, stam: p.stam })) };
}
function applySnapshot(m, s) {
  m.t = s.t; m.phase = s.phase; m.period = s.period; m.clock = s.clock; m.score = s.score.slice(); Object.assign(m.ball, s.ball);
  for (const q of s.players) Object.assign(m.byId[q.id], q);
}
class LocalSession { // Session locale hors ligne. Une SocketSession (Socket.IO) aura la même interface : setInput / update / match.
  constructor(m) { this.match = m; this.acc = 0; this.inputs = {}; this.onTick = null; }
  setInput(id, i) { this.inputs[id] = i; }
  update(dt) { this.acc += Math.min(dt, .1); while (this.acc >= STEP) { step(this.match, this.inputs, STEP); this.acc -= STEP; if (this.onTick) this.onTick(); } }
}
const Core = { W, H, GH, GD, PR, BR, STEP, HALF, createMatch, step, snapshot, applySnapshot, pickMate, home, LocalSession };
if (typeof module !== "undefined" && module.exports) module.exports = Core;
root.FRP = Core;
if (typeof document === "undefined") return;

/* ======================= 2) RENDER ======================= */
const KIT = [{ j: "#1d6fe8", j2: "#fff", s: "#0b2a6b", k: "#1d6fe8", t: "#fff" }, { j: "#e0372f", j2: "#fff", s: "#6b1410", k: "#e0372f", t: "#fff" }];
const GKK = [{ j: "#f5c518", j2: "#222", s: "#222", k: "#f5c518", t: "#222" }, { j: "#2bc77a", j2: "#0b3d27", s: "#0b3d27", k: "#2bc77a", t: "#062417" }];
const SKIN = ["#f1c9a0", "#c98f64", "#8d5a3b", "#5c3a24"], HAIR = ["#1a1410", "#4a2e1b", "#c9a24a", "#111", "#6b3b1d"];
const M = 60, PS = 1.4;
function buildPitch() {
  const cv = document.createElement("canvas"); cv.width = Math.ceil((W + 2 * M) * PS); cv.height = Math.ceil((H + 2 * M) * PS);
  const c = cv.getContext("2d"), R = rngMake(11); c.scale(PS, PS); c.translate(M, M);
  c.fillStyle = "#0d311f"; c.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? "#2d8149" : "#33894e"; c.fillRect(i * W / 14, 0, W / 14 + .5, H); }
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(255,255,255,.07)"); g.addColorStop(1, "rgba(0,0,0,.14)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.lineWidth = .8; for (let i = 0; i < 2600; i++) { const x = R() * W, y = R() * H, l = 2 + R() * 3; c.strokeStyle = R() < .5 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.08)"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - .5) * 2, y - l); c.stroke(); }
  c.strokeStyle = "rgba(255,255,255,.92)"; c.lineWidth = 2.2; c.strokeRect(0, 0, W, H);
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 58, 0, 7); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(W / 2, H / 2, 2.6, 0, 7); c.fill();
  for (const s of [0, 1]) {
    const x0 = s ? W : 0, d = s ? -1 : 1;
    c.strokeRect(s ? W - 110 : 0, H / 2 - 105, 110, 210); c.strokeRect(s ? W - 40 : 0, H / 2 - 52, 40, 104);
    c.beginPath(); c.arc(x0 + d * 82, H / 2, 2.4, 0, 7); c.fill();
    c.beginPath(); c.arc(x0 + d * 82, H / 2, 58, s ? Math.PI - 0.93 : -0.93, s ? Math.PI + 0.93 : 0.93); c.stroke();
    c.beginPath(); c.arc(x0, 0, 9, s ? Math.PI / 2 : 0, s ? Math.PI : Math.PI / 2); c.stroke(); c.beginPath(); c.arc(x0, H, 9, s ? Math.PI : -Math.PI / 2, s ? Math.PI * 1.5 : 0); c.stroke();
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(s ? W : -GD + 5, GY0 + 5, GD, GH);
    c.fillStyle = "rgba(255,255,255,.10)"; const nx = s ? W : -GD; c.fillRect(nx, GY0, GD, GH);
    c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = .6; c.beginPath();
    for (let x = 0; x <= GD; x += 5) { c.moveTo(nx + x, GY0); c.lineTo(nx + x, GY1); } for (let y = 0; y <= GH; y += 5) { c.moveTo(nx, GY0 + y); c.lineTo(nx + GD, GY0 + y); } c.stroke();
    c.strokeStyle = "#fff"; c.lineWidth = 3; c.strokeRect(nx, GY0, GD, GH); c.lineWidth = 2.2;
  }
  const v = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .72); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.32)");
  c.fillStyle = v; c.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  return cv;
}
function drawPlayer(c, p, isUser, time) {
  const kit = p.role === "GK" ? GKK[p.team] : KIT[p.team], cf = Math.cos(p.f), sf = Math.sin(p.f), ap = p.ap || (p.ap = { skin: SKIN[(p.i * 3 + p.team) % 4], hair: HAIR[(p.i * 2 + p.team * 3) % 5] });
  const moving = p.sp > 8, amp = moving ? Math.min(9, 1 + p.sp * .05) : 0, ph = p.ph, prog = p.stD ? 1 - p.stT / p.stD : 0;
  c.save(); c.translate(p.x, p.y);
  if (isUser) { c.strokeStyle = "#ffe14d"; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 1, 15, 7.5, 0, 0, 7); c.stroke(); }
  c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(0, 1, 10.5, 4.6, 0, 0, 7); c.fill();
  const ease = Math.min(1, prog * 5) * (prog > .8 ? (1 - prog) * 5 : 1);
  if (p.st === "tackle") { if (Math.abs(cf) > .35) { c.translate(0, -4); c.rotate(Math.sign(cf) * 1.35 * ease); c.translate(0, 4); } else c.scale(1, 1 - .4 * ease); }
  else if (p.st === "dive") { const d = Math.sign(p.vy || sf); c.translate(0, d * 10 * ease); if (d > 0) { c.translate(0, -10); c.rotate(Math.PI * .9 * ease); c.translate(0, 10); } c.scale(1, 1 + .22 * ease); }
  else if (p.st === "recv") c.scale(1, 1 - .07 * Math.sin(prog * Math.PI));
  else if (moving) c.rotate(clamp(p.vx / 260, -.15, .15));
  const sw = [Math.sin(ph), Math.sin(ph + Math.PI)];
  for (let li = 0; li < 2; li++) {
    const side = li ? 1 : -1, s = sw[li]; let fx = side * 3.4 + cf * amp * s * .9, fy = -1 + sf * amp * s * .55 - Math.max(0, s) * 2.2 * (amp / 8);
    if ((p.st === "shoot" || p.st === "pass") && side > 0) { const k = p.st === "shoot" ? 1 : .7, sg = prog < .35 ? -(prog / .35) * .7 : -.7 + (prog - .35) / .65 * 1.9; fx = 3.4 + cf * 11 * k * sg; fy = -1 + sf * 7 * k * sg - Math.max(0, sg) * 3; }
    if (p.st === "tackle") { fx = side * 3 + cf * (side > 0 ? 15 : 5) * ease; fy = -1 + sf * (side > 0 ? 9 : 3) * ease; }
    c.strokeStyle = kit.k; c.lineWidth = 4.6; c.lineCap = "round"; c.beginPath(); c.moveTo(side * 3.2, -11); c.lineTo(fx, fy - 2); c.stroke();
    c.fillStyle = "#111"; c.beginPath(); c.ellipse(fx + cf * 1.2, fy, 3.6, 2.3, 0, 0, 7); c.fill();
  }
  c.fillStyle = kit.s; c.beginPath(); c.moveTo(-6.2, -15); c.lineTo(6.2, -15); c.lineTo(7, -7.5); c.lineTo(-7, -7.5); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-7.4, -24); c.quadraticCurveTo(0, -27, 7.4, -24); c.lineTo(5.8, -12.5); c.lineTo(-5.8, -12.5); c.closePath();
  c.fillStyle = kit.j; c.fill(); c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = .8; c.stroke();
  c.fillStyle = kit.j2; c.fillRect(-6.6, -21, 13.2, 1.7);
  c.fillStyle = ap.skin; c.beginPath(); c.ellipse(0, -25.2, 2.6, 1.5, 0, 0, 7); c.fill();
  c.font = "bold 7px Arial"; c.textAlign = "center"; c.fillStyle = kit.t; c.fillText(p.num, 0, -15.2);
  for (let ai = 0; ai < 2; ai++) {
    const side = ai ? 1 : -1, s = -sw[ai], sx = side * 7.2; let hx = side * 8.6 + cf * amp * s * .8, hy = -14 + sf * amp * s * .5;
    if (p.shield) { hx = side * 14; hy = -17; } else if (p.st === "tackle") { hx = side * 12; hy = -20; } else if (p.st === "dive") { hx = side * 4; hy = -37; } else if (p.st === "recv") { hx = side * 6; hy = -10; }
    else if (p.st === "shoot" && side < 0) { hx = -12; hy = -18; }
    c.lineCap = "round"; c.strokeStyle = kit.j; c.lineWidth = 4.4; c.beginPath(); c.moveTo(sx, -23); c.lineTo(sx + (hx - sx) * .45, -23 + (hy + 23) * .45); c.stroke();
    c.strokeStyle = ap.skin; c.lineWidth = 3.1; c.beginPath(); c.moveTo(sx + (hx - sx) * .45, -23 + (hy + 23) * .45); c.lineTo(hx, hy); c.stroke();
    c.fillStyle = p.role === "GK" ? (p.team ? "#fff" : "#ff7a1a") : ap.skin; c.beginPath(); c.arc(hx, hy, p.role === "GK" ? 3 : 2, 0, 7); c.fill();
  }
  const hx = cf * 3, hy = -31.5 + sf * 1.6; c.fillStyle = ap.skin; c.beginPath(); c.arc(hx, hy, 5.2, 0, 7); c.fill(); c.fillStyle = ap.hair;
  if (sf < -.25) { c.beginPath(); c.arc(hx, hy, 5.5, 0, 7); c.fill(); }
  else { c.beginPath(); c.arc(hx, hy - .6, 5.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill(); if (Math.abs(cf) > .5) { c.beginPath(); c.ellipse(hx - cf * 2.4, hy - .4, 3.4, 4.4, 0, 0, 7); c.fill(); }
    c.fillStyle = "#1a1a1a"; for (const e of [-1, 1]) { c.beginPath(); c.arc(hx + cf * 2 + e * 1.6 * (1 - .6 * Math.abs(cf)), hy + .9, .75, 0, 7); c.fill(); } }
  if (isUser) { const by = -47 + Math.sin(time * 6) * 2; c.fillStyle = "#ffe14d"; c.beginPath(); c.moveTo(0, by + 6); c.lineTo(-5, by); c.lineTo(5, by); c.closePath(); c.fill(); }
  c.restore();
}
function makeRenderer(canvas) {
  const c = canvas.getContext("2d"), pitch = buildPitch(), cam = { x: W / 2, y: H / 2 }, trail = [], fx = []; let time = 0, flash = 0;
  return {
    pushEvents(m) {
      for (const e of m.events) {
        const T = { pass: "Passe", shot: "Tir !", tackle: "Tacle réussi", tkfail: "Tacle raté", save: "Arrêt !", catch: "Prise", intercept: "Interception", post: "Poteau !", recv: "Contrôle" }[e.t];
        if (T) fx.push({ x: e.x, y: e.y - 46, txt: T, t: 0 });
        if (e.t === "goal") flash = 1;
      }
    },
    draw(m, dt, userId, hint) {
      time += dt; const dpr = Math.min(devicePixelRatio || 1, 2), cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) { canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr); }
      const b = m.ball, u = m.byId[userId], zoom = Math.min(cw / (W + 90), ch / (H + 90)) * 1.3, vw = cw / zoom / 2, vh = ch / zoom / 2;
      const fxp = b.x * .6 + u.x * .4, fyp = b.y * .6 + u.y * .4, k = Math.min(1, dt * 4);
      cam.x += (fxp - cam.x) * k; cam.y += (fyp - cam.y) * k;
      const cx = vw * 2 < W + 2 * 45 ? clamp(cam.x, vw - 45, W + 45 - vw) : W / 2, cy = vh * 2 < H + 2 * 45 ? clamp(cam.y, vh - 45, H + 45 - vh) : H / 2;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#0d311f"; c.fillRect(0, 0, cw, ch);
      c.translate(cw / 2, ch / 2); c.scale(zoom, zoom); c.translate(-cx, -cy); c.drawImage(pitch, -M, -M, W + 2 * M, H + 2 * M);
      if (hint && m.phase === "play") { c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 1.6; c.beginPath(); c.ellipse(hint.x, hint.y + 1, 13, 6.5, 0, 0, 7); c.stroke(); }
      const sp = hyp(b.vx, b.vy); trail.push({ x: b.x, y: b.y - b.z * .6, s: sp }); if (trail.length > 10) trail.shift();
      if (sp > 260) for (let i = 0; i < trail.length; i++) { c.fillStyle = `rgba(255,255,255,${i / trail.length * .25})`; c.beginPath(); c.arc(trail[i].x, trail[i].y - 4, BR * .8, 0, 7); c.fill(); }
      const list = m.players.slice().sort((a, d) => a.y - d.y); let ballDrawn = false;
      const dBall = () => { c.fillStyle = `rgba(0,0,0,${.3 - Math.min(.2, b.z / 200)})`; c.beginPath(); c.ellipse(b.x, b.y + 1, BR * (1 + b.z / 90), BR * .55, 0, 0, 7); c.fill();
        c.save(); c.translate(b.x, b.y - BR * .8 - b.z * .6); c.fillStyle = "#fafafa"; c.beginPath(); c.arc(0, 0, BR, 0, 7); c.fill(); c.strokeStyle = "#222"; c.lineWidth = .8; c.stroke();
        c.rotate(b.roll); c.fillStyle = "#222"; c.beginPath(); c.arc(0, 0, 1.8, 0, 7); c.fill(); for (let i = 0; i < 5; i++) { const a = i * 1.2566; c.beginPath(); c.arc(Math.cos(a) * 4, Math.sin(a) * 4, 1, 0, 7); c.fill(); } c.restore(); };
      for (const p of list) { if (!ballDrawn && b.y < p.y && !b.owner) { dBall(); ballDrawn = true; } drawPlayer(c, p, p.id === userId, time); if (b.owner === p.id && !ballDrawn && (b.y >= p.y)) { dBall(); ballDrawn = true; } }
      if (!ballDrawn) dBall();
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; if (f.t > 1) { fx.splice(i, 1); continue; } c.globalAlpha = 1 - f.t; c.font = "bold 9px Arial"; c.textAlign = "center"; c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,.7)"; c.strokeText(f.txt, f.x, f.y - f.t * 14); c.fillStyle = "#fff"; c.fillText(f.txt, f.x, f.y - f.t * 14); c.globalAlpha = 1; }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash * .35})`; c.fillRect(0, 0, cw, ch); c.font = "900 " + Math.round(ch * .18) + "px Arial"; c.textAlign = "center"; c.fillStyle = "#fff"; c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 6; c.strokeText("BUT !", cw / 2, ch * .45); c.fillText("BUT !", cw / 2, ch * .45); flash = m.phase === "goal" ? Math.min(1, flash) : Math.max(0, flash - dt * 2); }
    }
  };
}
root.FRPRender = { makeRenderer, drawPlayer };

/* ======================= 3) UI / entrée tactile ======================= */
const $ = id => document.getElementById(id), canvas = $("game");
const match = createMatch({ seed: 7 }), session = new LocalSession(match), renderer = makeRenderer(canvas), USER = "b3";
const ui = { mx: 0, my: 0, sprint: false, def: false, pass: false, shoot: false, lp: false, ls: false };
session.onTick = () => { ui.lp = ui.ls = false; };
const zone = $("stick-zone"), base = $("stick-base"), knob = $("stick-knob"); let sp = null, bx = 0, by = 0;
const baseR = () => base.offsetWidth / 2 || 60;
zone.addEventListener("pointerdown", e => { e.preventDefault(); sp = e.pointerId; zone.setPointerCapture(sp); const z = zone.getBoundingClientRect(); bx = e.clientX; by = e.clientY; base.style.left = (bx - z.left) + "px"; base.style.top = (by - z.top) + "px"; base.classList.add("on"); setStick(e); });
function setStick(e) { const R = baseR(); let dx = (e.clientX - bx) / R, dy = (e.clientY - by) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } ui.mx = dx; ui.my = dy; knob.style.transform = `translate(${dx * R * .6}px,${dy * R * .6}px)`; }
zone.addEventListener("pointermove", e => { if (e.pointerId === sp) setStick(e); });
const relStick = e => { if (e.pointerId !== sp) return; sp = null; ui.mx = ui.my = 0; knob.style.transform = "translate(0,0)"; base.classList.remove("on"); };
zone.addEventListener("pointerup", relStick); zone.addEventListener("pointercancel", relStick);
function bind(id, down, up) { const el = $(id); el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("active"); down(); });
  ["pointerup", "pointercancel"].forEach(t => el.addEventListener(t, () => { el.classList.remove("active"); if (up) up(); })); }
bind("sprint", () => ui.sprint = true, () => ui.sprint = false); bind("defend", () => ui.def = true, () => ui.def = false);
bind("pass", () => { ui.pass = ui.lp = true; }, () => ui.pass = false); bind("shoot", () => { ui.shoot = ui.ls = true; }, () => ui.shoot = false);
const keys = {}; const KM = { ArrowUp: "u", w: "u", ArrowDown: "d", s: "d", ArrowLeft: "l", a: "l", ArrowRight: "r", d: "r" };
addEventListener("keydown", e => { if (KM[e.key]) keys[KM[e.key]] = 1; if (e.key === "Shift") ui.sprint = true; if (e.key === " ") ui.shoot = ui.ls = true; if (e.key === "e") ui.pass = ui.lp = true; if (e.key === "q") ui.def = true; });
addEventListener("keyup", e => { if (KM[e.key]) keys[KM[e.key]] = 0; if (e.key === "Shift") ui.sprint = false; if (e.key === " ") ui.shoot = false; if (e.key === "e") ui.pass = false; if (e.key === "q") ui.def = false; });
const msgEl = $("status"), clockEl = $("clock"), perEl = $("period"); let msg = "", msgT = 0, last = 0;
const MSG = { goal: "BUT !", half: "Mi-temps", second: "2e période", full: "Fin du match", tackle: "Tacle réussi", save: "Arrêt du gardien", post: "Poteau !" };
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
  let mx = ui.mx + (keys.r || 0) - (keys.l || 0), my = ui.my + (keys.d || 0) - (keys.u || 0);
  session.setInput(USER, { mx, my, sprint: ui.sprint, def: ui.def, pass: ui.pass || ui.lp, shoot: ui.shoot || ui.ls });
  session.update(dt); renderer.pushEvents(match);
  for (const e of match.events) { if (MSG[e.t]) { msg = MSG[e.t]; msgT = 1.6; } }
  const u = match.byId[USER]; let hint = null;
  if (match.ball.owner === USER) { const d = Math.hypot(mx, my) > .12 ? Math.atan2(my, mx) : u.f, q = pickMate(match, u, d, false); hint = q; }
  renderer.draw(match, dt, USER, hint);
  $("blue-score").textContent = match.score[0]; $("red-score").textContent = match.score[1];
  const cl = Math.ceil(match.clock); clockEl.textContent = String(Math.floor(cl / 60)).padStart(2, "0") + ":" + String(cl % 60).padStart(2, "0");
  perEl.textContent = match.period === 1 ? "1RE PÉRIODE" : "2E PÉRIODE"; $("stamina-fill").style.width = u.stam + "%"; $("stamina-fill").classList.toggle("low", u.stam < 25);
  if (msgT > 0) { msgT -= dt; msgEl.textContent = msg; } else msgEl.textContent = match.ball.owner === USER ? "TU AS LE BALLON" : match.phase === "kickoff" ? "Coup d'envoi" : "";
  const ov = $("overlay"), show = match.phase === "halftime" || match.phase === "full";
  ov.classList.toggle("hidden", !show);
  if (show) { $("overlay-title").textContent = match.phase === "full" ? "Fin du match" : "Mi-temps"; $("overlay-text").textContent = match.phase === "full" ? `Score final : ${match.score[0]} — ${match.score[1]}` : `${match.score[0]} — ${match.score[1]} · reprise dans un instant`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})(typeof window !== "undefined" ? window : globalThis);
