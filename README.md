# Cube Coach

An AI Rubik's cube teacher that uses your webcam. Show it your cube, and it builds a 3D copy and (soon) teaches you, move by move, in **your** cube's colours — no more matching your scramble to a YouTube video.

Runs entirely in the browser. No server, no account, no install.

## Status

| Phase | What it does | Status |
|---|---|---|
| 1. Scan | Webcam reads all 6 faces → 3D digital twin | ✅ done |
| 2. Teach | Picks your next F2L pair, animates it, you copy it | next |
| 3. Watch | Waits for your hands to leave the cube, checks you did the right move | planned |
| 4. Track | Follows any moves you make, live | stretch goal |

## How the scan works

1. **Centre stickers = the colour key.** A cube's centres never move, so the 6 scanned centres tell us what red, orange, etc. look like *on your cube, in your room's light*. Nothing is hard-coded.
2. **Colours are compared like human eyes do** — pixels are converted to the Lab colour space and compared with CIEDE2000, the standard "how different do these look" formula.
3. **The cube's own rules fix mistakes.** Instead of guessing each sticker alone, the app asks "which real corner/edge, in which rotation, best explains these stickers?" and solves that as an assignment problem (Hungarian algorithm), plus twist/flip/swap rules every real cube obeys.

In simulated scans with heavy noise, sticker-by-sticker reading got ~53% of cubes fully right; the piece-aware reading gets ~97%. Run `npm test` to see it.

## Run it locally

```bash
npm install
npm run dev     # open the localhost link it prints
npm test        # logic tests (colour reading, validator, solver)
```

Camera access needs `localhost` or `https`.

## Tips for a good scan
- Even light from the front, no strong glare spots.
- Fill the box with one face; hold it straight.
- The instructions assume the standard colour scheme (white opposite yellow, green opposite blue, red opposite orange).

## Built with
- [cubing.js](https://github.com/cubing/cubing.js) — 3D cube player
- [cubejs](https://github.com/ldez/cubejs) — Kociemba two-phase solver
- [Vite](https://vite.dev)
