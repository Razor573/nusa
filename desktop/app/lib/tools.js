// Pure domain utilities: Calculator, Color Info, Unit Converter, Timezone Formatter.
(function (root) {
  // --- Safe Recursive-Descent Calculator ---
  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const len = expr.length;
    while (i < len) {
      const ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }

      // Hex 0x... or Binary 0b...
      if (ch === '0' && i + 1 < len && (expr[i + 1] === 'x' || expr[i + 1] === 'X')) {
        let j = i + 2;
        while (j < len && /[0-9a-fA-F]/.test(expr[j])) j++;
        if (j === i + 2) throw new Error('Invalid hex literal');
        tokens.push({ type: 'num', value: parseInt(expr.slice(i, j), 16) });
        i = j;
        continue;
      }
      if (ch === '0' && i + 1 < len && (expr[i + 1] === 'b' || expr[i + 1] === 'B')) {
        let j = i + 2;
        while (j < len && /[01]/.test(expr[j])) j++;
        if (j === i + 2) throw new Error('Invalid binary literal');
        tokens.push({ type: 'num', value: parseInt(expr.slice(i + 2, j), 2) });
        i = j;
        continue;
      }

      // Decimal / scientific number
      if (/[0-9.]/.test(ch)) {
        let j = i;
        let hasDot = false;
        while (j < len && (/[0-9]/.test(expr[j]) || (expr[j] === '.' && !hasDot))) {
          if (expr[j] === '.') hasDot = true;
          j++;
        }
        if (j < len && (expr[j] === 'e' || expr[j] === 'E')) {
          let k = j + 1;
          if (k < len && (expr[k] === '+' || expr[k] === '-')) k++;
          let digits = 0;
          while (k < len && /[0-9]/.test(expr[k])) { k++; digits++; }
          if (digits > 0) j = k;
        }
        const num = Number(expr.slice(i, j));
        if (!Number.isFinite(num)) throw new Error('Invalid number');
        tokens.push({ type: 'num', value: num });
        i = j;
        continue;
      }

      // Identifiers (functions / constants)
      if (/[a-zA-Z_]/.test(ch)) {
        let j = i + 1;
        while (j < len && /[a-zA-Z0-9_]/.test(expr[j])) j++;
        tokens.push({ type: 'id', value: expr.slice(i, j).toLowerCase() });
        i = j;
        continue;
      }

      // Operators and parens
      if ('+-*/^()%!'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      throw new Error(`Unexpected character: ${ch}`);
    }
    return tokens;
  }

  function factorial(n) {
    if (!Number.isInteger(n) || n < 0) throw new Error('Factorial requires non-negative integer');
    if (n > 170) throw new Error('Factorial overflow');
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return String(n);
    if (Object.is(n, -0)) n = 0;
    const rounded = Number(n.toPrecision(12));
    return String(rounded);
  }

  function calc(expr) {
    if (typeof expr !== 'string' || !expr.trim()) {
      return { ok: false, error: 'Empty expression' };
    }
    try {
      const tokens = tokenize(expr);
      if (tokens.length === 0) return { ok: false, error: 'Empty expression' };
      let pos = 0;

      const peek = () => tokens[pos] || null;
      const next = () => tokens[pos++] || null;

      function parseExpr() {
        let left = parseTerm().value;
        while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
          const op = next().value;
          const right = parseTerm();
          const rhs = right.isPercent ? left * right.value : right.value;
          left = op === '+' ? left + rhs : left - rhs;
        }
        return left;
      }

      function parseTerm() {
        let leftObj = parsePower();
        let left = leftObj.value;
        let isPercent = leftObj.isPercent;
        while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
          const op = next().value;
          const right = parsePower();
          left = op === '*' ? left * right.value : left / right.value;
          isPercent = false;
        }
        return { value: left, isPercent };
      }

      function parsePower() {
        const base = parseUnary();
        if (peek() && peek().type === 'op' && peek().value === '^') {
          next();
          const exp = parsePower();
          return { value: Math.pow(base.value, exp.value), isPercent: false };
        }
        return base;
      }

      function parseUnary() {
        if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
          const op = next().value;
          const inner = parseUnary();
          return { value: op === '-' ? -inner.value : inner.value, isPercent: inner.isPercent };
        }
        return parsePostfix();
      }

      function parsePostfix() {
        let val = parsePrimary();
        let isPercent = false;
        while (peek() && peek().type === 'op' && (peek().value === '!' || peek().value === '%')) {
          const op = next().value;
          if (op === '!') {
            val = factorial(val);
            isPercent = false;
          } else {
            val = val / 100;
            isPercent = true;
          }
        }
        return { value: val, isPercent };
      }

      function parsePrimary() {
        const tok = peek();
        if (!tok) throw new Error('Unexpected end of expression');
        if (tok.type === 'num') {
          next();
          return tok.value;
        }
        if (tok.type === 'op' && tok.value === '(') {
          next();
          const val = parseExpr();
          const close = next();
          if (!close || close.type !== 'op' || close.value !== ')') {
            throw new Error('Missing closing parenthesis');
          }
          return val;
        }
        if (tok.type === 'id') {
          next();
          if (tok.value === 'pi') return Math.PI;
          if (tok.value === 'e') return Math.E;
          const open = next();
          if (!open || open.type !== 'op' || open.value !== '(') {
            throw new Error(`Unknown identifier or missing '(' for ${tok.value}`);
          }
          const arg = parseExpr();
          const close = next();
          if (!close || close.type !== 'op' || close.value !== ')') {
            throw new Error('Missing closing parenthesis');
          }
          const rad = (arg * Math.PI) / 180;
          switch (tok.value) {
            case 'sqrt':
              if (arg < 0) throw new Error('Square root of negative number');
              return Math.sqrt(arg);
            case 'abs': return Math.abs(arg);
            case 'sin': { const v = Math.sin(rad); return Math.abs(v) < 1e-12 ? 0 : v; }
            case 'cos': { const v = Math.cos(rad); return Math.abs(v) < 1e-12 ? 0 : v; }
            case 'tan': {
              const c = Math.cos(rad);
              if (Math.abs(c) < 1e-12) throw new Error('Undefined tangent');
              const v = Math.tan(rad);
              return Math.abs(v) < 1e-12 ? 0 : v;
            }
            case 'log':
              if (arg <= 0) throw new Error('Logarithm of non-positive number');
              return Math.log10(arg);
            case 'ln':
              if (arg <= 0) throw new Error('Logarithm of non-positive number');
              return Math.log(arg);
            default:
              throw new Error(`Unknown function: ${tok.value}`);
          }
        }
        throw new Error(`Unexpected token: ${tok.value}`);
      }

      const value = parseExpr();
      if (pos < tokens.length) {
        throw new Error(`Unexpected token: ${tokens[pos].value}`);
      }
      if (!Number.isFinite(value)) {
        return { ok: false, error: 'Result is not finite' };
      }
      return { ok: true, value, formatted: formatNumber(value) };
    } catch (err) {
      return { ok: false, error: err.message || 'Invalid expression' };
    }
  }

  // --- Color Info & WCAG 2.1 Contrast ---
  function colorInfo(hexOrRgb) {
    if (typeof hexOrRgb !== 'string') return null;
    const s = hexOrRgb.trim();
    let r, g, b;

    const hex6 = s.match(/^#([0-9a-fA-F]{6})$/);
    const hex3 = s.match(/^#([0-9a-fA-F]{3})$/);
    const rgbM = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);

    if (hex6) {
      r = parseInt(hex6[1].slice(0, 2), 16);
      g = parseInt(hex6[1].slice(2, 4), 16);
      b = parseInt(hex6[1].slice(4, 6), 16);
    } else if (hex3) {
      r = parseInt(hex3[1][0] + hex3[1][0], 16);
      g = parseInt(hex3[1][1] + hex3[1][1], 16);
      b = parseInt(hex3[1][2] + hex3[1][2], 16);
    } else if (rgbM) {
      r = Number(rgbM[1]);
      g = Number(rgbM[2]);
      b = Number(rgbM[3]);
      if (r > 255 || g > 255 || b > 255) return null;
    } else {
      return null;
    }

    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    const rgb = `rgb(${r}, ${g}, ${b})`;

    // RGB -> HSL
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    const l = (max + min) / 2;
    let sat = 0;
    if (d !== 0) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h /= 6;
    }
    const hDeg = Math.round(h * 360);
    const sPct = Math.round(sat * 100);
    const lPct = Math.round(l * 100);
    const hsl = `hsl(${hDeg}, ${sPct}%, ${lPct}%)`;

    // WCAG 2.1 Relative Luminance
    const lin = (c8) => {
      const c = c8 / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const contrastWhite = Math.round((1.05 / (lum + 0.05)) * 100) / 100;
    const contrastBlack = Math.round(((lum + 0.05) / 0.05) * 100) / 100;

    return {
      hex,
      rgb,
      hsl,
      r,
      g,
      b,
      h: hDeg,
      s: sPct,
      l: lPct,
      contrastWhite,
      contrastBlack,
    };
  }

  // --- Unit Converter ---
  const UNIT_CATEGORIES = Object.freeze({
    length: Object.freeze({
      mm: 0.001,
      cm: 0.01,
      m: 1,
      km: 1000,
      in: 0.0254,
      ft: 0.3048,
      yd: 0.9144,
      mi: 1609.344,
    }),
    weight: Object.freeze({
      mg: 0.001,
      g: 1,
      kg: 1000,
      t: 1000000,
      oz: 28.349523125,
      lb: 453.59237,
    }),
    temperature: Object.freeze(['C', 'F', 'K']),
    area: Object.freeze({
      mm2: 1e-6,
      cm2: 1e-4,
      m2: 1,
      ha: 10000,
      km2: 1e6,
      in2: 0.00064516,
      ft2: 0.09290304,
      yd2: 0.83612736,
      acre: 4046.8564224,
      mi2: 2589988.110336,
    }),
    volume: Object.freeze({
      ml: 0.001,
      L: 1,
      m3: 1000,
      tsp: 0.00492892159375,
      tbsp: 0.01478676478125,
      floz: 0.0295735295625,
      cup: 0.2365882365,
      pt: 0.473176473,
      qt: 0.946352946,
      gal: 3.785411784,
    }),
    speed: Object.freeze({
      'm/s': 1,
      'km/h': 1 / 3.6,
      mph: 0.44704,
      knot: 0.514444,
      'ft/s': 0.3048,
    }),
    data: Object.freeze({
      b: 0.125,
      B: 1,
      KB: 1000,
      MB: 1e6,
      GB: 1e9,
      TB: 1e12,
      KiB: 1024,
      MiB: 1048576,
      GiB: 1073741824,
      TiB: 1099511627776,
    }),
  });

  function convertUnit(value, fromUnit, toUnit, category) {
    const val = Number(value);
    if (!Number.isFinite(val)) return NaN;
    if (category === 'temperature') {
      let celsius;
      if (fromUnit === 'C') celsius = val;
      else if (fromUnit === 'F') celsius = (val - 32) * (5 / 9);
      else if (fromUnit === 'K') celsius = val - 273.15;
      else return NaN;

      if (toUnit === 'C') return celsius;
      if (toUnit === 'F') return celsius * (9 / 5) + 32;
      if (toUnit === 'K') return celsius + 273.15;
      return NaN;
    }

    const table = UNIT_CATEGORIES[category];
    if (!table || !(fromUnit in table) || !(toUnit in table)) return NaN;
    return (val * table[fromUnit]) / table[toUnit];
  }

  // --- Timezones ---
  const TIMEZONE_CITIES = Object.freeze([
    { name: 'Jakarta', tz: 'Asia/Jakarta' },
    { name: 'Singapore', tz: 'Asia/Singapore' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'Sydney', tz: 'Australia/Sydney' },
    { name: 'Dubai', tz: 'Asia/Dubai' },
    { name: 'Riyadh', tz: 'Asia/Riyadh' },
    { name: 'Kolkata', tz: 'Asia/Kolkata' },
    { name: 'Dhaka', tz: 'Asia/Dhaka' },
    { name: 'London', tz: 'Europe/London' },
    { name: 'Paris', tz: 'Europe/Paris' },
    { name: 'New York', tz: 'America/New_York' },
    { name: 'Los Angeles', tz: 'America/Los_Angeles' },
  ]);

  function formatInZone(date, tz, hourOffset = 0) {
    const shifted = new Date(+new Date(date) + (Number(hourOffset) || 0) * 3600000);
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(shifted);
    let hh = '00';
    let mm = '00';
    for (const p of timeParts) {
      if (p.type === 'hour') hh = p.value === '24' ? '00' : p.value;
      else if (p.type === 'minute') mm = p.value;
    }

    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).formatToParts(shifted);
    let weekday = '', day = '', month = '';
    for (const p of dateParts) {
      if (p.type === 'weekday') weekday = p.value;
      else if (p.type === 'day') day = p.value;
      else if (p.type === 'month') month = p.value;
    }
    return {
      time: `${hh}:${mm}`,
      date: `${weekday} ${day} ${month}`,
    };
  }

  root.Tools = {
    calc,
    colorInfo,
    UNIT_CATEGORIES,
    convertUnit,
    TIMEZONE_CITIES,
    formatInZone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
