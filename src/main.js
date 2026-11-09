// main.js — the app flow: scan 6 faces → check the reading → 3D digital twin.
import { TwistyPlayer } from 'cubing/twisty';
import { startCamera, sampleGrid, gridBox } from './camera.js';
import { rgbToLab, classifyStickers, groupDisplayColours } from './color.js';
import { SCAN_STEPS, FACES, readCube, validate, solve, invert, groupsToFacelets } from './cube.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), octx = overlay.getContext('2d');
const CHIP = { white: '#f4f4f4', yellow: '#ffd500', green: '#009b48', blue: '#0046ad', red: '#b71234', orange: '#ff5800' };

const state = {
  step: 0,                       // which SCAN_STEPS entry we're on
  faces: Array(6).fill(null),    // raw RGB of 9 stickers per face, indexed by URFDLB slot
  facelets: '',                  // 54-letter reading
  palette: {},                   // letter -> real RGB from your cube, for display
  unsure: new Set(),             // facelet indexes we had to guess
  facing: 'user',
  live: null,                    // latest 9 sampled colours
};

// ---------- Scanning ----------
async function initCamera() {
  try {
    await startCamera(video, state.facing);
    $('stage').classList.toggle('mirror', state.facing === 'user');
    $('cam-error').classList.add('hidden');
  } catch (err) {
    $('cam-error').textContent = 'Camera blocked or unavailable. Allow camera access in your browser and reload. (' + err.name + ')';
    $('cam-error').classList.remove('hidden');
  }
}

function drawOverlay() {
  requestAnimationFrame(drawOverlay);
  if (!video.videoWidth) return;
  if (overlay.width !== video.videoWidth) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
  const { x, y, size } = gridBox(overlay.width, overlay.height);
  const cell = size / 3;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  // darken outside the box so you know where to put the cube
  octx.fillStyle = 'rgba(0,0,0,0.45)';
  octx.fillRect(0, 0, overlay.width, overlay.height);
  octx.clearRect(x, y, size, size);
  octx.strokeStyle = 'rgba(255,255,255,0.9)';
  octx.lineWidth = Math.max(2, size / 150);
  for (let i = 0; i <= 3; i++) {
    octx.beginPath(); octx.moveTo(x + i * cell, y); octx.lineTo(x + i * cell, y + size); octx.stroke();
    octx.beginPath(); octx.moveTo(x, y + i * cell); octx.lineTo(x + size, y + i * cell); octx.stroke();
  }
  state.live = sampleGrid(video);
  // small swatch in each cell = what the camera thinks that sticker's colour is
  state.live?.forEach(([r, g, b], i) => {
    const cx = x + (i % 3) * cell + cell / 2, cy = y + Math.floor(i / 3) * cell + cell / 2;
    octx.fillStyle = `rgb(${r},${g},${b})`;
    octx.strokeStyle = '#000';
    octx.beginPath(); octx.arc(cx, cy, cell * 0.14, 0, Math.PI * 2); octx.fill(); octx.stroke();
  });
}

function renderScanStep() {
  const s = SCAN_STEPS[state.step];
  $('step-count').textContent = `Face ${state.step + 1} of 6`;
  $('instruction').textContent = s.how;
  $('chip-front').style.background = CHIP[s.front];
  $('chip-front').style.borderTopColor = CHIP[s.top];
  renderThumbs();
}

function renderThumbs() {
  $('thumbs').innerHTML = '';
  SCAN_STEPS.forEach((s, i) => {
    const t = document.createElement('button');
    t.className = 'thumb' + (i === state.step ? ' current' : '');
    t.title = `${s.front} face`;
    const face = state.faces[s.slot];
    for (let k = 0; k < 9; k++) {
      const d = document.createElement('i');
      d.style.background = face ? `rgb(${face[k].join(',')})` : (k === 4 ? CHIP[s.front] : '#333');
      t.appendChild(d);
    }
    t.onclick = () => { state.step = i; renderScanStep(); };
    $('thumbs').appendChild(t);
  });
}

function capture() {
  if (!state.live) return;
  state.faces[SCAN_STEPS[state.step].slot] = state.live.map((c) => [...c]);
  flash();
  const next = SCAN_STEPS.findIndex((s) => !state.faces[s.slot]);
  if (next === -1) return toReview();
  state.step = next;
  renderScanStep();
}

function flash() {
  $('stage').classList.add('flash');
  setTimeout(() => $('stage').classList.remove('flash'), 150);
}

// ---------- Review ----------
function toReview() {
  const rgb = state.faces.flat();               // 54 colours in URFDLB order
  const labs = rgb.map(rgbToLab);
  state.facelets = readCube(labs);              // piece-aware, always a legal cube
  // Stickers where the simple per-sticker guess disagrees with the piece-aware
  // answer = places the app had to use cube rules to decide. Worth a look.
  const naive = groupsToFacelets(classifyStickers(labs));
  state.unsure = new Set([...naive].map((c, i) => (c !== state.facelets[i] ? i : -1)).filter((i) => i >= 0));
  const groups = [...state.facelets].map((c) => FACES.indexOf(c));
  const cols = groupDisplayColours(rgb, groups);
  FACES.forEach((f, g) => (state.palette[f] = cols[g]));
  show('review');
  renderNet();
}

// Cross-shaped map: where each face sits in a 12x9 grid.
const NET_POS = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };

function renderNet() {
  const v = validate(state.facelets);
  const bad = new Set(v.bad);
  const n = state.unsure.size;
  $('review-msg').textContent = !v.ok ? v.message
    : n === 0 ? 'Read cleanly. Check it matches, then continue.'
    : `Read it, but I had to guess ${n} sticker${n > 1 ? 's' : ''} using cube rules (outlined). Double-check those.`;
  $('review-msg').className = 'msg ' + (v.ok ? 'ok' : 'err');
  $('build').disabled = !v.ok;

  const net = $('net');
  net.innerHTML = '';
  FACES.forEach((f, fi) => {
    const [r0, c0] = NET_POS[f];
    for (let k = 0; k < 9; k++) {
      const idx = fi * 9 + k;
      const el = document.createElement('button');
      el.className = 'sticker' + (bad.has(idx) ? ' bad' : state.unsure.has(idx) ? ' unsure' : '');
      el.style.gridRow = r0 + Math.floor(k / 3) + 1;
      el.style.gridColumn = c0 + (k % 3) + 1;
      el.style.background = `rgb(${state.palette[state.facelets[idx]].join(',')})`;
      if (k === 4) { el.disabled = true; el.classList.add('centre'); }
      else el.onclick = () => cycleSticker(idx);
      net.appendChild(el);
    }
  });
}

function cycleSticker(idx) {
  const cur = FACES.indexOf(state.facelets[idx]);
  const next = FACES[(cur + 1) % 6];
  state.facelets = state.facelets.slice(0, idx) + next + state.facelets.slice(idx + 1);
  state.unsure.delete(idx);
  renderNet();
}

// ---------- Digital twin ----------
let player = null, solution = '';

function toTwin() {
  $('build').textContent = 'Thinking… (first time takes a couple of seconds)';
  $('build').disabled = true;
  setTimeout(() => {                     // let the button text paint first
    solution = solve(state.facelets);
    $('build').textContent = 'Looks right → build 3D cube';
    if (!player) {
      player = new TwistyPlayer({ puzzle: '3x3x3', background: 'none', controlPanel: 'bottom-row', hintFacelets: 'floating' });
      $('player-slot').appendChild(player);
    }
    // The player starts solved; applying the reverse of a solution recreates your scramble.
    player.experimentalSetupAlg = invert(solution);
    player.alg = '';
    $('solution').textContent = '';
    show('twin');
  }, 30);
}

function playSolution() {
  player.alg = solution;
  player.timestamp = 0;
  player.play();
  const moves = solution ? solution.split(/\s+/).length : 0;
  $('solution').textContent = moves ? `${moves} moves: ${solution}` : 'Already solved!';
}

// ---------- Plumbing ----------
function show(id) {
  ['scan', 'review', 'twin'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}

function resetScan() {
  state.faces = Array(6).fill(null);
  state.step = 0;
  show('scan');
  renderScanStep();
}

$('capture').onclick = capture;
$('flip-cam').onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; initCamera(); };
$('build').onclick = toTwin;
$('rescan').onclick = resetScan;
$('restart').onclick = resetScan;
$('play-solution').onclick = playSolution;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('scan').classList.contains('hidden')) { e.preventDefault(); capture(); }
});

renderScanStep();
initCamera();
drawOverlay();
