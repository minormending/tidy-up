/* Checks that every class the markup and scripts actually apply has a rule
   in the stylesheet. Editing this file by slicing between markers has twice
   silently deleted a whole section; this catches that.

   Every stylesheet counts, including the two shared byte-for-byte with
   Letter Sounds and Behaviour Garden: css/grownup.css for the grown-up
   controls and css/landing.css for the front door.

   Run with:  node test/css-test.js                                        */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SHARED = ['grownup.css', 'landing.css'];
const css = ['app.css', ...SHARED]
  .map(f => fs.readFileSync(path.join(root, 'css', f), 'utf8'))
  .join('\n');
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

/* The shared stylesheets are meant to be the same file in all three apps.
   Editing one copy and forgetting the other two is the obvious way for the
   suite to drift back apart, so say so here. A sibling that is not checked
   out is skipped rather than failed - this is a nudge, not a dependency. */
const siblings = [
  ['learn-letters', f => '../learn-letters/css/' + f],
  ['behaviour-garden', f => '../behaviour-garden/' + f]
];
const drifted = [];
for (const shared of SHARED) {
  const mine = fs.readFileSync(path.join(root, 'css', shared), 'utf8');
  for (const [name, where] of siblings) {
    const rel = where(shared);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    if (fs.readFileSync(file, 'utf8') !== mine) drifted.push(shared + '  differs from  ' + rel);
  }
}
if (drifted.length) {
  console.error('\nthe shared stylesheets have drifted apart:');
  drifted.forEach(d => console.error('  ' + d));
  console.error('Copy whichever copy is right over the others.');
  process.exit(1);
}
console.log('shared stylesheets match every sibling app that is checked out.');
