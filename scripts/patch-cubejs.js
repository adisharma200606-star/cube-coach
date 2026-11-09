// cubejs is old CommonJS code that does `}).call(this)`. In a browser bundle
// `this` is undefined, which crashes it. Pointing it at globalThis fixes that.
// Runs automatically after `npm install` (see "postinstall" in package.json).
import fs from 'node:fs';
for (const f of ['cube.js', 'solve.js']) {
  const p = new URL(`../node_modules/cubejs/lib/${f}`, import.meta.url);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, src.replaceAll('}).call(this);', '}).call(globalThis);'));
}
console.log('patched cubejs for the browser');
