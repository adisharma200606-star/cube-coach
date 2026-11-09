// color.js — turning camera pixels into "which of the 6 cube colours is this?"
//
// Big idea: we never hard-code what "red" looks like. Every face has a centre
// sticker that never moves, so the 6 centres we scan ARE the reference colours
// for this cube, in this room's lighting. Every other sticker is matched to the
// centre it looks most like, with one extra rule: each colour appears exactly
// 9 times on a real cube.

// ---------- RGB -> Lab ----------
// Lab is a colour space built to match human vision: distances in Lab roughly
// match "how different do these look to a person". RGB distances don't.

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToLab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // linear RGB -> XYZ (D65 white)
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// ---------- CIEDE2000 ----------
// The industry-standard "how different do two colours look" formula.
// Much better than plain distance at telling red from orange.
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (a === 0 && b === 0) return 0; const t = Math.atan2(b, a) * deg; return t < 0 ? t + 360 : t; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---------- Classification ----------
// stickers: 54 Lab colours in URFDLB facelet order (9 per face).
// Returns 54 group numbers 0..5, where group k = "same colour as centre of face k".
export function classifyStickers(stickers, { iterations = 3 } = {}) {
  const CENTRES = [4, 13, 22, 31, 40, 49];
  let refs = CENTRES.map((i) => stickers[i]);
  let groups = null;

  for (let it = 0; it < iterations; it++) {
    groups = balancedAssign(stickers, refs, CENTRES);
    // Re-centre each reference on the average of its 9 stickers (like k-means).
    // This adapts to shadows/glare instead of trusting one centre sticker.
    refs = refs.map((_, g) => {
      const members = stickers.filter((_, i) => groups[i] === g);
      const sum = members.reduce((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]);
      return sum.map((v) => v / members.length);
    });
  }
  return groups;
}

// Greedy "closest pairs first" assignment where every colour can take at most 9 stickers.
function balancedAssign(stickers, refs, centres) {
  const groups = new Array(54).fill(-1);
  const capacity = new Array(6).fill(9);
  centres.forEach((ci, g) => { groups[ci] = g; capacity[g]--; });

  const pairs = [];
  stickers.forEach((lab, i) => {
    if (groups[i] !== -1) return;
    const ds = refs.map((ref) => deltaE2000(lab, ref));
    const sorted = [...ds].sort((a, b) => a - b);
    // How "confident" this sticker is: gap between best and second-best match.
    // Confident stickers get placed first; the ambiguous ones fill what's left.
    const margin = sorted[1] - sorted[0];
    ds.forEach((d, g) => pairs.push({ i, g, d, margin }));
  });
  // Primary: closest match. Ties broken in favour of confident stickers.
  pairs.sort((p, q) => p.d - q.d || q.margin - p.margin);
  for (const { i, g } of pairs) {
    if (groups[i] === -1 && capacity[g] > 0) { groups[i] = g; capacity[g]--; }
  }
  return groups;
}

// Average RGB of each group — used to paint the 2D map in YOUR cube's real colours.
export function groupDisplayColours(rgbStickers, groups) {
  return [0, 1, 2, 3, 4, 5].map((g) => {
    const m = rgbStickers.filter((_, i) => groups[i] === g);
    if (!m.length) return [128, 128, 128];
    const s = m.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
    return s.map((v) => Math.round(v / m.length));
  });
}
