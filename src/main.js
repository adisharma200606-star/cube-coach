// main.js — the app: Learn (scan → confirm → pick method → lesson) and Timer.
import { TwistyPlayer } from 'cubing/twisty';
import { startCamera, sampleGrid, gridBox } from './camera.js';
import { rgbToLab, deltaE2000, classifyStickers, groupDisplayColours } from './color.js';
import { SCAN_STEPS, FACES, readCube, validate, solve, invert, groupsToFacelets, randomScramble } from './cube.js';
import { planSolve, METHODS, COLOUR_NAMES } from './engine/methods.js';
import { explainMove } from './notation.js';

const $ = (id) => document.getElementById(id);
const STD_RGB = { U: [245, 245, 245], R: [200, 30, 45], F: [0, 155, 72], D: [255, 213, 0], L: [255, 110, 20], B: [0, 70, 173] };

const app = {
  scanStep: 0,
  faces: Array(6).fill(null),   // raw RGB per face (URFDLB slots)
  facelets: '',
  unsure: new Set(),
  palette: { ...STD_RGB },      // letter -> RGB of YOUR cube
  paletteLab: null,             // letter -> Lab, for camera checks
  facing: 'user',
  live: null,
  scramble: '',                 // moves that recreate your scramble from solved (white top, green front)
  method: null,
  steps: [],
  stepIndex: 0,
};

// =============== Screens & tabs ===============
let lastLearnScreen = 'scan';
const SCREENS = ['scan', 'review', 'method', 'lesson', 'done', 'timer'];
function show(id) {
  SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== id));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === (id === 'timer' ? 'timer' : 'learn')));
  app.screen = id;
  if (id !== 'timer') lastLearnScreen = id;
  // put the camera wherever this screen wants it
  const slot = $(id).querySelector('[data-cam]');
  if (id === 'scan' && slot) mountCam(slot);
  if (id === 'timer') syncTimerCam();
  if (id !== 'lesson') $('check-box').classList.add('hidden');
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
  if (b.dataset.tab === 'timer') { show('timer'); prepareTimer(); }
  else show(lastLearnScreen);
}));

// =============== Camera ===============
const video = $('video'), overlay = $('overlay'), octx = overlay.getContext('2d');
let camOn = false;
async function ensureCamera() {
  if (camOn) return;
  try {
    await startCamera(video, app.facing);
    camOn = true;
    $('cam').classList.toggle('mirror', app.facing === 'user');
    $('cam-error').classList.add('hidden');
  } catch (err) {
    $('cam-error').textContent = `I can't use the camera (${err.name}). Allow camera access for this site in your browser settings, then reload.`;
    $('cam-error').classList.remove('hidden');
  }
}
function mountCam(slot) { slot.appendChild($('cam')); ensureCamera(); }

function drawOverlay() {
  requestAnimationFrame(drawOverlay);
  if (!video.videoWidth || !$('cam').isConnected || !$('cam').offsetParent) return;
  if (overlay.width !== video.videoWidth) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
  const { x, y, size } = gridBox(overlay.width, overlay.height);
  const cell = size / 3;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.fillStyle = 'rgba(20,26,38,0.5)';
  octx.fillRect(0, 0, overlay.width, overlay.height);
  octx.clearRect(x, y, size, size);
  octx.strokeStyle = 'rgba(255,255,255,0.95)';
  octx.lineWidth = Math.max(2, size / 140);
  for (let i = 0; i <= 3; i++) {
    octx.beginPath(); octx.moveTo(x + i * cell, y); octx.lineTo(x + i * cell, y + size); octx.stroke();
    octx.beginPath(); octx.moveTo(x, y + i * cell); octx.lineTo(x + size, y + i * cell); octx.stroke();
  }
  app.live = sampleGrid(video);
  app.live?.forEach(([r, g, b], i) => {
    const cx = x + (i % 3) * cell + cell / 2, cy = y + Math.floor(i / 3) * cell + cell / 2;
    octx.fillStyle = `rgb(${r},${g},${b})`;
    octx.strokeStyle = 'rgba(0,0,0,0.6)';
    octx.beginPath(); octx.arc(cx, cy, cell * 0.13, 0, Math.PI * 2); octx.fill(); octx.stroke();
  });
  onFrame();
}

// =============== 1. Scan ===============
const CHIP = { white: STD_RGB.U, red: STD_RGB.R, green: STD_RGB.F, yellow: STD_RGB.D, orange: STD_RGB.L, blue: STD_RGB.B };
const rgb = (c) => `rgb(${c.join(',')})`;

function renderScanList() {
  $('scan-list').innerHTML = '';
  SCAN_STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    const done = !!app.faces[s.slot];
    li.className = (i === app.scanStep ? 'current ' : '') + (done ? 'done' : '');
    const face = document.createElement('span');
    face.className = 'face tiny';
    for (let k = 0; k < 9; k++) {
      const d = document.createElement('i');
      d.style.background = done ? rgb(app.faces[s.slot][k]) : k === 4 ? rgb(CHIP[s.front]) : 'transparent';
      face.appendChild(d);
    }
    face.style.borderTopColor = rgb(CHIP[s.top]);
    const text = document.createElement('span');
    text.innerHTML = `<b>${s.front[0].toUpperCase() + s.front.slice(1)} side</b><span>${i === app.scanStep ? s.how : done ? 'Captured. Tap to redo.' : `${s.top} on top`}</span>`;
    li.append(face, text);
    li.onclick = () => { app.scanStep = i; renderScanList(); };
    $('scan-list').appendChild(li);
  });
}

function capture() {
  if (!app.live) return;
  app.faces[SCAN_STEPS[app.scanStep].slot] = app.live.map((c) => [...c]);
  $('cam').classList.add('flash'); setTimeout(() => $('cam').classList.remove('flash'), 160);
  const next = SCAN_STEPS.findIndex((s) => !app.faces[s.slot]);
  if (next === -1) return toReview();
  app.scanStep = next;
  renderScanList();
}

// =============== 2. Review ===============
function toReview() {
  const all = app.faces.flat();
  const labs = all.map(rgbToLab);
  app.facelets = readCube(labs);
  const naive = groupsToFacelets(classifyStickers(labs));
  app.unsure = new Set([...naive].map((c, i) => (c !== app.facelets[i] ? i : -1)).filter((i) => i >= 0));
  const groups = [...app.facelets].map((c) => FACES.indexOf(c));
  const cols = groupDisplayColours(all, groups);
  app.paletteLab = {};
  FACES.forEach((f, g) => {
    app.palette[f] = cols[g];
    const m = labs.filter((_, i) => groups[i] === g);
    app.paletteLab[f] = [0, 1, 2].map((k) => m.reduce((s, c) => s + c[k], 0) / m.length);
  });
  show('review');
  renderNet();
}

const NET_POS = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
function renderNet() {
  const v = validate(app.facelets);
  const bad = new Set(v.bad);
  const n = app.unsure.size;
  $('review-msg').textContent = !v.ok ? v.message
    : n === 0 ? 'Every sticker read cleanly. Check it against your cube.'
    : `I read it, but had to guess ${n} sticker${n > 1 ? 's' : ''} using the cube's rules. Double-check the dashed ones.`;
  $('confirm').disabled = !v.ok;
  const net = $('net');
  net.innerHTML = '';
  FACES.forEach((f, fi) => {
    const [r0, c0] = NET_POS[f];
    for (let k = 0; k < 9; k++) {
      const idx = fi * 9 + k;
      const el = document.createElement('button');
      el.className = 'sticker' + (bad.has(idx) ? ' bad' : app.unsure.has(idx) ? ' unsure' : '');
      el.style.gridRow = r0 + Math.floor(k / 3) + 1;
      el.style.gridColumn = c0 + (k % 3) + 1;
      el.style.background = rgb(app.palette[app.facelets[idx]]);
      el.setAttribute('aria-label', `sticker ${idx}`);
      if (k === 4) el.disabled = true;
      else el.onclick = () => {
        const next = FACES[(FACES.indexOf(app.facelets[idx]) + 1) % 6];
        app.facelets = app.facelets.slice(0, idx) + next + app.facelets.slice(idx + 1);
        app.unsure.delete(idx);
        renderNet();
      };
      net.appendChild(el);
    }
  });
}

function confirmCube() {
  $('confirm').textContent = 'Working it out…';
  $('confirm').disabled = true;
  setTimeout(() => {
    app.scramble = invert(solve(app.facelets));
    $('confirm').textContent = "Yes, that's my cube";
    $('confirm').disabled = false;
    renderMethods();
    show('method');
  }, 30);
}

// =============== 3. Method ===============
function renderMethods() {
  $('methods').innerHTML = '';
  for (const [key, m] of Object.entries(METHODS)) {
    const b = document.createElement('button');
    b.className = 'method';
    b.innerHTML = `<span class="method-name">${m.name}</span><span class="method-blurb">${m.blurb}</span>
      <span class="method-stages">${m.stages.map((s) => `<span>${s}</span>`).join('')}</span>`;
    b.onclick = () => startLesson(key);
    $('methods').appendChild(b);
  }
  const soon = document.createElement('div');
  soon.className = 'method soon';
  soon.innerHTML = '<span class="method-name">Roux</span><span class="method-blurb">Blocks and M-slice. Coming later.</span>';
  $('methods').appendChild(soon);
}

// =============== 4. Lesson ===============
let player = null;
function startLesson(method) {
  app.method = method;
  app.steps = planSolve(app.facelets, method);
  app.stepIndex = 0;
  if (!player) {
    player = new TwistyPlayer({ puzzle: '3x3x3', background: 'none', controlPanel: 'none', hintFacelets: 'floating', backView: 'none' });
    player.tempoScale = Number($('speed').value);
    $('player-slot').appendChild(player);
  }
  renderStages();
  show('lesson');
  renderStep(true);
}

function renderStages() {
  const stages = METHODS[app.method].stages;
  const cur = stageOf(app.steps[app.stepIndex]);
  $('stages').innerHTML = stages.map((s, i) => `<li class="${i < cur ? 'past' : i === cur ? 'now' : ''}">${s}</li>`).join('');
}
function stageOf(step) {
  const stages = METHODS[app.method].stages;
  const i = stages.indexOf(step.stage);
  return i === -1 ? stages.length - 1 : i;
}

function renderStep(autoplay) {
  const step = app.steps[app.stepIndex];
  const prior = app.steps.slice(0, app.stepIndex).map((s) => s.moves).join(' ');
  $('step-count').textContent = `Step ${app.stepIndex + 1} of ${app.steps.length}`;
  $('step-title').textContent = step.title;
  $('step-detail').textContent = step.detail;
  $('prev').disabled = app.stepIndex === 0;
  $('next').textContent = app.stepIndex === app.steps.length - 1 ? 'I did it, finish' : 'I did it, next';
  $('move-help').textContent = step.moves ? 'Tap a move to see what it means.' : 'Nothing to do here.';
  $('moves').innerHTML = '';
  (step.moves ? step.moves.split(' ') : []).forEach((m) => {
    const t = document.createElement('button');
    t.className = 'key' + (/[xyz]/.test(m[0]) ? ' rot' : '');
    t.textContent = m;
    t.onclick = () => { $('move-help').textContent = explainMove(m); };
    $('moves').appendChild(t);
  });
  renderStages();
  $('check-box').classList.add('hidden');
  // 3D: start from your scramble, flipped white-down (z2), plus every earlier step
  player.experimentalSetupAlg = `${app.scramble} z2 ${prior}`;
  player.alg = step.moves;
  player.timestamp = 0;
  if (autoplay && step.moves) setTimeout(() => player.play(), 400);
}

function nextStep() {
  if (app.stepIndex < app.steps.length - 1) { app.stepIndex++; renderStep(true); }
  else {
    const turns = app.steps.reduce((a, s) => a + s.moves.split(' ').filter((m) => m && !/[xyz]/.test(m[0])).length, 0);
    $('done-msg').textContent = `You solved it with ${METHODS[app.method].name} in ${app.steps.length} steps and ${turns} turns. Do it a few more times and the algorithms will start to stick.`;
    show('done');
  }
}

// ---- camera check: does the front of your cube match what it should be after this step? ----
function openCheck() {
  const box = $('check-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const after = app.steps[app.stepIndex].after;
  const top = COLOUR_NAMES[after[4]], front = COLOUR_NAMES[after[22]];
  $('check-how').textContent = `Hold ${top} on top with ${front} facing the camera.`;
  drawFace($('expect-face'), Array.from(after.slice(18, 27)).map((c) => app.palette[FACES[c]]));
  $('check-result').textContent = 'Looking…';
  box.classList.remove('hidden');
  mountCam(box.querySelector('[data-cam]'));
}
function drawFace(el, colours, marks = []) {
  el.innerHTML = colours.map((c, i) => `<i style="background:${rgb(c)}" class="${marks[i] ? 'off' : ''}"></i>`).join('');
}
let matchFrames = 0;
function checkFrame() {
  if ($('check-box').classList.contains('hidden') || !app.live || !app.paletteLab) return;
  const exp = app.steps[app.stepIndex].after.slice(18, 27);
  const seen = app.live.map((c) => {
    const lab = rgbToLab(c);
    return FACES.reduce((best, f) => (deltaE2000(lab, app.paletteLab[f]) < deltaE2000(lab, app.paletteLab[best]) ? f : best), 'U');
  });
  const wrong = seen.map((f, i) => f !== FACES[exp[i]]);
  drawFace($('seen-face'), seen.map((f) => app.palette[f]), wrong);
  const n = wrong.filter(Boolean).length;
  matchFrames = n === 0 ? matchFrames + 1 : 0;
  $('check-result').className = 'check-result ' + (matchFrames > 8 ? 'ok' : '');
  $('check-result').textContent = matchFrames > 8 ? 'Matches. Nice, you did it right.'
    : n <= 2 ? `Almost: ${n} sticker${n > 1 ? 's' : ''} look${n > 1 ? '' : 's'} different (crossed out). Hold it steady, or check those.`
    : 'Doesn\'t match yet. Check you\'re holding it the right way round, or go back a step.';
}

// =============== Timer ===============
const timer = { running: false, start: 0, raf: 0, times: [], uniformFrames: 0 };
try { timer.times = JSON.parse(localStorage.getItem('cc-times') || '[]'); } catch { timer.times = []; }

function prepareTimer() {
  renderTimes();
  if (!timer.scrambleReady) newScramble();
}
function newScramble() {
  $('scramble').textContent = 'Generating…';
  setTimeout(() => { $('scramble').textContent = randomScramble(); timer.scrambleReady = true; }, 30);
}
const fmt = (ms) => (ms / 1000).toFixed(2);
function tick() { $('clock').textContent = fmt(performance.now() - timer.start); timer.raf = requestAnimationFrame(tick); }
function toggleTimer() {
  if (!timer.running) {
    timer.running = true; timer.start = performance.now(); timer.uniformFrames = 0;
    $('clock').classList.add('running');
    $('timer-hint').textContent = $('autostop').checked ? 'Solving… show any solved side to the camera to stop, or press Space.' : 'Solving… press Space to stop.';
    tick();
  } else stopTimer();
}
function stopTimer() {
  timer.running = false;
  cancelAnimationFrame(timer.raf);
  const t = performance.now() - timer.start;
  $('clock').textContent = fmt(t);
  $('clock').classList.remove('running');
  $('timer-hint').textContent = 'Nice. New scramble below. Press Space for the next solve.';
  timer.times.push({ t, s: $('scramble').textContent, d: Date.now() });
  try { localStorage.setItem('cc-times', JSON.stringify(timer.times.slice(-200))); } catch {}
  renderTimes();
  newScramble();
}
function renderTimes() {
  const ts = timer.times.map((x) => x.t);
  $('count').textContent = ts.length;
  $('best').textContent = ts.length ? fmt(Math.min(...ts)) : '–';
  if (ts.length >= 5) {
    const last = ts.slice(-5).sort((a, b) => a - b).slice(1, 4); // drop best and worst, like competitions
    $('ao5').textContent = fmt(last.reduce((a, b) => a + b, 0) / 3);
  } else $('ao5').textContent = '–';
  $('times').innerHTML = timer.times.slice(-12).reverse().map((x) => `<li><b>${fmt(x.t)}</b><span>${x.s}</span></li>`).join('');
}
function syncTimerCam() {
  const on = $('autostop').checked;
  $('timer-cam-wrap').classList.toggle('hidden', !on);
  if (on) mountCam($('timer-cam-wrap').querySelector('[data-cam]'));
}
// A solved side = all 9 stickers the same colour (and not dark background).
function timerFrame() {
  if (app.screen !== 'timer' || !timer.running || !$('autostop').checked || !app.live) return;
  if (performance.now() - timer.start < 3000) return; // ignore the first 3s
  const labs = app.live.map(rgbToLab);
  const mid = labs[4];
  const uniform = mid[0] > 25 && labs.every((l) => deltaE2000(l, mid) < 12);
  timer.uniformFrames = uniform ? timer.uniformFrames + 1 : 0;
  if (timer.uniformFrames > 10) stopTimer();
}

function onFrame() { checkFrame(); timerFrame(); }

// =============== Wiring ===============
$('capture').onclick = capture;
$('flip-cam').onclick = () => { app.facing = app.facing === 'user' ? 'environment' : 'user'; camOn = false; ensureCamera(); };
$('confirm').onclick = confirmCube;
$('rescan').onclick = resetScan;
$('replay').onclick = () => { player.timestamp = 0; player.play(); };
$('speed').oninput = (e) => { if (player) player.tempoScale = Number(e.target.value); };
$('next').onclick = nextStep;
$('prev').onclick = () => { if (app.stepIndex > 0) { app.stepIndex--; renderStep(true); } };
$('check').onclick = openCheck;
$('again').onclick = resetScan;
$('to-timer').onclick = () => { show('timer'); prepareTimer(); };
$('clock').onclick = toggleTimer;
$('autostop').onchange = syncTimerCam;
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (app.screen === 'scan') { e.preventDefault(); capture(); }
  else if (app.screen === 'timer') { e.preventDefault(); toggleTimer(); }
});

function resetScan() {
  app.faces = Array(6).fill(null);
  app.scanStep = 0;
  renderScanList();
  show('scan');
}

renderScanList();
show('scan');
drawOverlay();
