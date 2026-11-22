// Nusa Desktop Renderer
'use strict';

const CANVAS_W = 860;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem('nusa.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('nusa.' + k, JSON.stringify(v)); } catch {} },
};
const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const hhmm = (d, tz) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }).format(d);
const fmtDateTime = (d = new Date()) => {
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  const day = d.getDate();
  const mon = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
  const yr = d.getFullYear();
  const tm = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return `${wd} ${day} ${mon} ${yr} ${tm}`;
};
const mins = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtBytes = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`;
const fmtSpeed = (bps) => bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : bps >= 1e3 ? `${(bps / 1e3).toFixed(0)} KB/s` : `${bps} B/s`;

/* ================= Themes ================= */
let appliedVars = [];
const shade = (a) => `rgba(255,255,255,${a})`;
const T = (id, name, c) => ({ id, name, colors: { dim: '#8e8e93', faint: shade(.42), line: shade(.1), chip: shade(.08), chip2: shade(.14), ...c } });
const BUILTIN_THEMES = [
  { id: 'classic', name: 'Classic', colors: {} },
  T('mono', 'Mono', { bg: '#0a0a0b', card: '#141416', sidebar: '#101012', text: '#f5f5f5', mint: '#e5e5e5', green: '#22c55e', rest: '#a3a3a3', late: '#ff6b6b' }),
  T('midnight', 'Midnight', { bg: '#0a0f1c', card: '#111829', sidebar: '#0d1322', text: '#eaeefb', mint: '#6ea8fe', green: '#22c55e', rest: '#a5b4fc', late: '#fb7185' }),
  T('tokyo', 'Tokyo Night', { bg: '#1a1b26', card: '#222433', sidebar: '#161722', text: '#c0caf5', mint: '#7aa2f7', green: '#9ece6a', rest: '#e0af68', late: '#f7768e' }),
  T('nord', 'Nord', { bg: '#2e3440', card: '#373e4d', sidebar: '#272c36', text: '#eceff4', mint: '#88c0d0', green: '#a3be8c', rest: '#ebcb8b', late: '#bf616a' }),
  T('dracula', 'Dracula', { bg: '#282a36', card: '#313442', sidebar: '#21222c', text: '#f8f8f2', mint: '#bd93f9', green: '#50fa7b', rest: '#ffb86c', late: '#ff5555' }),
  T('gruvbox', 'Gruvbox', { bg: '#1d2021', card: '#282828', sidebar: '#181a1b', text: '#ebdbb2', mint: '#8ec07c', green: '#b8bb26', rest: '#fabd2f', late: '#fb4934' }),
  T('rose', 'Rosé Pine', { bg: '#191724', card: '#211f2e', sidebar: '#14121d', text: '#e0def4', mint: '#c4a7e7', green: '#9ccfd8', rest: '#f6c177', late: '#eb6f92' }),
  T('sunset', 'Sunset', { bg: '#1a0f14', card: '#24161d', sidebar: '#150b10', text: '#ffe9d6', mint: '#ff9e64', green: '#9ece6a', rest: '#ffc777', late: '#ff5c8a' }),
  T('forest', 'Forest', { bg: '#0b120d', card: '#131d16', sidebar: '#090e0a', text: '#e6f2e8', mint: '#7dd48a', green: '#4ade80', rest: '#d9c46a', late: '#ff7a6b' }),
  T('ocean', 'Ocean', { bg: '#04141c', card: '#0a1e29', sidebar: '#031017', text: '#dff6f5', mint: '#38e0c4', green: '#5eead4', rest: '#7dd3fc', late: '#fb7185' }),
];
const themeById = (id) => BUILTIN_THEMES.find((t) => t.id === id) || BUILTIN_THEMES[0];

function applyTheme() {
  const t = themeById(S.theme), root = document.documentElement.style;
  for (const k of appliedVars) root.removeProperty(k);
  appliedVars = [];
  for (const [k, v] of Object.entries(t.colors || {})) {
    root.setProperty('--' + k, v);
    appliedVars.push('--' + k);
  }
}

/* ================= Config & State ================= */
const DEFAULT_CFG = {
  notchSize: 'auto',
  minimalNotch: false,
  mascot: true,
  dateTime: true,
  sounds: true,
  hideFullscreen: true,
  notchStyle: 'classic',
  statusMetric: 'auto',
  privacyDots: false,
  lyricsEnabled: true,
  eqEnabled: true,
  hiResArt: true,
  clipsEnabled: false,
  clipsMode: 'text',
  notifEnabled: false,
  notifBody: true,
  notifMuted: [],
  sysEnabled: false,
  sysNotch: false,
  todoNl: true,
  icalUrl: '',
  widget1: 'weather',
  widget2: 'calendar',
  hudVolume: true,
  hudBrightness: true,
  hudCaps: true,
  hudLang: true,
  hudBattery: true,
  hudBluetooth: true,
  pages: { timer: true, water: true, shelf: true, list: true, system: false, tools: true },
};

const loadCfg = () => {
  const saved = LS.get('cfg', {});
  return {
    ...DEFAULT_CFG,
    ...saved,
    pages: { ...DEFAULT_CFG.pages, ...(saved.pages || {}) },
  };
};

const AUTO_PLACE = LS.get('city', 'auto') === 'auto';
const startPlace = () => {
  if (!AUTO_PLACE) return Places.city(LS.get('city'));
  const last = LS.get('autoPlace', null);
  return last ? Places.place(last) : Places.city('Jakarta');
};

const loadWater = () => {
  const saved = LS.get('water', null);
  const today = localDateStr();
  if (saved && saved.date === today) return saved;
  return Water.createState(today, saved || Water.DEFAULT_CONFIG);
};

const INITIAL_CFG = loadCfg();

const S = {
  hover: false, expanded: false, pinned: false, fullscreen: false, yielded: false,
  tab: LS.get('tab', 'music'),
  timerSub: 'pomodoro',
  shelfSub: 'files',
  listSub: 'todo',
  setCat: 'general',
  flash: null,
  cfg: INITIAL_CFG,
  initialNotchSize: INITIAL_CFG.notchSize,
  media: null, tint: null, scrub: null,
  lyricsOpen: false, lyricsKey: '', lyricsState: { status: 'idle', lines: [], plain: '' },
  weather: null, battery: null, audio: null,
  clips: [], pinnedClips: LS.get('pinnedClips', []), clipQuery: '', clipSnippet: '', copied: null,
  tasks: LS.get('tasks', []), taskText: '', taskPick: null,
  place: startPlace(), autoPlace: AUTO_PLACE, locating: false,
  shelf: LS.get('shelf', []), shelfNotes: LS.get('shelfNotes', []), shelfSel: [], noteText: '',
  files: {}, dropping: false, calSel: null,
  cal: { status: 'loading', events: [], at: 0 },
  notifLog: LS.get('notifLog', []),
  theme: LS.get('theme', 'classic'),
  phoneDrop: { active: false, url: null },
  water: loadWater(), waterRefill: false,
  cd: TimerLib.createCountdown(5),
  sw: TimerLib.createStopwatch(),
  pomo: TimerLib.createPomodoro(LS.get('pomoCfg', { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 4 })),
  focus: null, timer: null,
  sys: null, sysHist: [],
  privacy: { mic: { active: false, app: null }, cam: { active: false, app: null } },
  toolsSub: 'color',
  colorHex: '#22c55e', colorHist: LS.get('colorHist', ['#22c55e', '#6ea8fe', '#ffb85a']),
  calcExpr: '', calcHist: LS.get('calcHist', []),
  qrText: '',
  convCat: 'length', convVal: '1', convFrom: 'km', convTo: 'm', tzOffset: 0,
  loginAtBoot: false,
};
let flashTimer = null;

function saveCfg() {
  LS.set('cfg', S.cfg);
  syncWatchers();
}

function syncWatchers() {
  nusa.clipsConfig?.({ enabled: S.cfg.clipsEnabled, mode: S.cfg.clipsMode });
  nusa.privacyWatch?.(S.cfg.privacyDots);
  nusa.notifWatch?.(S.cfg.notifEnabled);
  syncSystemWatch();
}

function syncSystemWatch() {
  nusa.systemWatch?.({
    notch: Boolean(S.cfg.sysNotch),
    tab: Boolean(S.expanded && S.tab === 'list' && (S.listSub === 'system' || S.listSub === 'widgets')),
  });
}

/* ================= Status Ring & Presentation ================= */
function statusRingData() {
  const m = S.cfg.statusMetric;
  if ((m === 'pomodoro' || (m === 'auto' && (S.pomo.running || S.focus))) && (S.pomo.running || S.focus)) {
    const pct = S.focus
      ? Math.max(0, Math.min(100, Math.round((1 - (S.focus.end - Date.now()) / S.focus.total) * 100)))
      : Math.max(0, Math.min(100, Math.round((1 - TimerLib.remainingPomodoro(S.pomo) / S.pomo.totalMs) * 100)));
    return { pct, color: S.pomo.phase === 'rest' || S.focus?.phase === 'rest' ? '#ffb85a' : '#22c55e' };
  }
  if (m === 'water') {
    const pct = Math.min(100, Math.round((Water.totalMl(S.water) / Math.max(1, S.water.goalMl)) * 100));
    return { pct, color: '#38bdf8' };
  }
  if ((m === 'battery' || m === 'auto') && S.battery) {
    return { pct: S.battery.level, color: S.battery.level <= 20 && !S.battery.charging ? '#ff6b6b' : '#22c55e' };
  }
  return { pct: 100, color: '#22c55e' };
}

function statusRingHTML() {
  const { pct, color } = statusRingData();
  return `<span class="sring" style="--ring-p:${pct};--ring-c:${color}"></span>`;
}

function presentation() {
  if (S.expanded) return 'expanded';
  if (S.flash) return 'flash';
  if (S.focus) return 'focus';
  if (S.media?.title) return 'music';
  if (S.timer) return 'timer';
  if (!S.hover && S.cfg.minimalNotch) return 'lip';
  return 'idle';
}

const SMALL_FLASH = ['volume', 'brightness', 'caps', 'lang', 'low', 'unplug', 'done'];

function panelDimensions() {
  if (S.tab === 'settings') return { w: 780, h: 430 };
  if (S.tab === 'music') return { w: S.lyricsOpen ? 760 : 520, h: 256 };
  if (S.tab === 'timer') return { w: 540, h: 290 };
  if (S.tab === 'water') return { w: 540, h: 270 };
  if (S.tab === 'shelf') return { w: 620, h: 268 };
  if (S.tab === 'list') {
    const h = { todo: 330, today: 300, calendar: 310, widgets: 290, weather: 275, system: 280, tools: 310 }[S.listSub] || 300;
    return { w: 660, h };
  }
  return { w: 540, h: 260 };
}

function size(p = presentation()) {
  const dotsW = S.cfg.privacyDots && (S.privacy.mic.active || S.privacy.cam.active) ? 22 : 0;
  const dtW = S.cfg.dateTime ? 156 : 0;
  const mascW = S.cfg.mascot ? 24 : 0;
  const sysW = S.cfg.sysNotch && S.sys ? 92 : 0;
  switch (p) {
    case 'lip': return { w: 136, h: 6, r: 3, s: 3 };
    case 'idle': {
      const w = Math.max(96, 36 + dtW + mascW + sysW + dotsW);
      return { w, h: 28, r: 14, s: 8 };
    }
    case 'music': return { w: Math.min(340, 210 + (S.timer ? 24 : 0) + mascW + dotsW), h: 28, r: 14, s: 8 };
    case 'timer': return { w: 186 + dotsW, h: 28, r: 14, s: 8 };
    case 'focus': return { w: 236 + dotsW, h: 28, r: 14, s: 8 };
    case 'flash': {
      const k = S.flash.kind;
      if (SMALL_FLASH.includes(k)) return { w: 244, h: 30, r: 15, s: 8 };
      const w = { track: 320, task: 340, rain: 320, focusEnd: 360, charging: 300, device: 330, phoneDrop: 360, waterRemind: 340, timerDone: 330, notif: 360, privacy: 300 }[k] || 310;
      return { w, h: k === 'charging' ? 58 : 64, r: 20, s: 10 };
    }
    default: {
      const d = panelDimensions();
      return { w: d.w, h: d.h, r: 24, s: 12 };
    }
  }
}

let lastKey = '', lastH = 0;
function render(force) {
  const p = presentation();
  const hideFs = S.cfg.hideFullscreen && S.fullscreen;
  const island = $('#island');
  island.classList.toggle('yield', (!!S.yielded || hideFs) && p !== 'flash');
  island.dataset.style = S.cfg.notchStyle || 'classic';

  const sz = size(p);
  island.classList.toggle('closing', sz.h < lastH);
  lastH = sz.h;
  for (const [k, v] of Object.entries(sz)) island.style.setProperty('--' + k, v + 'px');
  island.style.setProperty('--ph', sz.h + 'px');
  island.classList.toggle('big', p === 'expanded' || p === 'flash');
  island.dataset.mode = p;

  const tinted = p === 'expanded' && S.tab === 'music' && S.media?.title && S.tint;
  island.classList.toggle('tinted', !!tinted);
  if (S.tint) {
    island.style.setProperty('--tint', S.tint);
    $('.tint', island).style.background = `linear-gradient(135deg, ${S.tint}30, ${S.tint}0a 48%, transparent 75%)`;
  }

  const key = p === 'expanded'
    ? (S.tab === 'settings' ? `x:settings:${S.setCat}` : `x:${S.tab}:${S.tab === 'music' ? (S.lyricsOpen ? 'lyr' : 'std') : S.tab === 'timer' ? S.timerSub : S.tab === 'shelf' ? S.shelfSub : S.tab === 'list' ? S.listSub : ''}`)
    : p === 'flash' ? 'f:' + S.flash.kind + S.flash.id : p;

  if (force || key !== lastKey) {
    const enter = key !== lastKey;
    const scroller = enter ? null : $('#content .scroll, #content .set-main, #content .lyrics-scroll');
    const keep = scroller ? scroller.scrollTop : 0;
    lastKey = key;
    $('#content').innerHTML = `<div class="view ${viewClass(p)}${enter ? ' enter' : ''}">${build(p)}</div>`;
    const again = scroller && $('#content .scroll, #content .set-main, #content .lyrics-scroll');
    if (again && keep) again.scrollTop = keep;
    afterBuild(p);
    syncSystemWatch();
  }
  live();
  const full = sz.w + sz.s * 2;
  const topOffset = S.cfg.notchStyle === 'floating' || S.cfg.notchStyle === 'glass' ? 8 : 0;
  const m = p === 'expanded' ? 8 : 2;
  nusa.setRect({ x: (CANVAS_W - full) / 2 - m, y: 0, w: full + m * 2, h: Math.max(sz.h, 8) + topOffset + m });
}

const viewClass = (p) => {
  if (p === 'expanded') return S.tab === 'settings' ? 'panel is-settings' : 'panel';
  if (p === 'flash') return SMALL_FLASH.includes(S.flash.kind) ? 'compact' : 'pop';
  if (p === 'lip') return '';
  return p === 'idle' ? 'compact center' : 'compact';
};

/* ================= Closed Notch & Flash ================= */
function privacyDotsHTML() {
  if (!S.cfg.privacyDots) return '';
  const mic = S.privacy.mic?.active, cam = S.privacy.cam?.active;
  if (!mic && !cam) return '';
  return `<span class="pdots">${mic ? `<i class="pdot mic" title="Mic: ${esc(S.privacy.mic.app || 'Active')}"></i>` : ''}${cam ? `<i class="pdot cam" title="Camera: ${esc(S.privacy.cam.app || 'Active')}"></i>` : ''}</span>`;
}

function mascotHTML() {
  return S.cfg.mascot ? `<span class="mascot" aria-hidden="true"><i></i><i></i></span>` : '';
}

function build(p) {
  if (p === 'lip') return '';
  if (p === 'flash') return flashHTML(S.flash);
  if (p === 'expanded') return panelHTML();
  const dots = privacyDotsHTML();
  const masc = mascotHTML();
  if (p === 'music') {
    const m = S.media;
    return `${statusRingHTML()}${m.art ? `<img class="art" src="${esc(m.art)}" alt="">` : ''}<span class="t">${esc(m.title)}</span>
      ${S.cfg.eqEnabled ? `<span class="eq ${m.playing ? 'on' : ''}"><i></i><i></i><i></i><i></i></span>` : ''}${S.timer ? ringSVG('timer') : ''}${masc}${dots}`;
  }
  if (p === 'timer') return `${statusRingHTML()}${IC.timer}<span class="t">Timer</span><span class="mono" style="color:#ff9f0a" data-live="timerLeft"></span>${dots}`;
  if (p === 'focus') return `${statusRingHTML()}<span class="t">${esc(S.focus.phase === 'focus' ? S.focus.title || 'Focus' : 'Break')}</span><span class="mono" data-live="focusLeft" style="color:${S.focus.phase === 'focus' ? '#22c55e' : '#ffb85a'}"></span>${dots}`;
  return `${statusRingHTML()}${S.cfg.dateTime ? `<span class="closed-dt" data-live="closedDt">${fmtDateTime()}</span>` : ''}${S.cfg.sysNotch && S.sys ? `<span class="mono" style="color:var(--dim);font-size:11px" data-live="sysClosed"></span>` : ''}${masc}${dots}`;
}

function afterBuild(p) {
  if (p !== 'expanded') return;
  if (S.tab === 'music' && S.lyricsOpen) ensureLyrics();
  if (S.tab === 'list' && S.listSub === 'calendar' && Date.now() - S.cal.at > 60000) loadCalendar();
  if (S.tab === 'list' && S.listSub === 'todo') $('#taskIn')?.focus();
}

function ringSVG(kind) {
  let frac = 0, color = '#ff9f0a';
  if (kind === 'timer' && S.timer) frac = 1 - (S.timer.end - Date.now()) / S.timer.total;
  if (kind === 'focus' && S.focus) { frac = 1 - (S.focus.end - Date.now()) / S.focus.total; color = S.focus.phase === 'focus' ? '#22c55e' : '#ffb85a'; }
  const C = 2 * Math.PI * 5;
  return `<svg class="ring" viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="5" stroke="${color}" opacity=".25"/><circle cx="6.5" cy="6.5" r="5" stroke="${color}"
    stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0, Math.min(1, frac)))}" stroke-linecap="round" transform="rotate(-90 6.5 6.5)"/></svg>`;
}

function flashHTML(f) {
  switch (f.kind) {
    case 'track':
      return `${S.media?.art ? `<img class="badge" src="${esc(S.media.art)}" style="border-radius:10px;object-fit:cover" alt="">` : `<span class="badge">${IC.music}</span>`}
        <span class="txt"><b>${esc(S.media?.title)}</b><small>${esc(S.media?.artist)}</small></span><span class="eq on" style="--tint:${S.tint || '#fff'}"><i></i><i></i><i></i><i></i></span>`;
    case 'task':
      return `<span class="badge" style="color:#22c55e">${IC.bell}</span><span class="txt"><b>${esc(f.title)}</b><small>Reminder · ${esc(f.time)}</small></span>
        <button class="cbtn" data-act="taskSnooze" data-id="${f.id}" title="Snooze 10m">${IC.clock}</button><button class="cbtn mint" data-act="taskDone" data-id="${f.id}" title="Done">${IC.check}</button>`;
    case 'rain':
      return `<span class="badge" style="color:#60a5fa">${IC.umbrella}</span><span class="txt"><b>Rain likely around ${f.time}</b><small>${f.chance}% chance</small></span>`;
    case 'focusEnd':
      return `<span class="badge" style="color:${f.rest ? '#ffb85a' : '#22c55e'}">${f.rest ? IC.cup : IC.target}</span>
        <span class="txt"><b>${f.rest ? 'Break finished' : 'Focus session done'}</b><small>${f.rest ? 'Ready for another round?' : `${focusToday()} today${f.title ? ' · ' + esc(f.title) : ''}`}</small></span>
        ${f.rest ? `<button class="pill" style="background:#22c55e" data-act="focus">${IC.target} Focus</button>` : `<button class="pill" style="background:#ffb85a" data-act="break">${IC.cup} Break</button>`}
        <button class="cbtn" data-act="dismiss">${IC.x}</button>`;
    case 'charging': {
      const minsLeft = S.battery?.toFull;
      const detail = minsLeft > 0 ? `${mins(minsLeft * 60000)} until full` : 'Connected to power';
      return `<span class="batt"><i id="battFill"></i>${IC.bolt}</span><span class="txt"><b>Charging</b><small>${detail}</small></span><span class="big mono">${f.percent}%</span>`;
    }
    case 'device':
      return `<span class="badge">${IC.headphones}</span><span class="txt"><b>${esc(f.name)}</b><small class="mono">${esc(f.detail)}</small></span><span style="color:#22c55e;font-size:16px">${IC.check}</span>`;
    case 'phoneDrop':
      return `<span class="badge" style="color:#22c55e">${IC.phone}</span>
        <span class="txt"><b>${esc(f.device || 'Phone')} wants to send ${f.count} file${f.count > 1 ? 's' : ''}</b><small>${esc(f.names)}</small></span>
        <button class="pill" style="background:#22c55e" data-act="pdApprove" data-id="${esc(f.reqId)}">Accept</button>
        <button class="cbtn" data-act="pdDecline" data-id="${esc(f.reqId)}" title="Decline">${IC.x}</button>`;
    case 'waterRemind':
      return `<span class="badge" style="color:#38bdf8">${IC.water}</span>
        <span class="txt"><b>Time to drink water</b><small>${Water.totalMl(S.water)} / ${S.water.goalMl} ml today</small></span>
        <button class="pill" style="background:#22c55e" data-act="waterDrinkFlash">Drank</button>
        <button class="cbtn" data-act="waterSnooze" title="Snooze 15m">${IC.clock}</button>`;
    case 'timerDone':
      return `<span class="badge" style="color:#ff9f0a">${IC.timer}</span>
        <span class="txt"><b>${esc(f.title || 'Countdown finished')}</b><small>Time’s up</small></span>
        <button class="pill" style="background:#ff9f0a" data-act="cdRestart">Restart</button>
        <button class="cbtn" data-act="dismiss">${IC.x}</button>`;
    case 'notif':
      return `<span class="badge" style="color:#22c55e">${IC.bell}</span>
        <span class="txt"><b>${esc(f.app || 'Notification')}: ${esc(f.title)}</b>${S.cfg.notifBody && f.body ? `<small>${esc(f.body)}</small>` : ''}</span>
        <button class="cbtn" data-act="notifMuteApp" data-app="${esc(f.app)}" title="Mute ${esc(f.app)}">${IC.bellOff}</button>
        <button class="cbtn" data-act="dismiss">${IC.x}</button>`;
    case 'privacy':
      return `<span class="badge" style="color:${f.kindName === 'Camera' ? '#22c55e' : '#ff9f0a'}">${f.kindName === 'Camera' ? IC.cam : IC.mic}</span>
        <span class="txt"><b>${esc(f.kindName)} in use</b><small>${esc(f.app || 'An app')} is using your ${f.kindName.toLowerCase()}</small></span>`;
    case 'volume': return `<span data-live="volFlash" style="display:contents"></span>`;
    case 'brightness': return `${IC.brightness}<span class="vbar"><i style="width:${Math.round(f.level)}%"></i></span><span class="mono" style="width:38px;text-align:right">${Math.round(f.level)}%</span>`;
    case 'caps': return smallRow(IC.capslock, f.on ? '#22c55e' : 'var(--dim)', 'Caps Lock', f.on ? 'ON' : 'OFF', f.on ? '#22c55e' : 'var(--dim)');
    case 'lang': return smallRow(IC.globe, '#60a5fa', 'Keyboard', f.lang || 'ENG', '#fff');
    case 'low': return smallRow(IC.battLow, 'var(--late)', 'Low battery', `${f.percent}%`, 'var(--late)');
    case 'unplug': return smallRow(IC.plug, 'var(--dim)', 'Charger removed', `${f.percent}%`, '#fff');
    case 'done': return smallRow(IC.timer, '#ff9f0a', 'Time’s up', '', '#ff9f0a');
  }
  return '';
}

const smallRow = (icon, tint, text, value, valueTint) =>
  `<span style="color:${tint};display:inline-flex">${icon}</span><span class="t">${text}</span><span class="mono" style="color:${valueTint}">${value}</span>`;

const spkIcon = (a) => !a || a.muted || a.vol === 0 ? IC.spk0 : a.vol < 0.34 ? IC.spk1 : IC.spk2;

function volFlashHTML() {
  const f = S.flash;
  if (f?.kind !== 'volume') return '';
  return `<span style="display:inline-flex;width:18px;justify-content:center">${spkIcon({ vol: f.level, muted: f.muted })}</span>
    <span class="vbar"><i style="width:${(f.muted ? 0 : f.level) * 100}%"></i></span>
    <span class="mono" style="width:38px;text-align:right">${f.muted ? 'Muted' : Math.round(f.level * 100) + '%'}</span>`;
}

function showFlash(f, seconds) {
  clearTimeout(flashTimer);
  if (f.kind === 'volume' && S.flash?.kind === 'volume') {
    Object.assign(S.flash, f);
    live();
    flashTimer = setTimeout(() => { S.flash = null; render(); }, seconds * 1000);
    return;
  }
  S.flash = { ...f, id: uid() };
  render();
  if (f.kind === 'charging') requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('#battFill'); if (b) b.style.width = `${Math.round(36 * f.percent / 100)}px`; }));
  flashTimer = setTimeout(() => { S.flash = null; render(); }, seconds * 1000);
}

/* ================= Open Panel & Bottom Dock ================= */
function dockItems() {
  const items = [['music', 'Music', 'music']];
  if (S.cfg.pages.timer !== false) items.push(['timer', 'Timer', 'timer']);
  if (S.cfg.pages.water !== false) items.push(['water', 'Water', 'water']);
  if (S.cfg.pages.shelf !== false) items.push(['shelf', 'Shelf', 'tray']);
  if (S.cfg.pages.list !== false) items.push(['list', 'List', 'list']);
  items.push(['settings', 'Settings', 'gear']);
  return items;
}

function panelHTML() {
  if (S.tab === 'settings') return settingsHTML();
  const body = {
    music: musicViewHTML,
    timer: timerViewHTML,
    water: waterViewHTML,
    shelf: shelfViewHTML,
    list: listViewHTML,
  }[S.tab]?.() || musicViewHTML();

  return `
    <div class="top-bar">
      ${statusRingHTML()}
      <span class="top-dt" data-live="closedDt">${fmtDateTime()}</span>
      <span class="sp"></span>
      ${privacyDotsHTML()}
      ${S.media?.playing && S.cfg.eqEnabled ? `<span class="eq on" style="--tint:${S.tint || '#22c55e'}"><i></i><i></i><i></i><i></i></span>` : ''}
      <button class="ibtn ${S.pinned ? 'on' : ''}" data-act="pin" title="${S.pinned ? 'Unpin' : 'Keep open'}">${IC.pin}</button>
    </div>
    <div class="body">${body}</div>
    <div class="dock-wrap">
      <div class="dock">
        ${dockItems().map(([k, label, ic]) => `<button class="dock-btn ${S.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}" title="${label}">${IC[ic]}</button>`).join('')}
      </div>
    </div>`;
}

/* ================= Music & Lyrics Split View ================= */
const seekable = (m) => m?.duration > 0 && !m.noTimeline && m.canSeek !== false;
const mediaPos = () => { const m = S.media; return (m?.position || 0) + (m?.playing ? (Date.now() - m.at) / 1000 : 0); };

function musicArtHTML(m) {
  const src = S.cfg.hiResArt ? (m?.hiArt || m?.art) : m?.art;
  if (src) return `<img class="m-art" src="${esc(src)}" data-act="openSource" title="Open ${esc(m?.app || 'player')}" alt="">`;
  return `<span class="m-art empty" ${m?.title ? 'data-act="openSource"' : ''}>${IC.note}</span>`;
}

function musicViewHTML() {
  const m = S.media;
  const hasTrack = Boolean(m?.title);
  const title = hasTrack ? m.title : 'Not Playing';
  const artist = hasTrack ? (m.artist || m.app || '') : 'Play music to see controls';
  const volPct = S.audio ? (S.audio.muted ? 0 : S.audio.vol * 100) : 60;

  const left = `
    <div class="music-left">
      <div class="music-head">
        ${musicArtHTML(m)}
        <div class="m-meta">
          <b>${esc(title)}</b>
          <small>${esc(artist)}</small>
        </div>
      </div>
      <div class="m-prog">
        <div class="bar ${seekable(m) ? 'seek' : ''}" id="seekBar" data-live="mbar"></div>
        <div class="times mono" data-live="mtime"><span>0:00</span><span>-0:00</span></div>
      </div>
      <div class="m-controls">
        <button class="lyr-btn ${S.lyricsOpen ? 'on' : ''}" data-act="toggleLyrics" title="Lyrics">${IC.lyrics}</button>
        <div class="m-transport">
          <button data-act="mprev" title="Previous">${IC.prev}</button>
          <button class="main" data-act="mtoggle" title="${m?.playing ? 'Pause' : 'Play'}">${m?.playing ? IC.pause : IC.play}</button>
          <button data-act="mnext" title="Next">${IC.next}</button>
        </div>
        <div class="vol">
          <button data-act="muteToggle" title="${S.audio?.muted ? 'Unmute' : 'Mute'}">${spkIcon(S.audio)}</button>
          <div class="vtrack" id="volBar" data-live="volLevel"><i style="width:${volPct}%"></i></div>
        </div>
      </div>
    </div>`;

  if (!S.lyricsOpen) return `<div class="music-split">${left}</div>`;

  return `<div class="music-split">${left}<div class="vline"></div><div class="lyrics-pane" id="lyricsPane">${lyricsPaneHTML()}</div></div>`;
}

function lyricsPaneHTML() {
  if (!S.cfg.lyricsEnabled) return `<div class="lyr-empty">Lyrics disabled in Settings</div>`;
  if (!S.media?.title) return `<div class="lyr-empty">Lyrics not available</div>`;
  if (S.lyricsState.status === 'loading') return `<div class="lyr-empty">Loading lyrics...</div>`;
  if (S.lyricsState.lines?.length) {
    const pos = S.scrub ?? mediaPos();
    const active = typeof Lyrics !== 'undefined' ? Lyrics.activeLineIndex(S.lyricsState.lines, pos) : -1;
    return `<div class="lyrics-scroll" id="lyricsScroll">${S.lyricsState.lines.map((ln, i) =>
      `<button class="lyr-line ${i === active ? 'active' : ''}" data-act="seekLine" data-t="${ln.timeSec}">${esc(ln.text)}</button>`
    ).join('')}</div>`;
  }
  if (S.lyricsState.plain) {
    return `<div class="lyrics-scroll">${S.lyricsState.plain.split(/\r?\n/).filter(Boolean).map((l) => `<div class="lyr-line">${esc(l)}</div>`).join('')}</div>`;
  }
  return `<div class="lyr-empty">Lyrics not available</div>`;
}

async function ensureLyrics() {
  if (!S.cfg.lyricsEnabled || !S.media?.title || typeof Lyrics === 'undefined') return;
  const key = `${S.media.artist || ''}|${S.media.title || ''}`;
  if (S.lyricsKey === key && S.lyricsState.status !== 'idle') return;
  S.lyricsKey = key;
  S.lyricsState = { status: 'loading', lines: [], plain: '' };
  const pane = $('#lyricsPane');
  if (pane) pane.innerHTML = lyricsPaneHTML();
  try {
    const res = await Lyrics.fetchLyrics({
      title: S.media.title,
      artist: S.media.artist,
      album: S.media.album,
      duration: S.media.duration,
    });
    if (S.lyricsKey !== key) return;
    S.lyricsState = { status: 'done', lines: res?.lines || [], plain: res?.plain || '' };
  } catch {
    if (S.lyricsKey !== key) return;
    S.lyricsState = { status: 'done', lines: [], plain: '' };
  }
  const again = $('#lyricsPane');
  if (again) again.innerHTML = lyricsPaneHTML();
}

function updateActiveLyric() {
  if (!S.lyricsOpen || !S.lyricsState.lines?.length || typeof Lyrics === 'undefined') return;
  const scroll = $('#lyricsScroll');
  if (!scroll) return;
  const idx = Lyrics.activeLineIndex(S.lyricsState.lines, S.scrub ?? mediaPos());
  const btns = scroll.querySelectorAll('.lyr-line');
  btns.forEach((b, i) => {
    const on = i === idx;
    if (on && !b.classList.contains('active')) {
      b.classList.add('active');
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (!on) {
      b.classList.remove('active');
    }
  });
}

/* ================= Timer View (Pomodoro + Countdown + Stopwatch) ================= */
function timerViewHTML() {
  const pills = `
    <div class="sub-pills">
      <button class="sub-pill ${S.timerSub === 'pomodoro' ? 'on' : ''}" data-act="tmSub" data-m="pomodoro">Pomodoro</button>
      <button class="sub-pill ${S.timerSub === 'countdown' ? 'on' : ''}" data-act="tmSub" data-m="countdown">Timer</button>
      <button class="sub-pill ${S.timerSub === 'stopwatch' ? 'on' : ''}" data-act="tmSub" data-m="stopwatch">Stopwatch</button>
    </div>`;

  if (S.timerSub === 'pomodoro') {
    const p = S.pomo;
    const totalCycles = p.cycles || 4;
    const dots = Array.from({ length: totalCycles }, (_, i) => {
      const n = i + 1;
      const cls = n < p.cycle ? 'done' : n === p.cycle ? 'cur' : '';
      return `<span class="pomo-dot ${cls}" title="Session ${n} of ${totalCycles}"></span>`;
    }).join('');
    const presetMin = p.config?.focusMin || 25;
    return `${pills}
      <div class="card-box" style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:18px">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;font-weight:500;color:${p.phase === 'focus' ? '#22c55e' : '#ffb85a'}">${p.phase === 'focus' ? 'Focus session' : 'Break'} · ${p.cycle}/${totalCycles}</span>
          </div>
          <div class="tm-big mono" data-live="pomoTime">${clock(TimerLib.remainingPomodoro(p) / 1000)}</div>
          <div class="pomo-round">
            <div class="pomo-dots">${dots}</div>
            <small style="color:var(--dim);font-size:11.5px">${p.completedToday || 0} completed today</small>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">
          <div class="seg">
            ${[5, 15, 25].map((m) => `<button class="${presetMin === m ? 'on' : ''}" data-act="pomoPreset" data-m="${m}">${m}m</button>`).join('')}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-dark green" data-act="pomoToggle">${p.running ? 'Pause' : 'Start'}</button>
            <button class="btn-dark" data-act="pomoSkip">Skip</button>
            <button class="btn-dark" data-act="pomoReset">Reset</button>
          </div>
        </div>
      </div>`;
  }

  if (S.timerSub === 'countdown') {
    const cd = S.cd;
    return `${pills}
      <div class="card-box" style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:18px">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="tm-big mono" data-live="cdTime">${clock(TimerLib.remainingCountdown(cd) / 1000)}</div>
          <div style="display:flex;gap:6px">
            <button class="chip" data-act="cdAdj" data-d="-60">-1m</button>
            <button class="chip" data-act="cdAdj" data-d="60">+1m</button>
            <button class="chip" data-act="cdAdj" data-d="300">+5m</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">
          <div style="display:flex;gap:6px">
            ${[1, 5, 10, 25].map((m) => `<button class="chip" data-act="cdPreset" data-m="${m}">${m}m</button>`).join('')}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-dark green" data-act="cdToggle">${cd.running ? 'Pause' : 'Start'}</button>
            <button class="btn-dark" data-act="cdReset">Reset</button>
          </div>
        </div>
      </div>`;
  }

  const sw = S.sw;
  return `${pills}
    <div style="display:flex;gap:14px;flex:1;min-height:0">
      <div class="card-box" style="flex:1;display:flex;flex-direction:column;justify-content:space-between">
        <div class="tm-big mono" data-live="swTime">0:00.00</div>
        <div style="display:flex;gap:8px">
          <button class="btn-dark green" data-act="swToggle">${sw.running ? 'Pause' : 'Start'}</button>
          <button class="btn-dark" data-act="swLap">Lap</button>
          <button class="btn-dark" data-act="swReset">Reset</button>
        </div>
      </div>
      <div class="tm-laps">${sw.laps.length ? [...sw.laps].reverse().map((l, i) => `<div class="tm-lap"><span>Lap ${sw.laps.length - i}</span><span class="mono">${clock(l.splitMs / 1000)}.${pad(Math.floor((l.splitMs % 1000) / 10))}</span></div>`).join('') : `<div class="note">No laps yet</div>`}</div>
    </div>`;
}

function syncPomoFocus() {
  if (S.pomo.running) {
    S.focus = { phase: S.pomo.phase, end: S.pomo.endAt, total: S.pomo.totalMs, title: S.pomo.phase === 'focus' ? 'Pomodoro' : 'Break' };
  } else {
    S.focus = null;
  }
}

/* ================= Water View ================= */
function saveWater() { LS.set('water', S.water); }

function waterViewHTML() {
  const total = Water.totalMl(S.water);
  const pct = Math.min(100, Math.round((total / Math.max(1, S.water.goalMl)) * 100));
  const C = 2 * Math.PI * 36;
  const buckets = Water.hourlyBuckets(S.water);
  const maxB = Math.max(S.water.sipMl, ...buckets);

  return `
    <div style="display:flex;gap:16px;align-items:center;flex:1">
      <div class="w-ring">
        <svg viewBox="0 0 88 88"><circle cx="44" cy="44" r="36" stroke="rgba(255,255,255,.1)"/><circle cx="44" cy="44" r="36" stroke="#22c55e" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" stroke-linecap="round"/></svg>
        <div><b>${pct}%</b><small>${total} ml</small></div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <b style="font-size:14px;font-weight:500">${total} / ${S.water.goalMl} ml</b>
            <small style="display:block;color:var(--dim);font-size:12px">${S.waterRefill ? 'Bottle empty — time to refill' : `${Math.max(0, S.water.goalMl - total)} ml remaining`}</small>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-dark green" data-act="waterDrink">+${S.water.sipMl} ml</button>
            <button class="btn-dark" data-act="waterUndo" title="Undo">${IC.undo}</button>
          </div>
        </div>
        <div class="w-bars">${buckets.slice(6, 22).map((v, i) => `<div class="w-bar" title="${i + 6}:00 · ${v} ml"><i class="${v ? '' : 'empty'}" style="height:${v ? Math.max(14, Math.round((v / maxB) * 100)) : 8}%"></i></div>`).join('')}</div>
      </div>
    </div>`;
}

/* ================= Shelf View (Files + Clips + Phone Drop) ================= */
function shelfViewHTML() {
  const pills = `
    <div class="sub-pills">
      <button class="sub-pill ${S.shelfSub === 'files' ? 'on' : ''}" data-act="shSub" data-m="files">Files (${S.shelf.length + S.shelfNotes.length})</button>
      <button class="sub-pill ${S.shelfSub === 'clips' ? 'on' : ''}" data-act="shSub" data-m="clips">Clipboard</button>
      <button class="sub-pill ${S.shelfSub === 'phonedrop' ? 'on' : ''}" data-act="shSub" data-m="phonedrop">Phone Drop</button>
    </div>`;

  if (S.shelfSub === 'files') {
    const items = S.shelf.map((p, i) => {
      const f = S.files[p] || {}, name = f.name || p.split(/[/\\]/).pop();
      const sel = S.shelfSel.includes(p);
      return `<div class="sitem ${sel ? 'sel' : ''}" draggable="true" data-act="fileOpen" data-i="${i}" data-path="${esc(p)}">
        <button class="sel-dot" data-act="fileSel" data-path="${esc(p)}" title="Select">${sel ? IC.check : ''}</button>
        ${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : `<span class="ph">${IC.tray}</span>`}
        <small title="${esc(p)}">${esc(midTrim(name))}</small>
        <button class="rm" data-act="fileRemove" data-i="${i}">${IC.xCircle}</button>
      </div>`;
    }).join('');
    const notes = S.shelfNotes.map((n, i) => `
      <div class="sitem note-card" draggable="true" data-act="noteCopy" data-ni="${i}">
        <span class="ph">${esc(n.text)}</span><small>Note</small>
        <button class="rm" data-act="noteRemove" data-ni="${i}">${IC.xCircle}</button>
      </div>`).join('');

    return `${pills}
      <div class="drop ${S.dropping ? 'on' : ''}" id="drop">
        ${S.shelf.length || S.shelfNotes.length
          ? `<div class="shelf">${items}${notes}</div>`
          : `<div class="note">${IC.trayIn}<span>Drop files here or paste a quick note</span></div>`}
        <div style="display:flex;flex-direction:column;gap:6px;padding-right:10px">
          ${S.shelfSel.length ? `<button class="chip on" data-act="removeSelected">Remove (${S.shelfSel.length})</button>` : ''}
          ${S.shelf.length ? `<button class="chip" data-act="fileShow">Show</button>` : ''}
          ${S.shelf.length || S.shelfNotes.length ? `<button class="chip" data-act="trayClear">Clear</button>` : ''}
        </div>
      </div>`;
  }

  if (S.shelfSub === 'clips') {
    if (!S.cfg.clipsEnabled) {
      return `${pills}<div class="note"><b>Clipboard history is off</b><span>Enable it in Settings → Shelf when you want Nusa to record copies.</span><button class="btn-dark green" data-act="clipsToggle" style="margin-top:6px">Enable clipboard</button></div>`;
    }
    const q = S.clipQuery.trim().toLowerCase();
    const list = allClipCards().filter((c) => !q || (c.text || '').toLowerCase().includes(q));
    return `${pills}
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <div class="field" style="flex:1">${IC.search}<input id="clipQ" placeholder="Search clipboard..." value="${esc(S.clipQuery)}"></div>
        <div class="field" style="flex:1"><input id="clipSnip" placeholder="Save a quick snippet..." value="${esc(S.clipSnippet)}"><button class="small-btn" data-act="addSnippet">${IC.plus}</button></div>
      </div>
      <div class="cards">${list.length ? list.map(clipCardHTML).join('') : `<div class="note">Copy text or images to see them here</div>`}</div>`;
  }

  // Phone Drop
  const url = S.phoneDrop.url;
  return `${pills}
    <div class="card-box qr-box">
      ${S.phoneDrop.active && url ? `${QR.toSVG(url, 104)}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">
          <b style="font-size:14px;font-weight:500">Scan with your phone</b>
          <small style="color:var(--dim);font-size:12px;word-break:break-all">${esc(url)}</small>
          <div style="display:flex;gap:8px">
            <button class="btn-dark" data-act="pdCopyUrl">${IC.copy} Copy URL</button>
            <button class="btn-dark danger" data-act="pdStop">Stop</button>
          </div>
        </div>`
      : `<div class="note" style="flex:1"><b>Send files from your phone</b><span>Starts a temporary local server on your Wi-Fi.</span><button class="btn-dark green" data-act="pdStart" style="margin-top:6px">${IC.phone} Start Phone Drop</button></div>`}
    </div>`;
}

const midTrim = (s, n = 16) => s.length <= n ? s : s.slice(0, Math.ceil(n / 2) - 1) + '…' + s.slice(-(Math.floor(n / 2)));

function allClipCards() {
  const pinnedIds = new Set(S.pinnedClips.map((c) => c.id));
  return [...S.pinnedClips.map((c) => ({ ...c, _pinned: true })), ...S.clips.filter((c) => !pinnedIds.has(c.id))];
}
function findClip(id) { return S.pinnedClips.find((c) => c.id === id) || S.clips.find((c) => c.id === id); }
function clipCardHTML(c) {
  const ok = S.copied === c.id;
  const body = c.type === 'image' && c.dataUrl ? `<img class="clip-thumb" src="${esc(c.dataUrl)}" alt="">` : `<p>${esc(c.text || '')}</p>`;
  return `<div class="card ${ok ? 'ok' : ''} ${c._pinned ? 'pinned' : ''}" draggable="true" data-act="clipCopy" data-id="${c.id}">
    ${body}
    <div class="clip-acts">
      <small>${ok ? 'Copied' : c._pinned ? 'Pinned' : 'Click to copy'}</small>
      <span class="sp"></span>
      <button class="clip-btn ${c._pinned ? 'on' : ''}" data-act="clipPin" data-id="${c.id}">${IC.bookmark}</button>
      <button class="clip-btn" data-act="clipDel" data-id="${c.id}">${IC.trash}</button>
    </div>
  </div>`;
}

/* ================= List View (To-do, Today, Calendar, Widgets, Weather, System, Tools) ================= */
function listViewHTML() {
  const subs = [
    ['todo', 'To-do'],
    ['today', 'Today'],
    ['calendar', 'Calendar'],
    ['widgets', 'Widgets'],
    ['weather', 'Weather'],
  ];
  if (S.cfg.pages.system || S.cfg.sysEnabled) subs.push(['system', 'System']);
  if (S.cfg.pages.tools !== false) subs.push(['tools', 'Tools']);

  const pills = `<div class="sub-pills">${subs.map(([k, lbl]) => `<button class="sub-pill ${S.listSub === k ? 'on' : ''}" data-act="lsSub" data-m="${k}">${lbl}</button>`).join('')}</div>`;

  const body = {
    todo: todoSubHTML,
    today: todaySubHTML,
    calendar: calendarSubHTML,
    widgets: widgetsSubHTML,
    weather: weatherSubHTML,
    system: systemSubHTML,
    tools: toolsSubHTML,
  }[S.listSub]?.() || todoSubHTML();

  return `${pills}${body}`;
}

function todoSubHTML() {
  const now = Date.now();
  const list = [...S.tasks].sort((a, b) => a.done !== b.done ? (a.done ? 1 : -1) : (a.due || 9e15) - (b.due || 9e15));
  return `
    <div class="field" style="margin-bottom:8px">
      ${IC.plus}<input id="taskIn" placeholder="Add a to-do (e.g. Call Alex tomorrow 3pm)..." value="${esc(S.taskText)}">
      <span id="taskPreview"></span>
    </div>
    <div class="scroll">${list.length ? list.map((t) => {
      const late = !t.done && t.due && t.due < now;
      return `<div class="row ${t.done ? 'done' : ''}">
        <button class="check ${t.done ? 'on' : ''}" data-act="taskToggle" data-id="${t.id}">${t.done ? IC.check : ''}</button>
        <div class="t"><b>${esc(t.title)}</b>${t.due ? `<small class="${late ? 'late' : ''}">${dueText(new Date(t.due))}</small>` : ''}</div>
        <button class="small-btn hov" data-act="focusTask" data-id="${t.id}" title="Focus 25m">${IC.target}</button>
        <button class="small-btn hov" data-act="taskDel" data-id="${t.id}" title="Delete">${IC.x}</button>
      </div>`;
    }).join('') : `<div class="note">No to-dos yet</div>`}</div>`;
}

function dueText(d) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(d);
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return `Tomorrow · ${hhmm(d)}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + hhmm(d);
}

function addTask() {
  const raw = S.taskText.trim();
  if (!raw) return;
  const parsed = S.cfg.todoNl ? TaskParser.parse(raw) : { title: raw, due: null };
  const title = parsed.title || raw;
  const due = S.taskPick?.[1] ?? parsed.due;
  S.tasks.unshift({ id: uid(), title, due, done: false, createdAt: Date.now() });
  S.taskText = ''; S.taskPick = null;
  LS.set('tasks', S.tasks);
  render(true);
}

function todaySubHTML() {
  if (!S.notifLog.length) {
    return `<div class="note"><b>No notifications today</b><span>${S.cfg.notifEnabled ? 'Incoming Windows notifications will appear here.' : 'Turn on Windows notifications in Settings → Notifications.'}</span></div>`;
  }
  return `<div class="scroll">${S.notifLog.map((n) => `
    <div class="row">
      <span class="small-btn">${IC.bell}</span>
      <div class="t"><b>${esc(n.app || 'App')} · ${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}</div>
      <span class="d">${hhmm(new Date(n.at))}</span>
    </div>`).join('')}</div>`;
}

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function calendarSubHTML() {
  const today = dayStart(new Date());
  const sel = S.calSel ?? today.getTime();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const t = d.getTime();
    return `<button class="day ${t === sel ? 'on' : ''} ${i === 0 ? 'today' : ''}" data-act="calDay" data-t="${t}">
      <small>${d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</small><b>${d.getDate()}</b></button>`;
  }).join('');

  const end = sel + 86400000;
  const evs = (S.cal.events || []).filter((e) => {
    const s = new Date(e.start).getTime(), f = s + (e.minutes || 60) * 60000;
    return f > sel && s < end;
  });

  return `
    <div class="cal-head"><b>${new Date(sel).toLocaleDateString('en-US', { month: 'short' })}</b>${days}</div>
    <div class="scroll" style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
      ${evs.length ? evs.map((e) => `<div class="ev"><i style="background:${e.color || '#3b82f6'}"></i><span>${esc(e.title)}</span><em>${e.allDay ? 'All day' : hhmm(new Date(e.start))}</em></div>`).join('')
        : `<div class="note">No events for this day${S.cfg.icalUrl ? '' : ' · Add a Google iCal URL in Settings → Widgets'}</div>`}
    </div>`;
}

function widgetCardHTML(kind) {
  if (kind === 'weather') {
    const w = S.weather;
    return `<div class="card-box" style="display:flex;flex-direction:column;justify-content:space-between">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--dim);font-size:12px">${esc(S.place.name)}</span>${w ? IC[wxIcon(w.code, w.day)] : ''}</div>
      <div><b style="font-size:28px;font-weight:600">${w ? Math.round(w.temp) + '°' : '--'}</b><small style="display:block;color:var(--dim)">${w ? wxLabel(w.code) : 'Loading...'}</small></div>
    </div>`;
  }
  if (kind === 'water') {
    const tot = Water.totalMl(S.water);
    return `<div class="card-box" style="display:flex;flex-direction:column;justify-content:space-between">
      <span style="color:var(--dim);font-size:12px">Water</span>
      <div><b style="font-size:24px;font-weight:600">${tot} ml</b><small style="display:block;color:var(--dim)">Goal ${S.water.goalMl} ml</small></div>
      <button class="chip" data-act="waterDrink">+${S.water.sipMl} ml</button>
    </div>`;
  }
  if (kind === 'pomodoro') {
    return `<div class="card-box" style="display:flex;flex-direction:column;justify-content:space-between">
      <span style="color:var(--dim);font-size:12px">Pomodoro</span>
      <b class="mono" style="font-size:24px;font-weight:600" data-live="pomoTime">${clock(TimerLib.remainingPomodoro(S.pomo) / 1000)}</b>
      <button class="chip" data-act="pomoToggle">${S.pomo.running ? 'Pause' : 'Start'}</button>
    </div>`;
  }
  if (kind === 'system') {
    const s = S.sys;
    return `<div class="card-box" style="display:flex;flex-direction:column;justify-content:space-between">
      <span style="color:var(--dim);font-size:12px">System</span>
      <div><b style="font-size:22px;font-weight:600">${s ? s.cpu + '%' : '--'}</b><small style="display:block;color:var(--dim)">RAM ${s ? s.mem.pct + '%' : '--'}</small></div>
    </div>`;
  }
  // calendar
  const next = (S.cal.events || []).find((e) => new Date(e.start).getTime() >= dayStart(new Date()).getTime());
  return `<div class="card-box" style="display:flex;flex-direction:column;justify-content:space-between">
    <span style="color:var(--dim);font-size:12px">Next event</span>
    <div><b style="font-size:14px;font-weight:500">${next ? esc(next.title) : 'Free day'}</b><small style="display:block;color:var(--dim)">${next ? (next.allDay ? 'All day' : hhmm(new Date(next.start))) : 'No upcoming events'}</small></div>
  </div>`;
}

function widgetsSubHTML() {
  return `<div class="widgets-grid">${widgetCardHTML(S.cfg.widget1)}${widgetCardHTML(S.cfg.widget2)}</div>`;
}

function weatherSubHTML() {
  const w = S.weather;
  if (!w) return `<div class="note">Loading weather for ${esc(S.place.name)}...</div>`;
  return `
    <div class="card-box">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">${IC[wxIcon(w.code, w.day)]}</span>
          <div><b style="font-size:24px;font-weight:600">${Math.round(w.temp)}°C</b><small style="display:block;color:var(--dim)">${wxLabel(w.code)} · Feels like ${Math.round(w.feels)}°</small></div>
        </div>
        <div style="text-align:right"><b style="font-size:13px;font-weight:500">${esc(S.place.name)}</b><small style="display:block;color:var(--dim)">${w.source === 'met.no' ? 'MET Norway' : 'Open-Meteo'}</small></div>
      </div>
      <div class="wx-hours">
        ${(w.hours || []).slice(0, 8).map((h) => `<div class="wx-hour"><span>${hhmm(new Date(h.time), S.place.tz)}</span>${IC[wxIcon(h.code, true)]}<b>${Math.round(h.temp)}°</b><span class="wet">${h.rain || 0}%</span></div>`).join('')}
      </div>
    </div>`;
}

function sparklineSVG(values, color) {
  if (!values.length) return '';
  const w = 180, h = 34;
  const pts = values.map((v, i) => `${values.length === 1 ? w : (i / (values.length - 1)) * w},${h - (Math.max(0, Math.min(100, v)) / 100) * (h - 4) - 2}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${pts}"/></svg>`;
}

function systemSubHTML() {
  const s = S.sys;
  if (!s) return `<div class="note">Sampling system metrics...</div>`;
  return `
    <div class="sys-grid">
      <div class="sys-card"><small>CPU</small><b class="mono">${s.cpu}%</b><span>${s.cores} cores</span></div>
      <div class="sys-card"><small>Memory</small><b class="mono">${s.mem.pct}%</b><span>${fmtBytes(s.mem.used)} / ${fmtBytes(s.mem.total)}</span></div>
      <div class="sys-card"><small>Disk</small><b class="mono">${s.disk ? s.disk.pct + '%' : '—'}</b><span>${s.disk ? fmtBytes(s.disk.free) + ' free' : ''}</span></div>
      <div class="sys-card"><small>Network</small><b class="mono">↓${fmtSpeed(s.net.downBps)}</b><span>↑${fmtSpeed(s.net.upBps)}</span></div>
    </div>
    <div class="sys-spark"><small style="color:var(--dim)">CPU</small>${sparklineSVG(S.sysHist.map((x) => x.cpu), '#22c55e')}<small style="color:var(--dim)">RAM</small>${sparklineSVG(S.sysHist.map((x) => x.mem), '#60a5fa')}</div>`;
}

function toolsSubHTML() {
  const subs = `<div style="display:flex;gap:6px;margin-bottom:8px">
    ${[['color', 'Color'], ['calc', 'Calculator'], ['qr', 'QR'], ['convert', 'Convert']].map(([k, l]) => `<button class="chip ${S.toolsSub === k ? 'on' : ''}" data-act="toolSub" data-m="${k}">${l}</button>`).join('')}
  </div>`;
  if (S.toolsSub === 'color') {
    const info = Tools.colorInfo(S.colorHex);
    return `${subs}<div class="card-box" style="display:flex;gap:14px;align-items:center">
      <div class="swatch" style="background:${info ? info.hex : '#222'}"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px">
          <div class="field" style="flex:1"><input id="colorIn" value="${esc(S.colorHex)}" placeholder="#22c55e"></div>
          ${typeof EyeDropper !== 'undefined' ? `<button class="btn-dark" data-act="pickColor">${IC.eyedropper} Pick</button>` : ''}
        </div>
        ${info ? `<div style="display:flex;gap:6px"><button class="chip" data-act="copyVal" data-v="${info.hex}">${info.hex}</button><button class="chip" data-act="copyVal" data-v="${info.rgb}">${info.rgb}</button><button class="chip" data-act="copyVal" data-v="${info.hsl}">${info.hsl}</button></div>` : ''}
      </div>
    </div>`;
  }
  if (S.toolsSub === 'calc') {
    const res = Tools.calc(S.calcExpr);
    return `${subs}<div class="field" style="margin-bottom:8px">${IC.calc}<input id="calcIn" placeholder="e.g. (125 * 4) + 18%" value="${esc(S.calcExpr)}">${res.ok ? `<button class="chip on" data-act="copyVal" data-v="${res.formatted}">= ${res.formatted}</button>` : ''}</div>
      <div class="scroll">${S.calcHist.map((h) => `<div class="row"><div class="t"><b>${esc(h.expr)}</b></div><button class="chip" data-act="copyVal" data-v="${esc(h.res)}">${esc(h.res)}</button></div>`).join('')}</div>`;
  }
  if (S.toolsSub === 'qr') {
    const txt = S.qrText.trim();
    return `${subs}<div style="display:flex;gap:14px;align-items:center">
      <div id="qrWrap" style="background:#fff;border-radius:12px;padding:6px">${QR.toSVG(txt || 'https://github.com/rama2555/nusa', 96)}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="field">${IC.qr}<input id="qrIn" placeholder="URL or text..." value="${esc(S.qrText)}"></div>
        <button class="btn-dark" data-act="copyQrSvg">${IC.copy} Copy SVG</button>
      </div>
    </div>`;
  }
  const units = S.convCat === 'temperature' ? Tools.UNIT_CATEGORIES.temperature : Object.keys(Tools.UNIT_CATEGORIES[S.convCat]);
  const out = Tools.convertUnit(Number(S.convVal), S.convFrom, S.convTo, S.convCat);
  return `${subs}<div style="display:flex;gap:6px;margin-bottom:8px">${Object.keys(Tools.UNIT_CATEGORIES).map((c) => `<button class="chip ${S.convCat === c ? 'on' : ''}" data-act="convCat" data-c="${c}">${c}</button>`).join('')}</div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="field" style="width:90px"><input id="convIn" value="${esc(S.convVal)}"></div>
      <div class="sel-wrap"><select id="convFrom">${units.map((u) => `<option value="${u}" ${S.convFrom === u ? 'selected' : ''}>${u}</option>`).join('')}</select>${IC.chevron}</div>
      <button class="small-btn" data-act="convSwap">${IC.swap}</button>
      <div class="sel-wrap"><select id="convTo">${units.map((u) => `<option value="${u}" ${S.convTo === u ? 'selected' : ''}>${u}</option>`).join('')}</select>${IC.chevron}</div>
      <button class="chip on" data-act="copyVal" data-v="${out ?? ''}">${out != null ? Number(out.toFixed(4)) : '—'}</button>
    </div>`;
}

/* ================= Two-Pane Settings View (13 Exact Categories) ================= */
const SETTINGS_NAV = [
  ['general', 'General', 'gear', '#6366f1'],
  ['display', 'Display', 'display', '#3b82f6'],
  ['pages', 'Pages', 'pages', '#8b5cf6'],
  ['appearance', 'Appearance', 'palette', '#ec4899'],
  ['music', 'Music and lyrics', 'music', '#f43f5e'],
  ['notifications', 'Notifications', 'bell', '#ef4444'],
  ['widgets', 'Widgets', 'widgets', '#f59e0b'],
  ['todo', 'To-do', 'tasks', '#10b981'],
  ['pomodoro', 'Pomodoro', 'target', '#22c55e'],
  ['water', 'Water', 'water', '#06b6d4'],
  ['shelf', 'Shelf', 'tray', '#0ea5e9'],
  ['hud', 'HUD and popups', 'hud', '#64748b'],
  ['about', 'About', 'info', '#71717a'],
];

const sw = (k, on) => `<button class="toggle ${on ? 'on' : ''}" data-act="cfgToggle" data-k="${k}" role="switch" aria-checked="${!!on}"></button>`;
const card = (title, desc, ctrl) => `<div class="set-card"><div class="set-info"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${ctrl}</div>`;
const selBox = (id, opts, val) => `<div class="sel-wrap"><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${IC.chevron}</div>`;

function settingsHTML() {
  const nav = SETTINGS_NAV.map(([id, label, ic, bg]) => `
    <button class="set-nav ${S.setCat === id ? 'on' : ''}" data-act="setCat" data-c="${id}">
      <span class="squircle" style="background:${bg}">${IC[ic]}</span>
      <span>${label}</span>
    </button>`).join('');

  return `
    <div class="set-shell">
      <div class="set-side">
        <div class="set-side-head">
          <b>Settings</b>
          <button class="ibtn" data-act="tab" data-tab="music" title="Back to notch">${IC.x}</button>
        </div>
        ${nav}
      </div>
      <div class="set-main">${settingsPageHTML(S.setCat)}</div>
    </div>`;
}

function settingsPageHTML(cat) {
  switch (cat) {
    case 'general': {
      const sizeOpts = [['auto', 'Auto'], ['100', '100%'], ['115', '115%'], ['130', '130%'], ['150', '150%']];
      const changed = S.cfg.notchSize !== S.initialNotchSize;
      return `
        <h2 class="set-title">General</h2>
        <div class="set-sec">Startup</div>
        ${card('Start with Windows', 'Launch Nusa automatically when you sign in', `<button class="toggle ${S.loginAtBoot ? 'on' : ''}" data-act="login"></button>`)}
        <div class="set-sec">Notch</div>
        <div class="set-card col">
          <div class="set-card-row">
            <div class="set-info"><b>Size</b><small>Scale the notch and open panel</small></div>
            <div class="seg">${sizeOpts.map(([v, l]) => `<button class="${S.cfg.notchSize === v ? 'on' : ''}" data-act="setNotchSize" data-v="${v}">${l}</button>`).join('')}</div>
          </div>
          <div class="set-note">
            <span>Nusa restarts to apply the new size</span>
            ${changed ? `<button class="btn-dark green" data-act="relaunch">${IC.restart} Restart</button>` : ''}
          </div>
        </div>
        ${card('Minimal notch', 'A smaller pill when nothing is playing', sw('minimalNotch', S.cfg.minimalNotch))}
        ${card('Nusa mascot', 'A little friend that lives in the notch', sw('mascot', S.cfg.mascot))}
        ${card('Date and time', 'The clock and date beside the status ring', sw('dateTime', S.cfg.dateTime))}
        <div class="set-sec">Sounds</div>
        ${card('Reminder sounds', 'Chimes for Pomodoro, To-do and Water', sw('sounds', S.cfg.sounds))}
        <div class="set-sec">Full screen</div>
        ${card('Hide in full screen', 'Games, videos and slides that fill the screen', sw('hideFullscreen', S.cfg.hideFullscreen))}`;
    }
    case 'display':
      return `
        <h2 class="set-title">Display</h2>
        <div class="set-sec">Notch style</div>
        <div class="set-card">
          <div class="set-info"><b>Notch appearance</b><small>Classic docked, floating pill, or frosted glass</small></div>
          <div class="seg">${[['classic', 'Classic'], ['floating', 'Floating'], ['glass', 'Glass']].map(([v, l]) => `<button class="${S.cfg.notchStyle === v ? 'on' : ''}" data-act="setNotchStyle" data-v="${v}">${l}</button>`).join('')}</div>
        </div>
        <div class="set-sec">Indicators</div>
        ${card('Status ring metric', 'Choose what the 15px green status ring tracks', selBox('setMetric', [['auto', 'Auto'], ['battery', 'Battery'], ['water', 'Water goal'], ['pomodoro', 'Pomodoro']], S.cfg.statusMetric))}
        ${card('Mic and camera dots', 'Show privacy dots when an app uses mic or camera', sw('privacyDots', S.cfg.privacyDots))}`;
    case 'pages':
      return `
        <h2 class="set-title">Pages</h2>
        <div class="set-sec">Bottom dock pages</div>
        ${card('Timer', 'Pomodoro, countdown timer, and stopwatch', `<button class="toggle ${S.cfg.pages.timer !== false ? 'on' : ''}" data-act="pageToggle" data-k="timer"></button>`)}
        ${card('Water', 'Daily hydration goal and hourly chart', `<button class="toggle ${S.cfg.pages.water !== false ? 'on' : ''}" data-act="pageToggle" data-k="water"></button>`)}
        ${card('Shelf', 'File shelf, clipboard history, and Phone Drop', `<button class="toggle ${S.cfg.pages.shelf !== false ? 'on' : ''}" data-act="pageToggle" data-k="shelf"></button>`)}
        ${card('List', 'To-do, Today log, Calendar, Widgets, and Weather', `<button class="toggle ${S.cfg.pages.list !== false ? 'on' : ''}" data-act="pageToggle" data-k="list"></button>`)}
        <div class="set-sec">List sub-pages</div>
        ${card('System stats', 'Live CPU, memory, disk, and network monitor', `<button class="toggle ${S.cfg.pages.system ? 'on' : ''}" data-act="pageToggle" data-k="system"></button>`)}
        ${card('Tools', 'Color picker, calculator, QR generator, and converter', `<button class="toggle ${S.cfg.pages.tools !== false ? 'on' : ''}" data-act="pageToggle" data-k="tools"></button>`)}`;
    case 'appearance':
      return `
        <h2 class="set-title">Appearance</h2>
        <div class="set-sec">Theme</div>
        ${card('Color theme', 'Choose Classic, Mono, or a curated palette', selBox('setTheme', BUILTIN_THEMES.map((t) => [t.id, t.name]), S.theme))}`;
    case 'music':
      return `
        <h2 class="set-title">Music and lyrics</h2>
        <div class="set-sec">Lyrics</div>
        ${card('Synced lyrics (LRCLIB)', 'Fetch time-synced lyrics for the playing track', sw('lyricsEnabled', S.cfg.lyricsEnabled))}
        <div class="set-sec">Player</div>
        ${card('Live equalizer', 'Animated bars in the notch while music plays', sw('eqEnabled', S.cfg.eqEnabled))}
        ${card('High-resolution art', 'Use full cover art when available from the player', sw('hiResArt', S.cfg.hiResArt))}`;
    case 'notifications':
      return `
        <h2 class="set-title">Notifications</h2>
        <div class="set-sec">Windows notifications</div>
        ${card('Mirror Windows notifications', 'Off by default; reads Windows notification centre locally', sw('notifEnabled', S.cfg.notifEnabled))}
        ${card('Show body preview', 'Include message text in notch notification popups', sw('notifBody', S.cfg.notifBody))}
        ${S.cfg.notifMuted.length ? card('Muted apps', `${S.cfg.notifMuted.length} app(s) muted`, `<button class="btn-dark" data-act="notifUnmuteAll">Unmute all</button>`) : ''}
        ${card('Today notification log', `${S.notifLog.length} notification(s) recorded today`, `<button class="btn-dark" data-act="clearNotifLog">Clear</button>`)}`;
    case 'widgets':
      return `
        <h2 class="set-title">Widgets</h2>
        <div class="set-sec">Widget slots</div>
        ${card('Slot 1', 'First card in List → Widgets', selBox('setW1', [['weather', 'Weather'], ['calendar', 'Calendar'], ['pomodoro', 'Pomodoro'], ['water', 'Water'], ['system', 'System']], S.cfg.widget1))}
        ${card('Slot 2', 'Second card in List → Widgets', selBox('setW2', [['calendar', 'Calendar'], ['weather', 'Weather'], ['pomodoro', 'Pomodoro'], ['water', 'Water'], ['system', 'System']], S.cfg.widget2))}
        <div class="set-sec">Weather & Calendar</div>
        ${card('Weather location', 'City for MET Norway hourly forecast', selBox('setCity', [['auto', 'Auto'], ...Places.CITIES.map((c) => [c.name, c.name])], S.autoPlace ? 'auto' : S.place.name))}
        <div class="set-card col">
          <div class="set-info"><b>Google Calendar iCal URL</b><small>Private .ics feed URL merged into Calendar</small></div>
          <div style="display:flex;gap:8px">
            <input class="set-input" id="icalUrlIn" placeholder="https://calendar.google.com/calendar/ical/..." value="${esc(S.cfg.icalUrl)}">
            <button class="btn-dark" data-act="syncIcal">Sync</button>
          </div>
        </div>`;
    case 'todo':
      return `
        <h2 class="set-title">To-do</h2>
        <div class="set-sec">Parsing & cleanup</div>
        ${card('Natural language dates', 'Parse "tomorrow 3pm" or "fri 10:00" automatically', sw('todoNl', S.cfg.todoNl))}
        ${card('Completed tasks', `${S.tasks.filter((t) => t.done).length} completed task(s)`, `<button class="btn-dark" data-act="clearDoneTasks">Clear done</button>`)}`;
    case 'pomodoro':
      return `
        <h2 class="set-title">Pomodoro</h2>
        <div class="set-sec">Durations</div>
        <div class="set-card">
          <div class="set-info"><b>Focus duration</b><small>Default session length</small></div>
          <div class="seg">${[5, 15, 25, 50].map((m) => `<button class="${(S.pomo.config?.focusMin || 25) === m ? 'on' : ''}" data-act="pomoPreset" data-m="${m}">${m}m</button>`).join('')}</div>
        </div>
        <div class="set-card">
          <div class="set-info"><b>Short break</b><small>Break between focus sessions</small></div>
          <div class="seg">${[5, 10].map((m) => `<button class="${(S.pomo.config?.shortBreakMin || 5) === m ? 'on' : ''}" data-act="pomoShort" data-m="${m}">${m}m</button>`).join('')}</div>
        </div>
        <div class="set-card">
          <div class="set-info"><b>Long break</b><small>Break after a 4-session round</small></div>
          <div class="seg">${[15, 20].map((m) => `<button class="${(S.pomo.config?.longBreakMin || 15) === m ? 'on' : ''}" data-act="pomoLong" data-m="${m}">${m}m</button>`).join('')}</div>
        </div>`;
    case 'water':
      return `
        <h2 class="set-title">Water</h2>
        <div class="set-sec">Daily target</div>
        ${card('Daily goal (ml)', 'Recommended 2000 ml per day', `<input class="set-num" id="wGoal" type="number" value="${S.water.goalMl}">`)}
        ${card('Sip size (ml)', 'Amount logged per click', `<input class="set-num" id="wSip" type="number" value="${S.water.sipMl}">`)}
        ${card('Bottle size (ml)', 'Tracks when you need a refill', `<input class="set-num" id="wBottle" type="number" value="${S.water.bottleMl}">`)}
        <div class="set-sec">Reminders</div>
        ${card('Water reminders', 'Off by default; gentle notch popup between active hours', `<button class="toggle ${S.water.remind ? 'on' : ''}" data-act="waterRemindToggle"></button>`)}
        ${card('Active hours', 'Start and end hour (0–24)', `<div style="display:flex;gap:6px;align-items:center"><input class="set-num" id="wStart" type="number" min="0" max="23" value="${S.water.startHour}"><span style="color:var(--dim)">to</span><input class="set-num" id="wEnd" type="number" min="1" max="24" value="${S.water.endHour}"></div>`)}
        ${card('Reset today', 'Clear today’s hydration log', `<button class="btn-dark danger" data-act="waterReset">Reset</button>`)}`;
    case 'shelf':
      return `
        <h2 class="set-title">Shelf</h2>
        <div class="set-sec">Clipboard history</div>
        ${card('Record clipboard', 'Off by default; stays local in memory', sw('clipsEnabled', S.cfg.clipsEnabled))}
        ${card('Clipboard mode', 'Choose what to capture when enabled', selBox('setClipMode', [['text', 'Text only'], ['files', 'Files only'], ['all', 'All']], S.cfg.clipsMode))}
        <div class="set-sec">Phone Drop & Storage</div>
        ${card('Phone Drop', 'Temporary local Wi-Fi upload server', S.phoneDrop.active ? `<button class="btn-dark danger" data-act="pdStop">Stop</button>` : `<button class="btn-dark green" data-act="pdStart">Start</button>`)}
        ${card('Clear shelf', 'Remove all staged files and notes', `<button class="btn-dark danger" data-act="trayClear">Clear</button>`)}`;
    case 'hud':
      return `
        <h2 class="set-title">HUD and popups</h2>
        <div class="set-sec">System HUDs</div>
        ${card('Volume HUD', 'Show volume bar when volume changes', sw('hudVolume', S.cfg.hudVolume))}
        ${card('Brightness HUD', 'Show brightness bar when display brightness changes', sw('hudBrightness', S.cfg.hudBrightness))}
        ${card('Caps Lock HUD', 'Show indicator when Caps Lock is toggled', sw('hudCaps', S.cfg.hudCaps))}
        ${card('Keyboard language HUD', 'Show layout code when input language changes', sw('hudLang', S.cfg.hudLang))}
        <div class="set-sec">Device & Notch</div>
        ${card('Battery popups', 'Charging and low-battery alerts', sw('hudBattery', S.cfg.hudBattery))}
        ${card('Bluetooth popups', 'Show connected audio devices', sw('hudBluetooth', S.cfg.hudBluetooth))}
        ${card('Closed-notch system stats', 'Off by default; CPU & network in idle notch', sw('sysNotch', S.cfg.sysNotch))}`;
    case 'about':
      return `
        <h2 class="set-title">About</h2>
        ${card('Nusa', 'Version 1.0.1 · MIT License · Local-first desktop notch', `<span class="chip">v1.0.1</span>`)}
        ${card('Privacy', 'No telemetry, no cloud account, and all watchers are opt-in', `<span style="color:#22c55e;font-size:12px">Local-only</span>`)}
        ${card('Quit Nusa', 'Close the desktop notch application', `<button class="btn-dark danger" data-act="quit">Quit Nusa</button>`)}`;
  }
  return '';
}

/* ================= Weather, Calendar, Shelf Helpers ================= */
function setPlace(p) {
  S.place = p;
  render(true);
  loadWeather();
}

async function locateUser() {
  if (!S.autoPlace || S.locating) return;
  S.locating = true;
  const r = await nusa.locate?.().catch(() => null);
  S.locating = false;
  if (!S.autoPlace || !r) return;
  const last = LS.get('autoPlace', null);
  const near = last && last.tz === r.tz && Math.abs(last.lat - r.lat) < 0.03 && Math.abs(last.lon - r.lon) < 0.03;
  if (!near) LS.set('autoPlace', r);
  const p = Places.place(near ? last : r);
  if (p.name !== S.place.name || p.lat !== S.place.lat || p.lon !== S.place.lon || p.tz !== S.place.tz) setPlace(p);
}

function chime(freqs) {
  if (!S.cfg.sounds) return;
  try {
    const ctx = new AudioContext();
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.16;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.9);
    });
    setTimeout(() => ctx.close(), 2200);
  } catch {}
}

const wxIcon = (c, day) => c === 0 ? (day ? 'sun' : 'moonStar') : c <= 2 ? (day ? 'cloudSun' : 'cloud') : c === 3 ? 'cloud' : c === 45 || c === 48 ? 'fog'
  : c >= 95 ? 'storm' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : 'cloud';
const wxLabel = (c) => c === 0 ? 'Clear' : c === 1 ? 'Mostly clear' : c === 2 ? 'Partly cloudy' : c === 3 ? 'Cloudy' : c === 45 || c === 48 ? 'Fog'
  : c >= 51 && c <= 57 ? 'Drizzle' : [65, 66, 67, 82].includes(c) ? 'Heavy rain' : (c >= 61 && c <= 81) ? 'Rain' : c >= 95 ? 'Thunderstorm' : 'Cloudy';
const isRain = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
let lastRain = 0;

async function loadWeather() {
  try {
    const p = S.place;
    let w = null;
    if (typeof nusa.weather === 'function') {
      w = await nusa.weather(p.lat, p.lon).catch(() => null);
    }
    if (!w) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=8&timeformat=unixtime`;
      const d = await (await fetch(url)).json();
      const h = d.hourly;
      w = {
        temp: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code, day: d.current.is_day === 1,
        hours: h.time.map((t, i) => ({ time: t * 1000, temp: h.temperature_2m[i], rain: h.precipitation_probability[i] ?? 0, code: h.weather_code[i] })),
        source: 'open-meteo',
      };
    }
    S.weather = w;
    const now = Date.now();
    const wet = S.weather.hours?.find((x) => x.time > now - 1800000 && x.time < now + 7200000 && x.rain >= 60);
    if (wet && now - lastRain > 3 * 3600000 && !isRain(S.weather.code) && S.focus?.phase !== 'focus') {
      lastRain = now;
      showFlash({ kind: 'rain', time: hhmm(new Date(wet.time), S.place.tz), chance: wet.rain }, 8);
    }
    render();
  } catch {}
}

async function loadCalendar() {
  const from = dayStart(new Date());
  let events = [];
  try {
    const r = await nusa.calendar?.(from.toISOString(), 7);
    if (r?.events) events = events.concat(r.events);
  } catch {}
  if (S.cfg.icalUrl && typeof nusa.ical === 'function' && typeof ICal !== 'undefined') {
    try {
      const txt = await nusa.ical(S.cfg.icalUrl);
      if (txt) {
        const parsed = ICal.parseICS(txt, from.getTime(), from.getTime() + 7 * 86400000);
        events = events.concat(parsed);
      }
    } catch {}
  }
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  S.cal = { status: 'ready', events, at: Date.now() };
  if (S.expanded && S.tab === 'list' && S.listSub === 'calendar') render(true);
}

function syncShelfMain() { nusa.shelfSync?.(S.shelf); }
async function addToShelf(p) {
  if (!p || S.shelf.includes(p)) return;
  S.shelf.push(p); LS.set('shelf', S.shelf); syncShelfMain();
  if (!S.files[p]) S.files[p] = await nusa.fileInfo?.(p).catch(() => ({})) || {};
  render(true);
}
function removeFromShelf(p) {
  S.shelf = S.shelf.filter((x) => x !== p);
  S.shelfSel = S.shelfSel.filter((x) => x !== p);
  LS.set('shelf', S.shelf); syncShelfMain(); render(true);
}
async function loadShelf() {
  syncShelfMain();
  for (const p of S.shelf) {
    if (!S.files[p]) S.files[p] = await nusa.fileInfo?.(p).catch(() => ({})) || {};
  }
}

/* ================= Focus, Timers & Checks ================= */
const todayKey = () => 'focus-' + new Date().toISOString().slice(0, 10);
const focusToday = () => LS.get(todayKey(), 0);
let focusDone = null, timerDone = null;

function startFocus(minutes = 25, task = null) {
  clearTimeout(focusDone);
  S.flash = null;
  S.focus = { phase: 'focus', end: Date.now() + minutes * 60000, total: minutes * 60000, title: task?.title, taskId: task?.id };
  focusDone = setTimeout(finishFocus, minutes * 60000);
  render(true);
}
function startBreak(minutes = 5) {
  clearTimeout(focusDone);
  S.flash = null;
  S.focus = { phase: 'rest', end: Date.now() + minutes * 60000, total: minutes * 60000 };
  focusDone = setTimeout(finishFocus, minutes * 60000);
  render(true);
}
function finishFocus() {
  const f = S.focus;
  if (!f) return;
  S.focus = null;
  if (f.phase === 'focus') LS.set(todayKey(), focusToday() + 1);
  chime(f.phase === 'focus' ? [523, 659, 784] : [784, 659]);
  if (!S.pinned) S.expanded = false;
  showFlash({ kind: 'focusEnd', rest: f.phase === 'rest', title: f.title }, 45);
}

function checkTimers() {
  const now = Date.now();
  if (S.cd.running && TimerLib.remainingCountdown(S.cd, now) <= 0) {
    S.cd = TimerLib.pauseCountdown(S.cd, now);
    S.cd = { ...S.cd, remainingMs: 0 };
    chime([880, 660, 880]);
    if (!S.expanded) showFlash({ kind: 'timerDone', title: 'Countdown finished' }, 15);
    else render(true);
  }
  if (S.pomo.running && TimerLib.remainingPomodoro(S.pomo, now) <= 0) {
    const wasFocus = S.pomo.phase === 'focus';
    S.pomo = TimerLib.advancePomodoro(S.pomo);
    syncPomoFocus();
    chime(wasFocus ? [523, 659, 784] : [784, 659]);
    if (!S.expanded) showFlash({ kind: 'focusEnd', rest: !wasFocus, title: 'Pomodoro' }, 45);
    else render(true);
  }
}

function checkWater() {
  const today = localDateStr();
  if (S.water.date !== today) {
    S.water = Water.resetDay(S.water, today);
    saveWater();
  }
  if (Water.nextReminderDue(S.water, Date.now()) && !S.expanded && S.focus?.phase !== 'focus') {
    S.water = { ...S.water, lastRemindedAt: Date.now() };
    saveWater();
    chime([587, 784]);
    showFlash({ kind: 'waterRemind' }, 25);
  }
}

function checkTasks() {
  const now = Date.now();
  for (const t of S.tasks) {
    if (!t.done && !t.notified && t.due && t.due <= now && now - t.due < 3600000) {
      t.notified = true;
      LS.set('tasks', S.tasks);
      chime([659, 880]);
      if (!S.expanded) showFlash({ kind: 'task', id: t.id, title: t.title, time: hhmm(new Date(t.due)) }, 30);
      break;
    }
  }
}

/* ================= Live 1s Updates ================= */
const LIVE = {
  closedDt: () => fmtDateTime(),
  sysClosed: () => S.sys ? `${S.sys.cpu}% · ↓${fmtSpeed(S.sys.net.downBps)}` : '',
  timerLeft: () => S.timer ? clock((S.timer.end - Date.now()) / 1000 + 0.999) : '',
  focusLeft: () => S.focus ? clock((S.focus.end - Date.now()) / 1000 + 0.999) : '',
  mbar: () => {
    const m = S.media;
    if (!m?.duration) return '<i style="width:0%"></i>';
    const pct = Math.min(100, Math.max(0, (S.scrub ?? mediaPos()) / m.duration * 100));
    return `<i style="width:${pct}%"></i>`;
  },
  mtime: () => {
    const m = S.media;
    if (!m?.duration) return '<span>0:00</span><span>-0:00</span>';
    const cur = Math.min(S.scrub ?? mediaPos(), m.duration);
    const rem = Math.max(0, m.duration - cur);
    return `<span>${clock(cur)}</span><span>-${clock(rem)}</span>`;
  },
  volLevel: () => S.audio ? `<i style="width:${(S.audio.muted ? 0 : S.audio.vol) * 100}%"></i>` : '<i style="width:60%"></i>',
  volFlash: volFlashHTML,
  cdTime: () => clock(TimerLib.remainingCountdown(S.cd) / 1000 + (S.cd.running ? 0.999 : 0)),
  swTime: () => {
    const ms = TimerLib.elapsedStopwatch(S.sw);
    return `${clock(ms / 1000)}.${pad(Math.floor((ms % 1000) / 10))}`;
  },
  pomoTime: () => clock(TimerLib.remainingPomodoro(S.pomo) / 1000 + (S.pomo.running ? 0.999 : 0)),
};

function live() {
  for (const el of document.querySelectorAll('[data-live]')) {
    const html = LIVE[el.dataset.live]?.() ?? '';
    if (el._last !== html) { el._last = html; el.innerHTML = html; }
  }
  updateActiveLyric();
}

/* ================= IPC Events ================= */
let closeTimer = null;
nusa.on('yield', (on) => {
  S.yielded = on;
  if (on) { S.hover = false; if (!S.pinned) S.expanded = false; }
  render();
});

nusa.on('fullscreen', (on) => {
  S.fullscreen = !!on;
  if (on && S.cfg.hideFullscreen && !S.pinned) { S.hover = false; S.expanded = false; }
  render();
});

nusa.on('hover', (over) => {
  S.hover = over;
  clearTimeout(closeTimer);
  if (!over && S.expanded && !S.pinned) closeTimer = setTimeout(() => { S.expanded = false; render(); }, 250);
  render();
});

nusa.on('open-panel', () => { S.expanded = true; nusa.focus(); render(true); });
window.addEventListener('blur', () => { if (S.expanded && !S.pinned) { S.expanded = false; render(); } });

const mediaSig = (x) => JSON.stringify(x && [x.title, x.artist, x.album, x.art, x.hiArt, x.playing, x.canSeek, x.noTimeline, Math.round(x.duration || 0)]);
nusa.on('media', (st) => {
  const before = S.media;
  S.media = st;
  if (st?.art && st.art !== before?.art) computeTint(st.art);
  if (!st?.art) S.tint = null;
  const newTrack = before?.title && st?.title && st.title !== before.title && st.playing;
  const changed = mediaSig(before) !== mediaSig(st);
  if (changed && S.lyricsOpen) ensureLyrics();
  if (newTrack && !S.expanded && S.focus?.phase !== 'focus') showFlash({ kind: 'track' }, 2.6);
  else if (changed && S.expanded && S.tab === 'music') render(true);
  else render(changed);
});

nusa.on('clip', (raw) => {
  if (!S.cfg.clipsEnabled) return;
  const item = typeof raw === 'string' ? { type: 'text', text: raw } : raw;
  if (!item) return;
  const sig = item.type === 'text' ? 't:' + item.text : item.type === 'image' ? 'i:' + item.hash : 'f:' + (item.files || []).map((f) => f.path).join('|');
  if (item.type === 'text' && !item.text?.trim()) return;
  const entry = { ...item, id: uid(), sig };
  if (S.clips[0]?.sig === sig) return;
  S.clips = [entry, ...S.clips.filter((c) => c.sig !== sig)].slice(0, 30);
  if (S.expanded && S.tab === 'shelf' && S.shelfSub === 'clips') render(true);
});

let volDragging = false;
nusa.on('audio', (a) => {
  const before = S.audio;
  if (volDragging && a) a = { ...a, vol: S.audio?.vol ?? a.vol };
  S.audio = a;
  if (!a) return render(lastKey.startsWith('x:'));
  const changed = before && before.id === a.id && (Math.abs(before.vol - a.vol) > 0.004 || before.muted !== a.muted);
  if (changed && S.cfg.hudVolume && !S.expanded && !['task', 'focusEnd', 'device', 'phoneDrop', 'waterRemind', 'timerDone', 'notif'].includes(S.flash?.kind)) {
    showFlash({ kind: 'volume', level: a.vol, muted: a.muted }, 1.6);
  }
  if (S.expanded && (!before || before.muted !== a.muted || before.id !== a.id)) render(true);
  else live();
});

nusa.on('hud', (h) => {
  if (!h || S.expanded) return;
  if (h.kind === 'brightness' && S.cfg.hudBrightness) showFlash({ kind: 'brightness', level: h.level }, 1.6);
  else if (h.kind === 'caps' && S.cfg.hudCaps) showFlash({ kind: 'caps', on: h.on }, 1.6);
  else if (h.kind === 'lang' && S.cfg.hudLang) showFlash({ kind: 'lang', lang: h.lang }, 1.6);
});

nusa.on('device', (d) => {
  if (S.expanded || !S.cfg.hudBluetooth) return;
  showFlash({ kind: 'device', name: d.name.replace(/^.*\((.*)\)\s*$/, '$1') || d.name, detail: d.detail }, 4);
});

nusa.on('system', (snap) => {
  S.sys = snap;
  if (snap) {
    S.sysHist.push({ cpu: snap.cpu, mem: snap.mem.pct });
    if (S.sysHist.length > 60) S.sysHist.shift();
  }
  if (S.expanded && S.tab === 'list' && S.listSub === 'system') render(true);
  else live();
});

nusa.on('privacy', (st) => {
  const prev = S.privacy;
  S.privacy = st || { mic: { active: false, app: null }, cam: { active: false, app: null } };
  if (S.cfg.privacyDots && !S.expanded) {
    if (!prev.cam?.active && S.privacy.cam?.active) showFlash({ kind: 'privacy', kindName: 'Camera', app: S.privacy.cam.app }, 3.5);
    else if (!prev.mic?.active && S.privacy.mic?.active) showFlash({ kind: 'privacy', kindName: 'Microphone', app: S.privacy.mic.app }, 3.5);
  }
  render(true);
});

nusa.on('notif', (n) => {
  if (!S.cfg.notifEnabled || !n) return;
  if (n.error === 'denied') {
    S.cfg.notifEnabled = false; saveCfg();
    showFlash({ kind: 'notif', app: 'Nusa', title: 'Notification access denied', body: 'Enable in Windows Settings' }, 5);
    return;
  }
  if (S.cfg.notifMuted.includes(n.app)) return;
  S.notifLog = [{ ...n, at: Date.now() }, ...S.notifLog].slice(0, 40);
  LS.set('notifLog', S.notifLog);
  if (!S.expanded && S.focus?.phase !== 'focus') showFlash({ kind: 'notif', app: n.app, title: n.title, body: n.body }, 5);
  else if (S.expanded && S.tab === 'list' && S.listSub === 'today') render(true);
});

nusa.on('phonedrop-state', (st) => {
  S.phoneDrop = st?.active ? { active: true, url: st.url } : { active: false, url: null };
  if (S.expanded && S.tab === 'shelf' && S.shelfSub === 'phonedrop') render(true);
});
nusa.on('phonedrop-request', (req) => {
  if (!req) return;
  const names = (req.files || []).map((f) => f.name).slice(0, 3).join(', ');
  if (!S.pinned) S.expanded = false;
  showFlash({ kind: 'phoneDrop', reqId: req.id, device: req.device, count: (req.files || []).length, names }, 45);
});
nusa.on('phonedrop-files', async (paths) => {
  for (const p of (paths || [])) await addToShelf(p);
});

/* ================= Seek, Volume & Drag-and-Drop ================= */
function dragOn(el, onMove, onEnd) {
  const move = (e) => {
    const r = el.getBoundingClientRect();
    onMove(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

document.addEventListener('pointerdown', (e) => {
  const seek = e.target.closest('#seekBar');
  if (seek && seekable(S.media)) {
    seek.classList.add('drag');
    dragOn(seek, (f) => { S.scrub = f * S.media.duration; live(); }, () => {
      seek.classList.remove('drag');
      if (S.scrub != null) { nusa.media('seek ' + S.scrub); S.media = { ...S.media, position: S.scrub, at: Date.now() }; }
      S.scrub = null;
    });
    return;
  }
  const vol = e.target.closest('#volBar');
  if (vol && S.audio) {
    volDragging = true;
    const set = (f) => { S.audio = { ...S.audio, vol: f, muted: false }; nusa.volume(f); live(); };
    const r = vol.getBoundingClientRect();
    set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    dragOn(vol, set, () => { volDragging = false; });
  }
});

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  S.dropping = true;
  if (!S.expanded || S.tab !== 'shelf' || S.shelfSub !== 'files') { S.expanded = true; S.tab = 'shelf'; S.shelfSub = 'files'; render(true); }
  else $('#drop')?.classList.add('on');
});
document.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) { S.dropping = false; $('#drop')?.classList.remove('on'); } });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); S.dropping = false; $('#drop')?.classList.remove('on');
  for (const f of e.dataTransfer.files) addToShelf(nusa.filePath(f));
});
document.addEventListener('dragstart', (e) => {
  const it = e.target.closest('.sitem[data-path]');
  if (it) { e.preventDefault(); nusa.fileDrag(it.dataset.path); return; }
  const clip = e.target.closest('.card[data-id]');
  if (clip) { const c = findClip(clip.dataset.id); if (c) { e.preventDefault(); nusa.clipDrag(c); } }
});

function computeTint(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (n) { S.tint = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`; render(); }
    } catch {}
  };
  img.src = src;
}

/* ================= Inputs, Changes & Clicks ================= */
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'taskIn') {
    S.taskText = e.target.value;
    const due = S.cfg.todoNl ? TaskParser.parse(S.taskText).due : null;
    const prev = $('#taskPreview');
    if (prev) prev.innerHTML = S.taskText && due ? `<span class="chip on">${IC.bell}${dueText(new Date(due))}</span>` : '';
  } else if (id === 'clipQ') { S.clipQuery = e.target.value; render(true); $('#clipQ')?.focus(); }
  else if (id === 'clipSnip') { S.clipSnippet = e.target.value; }
  else if (id === 'icalUrlIn') { S.cfg.icalUrl = e.target.value.trim(); saveCfg(); }
  else if (id === 'colorIn') { S.colorHex = e.target.value; if (Tools.colorInfo(S.colorHex)) render(true); $('#colorIn')?.focus(); }
  else if (id === 'calcIn') { S.calcExpr = e.target.value; render(true); const el = $('#calcIn'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  else if (id === 'qrIn') { S.qrText = e.target.value; render(true); const el = $('#qrIn'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  else if (id === 'convIn') { S.convVal = e.target.value; render(true); const el = $('#convIn'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
});

document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'setTheme') { S.theme = e.target.value; LS.set('theme', S.theme); applyTheme(); render(true); }
  else if (id === 'setCity') {
    const v = e.target.value;
    if (v === 'auto') { S.autoPlace = true; LS.set('city', 'auto'); locateUser(); }
    else { S.autoPlace = false; LS.set('city', v); setPlace(Places.city(v)); }
  }
  else if (id === 'setMetric') { S.cfg.statusMetric = e.target.value; saveCfg(); render(true); }
  else if (id === 'setClipMode') { S.cfg.clipsMode = e.target.value; saveCfg(); render(true); }
  else if (id === 'setW1') { S.cfg.widget1 = e.target.value; saveCfg(); render(true); }
  else if (id === 'setW2') { S.cfg.widget2 = e.target.value; saveCfg(); render(true); }
  else if (id === 'convFrom') { S.convFrom = e.target.value; render(true); }
  else if (id === 'convTo') { S.convTo = e.target.value; render(true); }
  else if (['wGoal', 'wSip', 'wBottle', 'wStart', 'wEnd'].includes(id)) {
    const key = { wGoal: 'goalMl', wSip: 'sipMl', wBottle: 'bottleMl', wStart: 'startHour', wEnd: 'endHour' }[id];
    const v = id === 'wStart' || id === 'wEnd' ? Math.min(24, Math.max(0, Number(e.target.value) || 0)) : Math.max(1, Number(e.target.value) || 0);
    S.water = { ...S.water, [key]: v }; saveWater(); render(true);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.target.id === 'taskIn') addTask();
    else if (e.target.id === 'clipSnip' && S.clipSnippet.trim()) {
      const entry = { id: uid(), type: 'text', text: S.clipSnippet.trim(), sig: 't:' + S.clipSnippet.trim() };
      S.pinnedClips = [entry, ...S.pinnedClips]; S.clipSnippet = ''; LS.set('pinnedClips', S.pinnedClips); render(true);
    } else if (e.target.id === 'calcIn') {
      const res = Tools.calc(S.calcExpr);
      if (res.ok) { S.calcHist = [{ expr: S.calcExpr, res: res.formatted }, ...S.calcHist].slice(0, 12); LS.set('calcHist', S.calcHist); render(true); }
    }
  }
  if (e.key === 'Escape' && S.expanded) { S.expanded = false; render(); }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (!S.expanded && e.target.closest('#island')) {
      if (S.flash?.kind === 'task') { S.flash = null; S.tab = 'list'; S.listSub = 'todo'; }
      else if (S.flash?.kind === 'notif') { S.flash = null; nusa.notifSettings?.(); return render(); }
      S.expanded = true; nusa.focus(); render(true);
    }
    return;
  }
  const d = el.dataset;
  const task = () => S.tasks.find((t) => t.id === d.id);
  const A = {
    tab: async () => {
      if (d.tab === 'settings') S.loginAtBoot = await nusa.loginItem().catch(() => false);
      S.tab = d.tab; LS.set('tab', S.tab); render(true);
    },
    pin: () => { S.pinned = !S.pinned; render(true); },
    setCat: () => { S.setCat = d.c; render(true); },
    tmSub: () => { S.timerSub = d.m; render(true); },
    shSub: () => { S.shelfSub = d.m; render(true); },
    lsSub: () => { S.listSub = d.m; render(true); },
    toggleLyrics: () => { S.lyricsOpen = !S.lyricsOpen; render(true); if (S.lyricsOpen) ensureLyrics(); },
    seekLine: () => { const t = Number(d.t); if (isFinite(t)) { nusa.media('seek ' + t); if (S.media) S.media = { ...S.media, position: t, at: Date.now() }; } },
    mprev: () => nusa.media('prev'),
    mnext: () => nusa.media('next'),
    mtoggle: () => nusa.media('toggle'),
    openSource: () => { const m = S.media; if (m) nusa.openSource({ pid: m.pid, path: m.path, source: m.source }); },
    muteToggle: () => { if (S.audio) { nusa.mute(!S.audio.muted); S.audio = { ...S.audio, muted: !S.audio.muted }; render(true); } },
    // Settings actions
    login: async () => { S.loginAtBoot = await nusa.loginItem(!S.loginAtBoot); render(true); },
    quit: () => window.close(),
    relaunch: () => nusa.relaunch?.(),
    cfgToggle: () => { S.cfg[d.k] = !S.cfg[d.k]; saveCfg(); render(true); },
    pageToggle: () => { S.cfg.pages[d.k] = !(S.cfg.pages[d.k] !== false); saveCfg(); render(true); },
    setNotchSize: () => { S.cfg.notchSize = d.v; saveCfg(); render(true); },
    setNotchStyle: () => { S.cfg.notchStyle = d.v; saveCfg(); render(true); },
    notifUnmuteAll: () => { S.cfg.notifMuted = []; saveCfg(); render(true); },
    notifMuteApp: () => { e.stopPropagation(); if (d.app && !S.cfg.notifMuted.includes(d.app)) { S.cfg.notifMuted.push(d.app); saveCfg(); } S.flash = null; render(); },
    clearNotifLog: () => { S.notifLog = []; LS.set('notifLog', []); render(true); },
    syncIcal: () => { loadCalendar(); },
    clearDoneTasks: () => { S.tasks = S.tasks.filter((t) => !t.done); LS.set('tasks', S.tasks); render(true); },
    // Calendar & Tasks
    calDay: () => { S.calSel = +d.t; render(true); },
    taskToggle: () => { const t = task(); if (t) { t.done = !t.done; LS.set('tasks', S.tasks); render(true); } },
    taskDel: () => { S.tasks = S.tasks.filter((t) => t.id !== d.id); LS.set('tasks', S.tasks); render(true); },
    taskDone: () => { const t = task(); if (t) { t.done = true; LS.set('tasks', S.tasks); } S.flash = null; render(); },
    taskSnooze: () => { const t = task(); if (t) { t.due = Date.now() + 600000; t.notified = false; LS.set('tasks', S.tasks); } S.flash = null; render(); },
    focus: () => startFocus(), break: () => startBreak(),
    focusTask: () => startFocus(25, task()),
    dismiss: () => { e.stopPropagation(); S.flash = null; render(); },
    // Shelf & Clips & Phone Drop
    fileOpen: () => nusa.fileOpen(S.shelf[+d.i]),
    fileRemove: () => { e.stopPropagation(); removeFromShelf(S.shelf[+d.i]); },
    fileSel: () => { e.stopPropagation(); const p = d.path; S.shelfSel = S.shelfSel.includes(p) ? S.shelfSel.filter((x) => x !== p) : [...S.shelfSel, p]; render(true); },
    removeSelected: () => { S.shelf = S.shelf.filter((p) => !S.shelfSel.includes(p)); S.shelfSel = []; LS.set('shelf', S.shelf); syncShelfMain(); render(true); },
    fileShow: () => nusa.fileShow(S.shelf[S.shelf.length - 1]),
    trayClear: () => { S.shelf = []; S.shelfNotes = []; S.shelfSel = []; LS.set('shelf', []); LS.set('shelfNotes', []); syncShelfMain(); render(true); },
    noteCopy: () => { const n = S.shelfNotes[+d.ni]; if (n) nusa.copy(n.text); },
    noteRemove: () => { e.stopPropagation(); S.shelfNotes.splice(+d.ni, 1); LS.set('shelfNotes', S.shelfNotes); render(true); },
    clipsToggle: () => { S.cfg.clipsEnabled = !S.cfg.clipsEnabled; saveCfg(); render(true); },
    addSnippet: () => { if (!S.clipSnippet.trim()) return; const entry = { id: uid(), type: 'text', text: S.clipSnippet.trim(), sig: 't:' + S.clipSnippet.trim() }; S.pinnedClips = [entry, ...S.pinnedClips]; S.clipSnippet = ''; LS.set('pinnedClips', S.pinnedClips); render(true); },
    clipCopy: () => { const c = findClip(d.id); if (!c) return; nusa.clipCopy(c); S.copied = c.id; render(true); setTimeout(() => { S.copied = null; render(true); }, 1200); },
    clipPin: () => { e.stopPropagation(); const i = S.pinnedClips.findIndex((c) => c.id === d.id); if (i >= 0) S.pinnedClips.splice(i, 1); else { const c = S.clips.find((x) => x.id === d.id); if (c) S.pinnedClips = [c, ...S.pinnedClips]; } LS.set('pinnedClips', S.pinnedClips); render(true); },
    clipDel: () => { e.stopPropagation(); S.pinnedClips = S.pinnedClips.filter((c) => c.id !== d.id); S.clips = S.clips.filter((c) => c.id !== d.id); LS.set('pinnedClips', S.pinnedClips); render(true); },
    pdStart: async () => { const info = await nusa.phonedropStart(); if (info?.url) { S.phoneDrop = { active: true, url: info.url }; render(true); } },
    pdStop: () => { nusa.phonedropStop(); S.phoneDrop = { active: false, url: null }; render(true); },
    pdCopyUrl: () => { if (S.phoneDrop.url) nusa.copy(S.phoneDrop.url); },
    pdApprove: async () => { e.stopPropagation(); await nusa.phonedropApprove(d.id); S.flash = null; render(); },
    pdDecline: () => { e.stopPropagation(); nusa.phonedropDecline(d.id); S.flash = null; render(); },
    // Water
    waterDrink: () => { const r = Water.logSip(S.water, S.water.sipMl); S.water = r.state; S.waterRefill = r.refillNeeded; saveWater(); render(true); },
    waterDrinkFlash: () => { const r = Water.logSip(S.water, S.water.sipMl); S.water = r.state; S.waterRefill = r.refillNeeded; saveWater(); S.flash = null; render(); },
    waterSnooze: () => { S.water = Water.snooze(S.water, Date.now(), 15); saveWater(); S.flash = null; render(); },
    waterUndo: () => { S.water = Water.undoSip(S.water); S.waterRefill = false; saveWater(); render(true); },
    waterRemindToggle: () => { S.water = { ...S.water, remind: !S.water.remind }; saveWater(); render(true); },
    waterReset: () => { S.water = Water.resetDay(S.water, localDateStr()); S.waterRefill = false; saveWater(); render(true); },
    // Timer / Stopwatch / Pomodoro
    cdToggle: () => { S.cd = S.cd.running ? TimerLib.pauseCountdown(S.cd) : TimerLib.startCountdown(S.cd); render(true); },
    cdAdj: () => { S.cd = TimerLib.adjustCountdown(S.cd, +d.d); render(true); },
    cdPreset: () => { S.cd = TimerLib.createCountdown(+d.m); render(true); },
    cdReset: () => { S.cd = TimerLib.createCountdown(Math.round(S.cd.durationMs / 60000)); render(true); },
    cdRestart: () => { S.cd = TimerLib.startCountdown(TimerLib.createCountdown(Math.round(S.cd.durationMs / 60000))); S.flash = null; render(); },
    swToggle: () => { S.sw = S.sw.running ? TimerLib.pauseStopwatch(S.sw) : TimerLib.startStopwatch(S.sw); render(true); },
    swLap: () => { S.sw = TimerLib.lapStopwatch(S.sw); render(true); },
    swReset: () => { S.sw = TimerLib.resetStopwatch(); render(true); },
    pomoToggle: () => { S.pomo = S.pomo.running ? TimerLib.pausePomodoro(S.pomo) : TimerLib.startPomodoro(S.pomo); syncPomoFocus(); render(true); },
    pomoSkip: () => { S.pomo = TimerLib.advancePomodoro(S.pomo); syncPomoFocus(); render(true); },
    pomoReset: () => { S.pomo = TimerLib.resetPomodoro(S.pomo); syncPomoFocus(); render(true); },
    pomoPreset: () => {
      const cfg = { ...(S.pomo.config || {}), focusMin: +d.m };
      LS.set('pomoCfg', cfg);
      S.pomo = TimerLib.createPomodoro(cfg); syncPomoFocus(); render(true);
    },
    pomoShort: () => {
      const cfg = { ...(S.pomo.config || {}), shortBreakMin: +d.m };
      LS.set('pomoCfg', cfg);
      S.pomo = TimerLib.createPomodoro(cfg); render(true);
    },
    pomoLong: () => {
      const cfg = { ...(S.pomo.config || {}), longBreakMin: +d.m };
      LS.set('pomoCfg', cfg);
      S.pomo = TimerLib.createPomodoro(cfg); render(true);
    },
    // Tools
    toolSub: () => { S.toolsSub = d.m; render(true); },
    copyVal: () => { if (d.v) nusa.copy(d.v); },
    pickColor: async () => {
      try {
        const res = await new EyeDropper().open();
        if (res?.sRGBHex) { S.colorHex = res.sRGBHex; render(true); }
      } catch {}
    },
    copyQrSvg: () => { const svg = $('#qrWrap')?.innerHTML; if (svg) nusa.copy(svg); },
    convCat: () => { S.convCat = d.c; const u = S.convCat === 'temperature' ? Tools.UNIT_CATEGORIES.temperature : Object.keys(Tools.UNIT_CATEGORIES[S.convCat]); S.convFrom = u[0]; S.convTo = u[1] || u[0]; render(true); },
    convSwap: () => { const tmp = S.convFrom; S.convFrom = S.convTo; S.convTo = tmp; render(true); },
  };
  A[d.act]?.();
});

/* ================= Startup ================= */
navigator.getBattery?.().then((b) => {
  if (b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity) return;
  let warned = false;
  const read = () => {
    S.battery = { level: Math.round(b.level * 100), charging: b.charging, toFull: isFinite(b.chargingTime) ? Math.round(b.chargingTime / 60) : null };
    if (b.charging || S.battery.level > 20) warned = false;
    else if (!warned) { warned = true; if (!S.expanded && S.cfg.hudBattery) showFlash({ kind: 'low', percent: S.battery.level }, 4); }
  };
  read();
  b.addEventListener('chargingchange', () => {
    read();
    if (S.expanded || !S.cfg.hudBattery) return render(true);
    showFlash(b.charging ? { kind: 'charging', percent: S.battery.level } : { kind: 'unplug', percent: S.battery.level }, b.charging ? 3.5 : 2.4);
  });
  b.addEventListener('levelchange', () => { read(); render(); });
  b.addEventListener('chargingtimechange', read);
});

applyTheme();
syncWatchers();
loadShelf();
loadCalendar();
setInterval(loadCalendar, 5 * 60000);
setInterval(() => { live(); checkTimers(); }, 1000);
setInterval(checkWater, 60000);
setTimeout(() => { checkTasks(); setInterval(checkTasks, 10000); }, 3000);
setInterval(loadWeather, 15 * 60000);
loadWeather();
locateUser();
setInterval(locateUser, 30 * 60000);
render(true);

window.__nusa = { S, render, showFlash, startFocus, applyTheme, BUILTIN_THEMES };
