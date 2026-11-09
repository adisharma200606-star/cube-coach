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
