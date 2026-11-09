// methods.js — turns "your scrambled cube" into a list of teaching steps
// for a chosen method (Beginner or CFOP).
//
// How it thinks: a method is a series of stages (cross, corners, ...). For each
// stage we have a small set of moves/algorithms a human would use. We try them
// (plus "turn the top" and "rotate the whole cube" setups) and keep the shortest
// one that makes progress without breaking anything already solved. That way the
// app teaches the same moves a YouTube tutorial would, but for YOUR scramble.
import { apply, algPerm, applyPerm, fromString, simplify, parseAlg } from './cube54.js';
import { CORNERS, EDGES } from '../cube.js';
import { BEGINNER, F2L as F2L_HAND, F2L_GENERATED, OLL, PLL } from './algs.js';
const F2L = [...F2L_HAND, ...F2L_GENERATED];

export const WHITE = 0, YELLOW = 3;
export const COLOUR_NAMES = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];

// ---------- Reading pieces ----------
const centre = (st, i) => st[Math.floor(i / 9) * 9 + 4];
const isSolvedAt = (st, idx) => idx.every((i) => st[i] === centre(st, i));
const idOf = (st, idx) => idx.map((i) => st[i]).sort().join('');

export function solvedIds(st) {
  const s = new Set();
  for (const idx of [...CORNERS, ...EDGES]) if (isSolvedAt(st, idx)) s.add(idOf(st, idx));
  return s;
}
const ids = (pred) => {
  const all = [];
  // piece identities from a solved cube (colour sets)
  const solvedSt = Uint8Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
  for (const idx of [...CORNERS, ...EDGES]) {
    const cols = idx.map((i) => solvedSt[i]);
    if (pred(cols)) all.push(cols.slice().sort().join(''));
  }
  return all;
};
const CROSS = ids((c) => c.length === 2 && c.includes(WHITE));
const WHITE_CORNERS = ids((c) => c.length === 3 && c.includes(WHITE));
const MID_EDGES = ids((c) => c.length === 2 && !c.includes(WHITE) && !c.includes(YELLOW));
const F2L_PIECES = [...CROSS, ...WHITE_CORNERS, ...MID_EDGES];
// An F2L pair = white corner + the middle edge with its other two colours.
const PAIRS = WHITE_CORNERS.map((c) => [c, c.replace(String(WHITE), '')]);

const countIn = (set, list) => list.filter((x) => set.has(x)).length;
const allIn = (set, list) => list.every((x) => set.has(x));
const pairsSolved = (set) => PAIRS.filter(([c, e]) => set.has(c) && set.has(e)).length;

const topFace = (st) => [0, 1, 2, 3, 4, 5].find((f) => st[f * 9 + 4] === YELLOW);
const topAllYellow = (st) => { const f = topFace(st); return [0, 1, 2, 3, 5, 6, 7, 8].every((k) => st[f * 9 + k] === YELLOW); };
const topEdgesYellow = (st) => { const f = topFace(st); return [1, 3, 5, 7].every((k) => st[f * 9 + k] === YELLOW); };
const isSolved = (st) => st.every((v, i) => v === centre(st, i));
const cornerPositioned = (st, idx) => idx.map((i) => st[i]).sort().join('') === idx.map((i) => centre(st, i)).sort().join('');
const yellowCornersPositioned = (st) => CORNERS.filter((idx) => idx.some((i) => centre(st, i) === YELLOW)).every((idx) => cornerPositioned(st, idx));

const colourName = (id) => id.split('').map((d) => COLOUR_NAMES[d]).join('-');

// ---------- Search over candidate algorithms ----------
const ROT = ['', 'y', "y'", 'y2'];
const AUF = ['', 'U', "U'", 'U2'];
const turnCount = (alg) => parseAlg(alg).filter((m) => !'xyz'.includes(m[0])).length;

function makeCands(list) {
  return list.map((c) => { const moves = simplify(c.moves); return { ...c, moves, perm: algPerm(moves || 'U U\''), cost: turnCount(moves) + (/[xyz]/.test(moves[0] || '') ? 0.5 : 0) }; });
}

// Try 1 candidate, then pairs of candidates. Returns [cand] or [cand1, cand2] or null.
function search(st, cands, goal, firstLevel = cands) {
  let best = null;
  for (const c of cands) {
    const s = applyPerm(st, c.perm);
    if (goal(s) && (!best || c.cost < best.cost)) best = { cost: c.cost, seq: [c] };
  }
  if (best) return best.seq;
  for (const a of firstLevel) {
    const s1 = applyPerm(st, a.perm);
    for (const b of cands) {
      const cost = a.cost + b.cost;
      if (best && cost >= best.cost) continue;
      if (goal(applyPerm(s1, b.perm))) best = { cost, seq: [a, b] };
    }
  }
  return best ? best.seq : null;
}

// Shortest sequence of up to maxDepth candidates (breadth-first, cheapest first).
function searchDeep(st, cands, goal, maxDepth = 3) {
  let layer = [{ st, seq: [], cost: 0 }];
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    let best = null;
    for (const node of layer) for (const c of cands) {
      const s = applyPerm(node.st, c.perm), cost = node.cost + c.cost;
      if (goal(s)) { if (!best || cost < best.cost) best = { seq: [...node.seq, c], cost }; }
      else next.push({ st: s, seq: [...node.seq, c], cost });
    }
    if (best) return best.seq;
    layer = next;
  }
  return null;
}

// ---------- Cross solver (exact shortest, via a distance table) ----------
// The state of k white edges = where each one's white sticker is (24 spots).
const EDGE_STICKERS = EDGES.flat();
const SPOT = new Map(EDGE_STICKERS.map((f, i) => [f, i]));
const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, f + "'", f + '2']);
const DEST = FACE_MOVES.map((m) => {
  const perm = algPerm(m), dest = new Uint8Array(24);
  for (let j = 0; j < 54; j++) if (SPOT.has(perm[j])) dest[SPOT.get(perm[j])] = SPOT.get(j);
  return dest;
});

function whiteSpot(st, edgeId) {
  for (const idx of EDGES) if (idOf(st, idx) === edgeId) return SPOT.get(idx.find((i) => st[i] === WHITE));
}
const encode = (spots) => spots.reduce((a, s) => a * 24 + s, 0);
const decode = (code, k) => { const out = Array(k); for (let i = k - 1; i >= 0; i--) { out[i] = code % 24; code = Math.floor(code / 24); } return out; };

function crossTable(goalSpots) {
  const k = goalSpots.length, size = 24 ** k;
  const dist = new Int8Array(size).fill(-1);
  let frontier = [encode(goalSpots)];
  dist[frontier[0]] = 0;
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const code of frontier) {
      const spots = decode(code, k);
      for (const dest of DEST) {
        const n = encode(spots.map((s) => dest[s]));
        if (dist[n] === -1) { dist[n] = d + 1; next.push(n); }
      }
    }
    frontier = next;
  }
  return dist;
}

function solveEdges(st, edgeIds) {
  const solvedSt = Uint8Array.from(st, (_, i) => centre(st, i));
  const table = crossTable(edgeIds.map((e) => whiteSpot(solvedSt, e)));
  let spots = edgeIds.map((e) => whiteSpot(st, e));
  const moves = [];
  while (table[encode(spots)] > 0) {
    const d = table[encode(spots)];
    const m = FACE_MOVES.findIndex((_, mi) => table[encode(spots.map((s) => DEST[mi][s]))] === d - 1);
    moves.push(FACE_MOVES[m]);
    spots = spots.map((s) => DEST[m][s]);
  }
  return moves.join(' ');
}

// ---------- Step builder ----------
class Plan {
  constructor(start) { this.state = start; this.steps = []; }
  add(stage, title, detail, moves, extra = {}) {
    moves = simplify(moves);
    const before = this.state;
    this.state = apply(this.state, moves || '');
    this.steps.push({ stage, title, detail, moves, before, after: this.state, ...extra });
  }
}

function crossSteps(plan, oneByOne) {
  const done = () => countIn(solvedIds(plan.state), CROSS);
  if (done() === 4) return plan.add('Cross', 'White cross: already done', 'Lucky — your white cross is already solved.', '');
  if (!oneByOne) {
    return plan.add('Cross', 'Make the white cross',
      'Solve the 4 white edges on the bottom, each matching the centre colour beside it. This is the shortest way for your scramble.',
      solveEdges(plan.state, CROSS));
  }
  const have = CROSS.filter((e) => solvedIds(plan.state).has(e));
  while (have.length < 4) {
    // pick the white edge that's quickest to add
    let best = null;
    for (const e of CROSS.filter((x) => !have.includes(x))) {
      const moves = solveEdges(plan.state, [...have, e]);
      const cost = moves ? turnCount(moves) : 0;
      if (!best || cost < best.cost) best = { e, moves, cost };
    }
    have.push(best.e);
    const other = COLOUR_NAMES[best.e.replace(String(WHITE), '')];
    plan.add('Cross', `White cross: edge ${have.length} of 4 (white-${other})`,
      `Bring the white-${other} edge to the bottom so its ${other} side lines up with the ${other} centre. Keep any edges you already placed.`,
      best.moves);
  }
}

function beginnerSteps(plan) {
  crossSteps(plan, true);

  // White corners
  const cornerCands = makeCands(ROT.flatMap((r) => AUF.flatMap((a) => [1, 2, 3, 4, 5].map((n) => ({
    moves: `${r} ${a} ${Array(n).fill(BEGINNER.corner).join(' ')}`, n, rot: r, auf: a })))));
  while (countIn(solvedIds(plan.state), WHITE_CORNERS) < 4) {
    const before = solvedIds(plan.state);
    const k = countIn(before, WHITE_CORNERS);
    const goal = (s) => { const ids = solvedIds(s); return allIn(ids, CROSS) && WHITE_CORNERS.every((c) => !before.has(c) || ids.has(c)) && countIn(ids, WHITE_CORNERS) > k; };
    const seq = search(plan.state, cornerCands, goal);
    if (!seq) throw new Error('corner search failed');
    seq.forEach((c, i) => {
      const last = i === seq.length - 1;
      plan.add('White corners', last ? `White corner ${countIn(before, WHITE_CORNERS) + 1} of 4` : 'Pop a stuck corner out',
        last ? `Turn the cube so the empty slot is front-right${c.rot ? ` (${c.rot})` : ''}, turn the top${c.auf ? ` (${c.auf})` : ''} to put the white corner above it, then repeat R U R' U' — ${c.n} time${c.n > 1 ? 's' : ''} here — until it drops in solved.`
          : 'A white corner is stuck in the wrong spot on the bottom. One R U R\' U\' lifts it to the top so you can place it properly.',
        c.moves);
    });
  }

  // Middle edges
  const edgeCands = makeCands(ROT.flatMap((r) => AUF.flatMap((a) => [['right', BEGINNER.edgeRight], ['left', BEGINNER.edgeLeft]].map(([side, alg]) => ({
    moves: `${r} ${a} ${alg}`, side, rot: r, auf: a })))));
  while (countIn(solvedIds(plan.state), MID_EDGES) < 4) {
    const before = solvedIds(plan.state);
    const k = countIn(before, MID_EDGES);
    const goal = (s) => { const ids = solvedIds(s); return allIn(ids, CROSS) && allIn(ids, WHITE_CORNERS) && MID_EDGES.every((e) => !before.has(e) || ids.has(e)) && countIn(ids, MID_EDGES) > k; };
    const seq = search(plan.state, edgeCands, goal);
    if (!seq) throw new Error('edge search failed');
    seq.forEach((c, i) => {
      const last = i === seq.length - 1;
      plan.add('Middle layer', last ? `Middle edge ${k + 1} of 4` : 'Pop a wrong edge out',
        last ? `Find a top edge with no yellow. Turn the top until its front colour matches the front centre, then send it ${c.side}: ${c.side === 'right' ? BEGINNER.edgeRight : BEGINNER.edgeLeft}.`
          : 'An edge is in the middle layer but in the wrong place or flipped. Use the same algorithm with any top edge to kick it out to the top.',
        c.moves);
    });
  }

  // Yellow cross
  const ycCands = makeCands(AUF.map((a) => ({ moves: `${a} ${BEGINNER.yellowCross}`, auf: a })));
  if (!topEdgesYellow(plan.state)) {
    const seq = searchDeep(plan.state, ycCands, (s) => allIn(solvedIds(s), F2L_PIECES) && topEdgesYellow(s), 3);
    if (!seq) throw new Error('yellow cross search failed');
    seq.forEach((c, i) => plan.add('Yellow cross', `Yellow cross (${i + 1}/${seq.length})`,
      'Look at the top. Dot: do the algorithm from any side. L-shape: hold it at the back-left. Line: hold it left-to-right. Then F R U R\' U\' F\'.', c.moves));
  }

  // Yellow edges in place
  const yeGoal = (s) => { const ids = solvedIds(s); return allIn(ids, F2L_PIECES) && topEdgesYellow(s) && EDGES.filter((idx) => idx.some((i) => centre(s, i) === YELLOW)).every((idx) => isSolvedAt(s, idx)); };
  const yeCands = makeCands([...AUF.slice(1).map((a) => ({ moves: a, auf: a })), ...AUF.flatMap((a) => AUF.map((b) => ({ moves: `${a} ${BEGINNER.yellowEdges} ${b}` })))]);
  if (!yeGoal(plan.state)) {
    const seq = searchDeep(plan.state, yeCands, yeGoal, 3);
    if (!seq) throw new Error('yellow edges search failed');
    seq.forEach((c, i) => plan.add('Yellow edges', `Match the yellow edges (${i + 1}/${seq.length})`,
      'Turn the top until two edges match their side centres. With them at the back and right, do R U R\' U R U2 R\', then line the top up.', c.moves));
  }

  // Yellow corners in place
  const cpCands = makeCands(ROT.map((r) => ({ moves: `${r} ${BEGINNER.cornerCycle}`, rot: r })));
  const cpGoal = (s) => allIn(solvedIds(s), F2L_PIECES) && yellowCornersPositioned(s);
  if (!cpGoal(plan.state)) {
    const seq = searchDeep(plan.state, cpCands, cpGoal, 3);
    if (!seq) throw new Error('corner position search failed');
    seq.forEach((c, i) => plan.add('Yellow corners', `Put the yellow corners in place (${i + 1}/${seq.length})`,
      'Find a corner already in its right spot (its colours match the 3 centres around it, even if twisted). Hold it at front-right and do U R U\' L\' U R\' U\' L. If none are right, do it once from anywhere and look again.',
      c.moves));
  }

  // Twist yellow corners (the bottom looks scrambled in the middle — that's normal)
  if (!isSolved(plan.state)) {
    let s = plan.state;
    for (let k = 0; k < 4; k++) {
      let n = 0;
      // front-right-top corner has its yellow on top when U-face facelet 8 is yellow
      while (s[8] !== YELLOW && n < 6) { s = apply(s, BEGINNER.cornerTwist); n++; }
      const moves = `${Array(n).fill(BEGINNER.cornerTwist).join(' ')} U`;
      plan.add('Twist corners', `Twist corner ${k + 1} of 4`,
        n ? `Hold yellow on top. Repeat R' D' R D until the front-right corner shows yellow on top (${n} times here), then turn the top (U) to bring the next corner in. Don't panic if the bottom looks messed up — it fixes itself.`
          : 'This corner already shows yellow on top. Just turn the top (U) to bring the next one in.',
        moves);
      s = apply(s, 'U');
    }
    const fin = AUF.find((a) => isSolved(apply(plan.state, a || 'U U\'')));
    if (fin) plan.add('Finish', 'Final turn', 'Turn the top layer to line everything up.', fin);
  }
}

function cfopSteps(plan) {
  crossSteps(plan, false);

  const f2lCands = makeCands(ROT.flatMap((r) => AUF.flatMap((a) => F2L.map((alg) => ({ moves: `${r} ${a} ${alg}`, rot: r, alg })))));
  const extractCands = makeCands(ROT.flatMap((r) => ["R U R'", "R U' R'", "R U2 R'"].map((alg) => ({ moves: `${r} ${alg}`, rot: r, extract: true }))));
  while (pairsSolved(solvedIds(plan.state)) < 4) {
    const before = solvedIds(plan.state);
    const k = pairsSolved(before);
    const keep = PAIRS.filter(([c, e]) => before.has(c) && before.has(e)).flat();
    const goal = (s) => { const ids = solvedIds(s); return allIn(ids, CROSS) && allIn(ids, keep) && pairsSolved(ids) > k; };
    let seq = search(plan.state, f2lCands, goal, extractCands);
    // Rare: both pieces trapped in two different wrong slots → free one, then search again.
    if (!seq) {
      for (const e of extractCands) {
        const rest = search(applyPerm(plan.state, e.perm), f2lCands, goal, extractCands);
        const cost = rest && e.cost + rest.reduce((a, c) => a + c.cost, 0);
        if (rest && (!seq || cost < seq.cost)) { seq = [e, ...rest]; seq.cost = cost; }
      }
    }
    if (!seq) throw new Error('F2L search failed');
    const after = solvedIds(seq.reduce((s, c) => applyPerm(s, c.perm), plan.state));
    const pair = PAIRS.find(([c, e]) => after.has(c) && after.has(e) && !(before.has(c) && before.has(e)));
    const name = colourName(pair[1]);
    seq.forEach((c) => {
      if (c.extract) plan.add('F2L', 'Free a stuck piece', `A piece of the ${name} pair is trapped in a slot. Lift it out to the top first${c.rot ? ` (rotate the cube with ${c.rot} so it's at front-right)` : ''}.`, c.moves);
      else plan.add('F2L', `F2L pair ${k + 1} of 4 (${name})`,
        `Pair the white-${name} corner with the ${name} edge and drop them into their slot together.${c.rot ? ` First rotate the whole cube (${c.rot}) so the slot is at front-right.` : ''}`, c.moves, { alg: c.alg });
    });
  }

  const ollCands = makeCands(AUF.flatMap((a) => OLL.map(([name, alg]) => ({ moves: `${a} ${alg}`, name }))));
  if (!topAllYellow(plan.state)) {
    const goal = (s) => allIn(solvedIds(s), F2L_PIECES) && topAllYellow(s);
    const twoLook = ollCands.filter((c) => /cross/.test(c.name));
    const seq = search(plan.state, ollCands, goal, twoLook);
    seq.forEach((c, i) => plan.add('OLL', seq.length > 1 ? `Make the top yellow (${i + 1}/2): ${c.name}` : `Make the top yellow: ${c.name}`,
      seq.length > 1 && i === 0 ? 'Two-look OLL: first make a yellow cross on top, then fix the corners.' : 'Orient the last layer so the whole top is yellow.', c.moves, { caseName: c.name }));
  }

  const pllCands = makeCands(AUF.flatMap((a) => PLL.flatMap(([name, alg]) => AUF.map((b) => ({ moves: `${a} ${alg} ${b}`, name })))));
  const aufOnly = makeCands(AUF.slice(1).map((a) => ({ moves: a, name: 'final turn' })));
  if (!isSolved(plan.state)) {
    const one = search(plan.state, aufOnly, isSolved, []);
    const seq = one || search(plan.state, pllCands, isSolved, pllCands.filter((c) => /^(Aa|Ab|Ua|Ub|H|Z)-/.test(c.name)));
    seq.forEach((c, i) => plan.add('PLL', c.name === 'final turn' ? 'Final turn' : `Finish: ${c.name}${seq.length > 1 ? ` (${i + 1}/2)` : ''}`,
      c.name === 'final turn' ? 'Turn the top layer to line everything up.' : 'Move the top pieces into place. Turn the top to the angle shown first.', c.moves, { caseName: c.name }));
  }
}

export const METHODS = {
  beginner: { name: 'Beginner', blurb: 'Layer by layer. 7 short algorithms, easiest to learn.', stages: ['Cross', 'White corners', 'Middle layer', 'Yellow cross', 'Yellow edges', 'Yellow corners', 'Twist corners'], build: beginnerSteps },
  cfop: { name: 'CFOP', blurb: 'What speedcubers use: cross, F2L pairs, OLL, PLL.', stages: ['Cross', 'F2L', 'OLL', 'PLL'], build: cfopSteps },
};

// scanFacelets: the 54-letter scan (white on top, green front).
// The lesson starts by flipping the cube so white is on the bottom (z2).
export function planSolve(scanFacelets, method) {
  const start = apply(fromString(scanFacelets), 'z2');
  const plan = new Plan(start);
  METHODS[method].build(plan);
  if (!isSolved(plan.state)) throw new Error('plan did not solve the cube');
  return plan.steps.filter((s) => s.moves || s.title.includes('already'));
}

export { isSolved };
