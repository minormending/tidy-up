/* Checks that every class the markup and scripts actually apply has a rule
   in the stylesheet. Editing this file by slicing between markers has twice
   silently deleted a whole section; this catches that.

   Every stylesheet counts, including the vendored ones in suite/. Those are
   not checked for drift here any more -- kidsuite's own tools/check does that
   for every consumer at once, rather than this app hardcoding a list of its
   siblings and app number four being quietly left out of it.

   Run with:  node test/css-test.js                                        */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = [
  path.join(root, 'css', 'app.css'),
  path.join(root, 'suite', 'grownup.css'),
  path.join(root, 'suite', 'landing.css'),
].map(f => fs.readFileSync(f, 'utf8')).join('\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = fs.readdirSync(path.join(root, 'js'))
  .filter(f => f.endsWith('.js'))
  .map(f => ({ file: 'js/' + f, text: fs.readFileSync(path.join(root, 'js', f), 'utf8') }));

/* Classes that carry no styling on purpose: JS hooks and state flags read
   only by script, or styled solely via a parent selector. */
const UNSTYLED = new Set(['is-recording', 'sr-only']);

const used = new Map();
const note = (cls, where) => {
  cls.split(/\s+/).filter(Boolean).forEach(c => {
    if (!/^[a-z][a-z0-9-]*$/.test(c)) return;
    if (!used.has(c)) used.set(c, where);
  });
};

for (const m of html.matchAll(/class="([^"]+)"/g)) note(m[1], 'index.html');

for (const { file, text } of scripts) {
  for (const m of text.matchAll(/\bel\(\s*'[^']*'\s*,\s*'([^']+)'/g)) note(m[1], file);
  for (const m of text.matchAll(/\.className\s*=\s*'([^']+)'/g)) note(m[1], file);
  for (const m of text.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'\)/g)) note(m[1], file);
  for (const m of text.matchAll(/class="([^"{+]+)"/g)) note(m[1], file);
}

const missing = [];
for (const [cls, where] of used) {
  if (UNSTYLED.has(cls)) continue;
  const rule = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![a-z0-9-])');
  if (!rule.test(css)) missing.push(cls + '  (used in ' + where + ')');
}

console.log('classes applied: ' + used.size + ', stylesheet bytes: ' + css.length);

if (missing.length) {
  console.error('\n' + missing.length + ' class(es) have no rule in either stylesheet:');
  missing.forEach(m => console.error('  ' + m));
  process.exit(1);
}
console.log('every applied class has a rule.');
