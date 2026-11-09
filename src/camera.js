// camera.js — webcam access + reading the 3x3 grid of colours.

export async function startCamera(video, facingMode = 'user') {
  if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

// The square guide box, in video pixel coordinates.
export function gridBox(w, h) {
  const size = Math.min(w, h) * 0.6;
  return { x: (w - size) / 2, y: (h - size) / 2, size };
}

const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });

// Reads the 9 stickers inside the guide box.
// Returns 9 [r,g,b] colours, row by row, as the CAMERA sees the face
// (which is the correct way to read a face — looking straight at it).
export function sampleGrid(video) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  if (work.width !== w) { work.width = w; work.height = h; }
  wctx.drawImage(video, 0, 0, w, h);
  const { x, y, size } = gridBox(w, h);
  const cell = size / 3;
  const out = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Only look at the middle 40% of each cell: avoids the black plastic
      // between stickers and slightly misaligned edges.
      const px = Math.round(x + col * cell + cell * 0.3);
      const py = Math.round(y + row * cell + cell * 0.3);
      const ps = Math.max(2, Math.round(cell * 0.4));
      out.push(medianColour(wctx.getImageData(px, py, ps, ps).data));
    }
  }
  return out;
}

// Median (middle value) instead of average: a shiny glare spot or a finger
// edge won't drag the result off.
function medianColour(data) {
  const r = [], g = [], b = [];
  for (let i = 0; i < data.length; i += 8) { r.push(data[i]); g.push(data[i + 1]); b.push(data[i + 2]); }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return [med(r), med(g), med(b)];
}
