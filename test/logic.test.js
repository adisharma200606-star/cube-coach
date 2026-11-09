// Run with: npm test
// Simulates a webcam scan: real cube colours + lighting tint + noise,
// then checks the app reads the cube back exactly.
import assert from 'node:assert';
import Cube from 'cubejs';
import { rgbToLab, classifyStickers } from '../src/color.js';
import { groupsToFacelets, validate, solve, invert, readCube } from '../src/cube.js';

// Typical cube colours as a webcam sees them (red & orange deliberately close).
const BASE = { U: [235, 235, 230], R: [190, 30, 40], F: [20, 160, 70], D: [235, 220, 40], L: [240, 110, 30], B: [20, 70, 190] };

function fakeScan(facelets, tint, noise) {
  return [...facelets].map((f) => BASE[f].map((v, k) =>
    Math.max(0, Math.min(255, v * tint[k] + (Math.random() * 2 - 1) * noise))));
}

function trial(noise, n = 200) {
  let sticker = 0, piece = 0;
  for (let t = 0; t < n; t++) {
    const truth = Cube.random().asString();
    const tint = [0.8 + Math.random() * 0.3, 0.8 + Math.random() * 0.3, 0.75 + Math.random() * 0.3];
    const labs = fakeScan(truth, tint, noise).map(rgbToLab);
    if (groupsToFacelets(classifyStickers(labs)) === truth) sticker++;
    if (readCube(labs) === truth) piece++;
  }
  console.log(`noise ±${noise}: sticker-by-sticker ${sticker}/${n}, piece-aware ${piece}/${n} cubes read perfectly`);
  return piece / n;
}
assert(trial(18) > 0.97, 'colour reading too inaccurate (normal noise)');
assert(trial(40) > 0.85, 'colour reading too inaccurate (heavy noise)');

// Validator
const solved = new Cube().asString();
assert(validate(solved).ok);
const s = new Cube(); s.move("R U R' U' F2 D");
assert(validate(s.asString()).ok);
const swapped = s.asString().split(''); [swapped[8], swapped[9]] = [swapped[9], swapped[8]];
assert(!validate(swapped.join('')).ok, 'should catch a twisted/misread corner');
const wrongCount = 'U' + solved.slice(1, 9) + 'U' + solved.slice(10);
assert(!validate(wrongCount).ok);

// Solver round-trip
const sol = solve(s.asString());
const check = new Cube(); check.move("R U R' U' F2 D"); check.move(sol);
assert(check.isSolved(), 'solution should solve the cube');
assert.equal(invert(''), '');
console.log('validator + solver: OK');

// ---------- Teaching engine ----------
import { apply as apply54, fromString as from54, toString as to54, invertAlg } from '../src/engine/cube54.js';
import { planSolve } from '../src/engine/methods.js';
import { PLL, OLL } from '../src/engine/algs.js';

// 1. our fast cube model agrees with cubejs (incl. rotations, slices, wide moves)
const MOVES = ['U','R','F','D','L','B','M','E','S','x','y','z','r','f','l','u','d','b'];
const SOLVED = new Cube().asString();
for (let t = 0; t < 500; t++) {
  const alg = Array.from({ length: 15 }, () => MOVES[Math.random() * 18 | 0] + ['', "'", '2'][Math.random() * 3 | 0]).join(' ');
  assert.equal(to54(apply54(from54(SOLVED), alg)), new Cube().move(alg).asString(), 'model mismatch on ' + alg);
  assert.equal(to54(apply54(apply54(from54(SOLVED), alg), invertAlg(alg))), SOLVED);
}
console.log('cube model: matches cubejs');

// 2. both methods solve random scrambles, and the steps replay correctly
for (const method of ['beginner', 'cfop']) {
  let moves = 0;
  for (let t = 0; t < 40; t++) {
    const scan = Cube.random().asString();
    const steps = planSolve(scan, method);
    let st = apply54(from54(scan), 'z2');
    for (const s of steps) st = apply54(st, s.moves || "U U'");
    assert(st.every((v, i) => v === st[Math.floor(i / 9) * 9 + 4]), `${method} plan does not solve`);
    moves += steps.reduce((a, s) => a + s.moves.split(' ').filter((m) => m && !/[xyz]/.test(m[0])).length, 0);
  }
  console.log(`${method}: 40/40 scrambles solved, avg ${(moves / 40).toFixed(0)} turns`);
}

// 3. every OLL/PLL alg keeps the first two layers intact
const whiteDown = apply54(from54(SOLVED), 'z2');
const f2lOk = (st) => to54(st).slice(27, 36) === to54(whiteDown).slice(27, 36); // white bottom face untouched
for (const [name, alg] of [...OLL, ...PLL]) assert(f2lOk(apply54(whiteDown, alg)), `${name} breaks the bottom layer`);
console.log('OLL/PLL algorithms: all keep F2L');
