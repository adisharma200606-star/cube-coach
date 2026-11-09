# Cube Coach — notes for Claude

Owner (Adi) is learning to code while building: explain changes in plain language, keep code commented for a beginner.

- Vanilla JS + Vite, no framework. Entry: `index.html` → `src/main.js`.
- `src/color.js` colour maths (Lab, CIEDE2000, balanced sticker classification).
- `src/cube.js` facelet notation (URFDLB, 54 chars), scan order, validator, piece-aware `readCube`, solver wrapper.
- `src/camera.js` getUserMedia + 3x3 grid sampling (median colour of each cell's middle 40%).
- `cubejs` needs `scripts/patch-cubejs.js` (postinstall) to work in the browser bundle.
- `npm test` must pass before committing. Phase plan lives in README.
