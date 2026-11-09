# Cube Coach

An AI Rubik's cube teacher that uses your webcam. Show it your cube, and it builds a 3D copy and (soon) teaches you, move by move, in **your** cube's colours — no more matching your scramble to a YouTube video.

Runs entirely in the browser. No server, no account, no install.

## What it does

1. **Scan** — scramble your cube and show each side to the webcam. It works out where every piece is.
2. **Pick a method** — Beginner (layer by layer) or CFOP. More methods can plug in later.
3. **Learn step by step** — for each stage it explains the goal, animates the exact moves on a 3D copy of *your* cube, and you copy them. Tap any move to see what it means.
4. **Check with the camera** — after a step, hold your cube up and it compares the front side to what it should be.
5. **Timer** — random-state scrambles, best time, average of 5. It can stop automatically when the camera sees a solved side.

Next up: live move tracking (follow your turns as you make them, no button presses).

## How the teaching works

A method is a series of stages. For each stage the app has the same small set of algorithms a human would learn (e.g. `R U R' U'` for beginner corners, 41 F2L cases, OLL, PLL). It tries them on your exact cube — with "turn the top" and "rotate the cube" setups — and picks the shortest one that makes progress without breaking anything already solved.

- The white cross is solved exactly (shortest possible) with a distance table.
- F2L covers all 149 possible pair positions: hand-written standard algorithms plus computer-found ones for the gaps (`node scripts/gen-f2l.js`).
- Tests solve hundreds of random scrambles with both methods (`npm test`). CFOP averages ~60 turns, Beginner ~150.

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
- [cubejs](https://github.com/ldez/cubejs) — Kociemba two-phase solver (used to rebuild your scramble in 3D and make timer scrambles)
- [Vite](https://vite.dev)
