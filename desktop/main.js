// Nusa untuk Windows & Linux: jendela transparan di tengah atas layar, isinya notch HTML.
const { app, BrowserWindow, screen, ipcMain, clipboard, Tray, Menu, nativeImage, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const media = require('./media');
const audio = require('./audio');
const calendar = require('./calendar');
const location = require('./location');
const system = require('./system');
const privacy = require('./privacy');
const notifications = require('./notifications');
const phonedrop = require('./phonedrop');

const W = 840, H = 440;
let win = null, tray = null;
let rect = { x: 0, y: 0, w: 0, h: 0 };
let inside = false;
/** Lagi minggir buat toolbar rekam layar / bar share (Windows). */
let yielded = false;
let coverTimer = null;

/** Kirim ke halaman; kalau gagal (halaman lagi dimuat ulang dll.) diabaikan aja. */
function send(channel, value) {
  try { if (win && !win.isDestroyed()) win.webContents.send(channel, value); } catch {}
}

// Mode tes: data di folder terpisah biar data asli nggak kesentuh
if (process.env.NUSA_USERDATA) app.setPath('userData', process.env.NUSA_USERDATA);
if (!app.requestSingleInstanceLock()) app.quit();
// Linux butuh ini biar latar jendela bisa transparan
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function place() {
  const d = screen.getPrimaryDisplay().bounds;
  win.setBounds({ x: Math.round(d.x + d.width / 2 - W / 2), y: d.y, width: W, height: H });
}

function create() {
  win = new BrowserWindow({
    width: W, height: H, frame: false, transparent: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    backgroundColor: '#00000000', title: 'Nusa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  place();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);

  // Klik di luar notch harus tembus ke app di belakang: cek posisi kursor 25x per detik
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    const over = !yielded && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    if (over === inside) return;
    inside = over;
    win.setIgnoreMouseEvents(!over);
    send('hover', over);
  }, 40);

  // Info lagu + ikon app sumbernya (Spotify, Chrome, ...) buat ditempel di pojok sampul kayak versi Mac
  let current = null;
  media.start(async (state) => {
    const s = state && JSON.parse(JSON.stringify(state));
    if (s?.path) s.icon = await fileIcon(s.path, 'normal');
    // Sampul dari Windows cuma 120×120 (pecah kalau digedein): cari versi 600×600 lagu yang sama
    if (s?.title && s.source !== 'Senandung') {
      const key = artKey(s);
      if (hiRes.has(key)) s.hiArt = hiRes.get(key);
      else hiResArt(s).then(() => { if (current && artKey(current) === key && hiRes.get(key)) send('media', { ...current, hiArt: hiRes.get(key) }); });
    }
    current = s;
    send('media', s);
  });

  // Volume sistem; pindah ke headphone/Bluetooth → pop-up nama perangkat + baterainya
  let lastDevice = null;
  audio.start((st) => {
    send('audio', st);
    if (!st) return;
    const changed = lastDevice !== null && st.id !== lastDevice;
    lastDevice = st.id;
    if (!changed || !(st.bt || st.ff === 3 || st.ff === 5)) return;
    audio.battery(st.name, (detail) => send('device', { name: st.name, bt: st.bt, detail: detail || 'Connected' }));
  }, (covered) => {
    // Toolbar rekam layar (Snipping Tool, Game Bar) / bar share Zoom-Teams muncul di tengah atas:
    // Nusa minggir dulu biar toolbarnya bisa diklik. Jendelanya NGGAK disembunyiin (hide/show = kedip);
    // notch cuma memudar & tembus klik. Nunggu kondisinya stabil dulu biar tooltip yang lewat sebentar
    // (mis. pas kursor di atas tab browser) nggak bikin Nusa kedip-kedip.
    clearTimeout(coverTimer);
    if (covered === yielded) return;
    coverTimer = setTimeout(() => {
      yielded = covered;
      if (covered) {
        inside = false;
        win.setIgnoreMouseEvents(true);
        send('hover', false);
      }
      send('yield', covered);
    }, covered ? 1200 : 1500);
  }, {
    onHud: (d) => send('hud', d),
    onFullscreen: (fs) => send('fullscreen', fs),
  });
}

ipcMain.on('rect', (_e, r) => { rect = r; });

// Server Senandung (tab Music): lewat proses utama biar nggak keblok CORS di halaman file://
ipcMain.handle('senandung', (_e, method, route, body) => new Promise((resolve) => {
  if (!/^\/api\/(remote\/(state|cmd)|yt\/search)/.test(route)) return resolve(null);
  const data = body ? JSON.stringify(body) : null;
  const req = require('http').request({ host: '127.0.0.1', port: 5560, path: route, method, timeout: 8000,
    headers: data ? { 'Content-Type': 'application/json', 'X-Senandung-Remote': '1', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
    let b = '';
    res.on('data', (d) => (b += d));
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
  });
  req.on('error', () => resolve(null));
  req.on('timeout', () => { req.destroy(); resolve(null); });
  if (data) req.write(data);
  req.end();
}));

ipcMain.on('media-cmd', (_e, cmd) => media.command(cmd));
// Lokasi user (buat cuaca); dipanggil pas nyala & tiap 30 menit kalau mode Current location
ipcMain.handle('locate', () => location.locate().catch(() => null));
ipcMain.on('volume', (_e, level) => audio.setVolume(level));
ipcMain.on('mute', (_e, on) => audio.setMute(!!on));
ipcMain.handle('calendar', (_e, start, days) => calendar.fetch(+start, Math.min(31, Math.max(1, +days || 7))));
// Izin kalender diblokir: buka halaman Privasi › Kalender di Settings
ipcMain.on('calendar-settings', () => shell.openExternal(process.platform === 'win32' ? 'ms-settings:privacy-calendar' : 'about:blank'));

function metSymbolToWmo(sym) {
  const base = String(sym || '').replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 95;
  const map = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrainshowers: 61, lightrain: 61,
    rainshowers: 63, rain: 63,
    heavyrainshowers: 65, heavyrain: 65,
    lightsleet: 66, sleet: 66, heavysleet: 66,
    lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 66,
    lightsnow: 71, lightsnowshowers: 71,
    snow: 73, snowshowers: 73,
    heavysnow: 75, heavysnowshowers: 75,
  };
  if (map[base] !== undefined) return map[base];
  if (base.includes('snow')) return 71;
  if (base.includes('rain')) return 63;
  if (base.includes('cloud')) return 3;
  return 2;
}

function apparentTemp(t, rh, windMs) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return t;
  const h = typeof rh === 'number' && Number.isFinite(rh) ? rh : 50;
  const w = typeof windMs === 'number' && Number.isFinite(windMs) ? windMs : 0;
  const e = (h / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return Math.round((t + 0.33 * e - 0.70 * w - 4.0) * 10) / 10;
}

ipcMain.handle('weather', async (_e, lat, lon) => {
  const la = +lat, lo = +lon;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la.toFixed(2)}&lon=${lo.toFixed(2)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nusa/1.0.1 (https://github.com/Razor573/nusa)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const series = data?.properties?.timeseries;
      if (Array.isArray(series) && series.length) {
        const cur = series[0];
        const det = cur.data?.instant?.details || {};
        const sym = cur.data?.next_1_hours?.summary?.symbol_code
          || cur.data?.next_6_hours?.summary?.symbol_code || 'clearsky_day';
        const temp = Math.round(det.air_temperature);
        const feels = Math.round(apparentTemp(det.air_temperature, det.relative_humidity, det.wind_speed));
        const hours = series.slice(1, 9).map((item) => {
          const hSym = item.data?.next_1_hours?.summary?.symbol_code
            || item.data?.next_6_hours?.summary?.symbol_code || sym;
          return {
            time: item.time,
            temp: Math.round(item.data?.instant?.details?.air_temperature ?? temp),
            rain: item.data?.next_1_hours?.details?.precipitation_amount ?? 0,
            code: metSymbolToWmo(hSym),
          };
        });
        return {
          temp,
          feels: Number.isFinite(feels) ? feels : temp,
          code: metSymbolToWmo(sym),
          day: !sym.endsWith('_night'),
          hours,
          source: 'met.no',
        };
      }
    }
  } catch {}

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,apparent_temperature,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=9&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.current;
    if (!c) return null;
    const h = data?.hourly || {};
    const times = Array.isArray(h.time) ? h.time : [];
    const hours = times.slice(1, 9).map((time, i) => ({
      time,
      temp: Math.round(h.temperature_2m?.[i + 1] ?? c.temperature_2m),
      rain: h.precipitation_probability?.[i + 1] ?? 0,
      code: h.weather_code?.[i + 1] ?? c.weather_code,
    }));
    return {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature ?? c.temperature_2m),
      code: c.weather_code ?? 0,
      day: c.is_day !== 0,
      hours,
      source: 'open-meteo',
    };
  } catch {
    return null;
  }
});

ipcMain.handle('ical', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return null;
  try {
    const res = await fetch(url.trim(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > 2 * 1024 * 1024) return null;
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) return null;
    return text;
  } catch {
    return null;
  }
});

ipcMain.on('set-scale', (_e, scale) => {
  const s = Math.max(0.75, Math.min(1.5, +scale || 1));
  if (win && !win.isDestroyed()) win.webContents.setZoomFactor(s);
});

ipcMain.on('relaunch', () => {
  app.relaunch();
  app.exit(0);
});

/* Sampul resolusi tinggi lewat iTunes Search (gratis, tanpa login). Yang dikirim cuma judul + artis. */
const hiRes = new Map();
const pending = new Map();
const norm = (s) => String(s || '').toLowerCase()
  .replace(/\s*-\s*topic$|vevo$|official/g, '')
  .replace(/\(.*?\)|\[.*?\]|feat\.?.*$|ft\.?.*$/g, '')
  .normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const artKey = (s) => norm(s.artist) + '|' + norm(s.title);

function hiResArt(s) {
  const key = artKey(s);
  if (pending.has(key)) return pending.get(key);
  const title = norm(s.title), artist = norm(s.artist);
  const job = (async () => {
    try {
      const term = encodeURIComponent(`${artist} ${title}`.trim());
      const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=25`, { signal: AbortSignal.timeout(6000) });
      const { results = [] } = await res.json();
      const same = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a));
      const hit = results.find((r) => same(norm(r.trackName), title) && (!artist || same(norm(r.artistName), artist)))
        || (artist ? null : results.find((r) => same(norm(r.trackName), title)));
      hiRes.set(key, hit?.artworkUrl100 ? hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null);
    } catch { hiRes.set(key, null); }
    pending.delete(key);
  })();
  pending.set(key, job);
  return job;
}

const icons = new Map();
async function fileIcon(p, size = 'large') {
  const key = size + '|' + p;
  if (!icons.has(key)) {
    try { icons.set(key, (await app.getFileIcon(p, { size })).toDataURL()); } catch { icons.set(key, null); }
  }
  return icons.get(key);
}

// Klik sampul: buka/munculin app yang lagi muter lagu
ipcMain.on('open-source', (_e, src) => {
  if (!src) return;
  if (process.platform === 'win32' && src.pid) {
    const ps = `$w = New-Object -ComObject WScript.Shell; if (-not $w.AppActivate(${+src.pid})) { exit 1 }`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (err) => { if (err && src.path) shell.openPath(src.path); });
  } else if (process.platform === 'win32' && String(src.source).includes('!')) {
    execFile('explorer.exe', ['shell:AppsFolder\\' + src.source]);
  } else if (src.path) shell.openPath(src.path);
});

// Rak (Tray): file yang ditaruh buat nanti
const isFile = (p) => typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p);
ipcMain.handle('file-info', async (_e, p) => isFile(p) ? { path: p, name: path.basename(p), icon: await fileIcon(p) } : null);
ipcMain.on('file-open', (_e, p) => { if (isFile(p)) shell.openPath(p); });
ipcMain.on('file-show', (_e, p) => { if (isFile(p)) shell.showItemInFolder(p); });
const fallbackDragIcon = () => nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
ipcMain.on('file-drag', async (e, p) => {
  if (!isFile(p)) return;
  const icon = nativeImage.createFromDataURL((await fileIcon(p)) || '');
  e.sender.startDrag({ file: p, icon: icon.isEmpty() ? fallbackDragIcon() : icon });
});
ipcMain.on('tray-drag-many', async (e, paths) => {
  const valid = (Array.isArray(paths) ? paths : []).filter(isFile);
  if (!valid.length) return;
  const icon = valid.length === 1 ? nativeImage.createFromDataURL((await fileIcon(valid[0])) || '') : fallbackDragIcon();
  e.sender.startDrag({ files: valid, icon: icon.isEmpty() ? fallbackDragIcon() : icon });
});
ipcMain.on('tray-drag-text', (e, text) => {
  const tmp = path.join(os.tmpdir(), `nusa-note-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmp, String(text ?? ''), 'utf8');
    e.sender.startDrag({ file: tmp, icon: fallbackDragIcon() });
  } catch {}
});

let currentShelfPaths = [];
ipcMain.on('shelf-sync', (_e, paths) => {
  currentShelfPaths = Array.isArray(paths) ? paths.filter(isFile) : [];
});

/* ================= Clipboard History (off by default) ================= */
let clipsConfig = { enabled: false, mode: 'text' };
let clipsTimer = null;
let lastClipSig = null;

function readClipboardFiles() {
  try {
    if (process.platform === 'win32') {
      const hdrop = clipboard.readBuffer('CF_HDROP');
      if (hdrop && hdrop.length >= 20) {
        const offset = hdrop.readUInt32LE(0);
        const wide = hdrop.readUInt32LE(16) !== 0;
        const body = hdrop.subarray(offset);
        const list = wide ? body.toString('utf16le').split('\0') : body.toString('latin1').split('\0');
        const out = [];
        for (const p of list) {
          if (!p) break;
          if (isFile(p)) out.push(p);
        }
        if (out.length) return out;
      }
      const fnw = clipboard.readBuffer('FileNameW');
      if (fnw && fnw.length > 0) {
        const p = fnw.toString('utf16le').replace(/\0.*$/, '');
        if (isFile(p)) return [p];
      }
    } else if (process.platform === 'linux') {
      const raw = clipboard.readBuffer('text/uri-list');
      if (raw && raw.length > 0) {
        const out = raw.toString('utf8').split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith('file://'))
          .map((l) => { try { return decodeURIComponent(new URL(l).pathname); } catch { return ''; } })
          .filter(isFile);
        if (out.length) return out;
      }
    }
  } catch {}
  return [];
}

async function readClipboardSnapshot(mode) {
  if (mode === 'files' || mode === 'all') {
    const files = readClipboardFiles();
    if (files.length) {
      return {
        sig: 'files:' + files.join('|'),
        item: { type: 'files', files: files.map((p) => ({ path: p, name: path.basename(p) })) },
      };
    }
  }
  if (mode === 'all') {
    try {
      const img = await Promise.resolve(clipboard.readImage());
      if (img && !img.isEmpty()) {
        const sz = img.getSize();
        const thumb = sz.width > 360 || sz.height > 360 ? img.resize({ width: Math.min(360, sz.width) }) : img;
        const png = thumb.toPNG();
        const hash = crypto.createHash('sha1').update(png).digest('hex').slice(0, 12);
        return {
          sig: 'img:' + hash,
          item: { type: 'image', dataUrl: thumb.toDataURL(), hash, width: sz.width, height: sz.height },
        };
      }
    } catch {}
  }
  if (mode === 'text' || mode === 'all') {
    try {
      const t = await Promise.resolve(clipboard.readText());
      if (typeof t === 'string' && t.length > 0) {
        return { sig: 'text:' + t, item: { type: 'text', text: t } };
      }
    } catch {}
  }
  return null;
}

function stopClipsPolling() {
  if (clipsTimer) { clearInterval(clipsTimer); clipsTimer = null; }
  lastClipSig = null;
}

function startClipsPolling() {
  stopClipsPolling();
  readClipboardSnapshot(clipsConfig.mode).then((snap) => {
    lastClipSig = snap ? snap.sig : '';
  });
  clipsTimer = setInterval(async () => {
    if (!clipsConfig.enabled || lastClipSig === null) return;
    const snap = await readClipboardSnapshot(clipsConfig.mode);
    if (snap && snap.sig !== lastClipSig) {
      lastClipSig = snap.sig;
      send('clip', snap.item);
    }
  }, 1000);
}

ipcMain.on('clips-config', (_e, cfg) => {
  const enabled = Boolean(cfg && cfg.enabled);
  const mode = cfg && ['text', 'files', 'all'].includes(cfg.mode) ? cfg.mode : 'text';
  clipsConfig = { enabled, mode };
  if (enabled) startClipsPolling();
  else stopClipsPolling();
});

ipcMain.on('clip-copy', (_e, item) => {
  try {
    if (typeof item === 'string') { clipboard.writeText(item); return; }
    if (!item || typeof item !== 'object') return;
    if (item.type === 'text') {
      clipboard.writeText(String(item.text || ''));
    } else if (item.type === 'image' && item.dataUrl) {
      clipboard.writeImage(nativeImage.createFromDataURL(item.dataUrl));
    } else if (item.type === 'files' && Array.isArray(item.files)) {
      const paths = item.files.map((f) => f.path).filter(isFile);
      if (!paths.length) return;
      if (process.platform === 'linux') {
        clipboard.writeBuffer('text/uri-list', Buffer.from(paths.map((p) => 'file://' + encodeURI(p)).join('\r\n'), 'utf8'));
      } else if (process.platform === 'win32') {
        const joined = paths.join('\0') + '\0\0';
        const strBuf = Buffer.from(joined, 'utf16le');
        const header = Buffer.alloc(20);
        header.writeUInt32LE(20, 0);
        header.writeUInt32LE(1, 16);
        clipboard.writeBuffer('CF_HDROP', Buffer.concat([header, strBuf]));
      } else {
        clipboard.writeText(paths.join('\n'));
      }
    }
  } catch {}
});

ipcMain.on('clip-drag', async (e, item) => {
  try {
    if (!item) return;
    if (typeof item === 'string' || item.type === 'text') {
      const text = typeof item === 'string' ? item : item.text;
      const tmp = path.join(os.tmpdir(), `nusa-clip-${Date.now()}.txt`);
      fs.writeFileSync(tmp, String(text ?? ''), 'utf8');
      e.sender.startDrag({ file: tmp, icon: fallbackDragIcon() });
    } else if (item.type === 'image' && item.dataUrl) {
      const img = nativeImage.createFromDataURL(item.dataUrl);
      const tmp = path.join(os.tmpdir(), `nusa-clip-${Date.now()}.png`);
      fs.writeFileSync(tmp, img.toPNG());
      e.sender.startDrag({ file: tmp, icon: img.isEmpty() ? fallbackDragIcon() : img.resize({ width: 48 }) });
    } else if (item.type === 'files' && Array.isArray(item.files)) {
      const valid = item.files.map((f) => f.path).filter(isFile);
      if (!valid.length) return;
      const icon = valid.length === 1 ? nativeImage.createFromDataURL((await fileIcon(valid[0])) || '') : fallbackDragIcon();
      e.sender.startDrag({ files: valid, icon: icon.isEmpty() ? fallbackDragIcon() : icon });
    }
  } catch {}
});

/* ================= System Stats, Privacy Dots, Notifications, Phone Drop ================= */
let sysWatch = { notch: false, tab: false };
let sysRunning = false;
ipcMain.on('system-watch', (_e, st) => {
  sysWatch = { notch: Boolean(st?.notch), tab: Boolean(st?.tab) };
  const want = sysWatch.notch || sysWatch.tab;
  if (want && !sysRunning) {
    sysRunning = true;
    system.start((snap) => send('system', snap));
  } else if (!want && sysRunning) {
    sysRunning = false;
    system.stop();
  }
});

ipcMain.on('privacy-watch', (_e, on) => {
  if (on) privacy.start((st) => send('privacy', st));
  else privacy.stop();
});

ipcMain.on('notif-watch', (_e, on) => {
  if (on) notifications.start((n) => send('notif', n));
  else notifications.stop();
});
ipcMain.on('notif-settings', () => shell.openExternal(process.platform === 'win32' ? 'ms-settings:notifications' : 'about:blank'));

ipcMain.handle('phonedrop-start', async () => phonedrop.start({
  app,
  getShelf: () => currentShelfPaths,
  onRequest: (req) => send('phonedrop-request', req),
  onFiles: (files) => send('phonedrop-files', files),
  onState: (st) => send('phonedrop-state', st),
}));
ipcMain.on('phonedrop-stop', () => {
  phonedrop.stop();
  send('phonedrop-state', { active: false });
});
ipcMain.handle('phonedrop-approve', (_e, id) => phonedrop.approve(id));
ipcMain.on('phonedrop-decline', (_e, id) => phonedrop.decline(id));

// Klik kanan di notch: menu kecil kayak versi Mac
ipcMain.on('context-menu', () => {
  const atLogin = process.platform === 'linux' ? linuxAutostart() : app.getLoginItemSettings().openAtLogin;
  Menu.buildFromTemplate([
    { label: atLogin ? 'Don’t open at login' : 'Open at login', click: () => (process.platform === 'linux' ? linuxAutostart(!atLogin) : app.setLoginItemSettings({ openAtLogin: !atLogin })) },
    { type: 'separator' },
    { label: 'Quit Nusa', click: () => app.quit() },
  ]).popup({ window: win });
});
ipcMain.on('copy', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('open', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on('focus', () => win && win.focus());
ipcMain.handle('login-item', (_e, on) => {
  if (process.platform === 'linux') return linuxAutostart(on);
  if (on !== undefined) app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

/** Linux nggak punya API login item: tulis file .desktop di ~/.config/autostart. */
function linuxAutostart(on) {
  const file = path.join(app.getPath('home'), '.config', 'autostart', 'nusa.desktop');
  if (on === true) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Nusa\nExec="${process.env.APPIMAGE || process.execPath}"\nX-GNOME-Autostart-enabled=true\n`);
  } else if (on === false) fs.rmSync(file, { force: true });
  return fs.existsSync(file);
}

function makeTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Nusa');
  const rebuild = async () => {
    const atLogin = process.platform === 'linux' ? linuxAutostart() : app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Nusa', click: () => send('open-panel') },
      { label: 'Start at login', type: 'checkbox', checked: atLogin, click: (m) => {
        process.platform === 'linux' ? linuxAutostart(m.checked) : app.setLoginItemSettings({ openAtLogin: m.checked });
        rebuild();
      } },
      { type: 'separator' },
      { label: 'Quit Nusa', click: () => app.quit() },
    ]));
  };
  rebuild();
  tray.on('click', () => send('open-panel'));
}

// Mode tes (dipakai pas development di Mac): jalanin langkah-langkah lalu potret jendela
async function shotMode(dir, steps) {
  for (const [js, name, wait] of steps) {
    if (js) await win.webContents.executeJavaScript(js);
    await new Promise((r) => setTimeout(r, wait ?? 900));
    if (name) fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  }
  app.quit();
}

app.whenReady().then(() => {
  // Linux: kasih jeda dikit biar compositor siap (kalau nggak, latar transparan jadi hitam)
  setTimeout(() => {
    create();
    makeTray();
    if (process.env.NUSA_SHOT_DIR) {
      win.webContents.once('did-finish-load', () => setTimeout(() => {
        shotMode(process.env.NUSA_SHOT_DIR, JSON.parse(fs.readFileSync(process.env.NUSA_SHOT_STEPS, 'utf8')));
      }, 2500));
    }
  }, process.platform === 'linux' ? 400 : 0);
});
app.on('second-instance', () => win && send('open-panel'));
app.on('before-quit', () => {
  stopClipsPolling();
  system.stop();
  privacy.stop();
  notifications.stop();
  phonedrop.stop();
});
app.on('window-all-closed', () => app.quit());
