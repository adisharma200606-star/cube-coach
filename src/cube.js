// cube.js — cube logic: scan order, checking a scan is a real cube, solving.
//
// Facelet notation (the standard used by most solvers):
// 54 letters, 9 per face, faces in the order U R F D L B
// (Up, Right, Front, Down, Left, Back). Each face is read left→right,
// top→bottom, like reading a page.
import Cube from 'cubejs';
import { deltaE2000, classifyStickers } from './color.js';

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

// The order we ask you to show faces, and how to hold the cube for each.
// Colours assume the standard scheme: white top, green front.
// `slot` = which face (0..5 in URFDLB order) this scan fills.
export const SCAN_STEPS = [
  { slot: 2, face: 'F', front: 'green',  top: 'white', how: 'Green facing the camera, white on top.' },
  { slot: 1, face: 'R', front: 'red',    top: 'white', how: 'Turn the whole cube to the left: red facing the camera, white still on top.' },
  { slot: 5, face: 'B', front: 'blue',   top: 'white', how: 'Turn left again: blue facing the camera, white on top.' },
  { slot: 4, face: 'L', front: 'orange', top: 'white', how: 'Turn left again: orange facing the camera, white on top.' },
  { slot: 0, face: 'U', front: 'white',  top: 'blue',  how: 'Back to green facing you, then tip the top towards the camera: white facing the camera, green at the bottom.' },
  { slot: 3, face: 'D', front: 'yellow', top: 'green', how: 'Now tip the other way: yellow facing the camera, green on top.' },
];

// Which facelets make up each piece (0-based indexes into the 54-letter string).
const CORNERS = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const CORNER_COLS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGES = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const EDGE_COLS = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

export function groupsToFacelets(groups) {
  return groups.map((g) => FACES[g]).join('');
}

function parity(perm) {
  let p = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

// Checks a scanned cube could actually exist.
// Returns { ok, message, bad: [facelet indexes to highlight] }.
export function validate(facelets) {
  const bad = new Set();
  for (const f of FACES) {
    const n = facelets.split(f).length - 1;
    if (n !== 9) return { ok: false, message: `Colour of the ${f} centre appears ${n} times (should be 9). Tap stickers to fix.`, bad: [] };
  }

  // Corners: find which real corner each position holds, and its twist.
  const cp = [], co = [];
  CORNERS.forEach((idx, pos) => {
    const cols = idx.map((i) => facelets[i]);
    const ori = cols.findIndex((c) => c === 'U' || c === 'D');
    const piece = ori < 0 ? -1 : CORNER_COLS.findIndex((pc) =>
      pc[0] === cols[ori] && pc[1] === cols[(ori + 1) % 3] && pc[2] === cols[(ori + 2) % 3]);
    if (piece < 0) idx.forEach((i) => bad.add(i));
    cp.push(piece); co.push(Math.max(ori, 0));
  });
  // Edges
  const ep = [], eo = [];
  EDGES.forEach((idx, pos) => {
    const a = facelets[idx[0]], b = facelets[idx[1]];
    let piece = EDGE_COLS.findIndex((pc) => pc[0] === a && pc[1] === b), flip = 0;
    if (piece < 0) { piece = EDGE_COLS.findIndex((pc) => pc[0] === b && pc[1] === a); flip = 1; }
    if (piece < 0) idx.forEach((i) => bad.add(i));
    ep.push(piece); eo.push(flip);
  });
  if (bad.size) return { ok: false, message: 'Some pieces have a colour combo that doesn\'t exist on a real cube (outlined). Tap to fix them.', bad: [...bad] };

  const dupC = cp.filter((p, i) => cp.indexOf(p) !== i);
  const dupE = ep.filter((p, i) => ep.indexOf(p) !== i);
  if (dupC.length || dupE.length) {
    CORNERS.forEach((idx, i) => dupC.includes(cp[i]) && idx.forEach((x) => bad.add(x)));
    EDGES.forEach((idx, i) => dupE.includes(ep[i]) && idx.forEach((x) => bad.add(x)));
    return { ok: false, message: 'The same piece shows up twice (outlined). One of those has a wrong sticker.', bad: [...bad] };
  }
  if (co.reduce((a, b) => a + b, 0) % 3) return { ok: false, message: 'One corner looks twisted — usually one sticker on a corner was misread.', bad: [] };
  if (eo.reduce((a, b) => a + b, 0) % 2) return { ok: false, message: 'One edge looks flipped — usually one sticker on an edge was misread.', bad: [] };
  if (parity(cp) !== parity(ep)) return { ok: false, message: 'Two pieces look swapped — check stickers that are similar colours (red/orange, white/yellow).', bad: [] };
  return { ok: true, message: 'Valid cube!', bad: [] };
}

let solverReady = false;
export function initSolver() {
  if (!solverReady) { Cube.initSolver(); solverReady = true; }
}

// Computer solution (Kociemba two-phase). Not how humans solve — just proof
// the app understands your cube, and the basis for teaching later.
export function solve(facelets) {
  initSolver();
  return Cube.fromString(facelets).solve().trim();
}

export function invert(alg) {
  return alg.trim() ? Cube.inverse(alg) : '';
}

// ---------- Piece-level reading ----------
// Reading stickers one by one makes mistakes (red vs orange!). But a cube has
// rules: there are exactly 8 corners and 12 edges, each with a fixed colour
// combo, each appearing once. So instead of asking "what colour is this
// sticker?", we ask "which real piece, in which rotation, best explains these
// 2-3 stickers?" — and solve that as an assignment problem (Hungarian method).

function hungarian(cost) {
  // Classic O(n^3) Hungarian algorithm. Returns assignment[row] = col.
  const n = cost.length, INF = 1e18;
  const u = Array(n + 1).fill(0), v = Array(n + 1).fill(0), p = Array(n + 1).fill(0), way = Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = Array(n + 1).fill(INF), used = Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = Array(n);
  for (let j = 1; j <= n; j++) res[p[j] - 1] = j - 1;
  return res;
}

// For one kind of piece (corners or edges): find the best valid arrangement.
function assignPieces(labs, refs, slots, names, nOri) {
  const faceRef = (letter) => refs[FACES.indexOf(letter)];
  // costs[pos][piece][ori]
  const costs = slots.map((idx) => names.map((pc) => {
    const out = [];
    for (let ori = 0; ori < nOri; ori++) {
      let c = 0;
      for (let k = 0; k < nOri; k++) c += deltaE2000(labs[idx[(ori + k) % nOri]], faceRef(pc[k]));
      out.push(c);
    }
    return out;
  }));
  const best = (pos, piece) => Math.min(...costs[pos][piece]);
  const perm = hungarian(costs.map((row, pos) => row.map((_, piece) => best(pos, piece))));
  const ori = perm.map((piece, pos) => costs[pos][piece].indexOf(best(pos, piece)));
  const total = () => perm.reduce((s, piece, pos) => s + costs[pos][piece][ori[pos]], 0);

  // Rule: total twist (corners) / flip (edges) must be a multiple of nOri.
  // If not, change the one orientation that costs the least extra.
  const oriSum = () => ori.reduce((a, b) => a + b, 0) % nOri;
  if (oriSum()) {
    let bestFix = null;
    perm.forEach((piece, pos) => {
      for (let o = 0; o < nOri; o++) {
        if (o === ori[pos]) continue;
        const newSum = (ori.reduce((a, b) => a + b, 0) - ori[pos] + o) % nOri;
        if (newSum) continue;
        const extra = costs[pos][piece][o] - costs[pos][piece][ori[pos]];
        if (!bestFix || extra < bestFix.extra) bestFix = { pos, o, extra };
      }
    });
    if (bestFix) ori[bestFix.pos] = bestFix.o;
  }
  return { perm, ori, costs, total };
}

// Best single swap of two pieces (used to fix swap-parity). Keeps orientation rule valid.
function bestSwap(res, nOri) {
  let best = null;
  const n = res.perm.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const pa = res.perm[a], pb = res.perm[b];
    const before = res.costs[a][pa][res.ori[a]] + res.costs[b][pb][res.ori[b]];
    for (let oa = 0; oa < nOri; oa++) for (let ob = 0; ob < nOri; ob++) {
      if ((oa + ob - res.ori[a] - res.ori[b]) % nOri !== 0) continue;
      const extra = res.costs[a][pb][oa] + res.costs[b][pa][ob] - before;
      if (!best || extra < best.extra) best = { a, b, oa, ob, extra };
    }
  }
  return best;
}

function piecesToFacelets(c, e) {
  const out = Array(54);
  [4, 13, 22, 31, 40, 49].forEach((i, f) => (out[i] = FACES[f]));
  c.perm.forEach((piece, pos) => { for (let k = 0; k < 3; k++) out[CORNERS[pos][(c.ori[pos] + k) % 3]] = CORNER_COLS[piece][k]; });
  e.perm.forEach((piece, pos) => { for (let k = 0; k < 2; k++) out[EDGES[pos][(e.ori[pos] + k) % 2]] = EDGE_COLS[piece][k]; });
  return out.join('');
}

// Main entry: 54 Lab colours (URFDLB order) -> facelet string that is always a legal cube.
export function readCube(labs) {
  const groups = classifyStickers(labs);
  let refs = [0, 1, 2, 3, 4, 5].map((g) => {
    const m = labs.filter((_, i) => groups[i] === g);
    return [0, 1, 2].map((k) => m.reduce((s, c) => s + c[k], 0) / m.length);
  });
  let facelets = '';
  for (let round = 0; round < 2; round++) {
    const c = assignPieces(labs, refs, CORNERS, CORNER_COLS, 3);
    const e = assignPieces(labs, refs, EDGES, EDGE_COLS, 2);
    if (parity(c.perm) !== parity(e.perm)) {
      const sc = bestSwap(c, 3), se = bestSwap(e, 2);
      const [r, s] = !se || (sc && sc.extra < se.extra) ? [c, sc] : [e, se];
      [r.perm[s.a], r.perm[s.b]] = [r.perm[s.b], r.perm[s.a]];
      r.ori[s.a] = s.oa; r.ori[s.b] = s.ob;
    }
    facelets = piecesToFacelets(c, e);
    // Re-estimate each colour from the cleaned-up reading, then go again.
    refs = FACES.map((f) => {
      const m = labs.filter((_, i) => facelets[i] === f);
      return [0, 1, 2].map((k) => m.reduce((s, x) => s + x[k], 0) / m.length);
    });
  }
  return facelets;
}
