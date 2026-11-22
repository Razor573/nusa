// Lightweight RFC 5545 iCalendar (.ics) VEVENT parser.
(function (root) {
  function unescapeICS(s) {
    return String(s || '')
      .replace(/\\n|\\N/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function parseICSDate(val, params = []) {
    const v = String(val || '').trim();
    const isDateParam = params.some((p) => /^VALUE=DATE$/i.test(p));
    const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (dateOnly || isDateParam) {
      const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
      if (!m) return null;
      const ms = new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).getTime();
      return { ms, allDay: true };
    }
    const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(v);
    if (!dt) return null;
    const [, Y, M, D, h, m, s, z] = dt;
    const ms = z
      ? Date.UTC(+Y, +M - 1, +D, +h, +m, +s)
      : new Date(+Y, +M - 1, +D, +h, +m, +s).getTime();
    return { ms, allDay: false };
  }

  function parseDuration(val) {
    const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(val || '').trim());
    if (!m) return null;
    const weeks = +(m[1] || 0);
    const days = +(m[2] || 0);
    const hours = +(m[3] || 0);
    const mins = +(m[4] || 0);
    const secs = +(m[5] || 0);
    return ((((weeks * 7 + days) * 24 + hours) * 60 + mins) * 60 + secs) * 1000;
  }

  function parseICS(icsText, fromMs, toMs) {
    if (!icsText || typeof icsText !== 'string') return [];
    const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    const events = [];
    let inEvent = false;
    let depth = 0;
    let cur = null;

    for (const line of lines) {
      if (!line) continue;
      const upper = line.trim().toUpperCase();
      if (upper === 'BEGIN:VEVENT') {
        inEvent = true;
        depth = 0;
        cur = { title: '', start: null, end: null, durationMs: null, allDay: false };
        continue;
      }
      if (upper === 'END:VEVENT') {
        if (inEvent && cur && cur.start != null) {
          const endMs = cur.end != null
            ? cur.end
            : cur.durationMs != null
              ? cur.start + cur.durationMs
              : cur.allDay
                ? cur.start + 86400000
                : cur.start;
          const minutes = Math.max(0, Math.round((endMs - cur.start) / 60000));
          const hasFrom = typeof fromMs === 'number' && Number.isFinite(fromMs);
          const hasTo = typeof toMs === 'number' && Number.isFinite(toMs);
          const afterFrom = !hasFrom || (endMs > cur.start ? endMs > fromMs : cur.start >= fromMs);
          const beforeTo = !hasTo || cur.start < toMs;
          if (afterFrom && beforeTo) {
            events.push({
              title: cur.title || '(No title)',
              start: cur.start,
              minutes,
              allDay: cur.allDay,
              color: '#4285f4',
            });
          }
        }
        inEvent = false;
        cur = null;
        continue;
      }
      if (!inEvent) continue;

      if (upper.startsWith('BEGIN:')) { depth++; continue; }
      if (upper.startsWith('END:')) { if (depth > 0) depth--; continue; }
      if (depth > 0) continue; // Ignore nested VALARM, etc.

      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const propPart = line.slice(0, colon);
      const valPart = line.slice(colon + 1);
      const segments = propPart.split(';');
      const prop = segments[0].toUpperCase();
      const params = segments.slice(1);

      if (prop === 'SUMMARY') {
        cur.title = unescapeICS(valPart).trim();
      } else if (prop === 'DTSTART') {
        const parsed = parseICSDate(valPart, params);
        if (parsed) {
          cur.start = parsed.ms;
          cur.allDay = parsed.allDay;
        }
      } else if (prop === 'DTEND') {
        const parsed = parseICSDate(valPart, params);
        if (parsed) cur.end = parsed.ms;
      } else if (prop === 'DURATION') {
        const d = parseDuration(valPart);
        if (d != null) cur.durationMs = d;
      }
    }

    events.sort((a, b) => a.start - b.start);
    return events;
  }

  root.ICal = { parseICS };
})(typeof window !== 'undefined' ? window : globalThis);
