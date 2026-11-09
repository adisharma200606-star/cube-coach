// cube54.js — a tiny, fast cube model.
//
// The cube is just 54 letters (one per sticker) in URFDLB order — the same
// "facelet" format the scanner produces. A move (like R or y) is a fixed
// shuffle of those 54 positions, so applying a move = copying letters around.
//
// We build each shuffle from geometry: every sticker gets a 3D position and a
// direction it faces, and a move rotates the stickers in its layer by 90°.

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

// 3D position (x right, y up, z towards you) + normal for sticker (face, row, col),
// using the standard way each face is read (see cube.js).
function stickerGeometry(face, r, c) {
  switch (face) {
    case 'U': return { p: [c - 1, 1, r - 1], n: [0, 1, 0] };
    case 'R': return { p: [1, 1 - r, 1 - c], n: [1, 0, 0] };
    case 'F': return { p: [c - 1, 1 - r, 1], n: [0, 0, 1] };
    case 'D': return { p: [c - 1, -1, 1 - r], n: [0, -1, 0] };
    case 'L': return { p: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    case 'B': return { p: [1 - c, 1 - r, -1], n: [0, 0, -1] };
  }
}

const STICKERS = [];
FACE_ORDER.forEach((f) => { for (let i = 0; i < 9; i++) STICKERS.push(stickerGeometry(f, Math.floor(i / 3), i % 3)); });
const key = ({ p, n }) => p.join(',') + '|' + n.join(',');
const INDEX = new Map(STICKERS.map((s, i) => [key(s), i]));

// Rotate vector v by 90° * q around axis 'x' | 'y' | 'z' (q=1 is counter-clockwise looking from + side).
function rot(v, axis, q) {
  let [x, y, z] = v;
  for (let k = 0; k < ((q % 4) + 4) % 4; k++) {
    if (axis === 'x') [y, z] = [-z, y];
    else if (axis === 'y') [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

// Build the permutation for turning the stickers whose position satisfies `inLayer`.
// perm[j] = i means "after the move, slot j holds what was in slot i".
function buildPerm(axis, inLayer, q) {
  const perm = new Uint8Array(54);
  STICKERS.forEach((s, i) => {
    const moved = inLayer(s.p) ? { p: rot(s.p, axis, q), n: rot(s.n, axis, q) } : s;
    perm[INDEX.get(key(moved))] = i;
  });
  return perm;
}

// Every move as: axis, which layers, and quarter-turn direction for the plain (clockwise) version.
// Clockwise "looking at the face" = negative rotation around its outward axis.
const SPEC = {
  U: ['y', (p) => p[1] === 1, -1], D: ['y', (p) => p[1] === -1, 1], E: ['y', (p) => p[1] === 0, 1],
  R: ['x', (p) => p[0] === 1, -1], L: ['x', (p) => p[0] === -1, 1], M: ['x', (p) => p[0] === 0, 1],
  F: ['z', (p) => p[2] === 1, -1], B: ['z', (p) => p[2] === -1, 1], S: ['z', (p) => p[2] === 0, -1],
  u: ['y', (p) => p[1] >= 0, -1], d: ['y', (p) => p[1] <= 0, 1],
  r: ['x', (p) => p[0] >= 0, -1], l: ['x', (p) => p[0] <= 0, 1],
  f: ['z', (p) => p[2] >= 0, -1], b: ['z', (p) => p[2] <= 0, 1],
  x: ['x', () => true, -1], y: ['y', () => true, -1], z: ['z', () => true, -1],
};

const PERMS = {};
for (const [name, [axis, layer, dir]] of Object.entries(SPEC)) {
  PERMS[name] = buildPerm(axis, layer, dir);
  PERMS[name + '2'] = buildPerm(axis, layer, dir * 2);
  PERMS[name + "'"] = buildPerm(axis, layer, -dir);
}

export function parseAlg(alg) {
  return alg.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean).map((t) => {
    // accept "Rw" as "r", and "R2'" as "R2"
    let m = t.replace(/^([URFDLB])w/, (_, f) => f.toLowerCase()).replace("2'", '2');
    if (!PERMS[m]) throw new Error('Unknown move: ' + t);
    return m;
  });
}

export function applyPerm(state, perm) {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[j] = state[perm[j]];
  return out;
}

// Combine a whole algorithm into one permutation (fast to reuse in searches).
export function algPerm(alg) {
  let perm = new Uint8Array(54).map((_, i) => i);
  for (const m of parseAlg(alg)) perm = applyPerm(perm, PERMS[m]);
  return perm;
}

export function apply(state, alg) {
  return applyPerm(state, algPerm(alg));
}

const CODE = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
export const fromString = (s) => Uint8Array.from(s, (ch) => CODE[ch]);
export const toString = (st) => Array.from(st, (v) => FACE_ORDER[v]).join('');

export function invertAlg(alg) {
  return parseAlg(alg).reverse().map((m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'")).join(' ');
}

// Clean up an alg: merge "U U" -> "U2", "R R'" -> nothing, etc.
export function simplify(alg) {
  const out = [];
  const amt = (m) => (m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1);
  for (const m of parseAlg(alg)) {
    const base = m.replace(/['2]/, '');
    const last = out[out.length - 1];
    if (last && last.replace(/['2]/, '') === base) {
      const t = (amt(last) + amt(m)) % 4;
      out.pop();
      if (t) out.push(base + ['', '', '2', "'"][t]);
    } else out.push(m);
  }
  return out.join(' ');
}

export const MOVE_NAMES = Object.keys(PERMS);
