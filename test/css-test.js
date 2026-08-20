/* Checks that every class the markup and scripts actually apply has a rule
   in the stylesheet. Editing this file by slicing between markers has twice
   silently deleted a whole section; this catches that.

   Both stylesheets count: the grown-up controls live in css/grownup.css,
   which is shared byte-for-byte with Letter Sounds and Behaviour Garden.

   Run with:  node test/css-test.js                                        */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = ['app.css', 'grownup.css']
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

/* css/grownup.css is the suite's shared grown-up kit and is meant to be the
   same file in all three apps. Editing one copy and forgetting the others is
   the obvious way for them to drift back apart, so say so here. Siblings that
   are not checked out are skipped rather than failed - this is a nudge, not a
   dependency. */
const siblings = [
  ['learn-letters', '../learn-letters/css/grownup.css'],
  ['behaviour-garden', '../behaviour-garden/grownup.css']
];
const mine = fs.readFileSync(path.join(root, 'css', 'grownup.css'), 'utf8');
const drifted = [];
for (const [name, rel] of siblings) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  if (fs.readFileSync(file, 'utf8') !== mine) drifted.push(name + '  (' + rel + ')');
}
if (drifted.length) {
  console.error('\ncss/grownup.css differs from:');
  drifted.forEach(d => console.error('  ' + d));
  console.error('Copy whichever one is right over the others.');
  process.exit(1);
}
console.log('grownup.css matches every sibling app that is checked out.');
