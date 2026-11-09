# Cube Coach — notes for Claude

Owner (Adi) is learning to code while building: explain changes in plain language, keep code commented for a beginner.

- Vanilla JS + Vite, no framework. Entry: `index.html` → `src/main.js`.
- `src/color.js` colour maths (Lab, CIEDE2000, balanced sticker classification).
- `src/cube.js` facelet notation (URFDLB, 54 chars), scan order, validator, piece-aware `readCube`, solver wrapper.
- `src/camera.js` getUserMedia + 3x3 grid sampling (median colour of each cell's middle 40%).
- `cubejs` needs `scripts/patch-cubejs.js` (postinstall) to work in the browser bundle.
- `src/engine/cube54.js` fast 54-sticker cube model (moves as permutations, supports x/y/z, M/E/S, wide).
- `src/engine/methods.js` turns a scan into teaching steps per method (METHODS registry: beginner, cfop). `src/engine/algs.js` alg libraries (white bottom, FR slot).
- Lesson frame: scan is white-top/green-front; lessons start with z2 (white bottom).
- `npm test` must pass before committing. Phase plan lives in README.
