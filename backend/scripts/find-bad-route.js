'use strict';
/* Finds the route file that is not a valid Express router (cause of
 * "Router.use() requires a middleware function but got a Module/Object").
 * Run from the backend folder:  node scripts/find-bad-route.js */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'routes');
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const full = path.join(dir, f);
  const src = fs.readFileSync(full, 'utf8');
  const esm = /^\s*(export\s+(default|const|function|\{)|import\s.+from\s)/m.test(src);
  let type = 'ok';
  try {
    const m = require(full);
    if (typeof m !== 'function') type = `exports a ${Object.prototype.toString.call(m)} (expected an Express router function)`;
  } catch (e) { type = `fails to load: ${e.message.split('\n')[0]}`; }
  if (esm) type = 'uses ES-module syntax (import/export) but the backend is CommonJS';
  if (type !== 'ok') { bad++; console.log(`BAD  src/routes/${f}: ${type}`); }
}
// Any ES-module syntax anywhere in src/ is the usual cause: on Node 22.12+ a .js file with import/export is
// loaded as an ES module, so require() returns a "Module" instead of the router / middleware function.
(function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) scan(full);
    else if (e.name.endsWith('.js') && /^\s*(export\s+(default|const|let|function|class|async|\{)|import\s+[\w{*].*\sfrom\s|import\s+['"])/m.test(fs.readFileSync(full, 'utf8'))) {
      bad++; console.log(`BAD  ${path.relative(path.join(__dirname, '..'), full)}: contains import/export (ES module syntax) in a CommonJS backend`);
    }
  }
})(path.join(__dirname, '..', 'src'));
console.log(bad ? `\n${bad} problem file(s). Replace each with the version from the backend ZIP.` : 'All route files export a valid router.');
