// Pure JS QR Code generator (Byte mode, EC Level L, Versions 1..10).
(function (root) {
  // GF(256) with primitive polynomial 0x11d (285)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 1; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version 1..10 specs for EC Level L:
  // [totalCodewords, ecPerBlock, [[count, dataPerBlock], ...], alignmentCenters]
  const VERSION_SPECS = [
    null,
    [26, 7, [[1, 19]], []],
    [44, 10, [[1, 34]], [6, 18]],
    [70, 15, [[1, 55]], [6, 22]],
    [100, 20, [[1, 80]], [6, 26]],
    [134, 26, [[1, 108]], [6, 30]],
    [172, 18, [[2, 68]], [6, 34]],
    [196, 20, [[2, 78]], [6, 22, 38]],
    [242, 24, [[2, 97]], [6, 24, 42]],
    [292, 30, [[2, 116]], [6, 26, 46]],
    [346, 18, [[2, 68], [2, 69]], [6, 28, 50]],
  ];

  function toUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const c2 = str.charCodeAt(++i);
        const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function chooseVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const spec = VERSION_SPECS[v];
      let dataCapBytes = 0;
      for (const [cnt, d] of spec[2]) dataCapBytes += cnt * d;
      const lenBits = v >= 10 ? 16 : 8;
      const neededBits = 4 + lenBits + byteLen * 8;
      if (neededBits <= dataCapBytes * 8) return v;
    }
    throw new Error('Input too long for QR Version 1..10 (Level L)');
  }

  function buildCodewords(bytes, version) {
    const spec = VERSION_SPECS[version];
    const ecPerBlock = spec[1];
    const groups = spec[2];
    let totalDataBytes = 0;
    for (const [cnt, d] of groups) totalDataBytes += cnt * d;

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    // Mode indicator: Byte = 0100
    pushBits(0b0100, 4);
    // Character count indicator
    pushBits(bytes.length, version >= 10 ? 16 : 8);
    for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);

    // Terminator (up to 4 zeros)
    const maxBits = totalDataBytes * 8;
    const term = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCodewords = new Uint8Array(totalDataBytes);
    for (let i = 0; i < bits.length / 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataCodewords[i] = b;
    }
    const padBytes = [0xec, 0x11];
    let p = 0;
    for (let i = bits.length / 8; i < totalDataBytes; i++) {
      dataCodewords[i] = padBytes[p++ & 1];
    }

    // Split into blocks and compute RS ECC
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (const [cnt, dLen] of groups) {
      for (let i = 0; i < cnt; i++) {
        const blk = dataCodewords.slice(offset, offset + dLen);
        offset += dLen;
        dataBlocks.push(blk);
        ecBlocks.push(rsEncode(blk, ecPerBlock));
      }
    }

    // Interleave data then ECC
    const out = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxDataLen; i++) {
      for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const b of ecBlocks) out.push(b[i]);
    }
    return out;
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const func = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFunc = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mod[r][c] = val;
        func[r][c] = true;
      }
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, inOuter && (onBorder || inInner));
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    const centers = VERSION_SPECS[version][3];
    for (const r0 of centers) {
      for (const c0 of centers) {
        if (func[r0][c0]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const onEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const center = dr === 0 && dc === 0;
            setFunc(r0 + dr, c0 + dc, onEdge || center);
          }
        }
      }
    }

    // Dark module + reserve format info
    setFunc(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        if (!func[8][i]) func[8][i] = true;
        if (!func[i][8]) func[i][8] = true;
      }
    }
    for (let i = 0; i < 8; i++) {
      func[8][size - 1 - i] = true;
      if (i < 7) func[size - 1 - i][8] = true;
    }

    // Version info for v >= 7
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >> 11) & 1) * 0x1f25);
      const vBits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    return { size, mod, func };
  }

  function placeData(size, mod, func, codewords) {
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = upward ? size - 1 - vert : vert;
        for (let lr = 0; lr < 2; lr++) {
          const c = right - lr;
          if (!func[r][c]) {
            let bit = false;
            if (bitIdx < totalBits) {
              bit = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
              bitIdx++;
            }
            mod[r][c] = bit;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMaskAndFormat(size, mod, func, maskId) {
    const out = mod.map((row) => row.slice());
    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      (r, _c) => r % 2 === 0,
      (_r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ][maskId];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!func[r][c] && maskFn(r, c)) {
          out[r][c] = !out[r][c];
        }
      }
    }

    // Format info: EC Level L = 01, mask = 0..7
    const data = (0b01 << 3) | maskId;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
    const fmt = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i < 15; i++) {
      const bit = ((fmt >> i) & 1) === 1;
      // Vertical
      if (i < 6) out[i][8] = bit;
      else if (i < 8) out[i + 1][8] = bit;
      else out[size - 15 + i][8] = bit;
      // Horizontal
      if (i < 8) out[8][size - 1 - i] = bit;
      else if (i < 9) out[8][15 - i] = bit;
      else out[8][14 - i] = bit;
    }

    return out;
  }

  function penaltyScore(size, m) {
    let score = 0;
    // Rule 1: 5+ consecutive same-color modules in row/col
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }

    // Rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) score += 3;
      }
    }

    // Rule 3: 1:1:3:1:1 finder-like patterns
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - 11; c++) {
        let m1 = true, m2 = true, c1 = true, c2 = true;
        for (let k = 0; k < 11; k++) {
          if (m[r][c + k] !== pat1[k]) m1 = false;
          if (m[r][c + k] !== pat2[k]) m2 = false;
          if (m[c + k][r] !== pat1[k]) c1 = false;
          if (m[c + k][r] !== pat2[k]) c2 = false;
        }
        if (m1 || m2) score += 40;
        if (c1 || c2) score += 40;
      }
    }

    // Rule 4: dark module balance
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    const pct = (dark * 100) / (size * size);
    const prev5 = Math.floor(Math.abs(pct - 50) / 5);
    score += prev5 * 10;
    return score;
  }

  function encode(text) {
    const str = String(text == null ? '' : text);
    const bytes = toUtf8Bytes(str);
    const version = chooseVersion(bytes.length);
    const codewords = buildCodewords(bytes, version);
    const { size, mod, func } = createMatrix(version);
    placeData(size, mod, func, codewords);

    let bestModules = null;
    let bestScore = Infinity;
    for (let maskId = 0; maskId < 8; maskId++) {
      const masked = applyMaskAndFormat(size, mod, func, maskId);
      const s = penaltyScore(size, masked);
      if (s < bestScore) {
        bestScore = s;
        bestModules = masked;
      }
    }
    return { size, modules: bestModules };
  }

  function toSVG(text, pixelSize = 4) {
    const { size, modules } = encode(text);
    const quiet = 4;
    const total = (size + quiet * 2) * pixelSize;
    const parts = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) {
          const x = (c + quiet) * pixelSize;
          const y = (r + quiet) * pixelSize;
          parts.push(`M${x},${y}h${pixelSize}v${pixelSize}h-${pixelSize}z`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${parts.join('')}" fill="#000000"/></svg>`;
  }

  root.QR = { encode, toSVG };
})(typeof window !== 'undefined' ? window : globalThis);
