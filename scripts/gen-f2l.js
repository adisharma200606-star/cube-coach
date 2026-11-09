// Finds a short algorithm for every F2L case the hand-written list misses.
// Run: node scripts/gen-f2l.js   (prints algs to paste into src/engine/algs.js)
import { apply, fromString, algPerm, applyPerm, simplify } from '../src/engine/cube54.js';
import { CORNERS, EDGES } from '../src/cube.js';
import { F2L as F2L_HAND, F2L_GENERATED } from '../src/engine/algs.js';
const F2L = [...F2L_HAND, ...F2L_GENERATED];

const solved = apply(fromString('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'), 'z2');
const YELLOW = 3;
// Projection: hide every last-layer piece (anything with yellow) — we only care about F2L.
const PIECES = [...CORNERS, ...EDGES];
const proj = (st) => { const o = Array.from(st); for (const idx of PIECES) if (idx.some((i) => st[i] === YELLOW)) idx.forEach((i) => (o[i] = 9)); return o.join(','); };
const goalKey = proj(solved);

// 1. every FR case (exhaustive BFS over "slot moves")
const macros = ['U', "R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F"].map(algPerm);
const cases = new Map([[goalKey, solved]]);
let frontier = [solved];
while (frontier.length) {
  const next = [];
  for (const s of frontier) for (const m of macros) { const n = applyPerm(s, m); const k = proj(n); if (!cases.has(k)) { cases.set(k, n); next.push(n); } }
  frontier = next;
}
console.error('F2L cases for one slot:', cases.size - 1);

// 2. which are already covered by AUF + library?
const lib = ['', 'U', "U'", 'U2'].flatMap((a) => F2L.map((f) => algPerm(simplify(`${a} ${f}`) || "U U'")));
const missing = [...cases].filter(([k, s]) => k !== goalKey && !lib.some((p) => proj(applyPerm(s, p)) === goalKey));
console.error('not covered:', missing.length);

// 3. meet-in-the-middle search: tables from the goal backwards, up to depth 6
function solveCase(st, faces) {
  const moves = faces.flatMap((f) => [f, f + "'", f + '2']);
  const P = moves.map(algPerm);
  const inv = (m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'");
  const back = new Map([[goalKey, []]]);
  let fr = [[solved, []]];
  for (let d = 0; d < 6; d++) {
    const nx = [];
    for (const [s, path] of fr) moves.forEach((m, i) => {
      if (path.length && path[path.length - 1][0] === m[0]) return;
      const n = applyPerm(s, P[i]); const k = proj(n);
      if (!back.has(k)) { back.set(k, [...path, m]); nx.push([n, [...path, m]]); }
    });
    fr = nx;
  }
  // forward from the case, BFS by length, stop at first meet (shortest)
  let layer = [[st, []]];
  for (let d = 0; d <= 6; d++) {
    for (const [s, path] of layer) { const b = back.get(proj(s)); if (b) return [...path, ...b.slice().reverse().map(inv)].join(' '); }
    const nx = [];
    for (const [s, path] of layer) moves.forEach((m, i) => { if (path.length && path[path.length - 1][0] === m[0]) return; nx.push([applyPerm(s, P[i]), [...path, m]]); });
    layer = nx;
  }
  return null;
}
const out = new Set();
for (const [, s] of missing) {
  const alg = solveCase(s, ['R', 'U']) || solveCase(s, ['R', 'U', 'F']);
  if (!alg) { console.error('NO SOLUTION'); continue; }
  // strip leading U-turns: AUF is added by the solver anyway
  out.add(simplify(alg).replace(/^U['2]? /, ''));
}
console.log(JSON.stringify([...out], null, 0));
