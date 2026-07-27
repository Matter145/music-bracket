import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GENRES, genrePool, genreArtists, combinedArtists } from "./data/index.js";

/* ================================================================== *
 * Music Bracket
 * Two ways to play four games (Bracket · Blind Rank · Tier List · Festival lineup):
 *   A) Pick a genre  → built-in local song database, no API, instant
 *   B) Paste albums  → one or more Spotify album links, fetched live
 * The genre database is the driver; albums are the personal layer.
 * ================================================================== */

const INK = "#17140F", PAPER = "#E9E3D4", RED = "#EE3B26", BLUE = "#2439DB";

// ---- BRANDING — edit these two lines only ----
const HANDLE = "@CornishIndieRockGuy";
const SITE_URL = "musicbracket.vercel.app";   // ← put your real site URL here (no https://)

// ---------- link parsing ----------
function parseSpotifyLink(raw) {
  const s = (raw || "").trim();
  let m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?)(playlist|album)\/([A-Za-z0-9]+)/);
  if (m) return { kind: m[1], id: m[2] };
  m = s.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/);
  if (m) return { kind: m[1], id: m[2] };
  if (/^[A-Za-z0-9]{22}$/.test(s)) return { kind: "album", id: s };
  return null;
}

// ---------- helpers ----------
const slice = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const initials = (name) => { const c = (name || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/); return (c.length === 1 ? c[0].slice(0, 2) : c[0][0] + c[c.length - 1][0]).toUpperCase(); };
function shuffleTake(arr, k) {
  const idx = arr.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, k).map((i) => arr[i]);
}
// Random draw of n items with at most maxPer per artist; falls back to fill
// if the cap can't reach n (e.g. a single-artist album pool).
function drawCapped(pool, n, maxPer = 3) {
  const shuffled = shuffleTake(pool, pool.length);
  const counts = {}, out = [];
  for (const t of shuffled) { const a = t.sub || t.name; if ((counts[a] || 0) < maxPer) { counts[a] = (counts[a] || 0) + 1; out.push(t); if (out.length === n) return out; } }
  for (const t of shuffled) { if (!out.includes(t)) { out.push(t); if (out.length === n) break; } }
  return out;
}
function downloadURL(url, name) { if (!url) return; const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
// Collapse a track pool down to its unique artists (uses each track's `sub`).
function artistPool(pool) {
  const seen = new Map();
  pool.forEach((t) => { if (t.sub && !seen.has(t.sub)) seen.set(t.sub, { id: "artist-" + seen.size, name: t.sub, sub: null, img: t.img || null }); });
  return [...seen.values()];
}
async function shareURL(url, name, text) {
  if (!url) return;
  try { const b = await (await fetch(url)).blob(); const f = new File([b], name, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text }); return; } } catch (e) {}
  downloadURL(url, name);
}
async function loadFonts() { try { await Promise.all([document.fonts.load('64px "Anton"'), document.fonts.load('700 20px "Space Grotesk"'), document.fonts.load('20px "Space Mono"')]); } catch (e) {} }
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
const _qrCache = {};
async function qrDataUrl(text) {
  if (_qrCache[text]) return _qrCache[text];
  const QR = (await import("qrcode")).default;   // dynamic: absent in preview, present once installed
  const u = await QR.toDataURL(text, { margin: 1, width: 240, color: { dark: "#17140F", light: "#E9E3D4" } });
  _qrCache[text] = u; return u;
}
// Draws the QR bottom-right of a poster; silently no-ops if qrcode isn't installed.
async function drawFooterQR(g, S) {
  try {
    const img = await loadImage(await qrDataUrl("https://" + SITE_URL));
    const sz = 120, x = S - 48 - sz, y = S - 60 - sz;
    g.fillStyle = PAPER; g.fillRect(x - 7, y - 7, sz + 14, sz + 14);
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x - 7, y - 7, sz + 14, sz + 14);
    g.drawImage(img, x, y, sz, sz);
    g.fillStyle = INK; g.font = '12px "Space Mono", monospace'; g.textAlign = "center";
    g.fillText("SCAN TO PLAY", x + sz / 2, y + sz + 20); g.textAlign = "left";
  } catch (e) { /* no qrcode available (preview) — poster renders without it */ }
}
function posterChrome(g, S, title, meta) {
  g.fillStyle = PAPER; g.fillRect(0, 0, S, S);
  g.fillStyle = "rgba(23,20,15,0.06)";
  for (let x = 0; x < S; x += 12) for (let y = 0; y < S; y += 12) { g.beginPath(); g.arc(x, y, 1, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 10; g.strokeRect(24, 24, S - 48, S - 48);
  g.fillStyle = INK; g.textBaseline = "alphabetic";
  g.font = '58px "Anton", sans-serif'; g.fillText(title, 56, 112);
  g.font = '20px "Space Mono", monospace'; g.fillText(slice(meta.toUpperCase(), 44), 58, 142);
  // ---- branded footer: small mark + handle + URL ----
  const fy = S - 44;
  g.fillStyle = RED; g.fillRect(56, fy - 20, 26, 26);            // mark: red square…
  g.fillStyle = PAPER; g.font = '700 18px "Anton"'; g.fillText("M", 62, fy); // …with an M
  g.fillStyle = INK; g.font = '700 20px "Anton", sans-serif'; g.fillText(HANDLE.toUpperCase(), 92, fy);
  g.font = '16px "Space Mono", monospace'; g.globalAlpha = .7;
  g.fillText(SITE_URL, 92, fy + 22); g.globalAlpha = 1;
}

// ---------- bracket geometry ----------
const ROW_H = 36, TOP = 18, COL_W = 178, PILL_W = 152, PILL_H = 32, LM = 8;
// Split a label onto up to two lines instead of truncating.
function wrapLabel(name, max = 20) {
  if (name.length <= max) return [name];
  const words = name.split(" ");
  let l1 = "";
  for (const w of words) { if ((l1 + " " + w).trim().length <= max) l1 = (l1 + " " + w).trim(); else break; }
  let l2 = name.slice(l1.length).trim();
  if (!l1) { l1 = name.slice(0, max); l2 = name.slice(max); }
  if (l2.length > max) l2 = l2.slice(0, max - 1) + "…";
  return [l1, l2];
}
const colX = (c) => LM + c * COL_W;
function seedOrder(n) { let r = [1]; while (r.length < n) { const s = r.length * 2, nx = []; for (const x of r) { nx.push(x); nx.push(s + 1 - x); } r = nx; } return r; }
function computeGeometry(rounds) {
  const slotY = (i) => TOP + (i + 0.5) * ROW_H, centers = [];
  for (let r = 0; r < rounds.length; r++) { centers[r] = []; for (let m = 0; m < rounds[r].length; m++) centers[r][m] = r === 0 ? (slotY(2 * m) + slotY(2 * m + 1)) / 2 : (centers[r - 1][2 * m] + centers[r - 1][2 * m + 1]) / 2; }
  return { slotY, centers };
}
function currentMatch(rounds) { for (let r = 0; r < rounds.length; r++) for (let m = 0; m < rounds[r].length; m++) { const mt = rounds[r][m]; if (!mt.winner && mt.a && mt.b) return { r, m }; } return null; }
function buildColumns(rounds, seeded, geo) {
  const R = rounds.length, cols = [];
  for (let c = 0; c <= R; c++) {
    const pills = [];
    if (c === 0) for (let i = 0; i < seeded.length; i++) { const e = seeded[i], mt = rounds[0][Math.floor(i / 2)]; pills.push({ e, y: geo.slotY(i), state: mt.winner ? (mt.winner.id === e.id ? "win" : "lose") : "on" }); }
    else if (c < R) for (let j = 0; j < rounds[c - 1].length; j++) { const e = rounds[c - 1][j].winner, mt = rounds[c][Math.floor(j / 2)]; pills.push({ e, y: geo.centers[c - 1][j], state: !e ? "empty" : mt.winner ? (mt.winner.id === e.id ? "win" : "lose") : "on" }); }
    else { const e = rounds[R - 1][0].winner; pills.push({ e, y: geo.centers[R - 1][0], state: e ? "champ" : "empty" }); }
    cols.push(pills);
  }
  const cur = currentMatch(rounds);
  if (cur) { const p = cols[cur.r]; if (p[cur.m * 2]) p[cur.m * 2].cur = true; if (p[cur.m * 2 + 1]) p[cur.m * 2 + 1].cur = true; }
  return cols;
}
function makeBracket(pool, size) {
  const n = size || (pool.length >= 16 ? 16 : pool.length >= 8 ? 8 : 0); if (!n) return null;
  const picked = drawCapped(pool, n, 3);
  const order = seedOrder(n).map((s) => picked[s - 1]);
  const rounds = []; let mc = n / 2; const first = [];
  for (let i = 0; i < mc; i++) first.push({ a: order[i * 2], b: order[i * 2 + 1], winner: null });
  rounds.push(first); mc /= 2;
  while (mc >= 1) { const r = []; for (let i = 0; i < mc; i++) r.push({ a: null, b: null, winner: null }); rounds.push(r); mc /= 2; }
  return { rounds, seeded: order };
}
const roundName = (s) => ({ 16: "Round of 16", 8: "Quarter-final", 4: "Semi-final", 2: "Final" }[s] || `Round of ${s}`);

// ================= shared bits =================
function Tile({ a, ground, size = 30 }) { return <div className="mb-tile" style={{ background: ground }}>{a.img ? <img src={a.img} alt="" /> : <span className="ini mb-anton" style={{ fontSize: size }}>{initials(a.name)}</span>}</div>; }
function Chip({ a, onClick, selected }) {
  return (
    <button className={"mb-chip" + (selected ? " sel" : "")} onClick={onClick}>
      <span className="mb-chip-img" style={{ background: a.img ? undefined : INK }}>{a.img ? <img src={a.img} alt="" /> : <span>{initials(a.name)}</span>}</span>
      <span className="mb-chip-name">{slice(a.name, 22)}{a.sub ? <em>{slice(a.sub, 22)}</em> : null}</span>
    </button>
  );
}

// ================= GAME 1: Bracket =================
function BracketMap({ rounds, seeded }) {
  const geo = useMemo(() => computeGeometry(rounds), [rounds]);
  const cols = useMemo(() => buildColumns(rounds, seeded, geo), [rounds, seeded, geo]);
  const R = rounds.length, n = rounds[0].length * 2, W = colX(R) + PILL_W + LM, H = TOP * 2 + n * ROW_H, conns = [];
  for (let c = 0; c < R; c++) for (let m = 0; m < rounds[c].length; m++) {
    const yA = cols[c][m * 2].y, yB = cols[c][m * 2 + 1].y, yT = cols[c + 1][m].y, x1 = colX(c) + PILL_W, x2 = colX(c + 1), xm = (x1 + x2) / 2;
    conns.push(`M${x1} ${yA} H${xm} V${yT} M${x1} ${yB} H${xm} V${yT} M${xm} ${yT} H${x2}`);
  }
  const fill = (s) => (s === "win" || s === "champ" ? INK : PAPER), txt = (s) => (s === "win" || s === "champ" ? PAPER : INK);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} role="img" aria-label="Bracket">
      {conns.map((d, i) => <path key={i} d={d} stroke={INK} strokeWidth="1.5" fill="none" opacity=".5" />)}
      {cols.map((pills, c) => pills.map((p, i) => p.state === "empty"
        ? <rect key={c + "-" + i} x={colX(c)} y={p.y - PILL_H / 2} width={PILL_W} height={PILL_H} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="3 3" opacity=".4" />
        : <g key={c + "-" + i} opacity={p.state === "lose" ? .45 : 1}>
            <rect x={colX(c)} y={p.y - PILL_H / 2} width={PILL_W} height={PILL_H} fill={fill(p.state)} stroke={p.cur ? RED : INK} strokeWidth={p.cur ? 3 : 1.5} />
            {(() => { const ls = wrapLabel(p.e.name, 20); return ls.length === 1
              ? <text x={colX(c) + 8} y={p.y + 4} fontFamily="Space Grotesk" fontWeight="700" fontSize="11" fill={txt(p.state)}>{ls[0]}</text>
              : <text x={colX(c) + 8} fontFamily="Space Grotesk" fontWeight="700" fontSize="11" fill={txt(p.state)}><tspan x={colX(c) + 8} y={p.y - 2}>{ls[0]}</tspan><tspan x={colX(c) + 8} y={p.y + 11}>{ls[1]}</tspan></text>; })()}
          </g>))}
    </svg>
  );
}
async function bracketImage(rounds, seeded, champ, meta) {
  await loadFonts(); const S = 1080, cv = document.createElement("canvas"); cv.width = S; cv.height = S; const g = cv.getContext("2d");
  posterChrome(g, S, "BRACKET BATTLES", meta);
  const geo = computeGeometry(rounds), cols = buildColumns(rounds, seeded, geo), R = rounds.length, n = rounds[0].length * 2;
  const Wb = colX(R) + PILL_W + LM, Hb = TOP * 2 + n * ROW_H, regX = 56, regY = 180, regW = S - 112, regH = 560;
  const sc = Math.min(regW / Wb, regH / Hb), ox = regX + (regW - Wb * sc) / 2, oy = regY + (regH - Hb * sc) / 2, X = (v) => ox + v * sc, Y = (v) => oy + v * sc;
  g.strokeStyle = INK; g.lineWidth = 1.5;
  for (let c = 0; c < R; c++) for (let m = 0; m < rounds[c].length; m++) {
    const yA = cols[c][m * 2].y, yB = cols[c][m * 2 + 1].y, yT = cols[c + 1][m].y, x1 = colX(c) + PILL_W, x2 = colX(c + 1), xm = (x1 + x2) / 2;
    g.globalAlpha = .5; g.beginPath(); g.moveTo(X(x1), Y(yA)); g.lineTo(X(xm), Y(yA)); g.lineTo(X(xm), Y(yT)); g.moveTo(X(x1), Y(yB)); g.lineTo(X(xm), Y(yB)); g.lineTo(X(xm), Y(yT)); g.moveTo(X(xm), Y(yT)); g.lineTo(X(x2), Y(yT)); g.stroke(); g.globalAlpha = 1;
  }
  cols.forEach((pills, c) => pills.forEach((p) => {
    if (p.state === "empty") return;
    const px = X(colX(c)), py = Y(p.y - PILL_H / 2), pw = PILL_W * sc, ph = PILL_H * sc, won = p.state === "win" || p.state === "champ";
    g.globalAlpha = p.state === "lose" ? .45 : 1;
    g.fillStyle = won ? INK : PAPER; g.fillRect(px, py, pw, ph); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(px, py, pw, ph);
    g.fillStyle = won ? PAPER : INK; g.font = `700 ${10.5 * sc}px "Space Grotesk"`; g.fillText(slice(p.e.name, 20), px + 5 * sc, py + ph / 2 + 4 * sc);
    g.globalAlpha = 1;
  }));
  g.fillStyle = INK; g.fillRect(48, S - 300, S - 96, 4); g.font = '22px "Space Mono"'; g.fillText("CHAMPION", 56, S - 262);
  const nm = slice(champ.name, 16); g.font = '58px "Anton"';
  g.fillStyle = INK; g.fillText(nm, 56, S - 208);
  await drawFooterQR(g, S);
  return cv.toDataURL("image/png");
}
function Bracket({ pool, label, onHome }) {
  const sizes = useMemo(() => [8, 16, 32].filter((s) => pool.length >= s), [pool]);
  const [size, setSize] = useState(null);
  const [rounds, setRounds] = useState(null);
  const [seeded, setSeeded] = useState(null);
  const [anim, setAnim] = useState(null);
  const [champ, setChamp] = useState(null);
  const [img, setImg] = useState(null);
  const start = (s) => { const nb = makeBracket(pool, s); setSize(s); setRounds(nb.rounds); setSeeded(nb.seeded); setChamp(null); setImg(null); };
  useEffect(() => { if (sizes.length === 1) start(sizes[0]); /* eslint-disable-next-line */ }, []);
  const pick = (top) => {
    if (anim || !cur) return; const mt = rounds[cur.r][cur.m], w = top ? mt.a : mt.b; setAnim(top ? "t" : "b");
    setTimeout(async () => {
      const nx = rounds.map((rd) => rd.map((m) => ({ ...m }))); nx[cur.r][cur.m].winner = w;
      if (cur.r + 1 < nx.length) { const tm = nx[cur.r + 1][Math.floor(cur.m / 2)]; if (cur.m % 2 === 0) tm.a = w; else tm.b = w; }
      setRounds(nx); setAnim(null);
      const fin = nx[nx.length - 1][0].winner;
      if (fin) { setChamp(fin); try { setImg(await bracketImage(nx, seeded, fin, label)); } catch (e) {} }
    }, 320);
  };
  const again = () => start(size);

  // size chooser (only when more than one size is possible and none picked yet)
  if (!rounds || !seeded) return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Bracket size</div><div className="mb-round mb-mono">{slice(label, 22)}</div></div>
      <p className="mb-note mb-mono">How many go into the draw?</p>
      <div className="mb-sizegrid">
        {sizes.map((s) => <button key={s} className="mb-sizebtn mb-anton" onClick={() => start(s)}>{s}</button>)}
      </div>
      <div className="mb-actions"><button className="mb-btn ghost" onClick={onHome}>‹ Menu</button></div>
    </div>
  );
  const cur = currentMatch(rounds);
  const total = seeded.length - 1;
  const done = rounds.reduce((s, rd) => s + rd.filter((m) => m.winner).length, 0);
  if (champ) return (
    <div className="mb-shell">
      <div className="mb-champ"><div className="eyebrow mb-mono">Tonight's headliner</div><h1 className="mb-anton headliner">{champ.name}</h1>{champ.sub && <div className="csub">{champ.sub}</div>}</div>
      {img ? <img className="mb-shareimg" src={img} alt="Bracket" style={{ width: 400 }} /> : <p className="mb-mono" style={{ textAlign: "center" }}>Rendering…</p>}
      <div className="mb-actions">
        <button className="mb-btn" onClick={() => shareURL(img, "bracket.png", `My champion: ${champ.name}\n\nMake yours at https://${SITE_URL} ${HANDLE}`)}>Share</button>
        <button className="mb-btn ghost" onClick={() => downloadURL(img, "bracket.png")}>Save</button>
        <button className="mb-btn ghost" onClick={again}>Run it back</button>
        <button className="mb-btn ghost" onClick={onHome}>Menu</button>
      </div>
    </div>
  );
  const mt = rounds[cur.r][cur.m], pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Bracket Battles</div><div className="mb-round mb-mono">{roundName(rounds[cur.r].length * 2)}<br />{cur.m + 1} / {rounds[cur.r].length}</div></div>
      <div className="mb-progress"><span style={{ width: pct + "%" }} /></div>
      <div className="mb-vs-wrap">
        <button className={"mb-panel" + (anim === "t" ? " win" : anim === "b" ? " out" : "")} onClick={() => pick(true)}><Tile a={mt.a} ground={RED} /><span className="mb-corner mb-mono" style={{ background: RED }}>A</span><div className="mb-pb"><div className="mb-anton mb-name">{mt.a.name}</div>{mt.a.sub && <div className="mb-sub">{mt.a.sub}</div>}</div></button>
        <div className="mb-vs mb-anton">VS</div>
        <button className={"mb-panel" + (anim === "b" ? " win" : anim === "t" ? " out" : "")} onClick={() => pick(false)}><Tile a={mt.b} ground={BLUE} /><span className="mb-corner mb-mono" style={{ background: BLUE }}>B</span><div className="mb-pb"><div className="mb-anton mb-name">{mt.b.name}</div>{mt.b.sub && <div className="mb-sub">{mt.b.sub}</div>}</div></button>
      </div>
      <div className="mb-mapwrap"><div className="mb-maphead"><h3 className="mb-anton">The draw</h3><span className="mb-mono" style={{ fontSize: 11, opacity: .6 }}>scroll →</span></div><div className="mb-mapscroll"><BracketMap rounds={rounds} seeded={seeded} /></div></div>
      <div className="mb-actions"><button className="mb-btn ghost" onClick={onHome}>Menu</button></div>
    </div>
  );
}

// ================= GAME 2: Blind Rank Top 5 =================
async function blindImage(slots, label) {
  await loadFonts(); const S = 1080, cv = document.createElement("canvas"); cv.width = S; cv.height = S; const g = cv.getContext("2d");
  posterChrome(g, S, "BLIND RANK", label);
  let y = 250;
  slots.forEach((t, i) => {
    if (!t) return;
    g.fillStyle = i === 0 ? RED : INK; g.fillRect(56, y - 44, 72, 72);
    g.fillStyle = PAPER; g.font = '46px "Anton"'; g.fillText(String(i + 1), 78, y + 8);
    g.fillStyle = INK; g.font = '38px "Anton"'; g.fillText(slice(t.name, 24), 148, y - 6);
    if (t.sub) { g.font = '20px "Space Mono"'; g.globalAlpha = .65; g.fillText(slice(t.sub, 34), 148, y + 20); g.globalAlpha = 1; }
    y += 108;
  });
  await drawFooterQR(g, S);
  return cv.toDataURL("image/png");
}
function BlindRank({ pool, label, onHome }) {
  const [five, setFive] = useState(() => drawCapped(pool, 5, 3));
  const [slots, setSlots] = useState([null, null, null, null, null]);
  const [idx, setIdx] = useState(0);
  const [img, setImg] = useState(null);
  const [flash, setFlash] = useState(false);
  const done = idx >= 5;
  useEffect(() => { if (done && !img) blindImage(slots, label).then(setImg).catch(() => {}); }, [done, img, slots, label]);
  const place = (s) => {
    if (done || slots[s]) return;
    const ns = [...slots]; ns[s] = five[idx]; setSlots(ns); setIdx(idx + 1);
    setFlash(true); setTimeout(() => setFlash(false), 260);
  };
  const reset = () => { setFive(drawCapped(pool, 5, 3)); setSlots([null, null, null, null, null]); setIdx(0); setImg(null); };
  const cur = !done ? five[idx] : null;
  return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Blind Rank</div><div className="mb-round mb-mono">{done ? "final five" : `track ${idx + 1} of 5`}</div></div>
      {!done ? <>
        <p className="mb-note mb-mono">Place it now. You <b>can't</b> move it later — and you don't get to see what's coming.</p>
        <div className={"mb-nowcard" + (flash ? " flash" : "")}>
          <Tile a={cur} ground={idx % 2 ? BLUE : RED} size={34} />
          <div className="mb-pb"><div className="mb-anton mb-name">{cur.name}</div>{cur.sub && <div className="mb-sub">{cur.sub}</div>}</div>
        </div>
        <div className="mb-slotgrid">
          {slots.map((t, i) => (
            <button key={i} className={"mb-slot" + (t ? " filled" : "")} onClick={() => place(i)} disabled={!!t}>
              <span className="mb-slotnum mb-anton">{i + 1}</span>
              <span className="mb-slottext">{t ? <b>{slice(t.name, 26)}</b> : <em>tap to place here</em>}</span>
            </button>
          ))}
        </div>
      </> : <>
        <div className="mb-slotgrid">
          {slots.map((t, i) => (
            <div key={i} className="mb-slot filled">
              <span className="mb-slotnum mb-anton" style={{ background: i === 0 ? RED : INK }}>{i + 1}</span>
              <span className="mb-slottext"><b>{slice(t.name, 26)}</b>{t.sub && <em>{slice(t.sub, 26)}</em>}</span>
            </div>
          ))}
        </div>
        {img ? <img className="mb-shareimg" src={img} alt="Blind rank" style={{ width: 360 }} /> : <p className="mb-mono" style={{ textAlign: "center" }}>Rendering…</p>}
      </>}
      <div className="mb-actions">
        {done && <><button className="mb-btn" onClick={() => shareURL(img, "blindrank.png", `My blind ranking\n\nMake yours at https://${SITE_URL} ${HANDLE}`)}>Share</button><button className="mb-btn ghost" onClick={() => downloadURL(img, "blindrank.png")}>Save</button></>}
        <button className="mb-btn ghost" onClick={reset}>{done ? "New five" : "Start over"}</button>
        <button className="mb-btn ghost" onClick={onHome}>Menu</button>
      </div>
    </div>
  );
}

// ================= GAME 3: Tier List =================
const TIERS = [{ k: "S", c: RED }, { k: "A", c: BLUE }, { k: "B", c: INK }, { k: "C", c: "rgba(23,20,15,.55)" }, { k: "D", c: "rgba(23,20,15,.3)" }];
async function tierImage(items, placements, label) {
  await loadFonts(); const S = 1080, cv = document.createElement("canvas"); cv.width = S; cv.height = S; const g = cv.getContext("2d");
  posterChrome(g, S, "TIER LIST", label);
  let y = 190; const rowH = 136, labelW = 120, x0 = 56, areaW = S - 112 - labelW;
  TIERS.forEach((t) => {
    g.fillStyle = t.c; g.fillRect(x0, y, labelW, rowH - 12);
    g.fillStyle = PAPER; g.font = '54px "Anton"'; g.fillText(t.k, x0 + labelW / 2 - 16, y + rowH / 2 + 6);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0 + labelW, y, areaW, rowH - 12);
    let cx = x0 + labelW + 12, cy = y + 14; const cw = 150, ch = 30;
    items.filter((i) => placements[i.id] === t.k).forEach((it) => {
      if (cx + cw > x0 + labelW + areaW - 8) { cx = x0 + labelW + 12; cy += ch + 8; }
      if (cy + ch > y + rowH - 14) return;
      g.fillStyle = INK; g.fillRect(cx, cy, cw, ch); g.fillStyle = PAPER; g.font = '600 14px "Space Grotesk"'; g.fillText(slice(it.name, 16), cx + 6, cy + 20); cx += cw + 8;
    });
    y += rowH;
  });
  await drawFooterQR(g, S);
  return cv.toDataURL("image/png");
}
function TierList({ pool, label, onHome }) {
  const items = useMemo(() => drawCapped(pool, Math.min(18, pool.length), 3), [pool]);
  const [placements, setPlacements] = useState({});
  const [sel, setSel] = useState(null);
  const [finished, setFinished] = useState(false);
  const [img, setImg] = useState(null);
  const tray = items.filter((i) => !placements[i.id]);
  const place = (k) => { if (sel) { setPlacements((p) => ({ ...p, [sel]: k })); setSel(null); } };
  const toTray = () => { if (sel) { setPlacements((p) => ({ ...p, [sel]: null })); setSel(null); } };
  const finish = async () => { setFinished(true); try { setImg(await tierImage(items, placements, label)); } catch (e) {} };
  return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Tier List</div><div className="mb-round mb-mono">tap a chip,<br />then a tier</div></div>
      {TIERS.map((t) => (
        <div key={t.k} className="mb-tier" onClick={() => place(t.k)}>
          <div className="mb-tier-label" style={{ background: t.c }}>{t.k}</div>
          <div className="mb-tier-area">{items.filter((i) => placements[i.id] === t.k).map((i) => <Chip key={i.id} a={i} selected={sel === i.id} onClick={(e) => { e.stopPropagation(); setSel(sel === i.id ? null : i.id); }} />)}</div>
        </div>
      ))}
      <div className="mb-tray" onClick={toTray}>
        <div className="mb-tray-head mb-mono">UNRANKED{sel ? " · tap a tier to place" : ""}</div>
        <div className="mb-tray-chips">{tray.map((i) => <Chip key={i.id} a={i} selected={sel === i.id} onClick={(e) => { e.stopPropagation(); setSel(sel === i.id ? null : i.id); }} />)}</div>
      </div>
      {finished && img && <img className="mb-shareimg" src={img} alt="Tier list" style={{ width: 380 }} />}
      <div className="mb-actions">
        {!finished ? <button className="mb-btn" onClick={finish} disabled={tray.length === items.length}>Finish</button>
          : <><button className="mb-btn" onClick={() => shareURL(img, "tierlist.png", `My tier list\n\nMake yours at https://${SITE_URL} ${HANDLE}`)}>Share</button><button className="mb-btn ghost" onClick={() => downloadURL(img, "tierlist.png")}>Save</button></>}
        <button className="mb-btn ghost" onClick={onHome}>Menu</button>
      </div>
    </div>
  );
}

// ================= GAME 4: Festival Lineup =================
const BUDGETS = [50, 75, 100];
const DAY_SETS = { 1: ["Saturday"], 2: ["Saturday", "Sunday"], 3: ["Friday", "Saturday", "Sunday"] };
const dayNames = (n) => DAY_SETS[n] || ["Friday", "Saturday", "Sunday"].slice(0, n);
async function festivalImage(byDay, days, budget, spent, meta) {
  await loadFonts(); const S = 1080, cv = document.createElement("canvas"); cv.width = S; cv.height = S; const g = cv.getContext("2d");
  posterChrome(g, S, "MY FESTIVAL", meta);
  const DN = dayNames(days);
  const x0 = 56, regRight = S - 56, colW = (regRight - x0) / days;
  const lineGap = 16, headerH = 44;
  // build each day's lines with font sizes
  const dayBlocks = byDay.map((acts) => {
    const sorted = [...acts].sort((a, b) => b.price - a.price);
    return sorted.map((a, i) => ({ name: i === 0 ? a.name.toUpperCase() : a.name, size: i === 0 ? 40 : i < 3 ? 26 : 20 }));
  });
  const heights = dayBlocks.map((lines) => lines.reduce((h, l) => h + l.size + lineGap, 0));
  const contentH = headerH + Math.max(60, ...heights);
  const regTop = 200, regBottom = S - 150;
  // vertically centre the bill (slight upward bias)
  const blockTop = regTop + Math.max(0, (regBottom - regTop - contentH) * 0.42);
  const dividerBottom = blockTop + contentH;
  g.textAlign = "center";
  for (let d = 0; d < days; d++) {
    const cx = x0 + colW * d + colW / 2;
    if (d > 0) { g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + colW * d, blockTop - 8); g.lineTo(x0 + colW * d, dividerBottom); g.stroke(); }
    g.fillStyle = INK; g.font = '20px "Space Mono"'; g.fillText(DN[d].toUpperCase(), cx, blockTop + 18);
    let y = blockTop + headerH + 26;
    dayBlocks[d].forEach((l) => {
      g.font = `${l.size}px "Anton"`;
      const maxc = Math.floor((colW - 14) / (l.size * 0.52));
      g.fillText(slice(l.name, Math.max(8, maxc)), cx, y);
      y += l.size + lineGap;
    });
  }
  g.textAlign = "left"; g.fillStyle = INK; g.font = '18px "Space Mono"'; g.globalAlpha = .7;
  g.fillText(`${days} day${days > 1 ? "s" : ""} · ${byDay.flat().length} acts · £${spent} spent`, 56, S - 236); g.globalAlpha = 1;
  await drawFooterQR(g, S);
  return cv.toDataURL("image/png");
}
function Festival({ pools, label, onHome }) {
  // pools: { all: [...], byGenre: { "Modern Indie": [...], "2000s Indie": [...] } }
  const eras = ["All", ...Object.keys(pools.byGenre)];
  const [era, setEra] = useState("All");
  const artists = era === "All" ? pools.all : pools.byGenre[era];
  const [days, setDays] = useState(null);
  const [budget, setBudget] = useState(null);
  const [placement, setPlacement] = useState({});   // artistId -> day index
  const [selected, setSelected] = useState({});      // artistId -> true (staged, not yet placed)
  const [done, setDone] = useState(false);
  const [img, setImg] = useState(null);
  const [openTiers, setOpenTiers] = useState({ 25: true });   // which price tiers are expanded

  const chosen = artists.filter((a) => placement[a.id] != null);
  const spent = chosen.reduce((s, a) => s + a.price, 0);
  const stagedCost = artists.filter((a) => selected[a.id]).reduce((s, a) => s + a.price, 0);
  const remaining = (budget || 0) - spent;
  const selCount = Object.keys(selected).length;
  const byDay = Array.from({ length: days || 0 }, (_, d) => artists.filter((a) => placement[a.id] === d));
  const DN = days ? dayNames(days) : [];

  const changeEra = (e) => { setEra(e); setPlacement({}); setSelected({}); };
  // Tap an artist: placed → remove it; unplaced → toggle in the staged selection (budget-blocked).
  const onChipTap = (a) => {
    if (placement[a.id] != null) { const p = { ...placement }; delete p[a.id]; setPlacement(p); return; }
    if (days === 1) { if (a.price <= remaining) setPlacement({ ...placement, [a.id]: 0 }); return; }
    if (selected[a.id]) { const s = { ...selected }; delete s[a.id]; setSelected(s); return; }
    if (stagedCost + a.price > remaining) return;   // would bust the budget
    setSelected({ ...selected, [a.id]: true });
  };
  // Tap a day in the sticky bar: drop the whole staged selection onto it.
  const placeSelectedOn = (d) => {
    if (!selCount) return;
    const p = { ...placement };
    Object.keys(selected).forEach((id) => { p[id] = d; });
    setPlacement(p); setSelected({});
  };
  const finish = async () => { setDone(true); try { setImg(await festivalImage(byDay, days, budget, spent, era === "All" ? "All Indie" : era)); } catch (e) {} };

  // 1. days
  if (!days) return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Festival Lineup</div><div className="mb-round mb-mono">{artists.length} acts</div></div>
      <div className="mb-rankby mb-mono">Line-up pool</div>
      <div className="mb-toggle">
        {eras.map((e) => <button key={e} className={era === e ? "on" : ""} onClick={() => changeEra(e)}>{e === "All" ? "All" : e.replace(" Indie", "")}</button>)}
      </div>
      <p className="mb-note mb-mono">How many days is your festival?</p>
      <div className="mb-sizegrid">{[1, 2, 3].map((n) => <button key={n} className="mb-sizebtn mb-anton" onClick={() => setDays(n)}>{n}</button>)}</div>
      <div className="mb-actions"><button className="mb-btn ghost" onClick={onHome}>‹ Menu</button></div>
    </div>
  );
  // 2. budget
  if (!budget) return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Festival Lineup</div><div className="mb-round mb-mono">{days} day{days > 1 ? "s" : ""}</div></div>
      <p className="mb-note mb-mono">Pick your total budget — spend it across the {days === 1 ? "day" : days + " days"} however you like.</p>
      <div className="mb-sizegrid">{BUDGETS.map((b) => <button key={b} className="mb-sizebtn mb-anton" style={{ fontSize: 26 }} onClick={() => setBudget(b * days)}>£{b * days}</button>)}</div>
      <div className="mb-actions"><button className="mb-btn ghost" onClick={() => setDays(null)}>‹ Back</button></div>
    </div>
  );
  // done
  if (done) return (
    <div className="mb-shell">
      <div className="mb-champ"><div className="eyebrow mb-mono">The bill</div><h1 className="mb-anton" style={{ fontSize: "clamp(32px,9vw,64px)", lineHeight: .9, margin: "8px 0" }}>My Festival</h1><div className="csub">{chosen.length} acts · {days} day{days > 1 ? "s" : ""} · £{spent} spent</div></div>
      {img ? <img className="mb-shareimg" src={img} alt="Festival lineup" style={{ width: 400 }} /> : <p className="mb-mono" style={{ textAlign: "center" }}>Rendering…</p>}
      <div className="mb-actions">
        <button className="mb-btn" onClick={() => shareURL(img, "festival.png", `My festival lineup\n\nBuild yours at https://${SITE_URL} ${HANDLE}`)}>Share</button>
        <button className="mb-btn ghost" onClick={() => downloadURL(img, "festival.png")}>Save</button>
        <button className="mb-btn ghost" onClick={() => setDone(false)}>Edit</button>
        <button className="mb-btn ghost" onClick={onHome}>Menu</button>
      </div>
    </div>
  );
  // 3. builder
  const byTier = [25, 20, 15, 10, 5].map((p) => ({ p, list: artists.filter((a) => a.price === p) })).filter((t) => t.list.length);
  const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Festival Lineup</div><div className="mb-round mb-mono">£{spent} / £{budget}<br />£{remaining} left</div></div>
      <div className="mb-progress"><span style={{ width: pct + "%", background: remaining < 0 ? RED : INK }} /></div>
      {days > 1 && (
        <div className="mb-daystrip">
          {byDay.map((acts, d) => (
            <div key={d} className="mb-daycol">
              <div className="mb-dayhead mb-mono">{DN[d]}</div>
              {acts.length ? acts.slice().sort((a, b) => b.price - a.price).map((a) => <div key={a.id} className="mb-dayact" onClick={() => onChipTap(a)}>{slice(a.name, 16)}</div>) : <div className="mb-dayempty mb-mono">empty</div>}
            </div>
          ))}
        </div>
      )}
      {byTier.map((t) => {
        const open = !!openTiers[t.p];
        const picks = t.list.filter((a) => placement[a.id] != null).length;
        return (
          <div key={t.p} className="mb-fest-sec">
            <button className="mb-fest-sechead" onClick={() => setOpenTiers({ ...openTiers, [t.p]: !open })}>
              <span className="mb-anton">£{t.p}</span>
              <span className="mb-mono">{t.list.length} acts{picks ? ` · ${picks} picked` : ""} <b>{open ? "–" : "+"}</b></span>
            </button>
            {open && (
              <div className="mb-fest-grid">
                {t.list.map((a) => {
                  const on = placement[a.id] != null;
                  const sel = !!selected[a.id];
                  const afford = on || sel || (stagedCost + a.price <= remaining);
                  const cls = "mb-fest-chip" + (on ? " on" : sel ? " sel" : "") + (afford ? "" : " cant");
                  return <button key={a.id} className={cls} onClick={() => onChipTap(a)}>{a.name}{on && days > 1 ? <b> · {DN[placement[a.id]][0]}</b> : null}</button>;
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="mb-actions">
        <button className="mb-btn" onClick={finish} disabled={!chosen.length}>Finish lineup</button>
        <button className="mb-btn ghost" onClick={() => { setDays(null); setBudget(null); setPlacement({}); setSelected({}); }}>Restart</button>
        <button className="mb-btn ghost" onClick={onHome}>Menu</button>
      </div>
      {days > 1 && (
        <div className={"mb-daybar" + (selCount ? " active" : "")}>
          <div className="mb-daybar-label mb-mono">{selCount ? `${selCount} selected · £${stagedCost} → add to` : "tap acts, then a day"}</div>
          <div className="mb-daybar-btns">
            {Array.from({ length: days }, (_, d) => (
              <button key={d} className="mb-daybar-btn mb-anton" disabled={!selCount} onClick={() => placeSelectedOn(d)}>{DN[d].slice(0, 3)}<span className="mb-mono">{byDay[d].length}</span></button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================= APP =================
const GAMES = [
  { k: "bracket", t: "Bracket Battles", d: "16 go in, one comes out. Knockout picks with a live draw.", min: 8 },
  { k: "blind", t: "Blind Rank Top 5", d: "One track at a time. Commit to a slot before you see what's next.", min: 5 },
  { k: "tier", t: "Tier List", d: "Sort them into S–D and share the grid.", min: 5 },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*{box-sizing:border-box}
.mb-root{--ink:${INK};--paper:${PAPER};--red:${RED};--blue:${BLUE};color-scheme:light;min-height:100vh;background:var(--paper);color:var(--ink);font-family:'Space Grotesk',system-ui,sans-serif;padding:20px 16px 48px}
.mb-shell{max-width:760px;margin:0 auto}
.mb-anton{font-family:'Anton',sans-serif;letter-spacing:.01em;text-transform:uppercase}
.mb-mono{font-family:'Space Mono',monospace}
.mb-bill{border:3px solid var(--ink);background:var(--paper);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;box-shadow:5px 5px 0 var(--ink);margin-bottom:16px;gap:10px}
.mb-title{font-size:20px;line-height:.9;color:var(--ink)}.mb-round{font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:right;line-height:1.3;color:var(--ink)}
.mb-progress{height:6px;background:rgba(23,20,15,.15);margin:12px 0 18px}.mb-progress>span{display:block;height:100%;background:var(--ink);transition:width .35s ease}
.mb-vs-wrap{position:relative}
.mb-panel{position:relative;width:100%;border:3px solid var(--ink);background:var(--paper);cursor:pointer;overflow:hidden;box-shadow:6px 6px 0 var(--ink);transition:transform .12s,box-shadow .12s;display:grid;grid-template-columns:92px 1fr;text-align:left}
.mb-panel:hover{transform:translate(-2px,-2px);box-shadow:9px 9px 0 var(--ink)}.mb-panel:active{transform:translate(2px,2px);box-shadow:3px 3px 0 var(--ink)}
.mb-tile{display:flex;align-items:center;justify-content:center;border-right:3px solid var(--ink);min-height:76px}.mb-tile img{width:100%;height:100%;object-fit:cover}.mb-tile .ini{color:var(--paper)}
.mb-pb{padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0}
.mb-name{font-size:24px;line-height:.96;word-break:break-word;color:var(--ink)}.mb-sub{font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.06em;color:var(--ink)}
.mb-corner{position:absolute;top:0;right:0;font-size:10px;letter-spacing:.18em;padding:4px 8px;color:var(--paper)}
.mb-vs{align-self:center;justify-self:center;margin:10px auto;width:52px;height:52px;border:3px solid var(--ink);border-radius:50%;background:var(--paper);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:4px 4px 0 var(--ink);z-index:2;position:relative}
.mb-panel.win{animation:sw .32s forwards}.mb-panel.out{animation:so .32s forwards}
@keyframes sw{45%{transform:scale(1.03)}}@keyframes so{to{opacity:.12;transform:scale(.97)}}
.mb-mapwrap{margin-top:22px;border:3px solid var(--ink);background:var(--paper);box-shadow:5px 5px 0 var(--ink)}
.mb-maphead{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:3px solid var(--ink)}.mb-maphead h3{margin:0;font-size:13px;letter-spacing:.18em;text-transform:uppercase}
.mb-mapscroll{overflow-x:auto;padding:8px}
.mb-champ{text-align:center;padding:8px 0 0;animation:rise .5s}@keyframes rise{from{opacity:0;transform:translateY(14px)}}
.mb-champ .eyebrow{font-size:12px;letter-spacing:.3em;text-transform:uppercase}.mb-champ .headliner{font-size:clamp(38px,10vw,78px);line-height:.86;margin:10px 0 4px;text-shadow:5px 5px 0 var(--red),10px 10px 0 var(--blue)}.mb-champ .csub{font-size:14px;text-transform:uppercase;opacity:.75}
.mb-shareimg{max-width:100%;border:3px solid var(--ink);box-shadow:6px 6px 0 var(--ink);margin:18px auto 0;display:block}
.mb-btn{font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:.04em;font-size:16px;padding:12px 20px;border:3px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;box-shadow:4px 4px 0 rgba(23,20,15,.35);transition:transform .1s}
.mb-btn:hover{transform:translate(-1px,-1px)}.mb-btn:active{transform:translate(2px,2px);box-shadow:none}.mb-btn.ghost{background:var(--paper);color:var(--ink)}.mb-btn:disabled{opacity:.4;cursor:not-allowed}
.mb-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:22px}
.mb-hero{font-size:clamp(44px,13vw,92px);line-height:.82;text-align:center}.mb-hero .l1{color:var(--ink)}.mb-hero .l2{color:var(--red);text-shadow:3px 3px 0 var(--blue)}
.mb-kicker{font-size:13px;letter-spacing:.24em;text-transform:uppercase;opacity:.75;margin-bottom:20px;text-align:center}
.mb-card{border:3px solid var(--ink);background:var(--paper);box-shadow:6px 6px 0 var(--ink);padding:18px;text-align:left;margin:14px 0}
.mb-card h2{font-family:'Anton',sans-serif;text-transform:uppercase;font-size:20px;margin:0 0 4px;color:var(--ink)}.mb-card p{margin:0 0 12px;font-size:14px;line-height:1.45;color:var(--ink)}
.mb-gamecard{cursor:pointer;transition:transform .1s,box-shadow .1s}.mb-gamecard:hover{transform:translate(-2px,-2px);box-shadow:9px 9px 0 var(--ink)}
.mb-gamecard.off{opacity:.45;cursor:not-allowed;box-shadow:3px 3px 0 var(--ink)}
.mb-twocol{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:640px){.mb-twocol{grid-template-columns:1fr 1fr;align-items:start}}
.mb-tag{display:inline-block;font-family:'Space Mono';font-size:10px;letter-spacing:.1em;background:var(--ink);color:var(--paper);padding:2px 7px;margin-bottom:8px}.mb-tag.alt{background:var(--red)}
.mb-genregrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mb-toggle{display:flex;border:3px solid var(--ink);box-shadow:5px 5px 0 var(--ink);margin:0 0 18px;background:var(--paper)}
.mb-rankby{font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.65;margin:2px 2px 6px}
.mb-sizegrid{display:flex;gap:12px;justify-content:center;margin:10px 0 20px}
.mb-fest-sec{border:3px solid var(--ink);border-bottom:none}
.mb-fest-sec:last-of-type{border-bottom:3px solid var(--ink)}
.mb-fest-sechead{width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--paper);color:var(--ink);border:none;border-bottom:2px solid var(--ink);padding:12px 14px;cursor:pointer;font-size:20px}
.mb-fest-sechead .mb-mono{font-size:12px;opacity:.7}.mb-fest-sechead b{font-size:18px;margin-left:4px}
.mb-fest-grid{display:flex;flex-wrap:wrap;gap:6px;padding:10px}
.mb-fest-chip{font-family:'Space Grotesk';font-size:13px;font-weight:600;color:var(--ink);background:var(--paper);border:2px solid var(--ink);box-shadow:2px 2px 0 var(--ink);padding:6px 10px;cursor:pointer}
.mb-fest-chip.on{background:var(--ink);color:var(--paper);box-shadow:2px 2px 0 var(--red)}
.mb-fest-chip.sel{background:var(--blue);color:var(--paper);box-shadow:2px 2px 0 var(--ink)}
.mb-fest-chip.cant{opacity:.3;cursor:not-allowed}
.mb-fest-chip b{color:var(--red)}.mb-fest-chip.on b{color:var(--paper)}
.mb-daybar{position:sticky;bottom:0;left:0;right:0;margin:16px -16px -48px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--paper);border-top:3px solid var(--ink);box-shadow:0 -4px 0 rgba(23,20,15,.12);z-index:20}
.mb-daybar.active{border-top-color:var(--red);box-shadow:0 -4px 0 var(--red);animation:daypulse 1.1s ease-in-out infinite}
@keyframes daypulse{50%{box-shadow:0 -6px 0 var(--red)}}
.mb-daybar-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;text-align:center;margin-bottom:8px;color:var(--ink)}
.mb-daybar-btns{display:flex;gap:8px}
.mb-daybar-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:18px;padding:10px 4px;border:3px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer}
.mb-daybar-btn span{font-size:10px;opacity:.6}
.mb-daybar.active .mb-daybar-btn{background:var(--ink);color:var(--paper)}
.mb-daybar.active .mb-daybar-btn span{opacity:.8}
.mb-daybar-btn:disabled{opacity:.5;cursor:default}
@media(prefers-reduced-motion:reduce){.mb-daybar.active{animation:none}}
.mb-daystrip{display:flex;gap:8px;margin-bottom:16px}
.mb-daycol{flex:1;border:3px solid var(--ink);background:var(--paper);box-shadow:3px 3px 0 var(--ink);min-height:70px;padding:6px}
.mb-dayhead{font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-align:center;border-bottom:2px solid var(--ink);padding-bottom:4px;margin-bottom:4px;color:var(--ink)}
.mb-dayact{font-family:'Space Grotesk';font-size:11px;font-weight:600;color:var(--ink);padding:2px 3px;cursor:pointer;border-bottom:1px dashed rgba(23,20,15,.2)}
.mb-dayact:hover{color:var(--red)}
.mb-dayempty{font-size:11px;opacity:.4;text-align:center;padding-top:8px}
.mb-sizebtn{flex:1;max-width:140px;font-size:34px;padding:24px 0;border:3px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer;box-shadow:5px 5px 0 var(--ink);transition:transform .1s,box-shadow .1s}
.mb-sizebtn:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 var(--ink)}
.mb-sizebtn:active{transform:translate(2px,2px);box-shadow:none;background:var(--ink);color:var(--paper)}
.mb-credit{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:26px;font-size:13px;font-family:'Space Mono',monospace;opacity:.85}
.mb-credit b{font-family:'Anton',sans-serif;letter-spacing:.03em}
.mb-credit-mark{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--red);color:var(--paper);font-size:15px}
.mb-toggle button{flex:1;font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:.04em;font-size:19px;padding:14px 10px;background:var(--paper);color:var(--ink);border:none;border-right:3px solid var(--ink);cursor:pointer;transition:background .1s}
.mb-toggle button:last-child{border-right:none}
.mb-toggle button.on{background:var(--ink);color:var(--paper)}
.mb-toggle button:disabled{opacity:.35;cursor:not-allowed}
.mb-toggle button:not(.on):not(:disabled):hover{background:rgba(23,20,15,.08)}
@media(min-width:560px){.mb-genregrid{grid-template-columns:1fr 1fr 1fr}}
.mb-genre{display:flex;flex-direction:column;gap:4px;align-items:flex-start;text-align:left;border:3px solid var(--ink);background:var(--paper);box-shadow:4px 4px 0 var(--ink);padding:16px 14px;cursor:pointer;transition:transform .1s,box-shadow .1s}
.mb-genre:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--ink)}.mb-genre:active{transform:translate(2px,2px);box-shadow:none}
.mb-genre .mb-anton{font-size:18px;line-height:1}.mb-genre .mb-mono{font-size:11px;opacity:.6}
.mb-input{width:100%;font-family:'Space Mono',monospace;font-size:13px;padding:10px 12px;border:3px solid var(--ink);background:var(--paper);color:var(--ink);resize:vertical}
.mb-err{color:var(--red);font-family:'Space Mono',monospace;font-size:13px;margin-top:10px;font-weight:700;line-height:1.4}
.mb-hint{font-size:12px;opacity:.7;margin-top:8px;line-height:1.4}
.mb-note{font-size:13px;line-height:1.5;border-left:3px solid var(--ink);padding-left:12px;margin:6px 0 16px}
.mb-chip{display:inline-flex;align-items:center;gap:8px;background:var(--paper);border:2px solid var(--ink);padding:5px 10px 5px 5px;margin:4px;cursor:pointer;font-family:'Space Grotesk';box-shadow:2px 2px 0 var(--ink);max-width:100%}
.mb-chip.sel{background:var(--ink);color:var(--paper);box-shadow:2px 2px 0 var(--red)}.mb-chip.sel .mb-chip-name,.mb-chip.sel .mb-chip-name em{color:var(--paper)}
.mb-chip-img{width:26px;height:26px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--paper);font-size:10px;font-family:'Anton'}.mb-chip-img img{width:100%;height:100%;object-fit:cover}
.mb-chip-name{font-size:13px;font-weight:600;line-height:1.1;text-align:left;display:flex;flex-direction:column;color:var(--ink)}.mb-chip-name em{font-style:normal;font-size:10px;opacity:.6;text-transform:uppercase}
.mb-tier{display:flex;border:3px solid var(--ink);border-bottom:none;min-height:64px;cursor:pointer}.mb-tier:last-of-type{border-bottom:3px solid var(--ink)}
.mb-tier-label{width:64px;flex:0 0 64px;display:flex;align-items:center;justify-content:center;color:var(--paper);font-family:'Anton';font-size:28px;border-right:3px solid var(--ink)}
.mb-tier-area{flex:1;display:flex;flex-wrap:wrap;align-content:flex-start;padding:4px;min-width:0}
.mb-tray{border:3px dashed var(--ink);margin-top:16px;padding:8px;cursor:pointer}.mb-tray-head{font-size:11px;letter-spacing:.14em;padding:2px 4px 6px}.mb-tray-chips{display:flex;flex-wrap:wrap}
.mb-nowcard{display:grid;grid-template-columns:92px 1fr;border:3px solid var(--ink);background:var(--paper);box-shadow:6px 6px 0 var(--red);margin-bottom:18px;overflow:hidden}
.mb-nowcard.flash{animation:fl .26s}@keyframes fl{50%{transform:translateX(-4px)}}
.mb-slotgrid{display:flex;flex-direction:column;gap:8px}
.mb-slot{display:flex;align-items:center;gap:12px;width:100%;border:3px solid var(--ink);background:var(--paper);padding:0;cursor:pointer;box-shadow:4px 4px 0 var(--ink);text-align:left;font-family:'Space Grotesk';min-height:54px;overflow:hidden}
.mb-slot:hover:not(:disabled){transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink)}
.mb-slot:disabled{cursor:default}.mb-slot.filled{background:rgba(23,20,15,.06)}
.mb-slotnum{width:54px;flex:0 0 54px;align-self:stretch;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--ink);color:var(--paper)}
.mb-slottext{padding:8px 12px;font-size:15px;display:flex;flex-direction:column;min-width:0;color:var(--ink)}
.mb-slottext em{font-style:normal;opacity:.45;font-size:13px}.mb-slottext b{line-height:1.15}
.mb-slottext b+em{opacity:.6;font-size:11px;text-transform:uppercase;margin-top:2px}
@media(min-width:620px){.mb-vs-wrap{display:grid;grid-template-columns:1fr 52px 1fr;align-items:center}.mb-vs{margin:0 -6px}}
@media(prefers-reduced-motion:reduce){.mb-panel,.mb-btn,.mb-gamecard,.mb-slot{transition:none}.mb-panel.win,.mb-panel.out,.mb-champ,.mb-nowcard.flash{animation:none}}
`;

function App() {
  const [links, setLinks] = useState("");
  const [pool, setPool] = useState(null);
  const [poolLabel, setPoolLabel] = useState("");
  const [genreObj, setGenreObj] = useState(null);
  const [screen, setScreen] = useState("connect");   // connect | genres | menu | <game>
  const [unit, setUnit] = useState("tracks");         // tracks | artists
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const styled = useRef(false);
  useEffect(() => { if (styled.current) return; styled.current = true; const el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el); }, []);

  // ---- A. genre (local, no API) ----
  const pickGenre = (g) => { setPool(genrePool(g)); setPoolLabel(g.genre); setGenreObj(g); setUnit("tracks"); setScreen("menu"); };

  // ---- B. one or more album links (live) ----
  const loadAlbums = useCallback(async () => {
    const lines = links.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { setError("Paste at least one album link."); return; }
    const parsed = [], bad = [];
    for (const l of lines) {
      const p = parseSpotifyLink(l);
      if (!p) bad.push(l);
      else if (p.kind === "playlist") { setError("Playlists can't be read by Spotify's API any more — paste album links only."); return; }
      else parsed.push(p);
    }
    if (!parsed.length) { setError("None of those look like album links. Copy from Spotify → an album → Share → Copy link."); return; }
    setLoading(true); setError("");
    try {
      const tr = await fetch("/api/token");
      if (!tr.ok) throw new Error("Couldn't get an app token — check the serverless function and its env vars.");
      const { access_token } = await tr.json();
      const H = { headers: { Authorization: "Bearer " + access_token } };
      let items = [], names = [], failed = bad.length;
      for (const p of parsed) {
        const meta = await fetch(`https://api.spotify.com/v1/albums/${p.id}`, H);
        if (!meta.ok) { failed++; continue; }
        const al = await meta.json();
        const img = al.images?.length ? al.images[al.images.length - 1].url : null;
        names.push(al.name);
        (al.tracks?.items || []).forEach((t) => items.push({ id: t.id, name: t.name, sub: t.artists?.map((a) => a.name).join(", ") || null, img }));
      }
      const seen = new Set(); items = items.filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
      if (items.length < 5) throw new Error(failed ? "Couldn't load enough tracks — some albums may be unavailable." : "Fewer than 5 tracks total — add another album.");
      setPool(items);
      setPoolLabel(names.length === 1 ? names[0] : `${names.length} albums`);
      setGenreObj(null);
      setUnit("tracks");
      setScreen("menu");
      if (failed) setError(`Loaded ${names.length} — ${failed} link${failed > 1 ? "s" : ""} couldn't be read and ${failed > 1 ? "were" : "was"} skipped.`);
    } catch (e) {
      setError(e && e.message === "Failed to fetch"
        ? "Can't reach Spotify from this preview — the sandbox blocks outside calls. Deploy to test album links; genres work anywhere."
        : (e.message || "Something went wrong."));
    } finally { setLoading(false); }
  }, [links]);

  let body;
  if (screen === "connect") body = (
    <div className="mb-shell">
      <div className="mb-kicker">pick a genre or paste albums · play four games</div>
      <h1 className="mb-anton mb-hero"><span className="l1">Music</span> <span className="l2">Bracket</span></h1>
      <div style={{ height: 18 }} />
      <div className="mb-twocol">
        <div className="mb-card" style={{ margin: 0 }}>
          <span className="mb-tag">INSTANT · NO LINK</span>
          <h2>Pick a genre</h2>
          <p>Play from a built-in library of {GENRES.length} genres. Different draw every time.</p>
          <button className="mb-btn" onClick={() => { setError(""); setScreen("genres"); }}>Browse genres</button>
        </div>
        <div className="mb-card" style={{ margin: 0 }}>
          <span className="mb-tag alt">YOUR PICK</span>
          <h2>Use albums</h2>
          <p>Paste one or more Spotify album links — their tracks become the pool.</p>
          <textarea className="mb-input" rows={3} placeholder={"https://open.spotify.com/album/…\n(one per line — add as many as you like)"} value={links} onChange={(e) => setLinks(e.target.value)} />
          <div style={{ marginTop: 12 }}><button className="mb-btn ghost" onClick={loadAlbums} disabled={loading}>{loading ? "Loading…" : "Load albums"}</button></div>
        </div>
      </div>
      {error && <div className="mb-err" style={{ textAlign: "center" }}>{error}</div>}
      <p className="mb-hint" style={{ textAlign: "center" }}>Album link: open an album in Spotify → the ⋯ menu → Share → Copy link.</p>
    </div>
  );
  else if (screen === "genres") body = (
    <div className="mb-shell">
      <div className="mb-bill"><div className="mb-anton mb-title">Pick a genre</div><div className="mb-round mb-mono">{GENRES.length} to choose</div></div>
      <div className="mb-genregrid">
        {GENRES.map((g) => (
          <button key={g.genre} className="mb-genre" onClick={() => pickGenre(g)}>
            <span className="mb-anton">{g.genre}</span>
            <span className="mb-mono">{g.tracks.length} tracks</span>
          </button>
        ))}
      </div>
      <div className="mb-actions"><button className="mb-btn ghost" onClick={() => setScreen("connect")}>‹ Back</button></div>
    </div>
  );
  else if (screen === "menu") {
    const artists = artistPool(pool);
    const canArtists = artists.length >= 5;
    const active = unit === "artists" ? artists : pool;
    const noun = unit === "artists" ? "artists" : "tracks";
    body = (
      <div className="mb-shell">
        <div className="mb-bill"><div className="mb-anton mb-title">Choose a game</div><div className="mb-round mb-mono">{slice(poolLabel, 22)}<br />{active.length} {noun}</div></div>
        <div className="mb-rankby mb-mono">Rank by</div>
        <div className="mb-toggle">
          <button className={unit === "tracks" ? "on" : ""} onClick={() => setUnit("tracks")}>Tracks</button>
          <button className={unit === "artists" ? "on" : ""} onClick={() => canArtists && setUnit("artists")} disabled={!canArtists} title={canArtists ? "" : "Not enough different artists in this pool"}>Artists</button>
        </div>
        {!canArtists && <p className="mb-note mb-mono">Artist mode needs at least 5 different artists — this pool has {artists.length}. Try a genre, or paste more albums.</p>}
        {error && <div className="mb-err">{error}</div>}
        {GAMES.map((gm) => {
          const ok = active.length >= gm.min;
          const desc = unit === "artists" ? gm.d.replace(/\btrack\b/g, "artist").replace(/\btracks\b/g, "artists") : gm.d;
          return (
            <div key={gm.k} className={"mb-card mb-gamecard" + (ok ? "" : " off")} onClick={() => ok && setScreen(gm.k)}>
              <h2>{gm.t}</h2>
              <p style={{ margin: 0 }}>{ok ? desc : `Needs at least ${gm.min} ${noun} — this pool has ${active.length}.`}</p>
            </div>
          );
        })}
        {genreObj && (
          <div className="mb-card mb-gamecard" onClick={() => setScreen("festival")}>
            <h2>Festival Lineup</h2>
            <p style={{ margin: 0 }}>Build a festival bill on a budget — bigger acts cost more.</p>
          </div>
        )}
        <div className="mb-actions"><button className="mb-btn ghost" onClick={() => { setError(""); setScreen("connect"); }}>‹ Change source</button></div>
      </div>
    );
  }
  else if (screen === "bracket") body = <Bracket key={unit} pool={unit === "artists" ? artistPool(pool) : pool} label={poolLabel + (unit === "artists" ? " · artists" : "")} onHome={() => setScreen("menu")} />;
  else if (screen === "blind") body = <BlindRank key={unit} pool={unit === "artists" ? artistPool(pool) : pool} label={poolLabel + (unit === "artists" ? " · artists" : "")} onHome={() => setScreen("menu")} />;
  else if (screen === "tier") body = <TierList key={unit} pool={unit === "artists" ? artistPool(pool) : pool} label={poolLabel + (unit === "artists" ? " · artists" : "")} onHome={() => setScreen("menu")} />;
  else if (screen === "festival") body = <Festival pools={{ all: combinedArtists(GENRES), byGenre: Object.fromEntries(GENRES.map((g) => [g.genre, genreArtists(g)])) }} label={poolLabel} onHome={() => setScreen("menu")} />;

  return <div className="mb-root">{body}<div className="mb-credit"><span className="mb-credit-mark mb-anton">M</span> created by <b>{HANDLE}</b></div></div>;
}

import { Analytics } from "@vercel/analytics/react";

export default function MusicBracket() {
  return (
    <>
      <App />
      <Analytics />
    </>
  );
}