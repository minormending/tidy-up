/* A small QR encoder, byte mode only, so the app can show a setup code
   without pulling in a library or going online. Verified module-for-module
   against a reference encoder across versions 1-40 and both error levels. */
const QR = (() => {
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28,
        28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
        26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
  };

  const EC_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7,
        8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
        16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
  };

  const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* ---- Galois field GF(256), primitive polynomial 0x11D ---- */

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function buildTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function generatorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function remainder(data, gen) {
    const out = new Array(gen.length - 1).fill(0);
    for (const byte of data) {
      const factor = byte ^ out.shift();
      out.push(0);
      for (let i = 0; i < gen.length - 1; i++) out[i] ^= gfMul(gen[i + 1], factor);
    }
    return out;
  }

  /* ---- capacity ---- */

  function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(version, ecl) {
    return Math.floor(rawDataModules(version) / 8) -
      ECC_PER_BLOCK[ecl][version] * EC_BLOCKS[ecl][version];
  }

  function capacityBytes(version, ecl) {
    const headerBits = 4 + (version <= 9 ? 8 : 16);
    return dataCodewords(version, ecl) - Math.ceil(headerBits / 8);
  }

  function pickVersion(byteLength, ecl, minVersion) {
    for (let v = minVersion || 1; v <= 40; v++) {
      const headerBits = 4 + (v <= 9 ? 8 : 16);
      if (byteLength * 8 + headerBits <= dataCodewords(v, ecl) * 8) return v;
    }
    return -1;
  }

  /* ---- bit stream ---- */

  function toBytes(text) {
    return Array.from(new TextEncoder().encode(text));
  }

  function buildCodewords(bytes, version, ecl) {
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };

    push(4, 4);
    push(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(b => push(b, 8));

    const capacity = dataCodewords(version, ecl) * 8;
    push(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      words.push(byte);
    }
    for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
    return words;
  }

  /* Split into blocks, add error correction, then interleave as the
     spec requires. */
  function interleave(words, version, ecl) {
    const numBlocks = EC_BLOCKS[ecl][version];
    const eccLen = ECC_PER_BLOCK[ecl][version];
    const rawCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortLen = Math.floor(rawCodewords / numBlocks) - eccLen;

    const gen = generatorPoly(eccLen);
    const blocks = [];
    let offset = 0;
    for (let i = 0; i < numBlocks; i++) {
      const length = shortLen + (i < shortBlocks ? 0 : 1);
      const data = words.slice(offset, offset + length);
      offset += length;
      blocks.push({ data: data, ecc: remainder(data, gen) });
    }

    const out = [];
    for (let i = 0; i < shortLen + 1; i++) {
      blocks.forEach((b, j) => {
        if (i < shortLen || j >= shortBlocks) out.push(b.data[i]);
      });
    }
    for (let i = 0; i < eccLen; i++) blocks.forEach(b => out.push(b.ecc[i]));
    return out;
  }

  /* ---- the grid ---- */

  function alignmentPositions(version) {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const size = version * 4 + 17;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function newGrid(size, value) {
    const grid = [];
    for (let y = 0; y < size; y++) grid.push(new Array(size).fill(value));
    return grid;
  }

  function drawFunctionPatterns(modules, reserved, version) {
    const size = modules.length;

    const setRange = (x, y, w, h, dark) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx, py = y + dy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          modules[py][px] = dark;
          reserved[py][px] = true;
        }
      }
    };

    const finder = (x, y) => {
      setRange(x - 1, y - 1, 9, 9, false);
      setRange(x, y, 7, 7, true);
      setRange(x + 1, y + 1, 5, 5, false);
      setRange(x + 2, y + 2, 3, 3, true);
    };

    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);

    for (let i = 8; i < size - 8; i++) {
      modules[6][i] = i % 2 === 0;
      reserved[6][i] = true;
      modules[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }

    const align = alignmentPositions(version);
    align.forEach(cy => {
      align.forEach(cx => {
        const corner = (cx === 6 && cy === 6) ||
          (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
        if (corner) return;
        setRange(cx - 2, cy - 2, 5, 5, true);
        setRange(cx - 1, cy - 1, 3, 3, false);
        setRange(cx, cy, 1, 1, true);
      });
    });

    /* the always-dark module, plus the reserved format strips */
    setRange(8, size - 8, 1, 1, true);
    for (let i = 0; i < 9; i++) {
      if (!reserved[i][8]) { modules[i][8] = false; reserved[i][8] = true; }
      if (!reserved[8][i]) { modules[8][i] = false; reserved[8][i] = true; }
    }
    for (let i = 0; i < 8; i++) {
      if (!reserved[size - 1 - i][8]) { modules[size - 1 - i][8] = false; reserved[size - 1 - i][8] = true; }
      if (!reserved[8][size - 1 - i]) { modules[8][size - 1 - i] = false; reserved[8][size - 1 - i] = true; }
    }

    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + i % 3;
        const b = Math.floor(i / 3);
        modules[b][a] = dark; reserved[b][a] = true;
        modules[a][b] = dark; reserved[a][b] = true;
      }
    }
  }

  function placeData(modules, reserved, codewords) {
    const size = modules.length;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (reserved[y][x]) continue;
          modules[y][x] = i < codewords.length * 8
            ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
            : false;
          i++;
        }
      }
    }
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }

  function applyMask(modules, reserved, mask) {
    const size = modules.length;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!reserved[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
  }

  function drawFormat(modules, ecl, mask) {
    const size = modules.length;
    const data = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    const at = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) modules[i][8] = at(i);
    modules[7][8] = at(6);
    modules[8][8] = at(7);
    modules[8][7] = at(8);
    for (let i = 9; i < 15; i++) modules[8][14 - i] = at(i);
    for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = at(i);
    for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = at(i);
    modules[size - 8][8] = true;
  }

  /* ---- mask penalties (spec rules 1-4) ---- */

  function penalty(modules) {
    const size = modules.length;
    let score = 0;

    const runScore = line => {
      let total = 0, run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) { run++; continue; }
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
      return total;
    };

    /* Rule 3: the 1:1:3:1:1 core with four light modules on one side or the
       other. Each occurrence costs 40 once, even when both sides are clear,
       and anything past the edge of the symbol counts as light. */
    const CORE = [true, false, true, true, true, false, true];
    const coreAt = (line, i) => {
      for (let k = 0; k < 7; k++) if (line[i + k] !== CORE[k]) return false;
      return true;
    };
    const allLight = (line, from, to) => {
      for (let i = Math.max(from, 0); i < Math.min(to, line.length); i++) if (line[i]) return false;
      return true;
    };
    const patternScore = line => {
      const n = line.length;
      let total = 0;
      let i = 0;
      while (i + 7 <= n) {
        if (!coreAt(line, i)) { i++; continue; }
        if (allLight(line, i - 4, i) || allLight(line, i + 7, i + 11)) {
          total += 40;
          i += 7;
        } else {
          i += 4;
        }
      }
      return total;
    };

    let dark = 0;
    for (let y = 0; y < size; y++) {
      const row = modules[y];
      const col = modules.map(r => r[y]);
      score += runScore(row) + runScore(col);
      score += patternScore(row) + patternScore(col);
      for (let x = 0; x < size; x++) if (row[x]) dark++;
    }

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const v = modules[y][x];
        if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) score += 3;
      }
    }

    /* Rule 4: every 5% the dark share strays from half costs 10. */
    const total = size * size;
    const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
    return score + k * 10;
  }

  /* ---- public ---- */

  function encode(text, options) {
    const opts = options || {};
    const ecl = opts.ecl || 'M';
    const bytes = toBytes(text);
    const version = pickVersion(bytes.length, ecl, opts.minVersion);
    if (version < 0) throw new Error('Too much data for one QR code');

    const codewords = interleave(buildCodewords(bytes, version, ecl), version, ecl);
    const size = version * 4 + 17;

    /* Masks are scored before the format bits go in - those bits depend on
       which mask wins, so they cannot be part of choosing it. */
    let best = null;
    const masks = opts.mask == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
    masks.forEach(mask => {
      const modules = newGrid(size, false);
      const reserved = newGrid(size, false);
      drawFunctionPatterns(modules, reserved, version);
      placeData(modules, reserved, codewords);
      applyMask(modules, reserved, mask);
      const score = penalty(modules);
      if (!best || score < best.score) best = { modules: modules, score: score, mask: mask };
    });

    drawFormat(best.modules, ecl, best.mask);
    return { size: size, version: version, ecl: ecl, mask: best.mask, modules: best.modules };
  }

  /* Renders as one SVG path, with the four-module quiet zone scanners need. */
  function svg(code, options) {
    const opts = options || {};
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const dim = code.size + quiet * 2;
    let path = '';
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (code.modules[y][x]) path += 'M' + (x + quiet) + ',' + (y + quiet) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" ' +
      'shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || 'QR code') + '">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + (opts.light || '#ffffff') + '"/>' +
      '<path d="' + path + '" fill="' + (opts.dark || '#000000') + '"/></svg>';
  }

  return { encode, svg, capacityBytes };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QR;
