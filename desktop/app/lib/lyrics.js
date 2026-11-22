// LRC parser and LRCLIB client for synced / plain lyrics.
(function (root) {
  const memCache = new Map();
  const pending = new Map();
  const LS_PREFIX = 'nusa:lyrics:';

  function parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const lines = [];
    const tagRe = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const raw of lrcText.split(/\r?\n/)) {
      const times = [];
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(raw)) !== null) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
        times.push(min * 60 + sec + ms / 1000);
      }
      if (!times.length) continue;
      const text = raw.replace(tagRe, '').trim();
      if (!text) continue;
      for (const timeSec of times) {
        lines.push({ timeSec, text });
      }
    }
    lines.sort((a, b) => a.timeSec - b.timeSec);
    return lines;
  }

  function activeLineIndex(lines, positionSec) {
    if (!Array.isArray(lines) || !lines.length) return -1;
    if (typeof positionSec !== 'number' || !Number.isFinite(positionSec)) return -1;
    const target = positionSec + 0.15;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeSec <= target) idx = i;
      else break;
    }
    return idx;
  }

  function cacheKey(artist, title) {
    const a = String(artist || '').trim().toLowerCase();
    const t = String(title || '').trim().toLowerCase();
    return `${a}|${t}`;
  }

  function readLS(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function writeLS(key, val) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
    } catch {}
  }

  function formatRecord(rec) {
    if (rec && typeof rec.syncedLyrics === 'string' && rec.syncedLyrics.trim()) {
      const lines = parseLRC(rec.syncedLyrics);
      if (lines.length) return { synced: true, lines };
    }
    if (rec && typeof rec.plainLyrics === 'string' && rec.plainLyrics.trim()) {
      return { synced: false, plain: rec.plainLyrics, lines: [] };
    }
    return null;
  }

  async function fetchJson(url) {
    const opts = { headers: { Accept: 'application/json' } };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      opts.signal = AbortSignal.timeout(8000);
    }
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchLyrics({ title, artist, album, duration } = {}) {
    const t = String(title || '').trim();
    const a = String(artist || '').trim();
    if (!t) return { synced: false, lines: [] };

    const key = cacheKey(a, t);
    if (memCache.has(key)) return memCache.get(key);
    const cached = readLS(key);
    if (cached) {
      memCache.set(key, cached);
      return cached;
    }
    if (pending.has(key)) return pending.get(key);

    const job = (async () => {
      let result = null;
      try {
        const params = new URLSearchParams({ track_name: t });
        if (a) params.set('artist_name', a);
        if (album && String(album).trim()) params.set('album_name', String(album).trim());
        if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
          params.set('duration', String(Math.round(duration)));
        }
        const direct = await fetchJson(`https://lrclib.net/api/get?${params.toString()}`);
        result = formatRecord(direct);

        if (!result) {
          const q = `${a} ${t}`.trim();
          const list = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
          if (Array.isArray(list) && list.length) {
            const syncedHit = list.find((r) => r && r.syncedLyrics);
            const plainHit = list.find((r) => r && r.plainLyrics);
            result = formatRecord(syncedHit || plainHit);
          }
        }
      } catch {
        result = null;
      }

      const finalResult = result || { synced: false, lines: [] };
      memCache.set(key, finalResult);
      if (result) writeLS(key, finalResult);
      pending.delete(key);
      return finalResult;
    })();

    pending.set(key, job);
    return job;
  }

  root.Lyrics = { parseLRC, activeLineIndex, fetchLyrics };
})(typeof window !== 'undefined' ? window : globalThis);
