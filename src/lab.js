// lab.js — records labelled test sessions for the live tracker.
//
// Output per session: one cube-session-<time>.zip containing
//   session.webm (or .mp4 on Safari)  — the webcam video
//   answer-key.json                   — the "answer key":
//     { start: solved cube held white-top/green-front,
//       moves: [{ m: "R'", t: 5123 }, ...] }   t = ms since the video started,
//     logged when you press Space AFTER finishing the move.
import { TwistyPlayer } from 'cubing/twisty';
import { startCamera } from './camera.js';
import { explainMove } from './notation.js';
import { zipSync, strToU8 } from 'fflate';

const $ = (id) => document.getElementById(id);
const video = $('video');
let facing = 'user', stream = null;

async function cam() {
  try {
    stream = await startCamera(video, facing);
    const s = stream.getVideoTracks()[0].getSettings();
    $('cam-info').textContent = `${s.width}×${s.height} @ ${Math.round(s.frameRate || 30)}fps`;
    document.querySelector('.lab-cam').classList.toggle('no-mirror', facing !== 'user');
  } catch (e) {
    $('cam-info').textContent = `Camera unavailable (${e.name}). Allow camera access and reload.`;
  }
}
$('flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; cam(); };

// ---------- random move list (never the same face twice in a row) ----------
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const SUFFIX = ['', "'", '2'];
const ROTS = ['y', "y'", 'y2', 'x', "x'"];
function makeSequence(n, rotations) {
  const out = [];
  let last = '';
  while (out.length < n) {
    if (rotations && out.length > 2 && Math.random() < 0.12 && !/[xyz]/.test(last)) { last = ROTS[(Math.random() * ROTS.length) | 0]; out.push(last); continue; }
    const f = FACES[(Math.random() * 6) | 0];
    if (f === last[0]) continue;
    last = f + SUFFIX[(Math.random() * 3) | 0];
    out.push(last);
  }
  return out;
}

// ---------- recording ----------
const sess = { seq: [], i: 0, log: [], rec: null, chunks: [], t0: 0, active: false, files: [] };
let twin = null;

function pickMime() {
  const opts = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

async function start() {
  if (!stream) await cam();
  if (!stream) return;
  sess.seq = makeSequence(Number($('n-moves').value) || 30, $('rotations').checked);
  sess.i = 0; sess.log = []; sess.chunks = [];
  sess.mime = pickMime();
  sess.rec = new MediaRecorder(stream, { mimeType: sess.mime || undefined, videoBitsPerSecond: 2_000_000 });
  sess.rec.ondataavailable = (e) => e.data.size && sess.chunks.push(e.data);
  sess.rec.onstop = finish;
  sess.rec.onstart = () => { sess.t0 = performance.now(); };
  sess.rec.start(1000);
  sess.started = new Date();
  $('setup').classList.add('hidden');
  $('recording').classList.remove('hidden');
  $('rec-dot').classList.remove('hidden');
  if (!twin) { twin = new TwistyPlayer({ puzzle: '3x3x3', background: 'none', controlPanel: 'none', hintFacelets: 'none' }); $('twin').appendChild(twin); }
  twin.alg = '';
  // 3-second still countdown: gives the tracker clean frames of the known start state
  $('countdown').classList.remove('hidden'); $('now').textContent = ''; $('did').disabled = true;
  for (let c = 3; c > 0; c--) { $('countdown').textContent = c; await new Promise((r) => setTimeout(r, 1000)); }
  $('countdown').classList.add('hidden'); $('did').disabled = false;
  sess.active = true;
  sess.log.push({ event: 'go', t: Math.round(performance.now() - sess.t0) });
  render();
}

function render() {
  const m = sess.seq[sess.i];
  $('progress').textContent = `Move ${sess.i + 1} of ${sess.seq.length}`;
  $('now').textContent = m;
  $('now').classList.toggle('rot', /[xyz]/.test(m));
  $('now-help').textContent = explainMove(m);
  $('upnext').innerHTML = sess.seq.slice(sess.i + 1, sess.i + 6).map((x) => `<span>${x}</span>`).join('');
}

function did() {
  if (!sess.active) return;
  const m = sess.seq[sess.i];
  sess.log.push({ m, t: Math.round(performance.now() - sess.t0) });
  twin.alg = sess.log.filter((x) => x.m).map((x) => x.m).join(' ');
  twin.timestamp = 'end';
  sess.i++;
  if (sess.i >= sess.seq.length) stop('complete'); else render();
}

function stop(reason) {
  if (!sess.rec || sess.rec.state === 'inactive') return;
  sess.active = false;
  sess.endReason = reason;
  sess.log.push({ event: 'end', reason, t: Math.round(performance.now() - sess.t0) });
  setTimeout(() => sess.rec.stop(), 800); // keep a little footage after the last move
}

function finish() {
  $('rec-dot').classList.add('hidden');
  const s = stream.getVideoTracks()[0].getSettings();
  const stamp = sess.started.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = sess.mime.includes('mp4') ? 'mp4' : 'webm';
  const video = new Blob(sess.chunks, { type: sess.mime || 'video/webm' });
  const key = {
    format: 'cube-coach-session/1',
    recorded: sess.started.toISOString(),
    start: { state: 'solved', hold: 'white on top, green facing camera' },
    style: $('style').value,
    rotationsIncluded: $('rotations').checked,
    camera: { width: s.width, height: s.height, fps: s.frameRate, facing, mirroredPreview: facing === 'user' },
    note: 't = milliseconds since video start, logged when Space was pressed after finishing the move',
    endReason: sess.endReason,
    moves: sess.log,
    userAgent: navigator.userAgent,
  };
  // One .zip = video + answer key, so nothing gets separated (and browsers allow one download fine).
  video.arrayBuffer().then((buf) => {
    const zip = zipSync({
      [`session.${ext}`]: [new Uint8Array(buf), { level: 0 }], // video is already compressed
      'answer-key.json': strToU8(JSON.stringify(key, null, 2)),
    });
    sess.files = [[new Blob([zip], { type: 'application/zip' }), `cube-session-${stamp}.zip`]];
    download();
  });
  const done = sess.log.filter((x) => x.m).length;
  $('summary').textContent = `${done} move${done === 1 ? '' : 's'} recorded, ${(video.size / 1e6).toFixed(1)} MB of video.${sess.endReason === 'stopped' ? ' (Stopped early: everything up to the last Space press is labelled.)' : ''}`;
  $('recording').classList.add('hidden');
  $('finished').classList.remove('hidden');
}

function download() {
  for (const [blob, name] of sess.files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
}

$('start').onclick = start;
$('did').onclick = did;
$('stop').onclick = () => stop('stopped');
$('again').onclick = () => { $('finished').classList.add('hidden'); $('setup').classList.remove('hidden'); };
$('redownload').onclick = download;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && sess.active) { e.preventDefault(); if (!e.repeat) did(); }
  if (e.code === 'Escape' && sess.active) stop('stopped');
});

cam();
