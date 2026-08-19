/* Checks the QR encoder against matrices produced by an independent
   reference encoder (segno). Every version 1-40, both error levels, all
   eight masks: 640 symbols, compared by hash.

   Run with:  node test/qr-test.js                                        */
const crypto = require('crypto');
const path = require('path');
const QR = require(path.join(__dirname, '..', 'js', 'qr.js'));
const golden = require(path.join(__dirname, 'qr-golden.json'));

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~:/?#[]@!$&()*+,;=%';

function payload(n, seed) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[(i * 7 + seed * 13 + 5) % ALPHA.length];
  return s;
}

function hash(code) {
  const flat = code.modules.map(r => r.map(b => (b ? '1' : '0')).join('')).join('');
  return crypto.createHash('sha256').update(flat).digest('hex').slice(0, 16);
}

let checked = 0;
const failures = [];

for (const ecl of ['L', 'M']) {
  for (let v = 1; v <= 40; v++) {
    const expected = golden.cases[ecl + v];
    const text = payload(QR.capacityBytes(v, ecl), v);
    for (let mask = 0; mask < 8; mask++) {
      const code = QR.encode(text, { ecl: ecl, mask: mask, minVersion: v });
      checked++;
      if (code.version !== v) failures.push(ecl + v + ' mask ' + mask + ': picked version ' + code.version);
      else if (hash(code) !== expected[mask]) failures.push(ecl + v + ' mask ' + mask + ': matrix differs');
    }
  }
}

/* An auto-masked symbol must still be one of the eight valid symbols. */
for (const ecl of ['L', 'M']) {
  for (let v = 1; v <= 40; v++) {
    const text = payload(QR.capacityBytes(v, ecl), v);
    const code = QR.encode(text, { ecl: ecl, minVersion: v });
    checked++;
    if (hash(code) !== golden.cases[ecl + v][code.mask]) {
      failures.push(ecl + v + ' auto: chose mask ' + code.mask + ' but matrix does not match it');
    }
  }
}

if (failures.length) {
  console.error(failures.length + ' of ' + checked + ' failed:');
  failures.slice(0, 20).forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log(checked + ' QR symbols match the reference encoder.');
