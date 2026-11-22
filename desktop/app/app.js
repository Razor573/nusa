// Nusa for Windows & Linux.
'use strict';

const CANVAS_W = 840;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem('nusa.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('nusa.' + k, JSON.stringify(v)); } catch {} },
};
const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => { const s = Math.max(0, Math.floor(sec)); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const hhmm = (d, tz) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }).format(d);
const mins = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };
const isWin = window.nusa?.platform === 'win32';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtBytes = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`;
const fmtSpeed = (bps) => bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : bps >= 1e3 ? `${(bps / 1e3).toFixed(0)} KB/s` : `${bps} B/s`;

/* ================= Theme ================= */
let appliedVars = [];
const shade = (a) => `rgba(255,255,255,${a})`;
const T = (id, name, c) => ({ id, name, colors: { dim: shade(.62), faint: shade(.42), line: shade(.12), chip: shade(.09), chip2: shade(.16), ...c } });
const BUILTIN_THEMES = [
  { id: 'classic', name: 'Classic', colors: {} },
  T('midnight', 'Midnight', { bg: '#0a0f1c', text: '#eaeefb', mint: '#6ea8fe', green: '#4de2c0', rest: '#a5b4fc', late: '#fb7185' }),
  T('tokyo', 'Tokyo Night', { bg: '#1a1b26', text: '#c0caf5', mint: '#7aa2f7', green: '#9ece6a', rest: '#e0af68', late: '#f7768e' }),
  T('nord', 'Nord', { bg: '#2e3440', text: '#eceff4', mint: '#88c0d0', green: '#a3be8c', rest: '#ebcb8b', late: '#bf616a' }),
  T('dracula', 'Dracula', { bg: '#282a36', text: '#f8f8f2', mint: '#bd93f9', green: '#50fa7b', rest: '#ffb86c', late: '#ff5555' }),
  T('gruvbox', 'Gruvbox', { bg: '#1d2021', text: '#ebdbb2', mint: '#8ec07c', green: '#b8bb26', rest: '#fabd2f', late: '#fb4934' }),
  T('rose', 'Rosé Pine', { bg: '#191724', text: '#e0def4', mint: '#c4a7e7', green: '#9ccfd8', rest: '#f6c177', late: '#eb6f92' }),
  T('sunset', 'Sunset', { bg: '#1a0f14', text: '#ffe9d6', mint: '#ff9e64', green: '#9ece6a', rest: '#ffc777', late: '#ff5c8a' }),
  T('forest', 'Forest', { bg: '#0b120d', text: '#e6f2e8', mint: '#7dd48a', green: '#4ade80', rest: '#d9c46a', late: '#ff7a6b' }),
  T('ocean', 'Ocean', { bg: '#04141c', text: '#dff6f5', mint: '#38e0c4', green: '#5eead4', rest: '#7dd3fc', late: '#fb7185' }),
  T('mono', 'Mono', { bg: '#0a0a0b', text: '#f5f5f5', mint: '#e5e5e5', green: '#c4c4c4', rest: '#a3a3a3', late: '#ff6b6b' }),
];
const themeById = (id) => BUILTIN_THEMES.find((t) => t.id === id) || BUILTIN_THEMES[0];

function applyTheme() {
  const t = themeById(S.theme), root = document.documentElement.style;
  for (const k of appliedVars) root.removeProperty(k);
  appliedVars = [];
  for (const [k, v] of Object.entries(t.colors || {})) { root.setProperty('--' + k, v); appliedVars.push('--' + k); }
}

/* ================= Config & State ================= */
const DEFAULT_CFG = {
  clipsEnabled: false,
  clipsMode: 'text',
  notifEnabled: false,
  notifBody: true,
  notifMuted: [],
  privacyDots: false,
  sysEnabled: false,
  sysNotch: false,
  tabs: { water: true, timer: true, tools: true, system: false },
};
const loadCfg = () => {
  const saved = LS.get('cfg', {});
  return { ...DEFAULT_CFG, ...saved, tabs: { ...DEFAULT_CFG.tabs, ...(saved.tabs || {}) } };
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

const S = {
  hover: false, expanded: false, pinned: false, settingsOpen: false,
  tab: LS.get('tab', 'home'), flash: null,
  cfg: loadCfg(),
  media: null, tint: null, weather: null, battery: null,
  timer: null, focus: null,
  clips: [], pinnedClips: LS.get('pinnedClips', []), clipQuery: '', clipSnippet: '', copied: null,
  tasks: LS.get('tasks', []), taskText: '', taskPick: null,
  place: startPlace(), autoPlace: AUTO_PLACE, locating: false,
  music: { queue: [], idx: -1, playing: false, online: false, query: '', results: [], searching: false },
  menu: null,
  audio: null, shelf: LS.get('shelf', []), shelfNotes: LS.get('shelfNotes', []), shelfSel: [], noteText: '',
  files: {}, dropping: false, calSel: null, mirror: null, scrub: null,
  cal: { status: 'loading', events: [], at: 0 },
  theme: LS.get('theme', 'classic'),
  // New feature state
  phoneDrop: { active: false, url: null },
  water: loadWater(), waterCfgOpen: false, waterRefill: false,
  timerMode: 'countdown',
  cd: TimerLib.createCountdown(5),
  sw: TimerLib.createStopwatch(),
  pomo: TimerLib.createPomodoro(),
  sys: null, sysHist: [],
  privacy: { mic: { active: false, app: null }, cam: { active: false, app: null } },
  toolsSub: 'color',
  colorHex: '#5cdba8', colorHist: LS.get('colorHist', ['#5cdba8', '#6ea8fe', '#ffb85a']),
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
    tab: Boolean(S.expanded && !S.settingsOpen && S.tab === 'system'),
  });
}

/* ================= Presentation & Sizing ================= */
function presentation() {
  if (S.expanded) return 'expanded';
  if (S.flash) return 'flash';
  if (!S.hover) return 'lip';
  if (S.focus) return 'focus';
  if (S.media?.title) return 'music';
  if (S.timer) return 'timer';
  return 'idle';
}

const panelHeight = () => {
  if (S.settingsOpen) return 340;
  return ({ music: 330, tasks: 330, tray: 215, clips: 235, water: 245, timer: 270, tools: 285, system: 245 }[S.tab] || 195);
};

function size(p = presentation()) {
  const bump = 12;
  const c = (w) => ({ w: w + bump, h: 24, r: 9, s: 7 });
  const dotsW = S.cfg.privacyDots && (S.privacy.mic.active || S.privacy.cam.active) ? 20 : 0;
  switch (p) {
    case 'lip': return { w: 150, h: 6, r: 3, s: 3 };
    case 'idle': return c((S.cfg.sysNotch && S.sys ? 176 : 150) + dotsW);
    case 'music': return c((S.timer ? 268 : 248) + dotsW);
    case 'timer': return c(168 + dotsW);
    case 'focus': return c(250 + dotsW);
    case 'flash': {
      const k = S.flash.kind;
      if (SMALL_FLASH.includes(k)) return { w: 232, h: 24, r: 9, s: 7 };
      const w = { track: 318, task: 340, rain: 318, focusEnd: 360, charging: 300, device: 330, phoneDrop: 360, waterRemind: 340, timerDone: 330, notif: 360, privacy: 300 }[k] || 300;
      return { w, h: k === 'charging' ? 58 : 62, r: 20, s: 10 };
    }
    default: {
      const h = panelHeight();
      const need = S.menu?.h ? Math.min(424, S.menu.y + S.menu.h + 14) : 0;
      return { w: 760, h: Math.max(h, need), r: 26, s: 14 };
    }
  }
}

let lastKey = '', lastH = 0;
function render(force) {
  const p = presentation();
  $('#island').classList.toggle('yield', !!S.yielded && p !== 'flash');
  const sz = size(p);
  const island = $('#island');
  island.classList.toggle('closing', sz.h < lastH);
  lastH = sz.h;
  for (const [k, v] of Object.entries(sz)) island.style.setProperty('--' + k, v + 'px');
  island.style.setProperty('--ph', panelHeight() + 'px');
  island.classList.toggle('big', p === 'expanded' || p === 'flash');
  island.dataset.mode = p;
  const tinted = p === 'expanded' && !S.settingsOpen && (S.tab === 'home' || (S.tab === 'music' && !S.music.online)) && S.media?.title && S.tint;
  island.classList.toggle('tinted', !!tinted);
  if (S.tint) {
    island.style.setProperty('--tint', S.tint);
    $('.tint', island).style.background = `linear-gradient(135deg, ${S.tint}38, ${S.tint}0d 45%, transparent 75%)`;
  }
  const key = p === 'expanded' ? (S.settingsOpen ? 'x:settings' : 'x:' + S.tab) : p === 'flash' ? 'f:' + S.flash.kind + S.flash.id : p;
  if (force || key !== lastKey) {
    const enter = key !== lastKey;
    const scroller = enter ? null : $('#content .scroll, #content .cards, #content .shelf, #content .set-grid');
    const keep = scroller ? scroller.scrollTop || scroller.scrollLeft : 0;
    lastKey = key;
    $('#content').innerHTML = `<div class="view ${viewClass(p)}${enter ? ' enter' : ''}">${build(p)}</div>`;
    const again = scroller && $('#content .scroll, #content .cards, #content .shelf, #content .set-grid');
    if (again && keep) { if (again.scrollHeight > again.clientHeight) again.scrollTop = keep; else again.scrollLeft = keep; }
    afterBuild(p);
    syncSystemWatch();
  }
  live();
  const full = sz.w + sz.s * 2;
  const m = p === 'expanded' ? 6 : 0;
  nusa.setRect({ x: (CANVAS_W - full) / 2 - m, y: 0, w: full + m * 2, h: Math.max(sz.h, 8) + m });
}

const SMALL_FLASH = ['volume', 'low', 'unplug', 'done'];
const viewClass = (p) => p === 'flash' && SMALL_FLASH.includes(S.flash.kind) ? 'compact'
  : ({ expanded: 'panel', flash: 'pop', lip: '' }[p] ?? (p === 'idle' ? 'compact center' : 'compact'));

/* ================= Closed Notch & Flash ================= */
function privacyDotsHTML() {
  if (!S.cfg.privacyDots) return '';
  const mic = S.privacy.mic?.active, cam = S.privacy.cam?.active;
  if (!mic && !cam) return '';
  return `<span class="pdots">${mic ? `<i class="pdot mic" title="Mic: ${esc(S.privacy.mic.app || 'Active')}"></i>` : ''}${cam ? `<i class="pdot cam" title="Camera: ${esc(S.privacy.cam.app || 'Active')}"></i>` : ''}</span>`;
}

function build(p) {
  if (p === 'lip') return '';
  if (p === 'flash') return flashHTML(S.flash);
  if (p === 'expanded') return panelHTML();
  const dots = privacyDotsHTML();
  if (p === 'music') {
    const m = S.media;
    return `${m.art ? `<img class="art" src="${esc(m.art)}" alt="">` : `<span class="art"></span>`}<span class="t">${esc(m.title)}</span>
      <span class="eq ${m.playing ? 'on' : ''}"><i></i><i></i><i></i><i></i></span>${S.timer ? ringSVG('timer') : ''}${dots}`;
  }
  if (p === 'timer') return `${IC.timer}<span class="t"></span><span class="mono" style="color:#ff9f0a" data-live="timerLeft"></span>${dots}`;
  if (p === 'focus') return `<span data-live="focusRing"></span><span class="t">${esc(S.focus.phase === 'focus' ? S.focus.title || 'Focus' : 'Break')}</span><span class="mono" data-live="focusLeft" style="color:${S.focus.phase === 'focus' ? 'var(--mint)' : 'var(--rest)'}"></span>${dots}`;
  return `<span data-live="idle"></span>${dots}`;
}

function afterBuild(p) {
  if (S.mirror?.stream && (p !== 'expanded' || S.settingsOpen || S.tab !== 'home')) stopMirror();
  const v = $('#mirror');
  if (v && S.mirror?.stream && v.srcObject !== S.mirror.stream) v.srcObject = S.mirror.stream;
  if (p !== 'expanded' || S.settingsOpen) return;
  if (S.tab === 'home' && Date.now() - S.cal.at > 60000) loadCalendar();
  if (S.tab === 'music') { musicPoll(); $('#musicQ')?.focus(); }
  if (S.tab === 'tasks') $('#taskIn')?.focus();
}

function ringSVG(kind) {
  let frac = 0, color = '#ff9f0a';
  if (kind === 'timer' && S.timer) frac = 1 - (S.timer.end - Date.now()) / S.timer.total;
  if (kind === 'focus' && S.focus) { frac = 1 - (S.focus.end - Date.now()) / S.focus.total; color = S.focus.phase === 'focus' ? '#5cdba8' : '#ffb85a'; }
  const C = 2 * Math.PI * 5;
  return `<svg class="ring" viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="5" stroke="${color}" opacity=".25"/><circle cx="6.5" cy="6.5" r="5" stroke="${color}"
    stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0, Math.min(1, frac)))}" stroke-linecap="round" transform="rotate(-90 6.5 6.5)"/></svg>`;
}

function flashHTML(f) {
  switch (f.kind) {
    case 'track':
      return `${S.media?.art ? `<img class="badge" src="${esc(S.media.art)}" style="border-radius:9px;object-fit:cover" alt="">` : `<span class="badge">${IC.music}</span>`}
        <span class="txt"><b>${esc(S.media?.title)}</b><small>${esc(S.media?.artist)}</small></span><span class="eq on" style="--tint:${S.tint || '#fff'}"><i></i><i></i><i></i><i></i></span>`;
    case 'task':
      return `<span class="badge" style="color:var(--mint)">${IC.bell}</span><span class="txt"><b>${esc(f.title)}</b><small>Reminder · ${esc(f.time)}</small></span>
        <button class="cbtn" data-act="taskSnooze" data-id="${f.id}" title="Snooze 10 minutes">${IC.clock}</button><button class="cbtn mint" data-act="taskDone" data-id="${f.id}" title="Mark as done">${IC.check}</button>`;
    case 'rain':
      return `<span class="badge" style="color:#73bfff">${IC.umbrella}</span><span class="txt"><b>Rain likely around ${f.time}</b><small>${f.chance}% chance · bring an umbrella</small></span>`;
    case 'focusEnd':
      return `<span class="badge" style="color:${f.rest ? 'var(--rest)' : 'var(--mint)'}">${f.rest ? IC.cup : IC.target}</span>
        <span class="txt"><b>${f.rest ? 'Break’s over' : 'Focus session done'}</b><small>${f.rest ? 'Ready for another round?' : `${focusToday()} today${f.title ? ' · ' + esc(f.title) : ''}`}</small></span>
        ${f.rest ? `<button class="pill" style="background:var(--mint)" data-act="focus">${IC.target} Focus</button>` : `<button class="pill" style="background:var(--rest)" data-act="break">${IC.cup} Break</button>`}
        <button class="cbtn" data-act="dismiss">${IC.x}</button>`;
    case 'charging': {
      const minsLeft = S.battery?.toFull;
      const detail = minsLeft > 0 ? (minsLeft >= 60 ? `${Math.floor(minsLeft / 60)} hr ${minsLeft % 60} min until full` : `${minsLeft} min until full`) : 'Connected to power';
      return `<span class="batt"><i id="battFill"></i>${IC.bolt}</span><span class="txt"><b>Charging</b><small>${detail}</small></span><span class="big mono">${f.percent}%</span>`;
    }
    case 'device':
      return `<span class="badge">${IC.headphones}</span><span class="txt"><b>${esc(f.name)}</b><small class="mono">${esc(f.detail)}</small></span><span style="color:var(--green);font-size:16px">${IC.check}</span>`;
    case 'phoneDrop':
      return `<span class="badge" style="color:var(--mint)">${IC.phone}</span>
        <span class="txt"><b>${esc(f.device || 'Phone')} wants to send ${f.count} file${f.count > 1 ? 's' : ''}</b><small>${esc(f.names)}</small></span>
        <button class="pill" style="background:var(--mint)" data-act="pdApprove" data-id="${esc(f.reqId)}">Accept</button>
        <button class="cbtn" data-act="pdDecline" data-id="${esc(f.reqId)}" title="Decline">${IC.x}</button>`;
    case 'waterRemind':
      return `<span class="badge" style="color:var(--mint)">${IC.water}</span>
        <span class="txt"><b>Time to drink water</b><small>${Water.totalMl(S.water)} / ${S.water.goalMl} ml today</small></span>
        <button class="pill" style="background:var(--mint)" data-act="waterDrinkFlash">Drank</button>
        <button class="cbtn" data-act="waterSnooze" title="Snooze 15m">${IC.clock}</button>`;
    case 'timerDone':
      return `<span class="badge" style="color:#ff9f0a">${IC.timer}</span>
        <span class="txt"><b>${esc(f.title || 'Countdown finished')}</b><small>Time’s up</small></span>
        <button class="pill" style="background:#ff9f0a" data-act="cdRestart">Restart</button>
        <button class="cbtn" data-act="dismiss">${IC.x}</button>`;
    case 'notif':
      return `<span class="badge" style="color:var(--mint)">${IC.bell}</span>
        <span class="txt"><b>${esc(f.app || 'Notification')}: ${esc(f.title)}</b>${S.cfg.notifBody && f.body ? `<small>${esc(f.body)}</small>` : ''}</span>
        <button class="cbtn" data-act="notifMuteApp" data-app="${esc(f.app)}" title="Mute ${esc(f.app)}">${IC.bellOff}</button>
        <button class="cbtn" data-act="dismiss" title="Dismiss">${IC.x}</button>`;
    case 'privacy':
      return `<span class="badge" style="color:${f.kindName === 'Camera' ? 'var(--green)' : '#ff9f0a'}">${f.kindName === 'Camera' ? IC.cam : IC.mic}</span>
        <span class="txt"><b>${esc(f.kindName)} in use</b><small>${esc(f.app || 'An app')} started using your ${f.kindName.toLowerCase()}</small></span>`;
    case 'volume': return `<span data-live="volFlash" style="display:contents"></span>`;
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
  S.flash = { ...f, id: Math.random().toString(36).slice(2) };
  render();
  if (f.kind === 'charging') requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('#battFill'); if (b) b.style.width = `${Math.round(36 * f.percent / 100)}px`; }));
  flashTimer = setTimeout(() => { S.flash = null; render(); }, seconds * 1000);
}

/* ================= Panel & Tabs ================= */
const ALL_TABS = [
  ['home', 'Home', 'home'],
  ['music', 'Music', 'music'],
  ['tasks', 'Tasks', 'tasks'],
  ['tray', 'Tray', 'tray'],
  ['clips', 'Clips', 'clips'],
  ['water', 'Water', 'water'],
  ['timer', 'Timer', 'stopwatch'],
  ['tools', 'Tools', 'tools'],
  ['system', 'System', 'system'],
];

function visibleTabs() {
  return ALL_TABS.filter(([k]) => {
    if (['home', 'music', 'tasks', 'tray', 'clips'].includes(k)) return true;
    if (k === 'system') return S.cfg.sysEnabled || S.cfg.tabs.system;
    return S.cfg.tabs[k] !== false;
  });
}

function panelHTML() {
  const vTabs = visibleTabs();
  if (!vTabs.some(([k]) => k === S.tab)) S.tab = 'home';
  const tabs = vTabs.map(([k, label, ic]) => `<button class="tab ${!S.settingsOpen && S.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}" title="${label}">${IC[ic]}${!S.settingsOpen && S.tab === k ? `<span>${label}</span>` : ''}</button>`).join('');
  const timer = S.timer
    ? `<span style="color:#ff9f0a;font-size:12px" class="mono" data-live="timerLeft"></span><button class="chip" data-act="timerStop">Stop</button>`
    : `<span style="color:var(--dim)">${IC.timer}</span>${[5, 15, 25].map((m) => `<button class="chip" data-act="timer" data-m="${m}">${m}m</button>`).join('')}`;
  const w = S.weather;
  const wx = w ? `<button class="chip" data-act="wxMenu" title="${esc(wxLabel(w.code))} · feels ${Math.round(w.feels)}°">${IC[wxIcon(w.code, w.day)]}<span class="mono">${Math.round(w.temp)}°</span></button>` : '';
  const b = S.battery;
  const batt = b ? `<span class="bicon ${b.charging ? 'chg' : b.level <= 20 ? 'low' : ''}" title="${b.level}%${b.charging ? ' · charging' : ''}"><i style="width:${Math.max(8, b.level)}%"></i>${b.charging ? IC.bolt : ''}</span>
    <span class="mono" style="font-size:11px;font-weight:500">${b.level}%</span>` : '';
  const vol = S.audio ? `<span class="vol" title="${esc(S.audio.name)}"><button data-act="muteToggle" title="${S.audio.muted ? 'Unmute' : 'Mute'}">${spkIcon(S.audio)}</button>
    <span class="vtrack" id="volTrack" data-live="volLevel"></span></span><span class="sep"></span>` : '';
  const body = S.settingsOpen ? settingsHTML() : ({
    home: homeHTML, music: musicHTML, tasks: tasksHTML, tray: trayHTML, clips: clipsHTML,
    water: waterHTML, timer: timerHTML, tools: toolsHTML, system: systemHTML,
  }[S.tab] || homeHTML)();
  return `<div class="top">${tabs}<span class="sp"></span>${privacyDotsHTML()}${vol}${timer}<span class="sep"></span>${wx}${batt}
      <button class="ibtn ${S.pinned ? 'on' : ''}" data-act="pin" title="${S.pinned ? 'Unpin panel' : 'Keep panel open'}">${S.pinned ? IC.lock : IC.unlock}</button>
      <button class="ibtn ${S.settingsOpen ? 'on' : ''}" data-act="gear" title="Settings">${IC.gear}</button></div>
    <div class="body">${body}</div>
    ${S.menu ? menuHTML() : ''}`;
}

/* ================= Home ================= */
function coverHTML(m, cls = 'cover') {
  const src = m.hiArt || m.art;
  const img = src ? `<img class="${cls}" src="${esc(src)}" alt=""${m.hiArt && m.art ? ` data-fallback="${esc(m.art)}"` : ''}>` : `<span class="${cls} empty">${IC.music}</span>`;
  return `<span class="cwrap" ${m.path || m.source ? `data-act="openSource" title="Open ${esc(m.app || 'app')}"` : ''}>${img}${m.icon ? `<img class="appic" src="${esc(m.icon)}" alt="">` : ''}</span>`;
}
document.addEventListener('error', (e) => { const f = e.target?.dataset?.fallback; if (f) { delete e.target.dataset.fallback; e.target.src = f; } }, true);
const seekable = (m) => m?.duration > 0 && !m.noTimeline && m.canSeek !== false;

function homeHTML() {
  const m = S.media;
  const music = m?.title
    ? `<div class="np">${coverHTML(m)}
        <div class="col" style="flex:1"><b>${esc(m.title)}</b>${m.album ? `<small>${esc(m.album)}</small>` : ''}<small>${esc(m.artist)}</small>
        <div class="ctl"><button data-act="mprev" title="Previous">${IC.prev}</button><button class="main" data-act="mtoggle" title="Play/Pause">${m.playing ? IC.pause : IC.play}</button><button data-act="mnext" title="Next">${IC.next}</button></div>
        ${m.duration && !m.noTimeline ? `<div class="bar ${seekable(m) ? 'seek' : ''}" data-live="mbar"></div>` : ''}</div></div>`
    : `<div class="note">${IC.music}<span>Nothing playing</span></div>`;
  return `<div class="col" style="width:250px;justify-content:center">${music}</div><div class="vline"></div>
    <div class="col" style="flex:1">${calendarHTML()}</div><div class="vline"></div>
    <div class="col wxcol" style="width:168px;justify-content:center">
      ${S.mirror?.stream ? `<video id="mirror" autoplay muted playsinline></video>` : `<div class="col" data-live="wxCard"></div>`}
      <button class="mirror-btn ${S.mirror?.stream ? 'on' : ''}" data-act="mirror" title="${S.mirror?.stream ? 'Close mirror' : S.mirror?.denied ? 'Camera blocked — allow it in Windows Settings › Privacy › Camera' : 'Mirror (camera)'}">${S.mirror?.stream ? IC.x : S.mirror?.denied ? IC.videoOff : IC.video}</button>
    </div>`;
}

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

async function loadCalendar() {
  if (!isWin) { S.cal = { status: 'off', events: [], at: Date.now() }; return; }
  const from = +dayStart(Date.now()) - 2 * 86400000;
  const r = await nusa.calendar(from, 7);
  S.cal = { status: r?.error === 'denied' ? 'denied' : r?.error ? 'error' : 'ok', events: r?.events || [], calendars: r?.calendars || 0, at: Date.now() };
  if (S.expanded && !S.settingsOpen && S.tab === 'home') live();
}

function calendarHTML() {
  const today = dayStart(new Date());
  const sel = S.calSel && +dayStart(S.calSel) ? dayStart(S.calSel) : today;
  const days = [-2, -1, 0, 1, 2, 3, 4].map((k) => new Date(+today + k * 86400000 + 3600000 * 2)).map(dayStart);
  const fmt = (d, o) => d.toLocaleDateString('en-US', o);
  return `<div class="cal-head"><b>${fmt(sel, { month: 'short' })}</b>${days.map((d) => {
    const isToday = +d === +today, isSel = +d === +sel, past = d < today;
    return `<button class="day ${isSel ? 'on' : ''} ${isToday ? 'today' : past ? 'past' : ''}" data-act="calDay" data-t="${+d}" title="${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}">
      <small>${fmt(d, { weekday: 'short' }).slice(0, 3).toUpperCase()}</small><b class="mono">${d.getDate()}</b></button>`;
  }).join('')}</div><div class="cal-list" data-live="agenda"></div>`;
}

function agendaHTML() {
  const now = new Date(), today = dayStart(now);
  const sel = S.calSel ? dayStart(S.calSel) : today;
  const end = +sel + 86400000;
  const rows = [];
  for (const e of S.cal.events) {
    const until = e.start + Math.max(1, e.minutes) * 60000;
    if (e.start >= end || until <= +sel) continue;
    rows.push({ color: e.color || '#0a85ff', title: e.title || 'Untitled', time: e.allDay ? 'All day' : hhmm(new Date(e.start)), at: e.allDay ? +sel - 1 : e.start, done: !e.allDay && until < +now });
  }
  for (const t of S.tasks) {
    if (t.done || !t.due) continue;
    const late = t.due < +now;
    if ((t.due >= +sel && t.due < end) || (+sel === +today && late)) rows.push({ color: late ? 'var(--late)' : 'var(--rest)', title: t.title, time: late ? 'Overdue' : hhmm(new Date(t.due)), at: t.due, late });
  }
  rows.sort((a, b) => a.at - b.at);
  if (S.cal.status === 'denied' && !rows.length) return `<button class="note" data-act="calSettings" style="gap:3px">${IC.calendar}<span>Allow calendar access in Settings</span></button>`;
  if (!rows.length) return `<div class="note" style="gap:3px">${IC.calendar}<span>${+sel === +today ? 'No more events today' : 'No events'}</span></div>`;
  return rows.slice(0, 4).map((r) => `<div class="ev ${r.late ? 'late' : r.done ? 'done' : ''}"><i style="background:${r.color}"></i><span>${esc(r.title)}</span><em class="mono">${r.time}</em></div>`).join('');
}

function wxCardHTML() {
  const w = S.weather;
  if (!w) return `<div class="note"><span>Loading weather…</span></div>`;
  const hours = w.hours.filter((h) => h.time > Date.now()).slice(0, 4);
  return `<div class="wx" style="display:flex;align-items:center;gap:8px">${IC[wxIcon(w.code, w.day)]}<b>${Math.round(w.temp)}°</b></div>
    <small style="color:var(--dim);font-size:11.5px">${wxLabel(w.code)} · feels ${Math.round(w.feels)}°</small>
    <button style="color:var(--faint);font-size:11px;text-align:left" data-act="cityMenu">${esc(S.place.name)} · ${esc(S.place.zone)} ${IC.chevron}</button>
    <div class="wx-hours">${hours.map((h) => `<div>${hhmm(new Date(h.time), S.place.tz)}${IC[wxIcon(h.code, true)]}<b class="${h.rain >= 30 ? 'wet' : ''}">${h.rain >= 30 ? h.rain + '%' : Math.round(h.temp) + '°'}</b></div>`).join('')}</div>`;
}

/* ================= Music ================= */
function musicHTML() {
  const mu = S.music;
  if (!mu.online) return `<div class="col" style="flex:1">${systemPlayerHTML()}</div>`;
  const head = `<div class="field">${IC.search}<input id="musicQ" placeholder="Search songs, artists…" value="${esc(mu.query)}" autocomplete="off" spellcheck="false"></div>`;
  let list;
  if (mu.query.trim() && mu.searching && !mu.results.length) list = `<div class="note"><span>Searching…</span></div>`;
  else {
    const rows = mu.query.trim() ? mu.results : mu.queue;
    list = rows.length
      ? `<span class="label">${mu.query.trim() ? 'Results' : 'Up next'}</span><div class="scroll" style="margin-top:4px">${rows.map((s, k) => songRow(s, k, !mu.query.trim())).join('')}</div>`
      : `<div class="note">${IC.music}<span>${mu.query.trim() ? 'No songs found.' : 'Nothing queued in Senandung yet.'}</span></div>`;
  }
  return `<div class="col" style="flex:1;gap:10px">${head}${list}</div>`;
}

function systemPlayerHTML() {
  const m = S.media;
  if (!m?.title) return `<div class="note">${IC.music}<b>Nothing playing</b><span>Play something in Spotify, YouTube, or any music app — it’ll show up here.</span></div>`;
  const timeline = m.duration && !m.noTimeline;
  return `<div class="np big">${coverHTML(m)}
    <div class="col" style="flex:1;min-width:0">
      ${m.app ? `<span class="label">${m.playing ? 'Playing' : 'Paused'} · ${esc(m.app)}</span>` : ''}
      <b>${esc(m.title)}</b><small>${esc(m.artist)}</small>${m.album ? `<small>${esc(m.album)}</small>` : ''}
      <div class="ctl"><button data-act="mprev" title="Previous">${IC.prev}</button><button class="main" data-act="mtoggle" title="Play/Pause">${m.playing ? IC.pause : IC.play}</button><button data-act="mnext" title="Next">${IC.next}</button></div>
      ${timeline ? `<div class="bar ${seekable(m) ? 'seek' : ''}" data-live="mbar"></div><div class="times mono" data-live="mtime"></div>` : ''}
    </div></div>`;
}

function songRow(s, k, queue) {
  const now = queue && s.i === S.music.idx;
  const art = s.art ? (s.art.startsWith('/') ? 'http://127.0.0.1:5560' + s.art : 'http://127.0.0.1:5560/api/yt/img?u=' + encodeURIComponent(s.art)) : '';
  return `<div class="row ${now ? 'now' : ''}" data-act="${queue ? 'mjump' : 'mplay'}" data-k="${k}">
    ${art ? `<img class="cover" src="${esc(art)}" loading="lazy" alt="">` : `<span class="cover"></span>`}
    <span class="t"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>
    ${now ? `<span style="color:var(--mint)">${IC.wave}</span>` : ''}${s.duration ? `<span class="d">${clock(s.duration)}</span>` : ''}
    ${queue ? '' : `<button class="small-btn hov" data-act="mqueue" data-k="${k}" title="Play next">${IC.plus}</button>`}</div>`;
}

let musicTimer = null, searchTimer = null;
async function musicPoll() {
  clearTimeout(musicTimer);
  if (!S.expanded || S.settingsOpen || S.tab !== 'music') return;
  const st = await nusa.senandung('GET', '/api/remote/state');
  const mu = S.music;
  const was = JSON.stringify([mu.online, mu.idx, mu.queue.length, mu.playing]);
  mu.online = !!st;
  if (st) { mu.queue = st.queue || []; mu.idx = st.idx; mu.playing = st.playing; }
  if (JSON.stringify([mu.online, mu.idx, mu.queue.length, mu.playing]) !== was && !mu.query.trim()) { refreshBody(); render(); }
  musicTimer = setTimeout(musicPoll, 1500);
}

function musicSearch() {
  clearTimeout(searchTimer);
  const q = S.music.query.trim();
  if (!q) { S.music.results = []; return refreshBody(); }
  S.music.searching = true;
  searchTimer = setTimeout(async () => {
    const res = await nusa.senandung('GET', `/api/yt/search?q=${encodeURIComponent(q)}&type=songs`);
    if (S.music.query.trim() !== q) return;
    S.music.results = (res || []).filter((x) => x.vid).slice(0, 25);
    S.music.searching = false;
    refreshBody();
  }, 400);
}

function refreshBody() {
  if (!S.expanded || S.settingsOpen) return;
  const body = $('.body');
  if (!body) return;
  if (S.tab === 'music') {
    const field = $('.field', body);
    const html = musicHTML();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    if (field && fresh.firstElementChild?.classList.contains('field')) fresh.replaceChild(field, fresh.firstElementChild);
    body.replaceChildren(fresh);
    live();
  } else if (S.tab === 'tasks') {
    const list = $('#taskList');
    if (list) list.innerHTML = taskListHTML();
    const count = $('#taskCount');
    if (count) count.outerHTML = taskCountHTML();
  } else render(true);
  live();
}

/* ================= Tasks ================= */
const saveTasks = () => LS.set('tasks', S.tasks);

function dueText(d) {
  const now = new Date(), t = hhmm(d);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff === 0) return `Today ${t}`;
  if (diff === 1) return `Tomorrow ${t}`;
  if (diff === -1) return `Yesterday ${t}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} · ${t}`;
}

function quickPicks() {
  const now = new Date();
  const tonight = new Date(now); tonight.setHours(20, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  return [['In 30 min', +now + 1800000], ['In 1 hour', +now + 3600000], ...(tonight - now > 3600000 ? [['Tonight 20:00', +tonight]] : []), ['Tomorrow 09:00', +tomorrow]];
}

function taskCountHTML() {
  const open = S.tasks.filter((t) => !t.done), late = open.filter((t) => t.due && t.due < Date.now()).length;
  return `<span id="taskCount" style="font-size:11px;color:${late ? 'var(--late)' : 'var(--dim)'}">${open.length} to do${late ? ` · ${late} overdue` : ''}</span>`;
}

function tasksHTML() {
  const preview = S.taskPick?.[1] ?? TaskParser.parse(S.taskText).due;
  return `<div class="col" style="flex:1;gap:10px">
    <div class="field"><span class="ic mint">${IC.plus}</span><input id="taskIn" placeholder="Add a task… “Rapat QC besok jam 9”" value="${esc(S.taskText)}" autocomplete="off" spellcheck="false">
      <span id="taskPreview">${S.taskText && preview ? `<span class="chip on">${IC.bell}${dueText(new Date(preview))}</span>` : ''}</span></div>
    <div class="chips">${quickPicks().map(([l, t]) => `<button class="chip ${S.taskPick?.[0] === l ? 'on' : ''}" data-act="pick" data-l="${l}" data-t="${t}">${l}</button>`).join('')}
      <span class="sp"></span>${S.focus ? `<button class="chip on" data-act="focusStop">${S.focus.phase === 'focus' ? 'Stop focus' : 'Skip break'}</button>`
      : `<button class="chip" data-act="focus">${IC.target} Focus 25m${focusToday() ? ` · ${focusToday()} today` : ''}</button>`}${taskCountHTML()}</div>
    <div class="scroll" id="taskList">${taskListHTML()}</div></div>`;
}

function taskListHTML() {
  if (!S.tasks.length) return `<div class="note">${IC.tasks}<b>Nothing to do</b><span>Type a task with a time, like “Rapat QC besok jam 9” or “Call Budi in 30 min”.</span></div>`;
  const now = Date.now();
  const sorted = [...S.tasks].sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || (a.created - b.created));
  return sorted.map((t) => {
    const late = !t.done && t.due && t.due < now;
    return `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-act="taskToggle" data-id="${t.id}">${t.done ? IC.check : ''}</button>
      <span class="t"><b>${esc(t.title)}</b></span>${t.due ? `<span class="d ${late ? 'late' : ''}">${late ? 'Overdue · ' : ''}${dueText(new Date(t.due))}</span>` : ''}
      ${t.done ? '' : `<button class="small-btn mint hov ${S.focus?.taskId === t.id ? 'keep' : ''}" data-act="focusTask" data-id="${t.id}" title="Focus on this for 25 minutes">${IC.target}</button>`}
      <button class="small-btn hov" data-act="taskDel" data-id="${t.id}" title="Delete">${IC.x}</button></div>`;
  }).join('');
}

function addTask() {
  const r = TaskParser.parse(S.taskText);
  if (!r.title) return;
  S.tasks.push({ id: uid(), title: r.title, due: S.taskPick ? S.taskPick[1] : r.due ? +r.due : null, done: false, notified: false, created: Date.now() });
  S.taskText = ''; S.taskPick = null;
  saveTasks();
  render(true);
}

function checkTasks() {
  const now = Date.now();
  S.tasks = S.tasks.filter((t) => !(t.done && t.doneAt && now - t.doneAt > 86400000));
  const t = S.tasks.find((x) => !x.done && !x.notified && x.due && x.due <= now);
  if (!t) return;
  t.notified = true;
  saveTasks();
  chime([880, 1320]);
  if (!S.pinned) S.expanded = false;
  showFlash({ kind: 'task', id: t.id, title: t.title, time: dueText(new Date(t.due)) }, 30);
}

/* ================= Clips (Off by default + Snippets) ================= */
function allClipCards() {
  const q = S.clipQuery.trim().toLowerCase();
  const pinnedIds = new Set(S.pinnedClips.map((c) => c.id));
  const merged = [...S.pinnedClips, ...S.clips.filter((c) => !pinnedIds.has(c.id))];
  if (!q) return merged;
  return merged.filter((c) => {
    if (c.type === 'text') return c.text.toLowerCase().includes(q);
    if (c.type === 'files') return c.files.some((f) => f.name.toLowerCase().includes(q));
    return 'image'.includes(q);
  });
}

function clipCardHTML(c) {
  const isPinned = S.pinnedClips.some((p) => p.id === c.id);
  const isOk = S.copied === c.id;
  let body = '', meta = '';
  if (c.type === 'image') {
    body = `<img class="clip-thumb" src="${esc(c.dataUrl)}" alt="">`;
    meta = isOk ? 'Copied' : `${c.width}×${c.height}`;
  } else if (c.type === 'files') {
    body = `<p>${c.files.map((f) => esc(f.name)).join('\n')}</p>`;
    meta = isOk ? 'Copied' : `${c.files.length} file${c.files.length > 1 ? 's' : ''}`;
  } else {
    body = `<p>${esc(c.text.trim())}</p>`;
    meta = isOk ? 'Copied' : `${c.text.length} chars`;
  }
  return `<div class="card ${isOk ? 'ok' : ''} ${isPinned ? 'pinned' : ''}" draggable="true" data-clip-id="${esc(c.id)}" data-act="clipCopy" data-id="${esc(c.id)}">
    ${body}
    <div class="clip-acts"><small>${meta}</small><span class="sp"></span>
      <button class="clip-btn ${isPinned ? 'on' : ''}" data-act="clipPin" data-id="${esc(c.id)}" title="${isPinned ? 'Unpin' : 'Pin snippet'}">${IC.bookmark}</button>
      <button class="clip-btn" data-act="clipDel" data-id="${esc(c.id)}" title="Remove">${IC.x}</button>
    </div></div>`;
}

function clipsHTML() {
  const cards = allClipCards();
  const topBar = S.cfg.clipsEnabled
    ? `<div class="chips">
        <div class="field" style="height:28px;flex:1">${IC.search}<input id="clipQ" placeholder="Filter clips…" value="${esc(S.clipQuery)}" autocomplete="off"></div>
        <div class="field" style="height:28px;width:200px"><input id="clipSnip" placeholder="Save snippet…" value="${esc(S.clipSnippet)}" autocomplete="off"><button class="small-btn mint" data-act="addSnippet" title="Save pinned snippet">${IC.plus}</button></div>
        <button class="chip" data-act="clipsToggle">Pause</button>
      </div>`
    : `<div class="chips">
        <button class="chip on" data-act="clipsToggle">${IC.clips} Turn on clipboard history</button>
        <div class="field" style="height:28px;flex:1"><input id="clipSnip" placeholder="Save a pinned snippet (works even while history is off)…" value="${esc(S.clipSnippet)}" autocomplete="off"><button class="small-btn mint" data-act="addSnippet" title="Save snippet">${IC.plus}</button></div>
      </div>`;
  const content = cards.length
    ? `<div class="cards" style="flex:1">${cards.map(clipCardHTML).join('')}</div>`
    : `<div class="note">${IC.clips}<span>${S.cfg.clipsEnabled ? 'Text, files, or images you copy will appear here' : 'Clipboard history is off — turn it on or save pinned snippets above'}</span></div>`;
  return `<div class="col" style="flex:1;gap:8px">${topBar}${content}</div>`;
}

function findClip(id) {
  return S.pinnedClips.find((c) => c.id === id) || S.clips.find((c) => c.id === id);
}

/* ================= Tray (File Shelf + Multi-select + Text Cards + Phone Drop) ================= */
const midTrim = (s, n = 16) => s.length <= n ? s : s.slice(0, Math.ceil(n / 2) - 1) + '…' + s.slice(-(Math.floor(n / 2)));

function syncShelfMain() {
  nusa.shelfSync?.(S.shelf);
}

function trayHTML() {
  if (S.phoneDrop.active && S.phoneDrop.url) {
    return `<div class="drop"><div class="qr-box">${QR.toSVG(S.phoneDrop.url, 3)}
      <div class="col" style="flex:1;gap:6px">
        <span class="label">Phone Drop</span>
        <b>Scan with your phone</b>
        <small class="mono" style="color:var(--dim);font-size:11px;word-break:break-all">${esc(S.phoneDrop.url)}</small>
        <div class="chips" style="margin-top:4px">
          <button class="chip" data-act="pdCopyUrl">${IC.copy} Copy link</button>
          <button class="chip on" data-act="pdStop">Done</button>
        </div>
      </div></div></div>`;
  }

  const hasAny = S.shelf.length > 0 || S.shelfNotes.length > 0;
  const selCount = S.shelfSel.length;
  const topControls = `<div class="chips">
    <div class="field" style="height:26px;flex:1"><input id="noteIn" placeholder="+ Note card on shelf (Enter to add)…" value="${esc(S.noteText)}" autocomplete="off"><button class="small-btn mint" data-act="addShelfNote" title="Add note">${IC.plus}</button></div>
    ${selCount > 0 ? `<button class="chip on" draggable="true" data-act="dragSelected" id="dragSelBtn">Drag ${selCount} selected</button><button class="chip" data-act="removeSelected">${IC.trash} Remove</button>` : ''}
    <button class="chip" data-act="pdStart">${IC.phone} Phone</button>
  </div>`;

  const fileItems = S.shelf.map((p, i) => {
    const f = S.files[p];
    const sel = S.shelfSel.includes(p);
    return `<div class="sitem ${sel ? 'sel' : ''}" draggable="true" data-act="fileOpen" data-i="${i}" data-path="${esc(p)}" title="${esc(p)}\nClick to open · drag out to use">
      <button class="sel-dot" data-act="fileSel" data-path="${esc(p)}" title="Select">${sel ? IC.check : ''}</button>
      ${f?.icon ? `<img src="${esc(f.icon)}" alt="">` : `<span class="ph">${IC.clips}</span>`}<small>${esc(midTrim(f?.name || p.split(/[\\/]/).pop()))}</small>
      <button class="rm" data-act="fileRemove" data-i="${i}" title="Remove from Tray">${IC.xCircle}</button></div>`;
  });

  const noteItems = S.shelfNotes.map((n, i) => `
    <div class="sitem note-card" draggable="true" data-act="noteCopy" data-ni="${i}" title="Click to copy · drag out as .txt">
      <span class="ph">${esc(n.text)}</span><small>Note</small>
      <button class="rm" data-act="noteRemove" data-ni="${i}" title="Remove note">${IC.xCircle}</button>
    </div>`);

  const inner = hasAny
    ? `<div class="shelf">${fileItems.join('')}${noteItems.join('')}</div>
      <div class="shelf-side"><button class="sbtn" data-act="fileShow" title="Show the last file in its folder">${IC.clips}<span>Show</span></button>
        <button class="sbtn" data-act="trayClear" title="Remove everything from Tray">${IC.x}<span>Clear</span></button></div>`
    : `<div class="note">${IC.trayIn}<span>Drop files here, add a note card, or use Phone Drop</span></div>`;

  return `<div class="col" style="flex:1;gap:8px">${topControls}<div class="drop ${S.dropping ? 'on' : ''}">${inner}</div></div>`;
}

async function addToShelf(p) {
  if (!p || S.shelf.includes(p)) return;
  const info = await nusa.fileInfo(p);
  if (!info) return;
  S.files[p] = info;
  S.shelf = [...S.shelf, p];
  LS.set('shelf', S.shelf);
  syncShelfMain();
  if (S.expanded && S.tab === 'tray') render(true);
}

function removeFromShelf(p) {
  S.shelf = S.shelf.filter((x) => x !== p);
  S.shelfSel = S.shelfSel.filter((x) => x !== p);
  LS.set('shelf', S.shelf);
  syncShelfMain();
  render(true);
}

async function loadShelf() {
  const keep = [];
  for (const p of S.shelf) {
    const info = await nusa.fileInfo(p);
    if (info) { S.files[p] = info; keep.push(p); }
  }
  S.shelf = keep;
  LS.set('shelf', keep);
  syncShelfMain();
  if (S.expanded && S.tab === 'tray') render(true);
}

/* ================= Water Tracker ================= */
function saveWater() { LS.set('water', S.water); }

function waterHTML() {
  const w = S.water;
  const total = Water.totalMl(w);
  const pct = Math.min(1, w.goalMl > 0 ? total / w.goalMl : 0);
  const C = 2 * Math.PI * 39;
  const buckets = Water.hourlyBuckets(w);
  const maxB = Math.max(w.sipMl, ...buckets, 250);

  const ring = `<div class="w-ring"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="39" stroke="rgba(255,255,255,.1)"/><circle cx="46" cy="46" r="39" stroke="var(--mint)" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
    <div><b class="mono">${total}</b><small>/ ${w.goalMl} ml</small></div></div>`;

  const bars = `<div class="w-bars">${buckets.map((v, h) => {
    const hPct = v > 0 ? Math.max(12, Math.round((v / maxB) * 100)) : 4;
    return `<div class="w-bar" title="${pad(h)}:00 · ${v} ml"><i class="${v ? '' : 'empty'}" style="height:${hPct}%"></i></div>`;
  }).join('')}</div>`;

  const cfgRow = S.waterCfgOpen
    ? `<div class="w-cfg">
        <span>Goal</span><input type="number" id="wGoal" value="${w.goalMl}" step="100" min="250">
        <span>Sip</span><input type="number" id="wSip" value="${w.sipMl}" step="50" min="50">
        <span>Bottle</span><input type="number" id="wBottle" value="${w.bottleMl}" step="100" min="100">
        <span>Hrs</span><input type="number" id="wStart" value="${w.startHour}" min="0" max="23" style="width:42px">–<input type="number" id="wEnd" value="${w.endHour}" min="1" max="24" style="width:42px">
        <button class="chip ${w.remind ? 'on' : ''}" data-act="waterRemindToggle">${w.remind ? 'Reminders On' : 'Reminders Off'}</button>
        <button class="chip" data-act="waterReset">Reset today</button>
      </div>`
    : `<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--faint)"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>`;

  return `<div class="col" style="width:220px;justify-content:center;gap:10px">
      <div style="display:flex;align-items:center;gap:14px">${ring}
        <div class="col" style="gap:6px">
          <span class="label">Hydration</span>
          <button class="chip on" data-act="waterDrink">${IC.plus} Drink +${w.sipMl} ml</button>
          <div style="display:flex;gap:6px">
            <button class="chip" data-act="waterUndo" ${w.entries.length ? '' : 'disabled style="opacity:.4"'}>${IC.undo} Undo</button>
            <button class="chip ${S.waterCfgOpen ? 'on' : ''}" data-act="waterCfgToggle" title="Water settings">${IC.gear}</button>
          </div>
        </div>
      </div>
      ${S.waterRefill ? `<span class="chip on" style="background:var(--rest);color:#000">Refill your ${w.bottleMl} ml bottle</span>` : ''}
    </div>
    <div class="vline"></div>
    <div class="col" style="flex:1;justify-content:center;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="label">24-hour intake</span><small style="color:var(--dim)">${w.entries.length} sip${w.entries.length === 1 ? '' : 's'} · ${Math.round(pct * 100)}%</small></div>
      ${bars}${cfgRow}
    </div>`;
}

function checkWater() {
  const today = localDateStr();
  if (S.water.date !== today) { S.water = Water.resetDay(S.water, today); saveWater(); }
  const now = Date.now();
  if (Water.nextReminderDue(S.water, now)) {
    S.water = { ...S.water, lastRemindedAt: now };
    saveWater();
    chime([587, 880]);
    if (!S.expanded) showFlash({ kind: 'waterRemind' }, 20);
  }
}

/* ================= Timer / Stopwatch / Pomodoro ================= */
function timerHTML() {
  const sub = `<div class="chips">
    ${[['countdown', 'Countdown'], ['stopwatch', 'Stopwatch'], ['pomodoro', 'Pomodoro']].map(([k, l]) =>
      `<button class="chip ${S.timerMode === k ? 'on' : ''}" data-act="tmMode" data-m="${k}">${l}</button>`).join('')}
  </div>`;

  if (S.timerMode === 'countdown') {
    const remMs = TimerLib.remainingCountdown(S.cd);
    const endsAt = S.cd.running && S.cd.endAt ? `Ends at ${hhmm(new Date(S.cd.endAt))}` : `${Math.round(S.cd.durationMs / 60000)} min preset`;
    return `<div class="col" style="flex:1;gap:10px">${sub}
      <div style="display:flex;align-items:center;gap:20px;flex:1">
        <div class="col" style="gap:4px">
          <div class="tm-big mono" data-live="cdTime">${clock(remMs / 1000)}</div>
          <small style="color:var(--dim)">${endsAt}</small>
          <div class="chips" style="margin-top:6px">
            <button class="chip on" data-act="cdToggle">${S.cd.running ? 'Pause' : 'Start'}</button>
            <button class="chip" data-act="cdAdj" data-d="-1">-1m</button>
            <button class="chip" data-act="cdAdj" data-d="1">+1m</button>
            <button class="chip" data-act="cdReset">Reset</button>
          </div>
        </div>
        <div class="vline"></div>
        <div class="col" style="flex:1;gap:8px">
          <span class="label">Presets</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${TimerLib.PRESETS.map((m) => `<button class="chip ${!S.cd.running && Math.round(S.cd.durationMs / 60000) === m ? 'on' : ''}" data-act="cdPreset" data-m="${m}">${m}m</button>`).join('')}
          </div>
        </div>
      </div></div>`;
  }

  if (S.timerMode === 'stopwatch') {
    const elMs = TimerLib.elapsedStopwatch(S.sw);
    const fmtSw = (ms) => {
      const cs = Math.floor((ms % 1000) / 10);
      return `${clock(ms / 1000)}.${pad(cs)}`;
    };
    const laps = [...S.sw.laps].reverse();
    return `<div class="col" style="flex:1;gap:10px">${sub}
      <div style="display:flex;gap:18px;flex:1;min-height:0">
        <div class="col" style="width:230px;justify-content:center;gap:10px">
          <div class="tm-big mono" data-live="swTime">${fmtSw(elMs)}</div>
          <div class="chips">
            <button class="chip on" data-act="swToggle">${S.sw.running ? 'Pause' : 'Start'}</button>
            <button class="chip" data-act="swLap" ${S.sw.running || elMs > 0 ? '' : 'disabled style="opacity:.4"'}>Lap</button>
            <button class="chip" data-act="swReset">Reset</button>
          </div>
        </div>
        <div class="vline"></div>
        <div class="col" style="flex:1;min-height:0;gap:6px">
          <span class="label">Laps (${laps.length})</span>
          <div class="tm-laps">${laps.length ? laps.map((l) => `<div class="tm-lap mono"><span>#${l.index}</span><span>+${fmtSw(l.splitMs)}</span><span style="color:var(--dim)">${fmtSw(l.totalMs)}</span></div>`).join('') : '<div class="note"><span>No laps recorded</span></div>'}</div>
        </div>
      </div></div>`;
  }

  // Pomodoro
  const p = S.pomo;
  const remMs = TimerLib.remainingPomodoro(p);
  const dots = Array.from({ length: p.cycles }, (_, i) => {
    const idx = i + 1;
    const cls = idx < p.cycle ? 'done' : idx === p.cycle ? 'cur' : '';
    return `<i class="pomo-dot ${cls}"></i>`;
  }).join('');
  return `<div class="col" style="flex:1;gap:10px">${sub}
    <div style="display:flex;align-items:center;gap:24px;flex:1">
      <div class="col" style="gap:6px">
        <span class="label" style="color:${p.phase === 'focus' ? 'var(--mint)' : 'var(--rest)'}">${p.phase === 'focus' ? 'Focus' : 'Break'} · Cycle ${p.cycle}/${p.cycles}</span>
        <div class="tm-big mono" data-live="pomoTime">${clock(remMs / 1000)}</div>
        <div class="pomo-dots">${dots}<small style="color:var(--dim);margin-left:6px">${p.completedToday} completed today</small></div>
      </div>
      <div class="vline"></div>
      <div class="col" style="gap:8px">
        <div class="chips">
          <button class="chip on" data-act="pomoToggle">${p.running ? 'Pause' : 'Start'}</button>
          <button class="chip" data-act="pomoSkip">Skip</button>
          <button class="chip" data-act="pomoReset">Reset</button>
        </div>
        <small style="color:var(--dim)">25m focus · 5m short break · 15m long break after ${p.cycles} cycles</small>
      </div>
    </div></div>`;
}

function syncPomoFocus() {
  if (S.pomo.running) {
    S.focus = { phase: S.pomo.phase === 'focus' ? 'focus' : 'rest', end: S.pomo.endAt, total: S.pomo.totalMs, title: 'Pomodoro' };
  } else if (S.focus?.title === 'Pomodoro') {
    S.focus = null;
  }
}

function checkTimers() {
  const now = Date.now();
  if (S.cd.running && S.cd.endAt && now >= S.cd.endAt) {
    S.cd = { ...S.cd, running: false, remainingMs: 0, endAt: null };
    chime([880, 660, 880]);
    if (!S.pinned) S.expanded = false;
    showFlash({ kind: 'timerDone', title: `${Math.round(S.cd.durationMs / 60000)}m countdown` }, 30);
  }
  if (S.pomo.running && S.pomo.endAt && now >= S.pomo.endAt) {
    const wasRest = S.pomo.phase !== 'focus';
    S.pomo = TimerLib.advancePomodoro(S.pomo);
    syncPomoFocus();
    chime(wasRest ? [784, 659] : [523, 659, 784]);
    if (!S.pinned) S.expanded = false;
    showFlash({ kind: 'focusEnd', rest: wasRest, title: 'Pomodoro' }, 30);
  }
}

/* ================= System Stats ================= */
function sparklineSVG(values, color) {
  if (!values.length) return '';
  const w = 320, h = 36;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w : (i / (values.length - 1)) * w;
    const y = h - Math.max(0, Math.min(100, v)) / 100 * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts}"/></svg>`;
}

function systemHTML() {
  const s = S.sys;
  const upFmt = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`; };
  const top = `<div class="chips"><span class="label">Live System Stats</span><span class="sp"></span>
    <button class="chip ${S.cfg.sysNotch ? 'on' : ''}" data-act="sysNotchToggle">Show on closed notch</button></div>`;
  if (!s) return `<div class="col" style="flex:1;gap:10px">${top}<div class="note">${IC.system}<span>Sampling CPU, memory & network…</span></div></div>`;
  const cpuPts = S.sysHist.map((x) => x.cpu);
  const memPts = S.sysHist.map((x) => x.mem);
  return `<div class="col" style="flex:1;gap:10px">${top}
    <div class="sys-grid">
      <div class="sys-card"><small>CPU</small><b class="mono" style="color:var(--mint)">${s.cpu}%</b><span>${S.battery ? `Battery ${s.battery.level}%` : 'AC Power'}</span></div>
      <div class="sys-card"><small>Memory</small><b class="mono">${s.mem.pct}%</b><span>${fmtBytes(s.mem.used)} / ${fmtBytes(s.mem.total)}</span></div>
      <div class="sys-card"><small>Network</small><b class="mono">↓ ${fmtSpeed(s.net.downBps)}</b><span>↑ ${fmtSpeed(s.net.upBps)}</span></div>
      <div class="sys-card"><small>Disk & Uptime</small><b class="mono">${s.disk.total ? fmtBytes(s.disk.free) : '—'}</b><span>free · up ${upFmt(s.uptimeSec)}</span></div>
    </div>
    <div class="sys-spark">
      <div class="col" style="width:92px"><small style="color:var(--mint);font-size:10.5px;font-weight:600">CPU 60s</small><small style="color:var(--rest);font-size:10.5px;font-weight:600">Mem 60s</small></div>
      <div style="flex:1;position:relative;height:38px">
        ${sparklineSVG(cpuPts, 'var(--mint)')}
      </div>
      <div style="flex:1;position:relative;height:38px">
        ${sparklineSVG(memPts, 'var(--rest)')}
      </div>
    </div></div>`;
}

/* ================= Small Tools ================= */
function toolsHTML() {
  const sub = `<div class="chips">
    ${[['color', 'Color', 'eyedropper'], ['calc', 'Calc', 'calc'], ['qr', 'QR', 'qr'], ['convert', 'Convert', 'globe']].map(([k, l, ic]) =>
      `<button class="chip ${S.toolsSub === k ? 'on' : ''}" data-act="toolSub" data-m="${k}">${IC[ic]} ${l}</button>`).join('')}
  </div>`;

  if (S.toolsSub === 'color') {
    const info = Tools.colorInfo(S.colorHex) || Tools.colorInfo('#5cdba8');
    return `<div class="col" style="flex:1;gap:10px">${sub}
      <div style="display:flex;gap:16px;align-items:center;flex:1">
        <div class="col" style="gap:8px">
          <div style="display:flex;gap:10px;align-items:center">
            <span class="swatch" style="background:${esc(info.hex)}"></span>
            <div class="field" style="width:120px;height:30px"><input id="colorIn" value="${esc(S.colorHex)}" placeholder="#5cdba8" autocomplete="off"></div>
            ${typeof EyeDropper !== 'undefined' ? `<button class="chip on" data-act="pickColor">${IC.eyedropper} Pick</button>` : ''}
          </div>
          <div class="chips">${S.colorHist.map((c) => `<button class="color-chip" style="background:${esc(c)}" data-act="useColor" data-c="${esc(c)}" title="${esc(c)}"></button>`).join('')}</div>
        </div>
        <div class="vline"></div>
        <div class="col" style="flex:1;gap:6px">
          <div class="chips">
            <button class="chip" data-act="copyVal" data-v="${esc(info.hex)}">${IC.copy} ${esc(info.hex)}</button>
            <button class="chip" data-act="copyVal" data-v="${esc(info.rgb)}">${IC.copy} ${esc(info.rgb)}</button>
            <button class="chip" data-act="copyVal" data-v="${esc(info.hsl)}">${IC.copy} ${esc(info.hsl)}</button>
          </div>
          <small style="color:var(--dim)">WCAG Contrast — White: <b class="mono">${info.contrastWhite}:1</b> · Black: <b class="mono">${info.contrastBlack}:1</b></small>
        </div>
      </div></div>`;
  }

  if (S.toolsSub === 'calc') {
    const res = S.calcExpr.trim() ? Tools.calc(S.calcExpr) : null;
    return `<div class="col" style="flex:1;gap:8px">${sub}
      <div style="display:flex;gap:14px;flex:1;min-height:0">
        <div class="col" style="flex:1;gap:8px">
          <div class="field">${IC.calc}<input id="calcIn" placeholder="e.g. 1250*15%, 2^10, sqrt(2), 5!" value="${esc(S.calcExpr)}" autocomplete="off"></div>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="chip on" data-act="copyVal" data-v="${res?.ok ? esc(res.formatted) : ''}" ${res?.ok ? '' : 'disabled style="opacity:.4"'}>
              ${res?.ok ? `${IC.copy} = ${esc(res.formatted)}` : res ? esc(res.error) : 'Type an expression, Enter to save'}
            </button>
          </div>
        </div>
        <div class="vline"></div>
        <div class="col" style="width:240px;min-height:0;gap:4px">
          <span class="label">History</span>
          <div class="scroll">${S.calcHist.length ? S.calcHist.map((h) => `<div class="row" data-act="copyVal" data-v="${esc(h.res)}" title="Click to copy result"><span class="t"><b>${esc(h.expr)}</b></span><span class="d mono">= ${esc(h.res)}</span></div>`).join('') : '<div class="note"><span>Press Enter to save</span></div>'}</div>
        </div>
      </div></div>`;
  }

  if (S.toolsSub === 'qr') {
    const lastTextClip = S.clips.find((c) => c.type === 'text')?.text || '';
    const txt = S.qrText || lastTextClip || 'https://github.com/Hiroyki/nusa';
    let svg = '';
    try { svg = QR.toSVG(txt, 3); } catch { svg = '<span style="color:var(--late)">Text too long</span>'; }
    return `<div class="col" style="flex:1;gap:8px">${sub}
      <div style="display:flex;gap:14px;align-items:center;flex:1">
        <div style="width:118px;height:118px;background:#fff;border-radius:10px;display:grid;place-items:center;overflow:hidden;flex:none" id="qrWrap">${svg.replace(/width="[^"]*" height="[^"]*"/, 'width="112" height="112"')}</div>
        <div class="col" style="flex:1;gap:8px">
          <div class="field">${IC.qr}<input id="qrIn" placeholder="Text or URL to encode…" value="${esc(S.qrText)}" autocomplete="off"></div>
          <div class="chips">
            <button class="chip on" data-act="copyQrSvg">${IC.copy} Copy SVG</button>
            ${lastTextClip ? `<button class="chip" data-act="qrFromClip">Use last clipboard</button>` : ''}
          </div>
        </div>
      </div></div>`;
  }

  // Convert + Timezones
  const cats = Object.keys(Tools.UNIT_CATEGORIES);
  const units = S.convCat === 'temperature' ? Tools.UNIT_CATEGORIES.temperature : Object.keys(Tools.UNIT_CATEGORIES[S.convCat]);
  if (!units.includes(S.convFrom)) S.convFrom = units[0];
  if (!units.includes(S.convTo)) S.convTo = units[1] || units[0];
  const convRes = Tools.convertUnit(S.convVal, S.convFrom, S.convTo, S.convCat);
  const convStr = Number.isFinite(convRes) ? String(Number(convRes.toPrecision(8))) : '—';
  const now = new Date();

  return `<div class="col" style="flex:1;gap:8px;min-height:0">${sub}
    <div style="display:flex;gap:12px;flex:1;min-height:0">
      <div class="col" style="width:270px;gap:6px">
        <div class="chips" style="flex-wrap:wrap">${cats.map((c) => `<button class="chip ${S.convCat === c ? 'on' : ''}" data-act="convCat" data-c="${c}">${c}</button>`).join('')}</div>
        <div style="display:flex;gap:6px;align-items:center">
          <div class="field" style="flex:1;height:28px"><input id="convIn" value="${esc(S.convVal)}" autocomplete="off"></div>
          <select id="convFrom" style="background:var(--chip);border:0;border-radius:8px;height:28px;padding:0 6px">${units.map((u) => `<option value="${u}" ${u === S.convFrom ? 'selected' : ''}>${u}</option>`).join('')}</select>
          <button class="small-btn" data-act="convSwap" title="Swap">${IC.swap}</button>
          <select id="convTo" style="background:var(--chip);border:0;border-radius:8px;height:28px;padding:0 6px">${units.map((u) => `<option value="${u}" ${u === S.convTo ? 'selected' : ''}>${u}</option>`).join('')}</select>
        </div>
        <button class="chip on" data-act="copyVal" data-v="${esc(convStr)}" style="align-self:flex-start">${IC.copy} = ${esc(convStr)} ${esc(S.convTo)}</button>
      </div>
      <div class="vline"></div>
      <div class="col" style="flex:1;min-height:0;gap:6px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px">
          <span class="label">World Clock</span>
          <input type="range" id="tzRange" min="-12" max="12" value="${S.tzOffset}" style="flex:1">
          <span class="mono" style="width:36px;text-align:right">${S.tzOffset >= 0 ? '+' : ''}${S.tzOffset}h</span>
        </div>
        <div class="tz-grid">${Tools.TIMEZONE_CITIES.map((c) => {
          const z = Tools.formatInZone(now, c.tz, S.tzOffset);
          return `<div class="tz-card"><div><small>${esc(c.name)}</small><span style="font-size:10px;color:var(--faint)">${esc(z.date)}</span></div><b class="mono">${z.time}</b></div>`;
        }).join('')}</div>
      </div>
    </div></div>`;
}

/* ================= Settings View ================= */
function settingsHTML() {
  const tog = (act, on, data = '') => `<button class="toggle ${on ? 'on' : ''}" data-act="${act}" ${data}></button>`;
  return `<div class="col" style="flex:1;gap:8px;min-height:0">
    <div class="chips">
      <span class="label">Settings</span><span class="sp"></span>
      <button class="chip" data-act="login">${S.loginAtBoot ? 'Start at login: On' : 'Start at login: Off'}</button>
      <button class="chip" data-act="quit" style="color:var(--late)">Quit Nusa</button>
      <button class="chip on" data-act="closeSettings">Done</button>
    </div>
    <div class="set-grid">
      <div class="set-row"><span>Theme</span><select id="setTheme">${BUILTIN_THEMES.map((t) => `<option value="${t.id}" ${t.id === S.theme ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="set-row"><span>Location</span><select id="setCity"><option value="auto" ${S.autoPlace ? 'selected' : ''}>Auto (${esc(S.place.name)})</option>${Places.CITIES.map((c) => `<option value="${esc(c.name)}" ${!S.autoPlace && c.name === S.place.name ? 'selected' : ''}>${esc(c.name)} · ${c.zone}</option>`).join('')}</select></div>
      <div class="set-row"><span>Clipboard history</span><div style="display:flex;gap:6px;align-items:center"><select id="setClipMode"><option value="text" ${S.cfg.clipsMode === 'text' ? 'selected' : ''}>Text</option><option value="files" ${S.cfg.clipsMode === 'files' ? 'selected' : ''}>Files</option><option value="all" ${S.cfg.clipsMode === 'all' ? 'selected' : ''}>All</option></select>${tog('cfgToggle', S.cfg.clipsEnabled, 'data-k="clipsEnabled"')}</div></div>
      <div class="set-row"><span>Windows notifications</span><div style="display:flex;gap:6px;align-items:center">${S.cfg.notifMuted.length ? `<button class="chip" data-act="notifUnmuteAll">Unmute (${S.cfg.notifMuted.length})</button>` : ''}${tog('cfgToggle', S.cfg.notifEnabled, 'data-k="notifEnabled"')}</div></div>
      <div class="set-row"><span>Notification body preview</span>${tog('cfgToggle', S.cfg.notifBody, 'data-k="notifBody"')}</div>
      <div class="set-row"><span>Mic & camera dots</span>${tog('cfgToggle', S.cfg.privacyDots, 'data-k="privacyDots"')}</div>
      <div class="set-row"><span>Live system stats tab</span>${tog('cfgToggle', S.cfg.sysEnabled, 'data-k="sysEnabled"')}</div>
      <div class="set-row"><span>System stats on closed notch</span>${tog('cfgToggle', S.cfg.sysNotch, 'data-k="sysNotch"')}</div>
      <div class="set-row"><span>Show Water tab</span>${tog('tabToggle', S.cfg.tabs.water !== false, 'data-k="water"')}</div>
      <div class="set-row"><span>Show Timer tab</span>${tog('tabToggle', S.cfg.tabs.timer !== false, 'data-k="timer"')}</div>
      <div class="set-row"><span>Show Tools tab</span>${tog('tabToggle', S.cfg.tabs.tools !== false, 'data-k="tools"')}</div>
      <div class="set-row"><span>Show System tab</span>${tog('tabToggle', Boolean(S.cfg.tabs.system || S.cfg.sysEnabled), 'data-k="system"')}</div>
    </div>
  </div>`;
}

/* ================= Small Dropdown Menus ================= */
function menuHTML() {
  const m = S.menu;
  const item = (label, act, data, on) => `<button class="${on ? 'on' : ''}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
  let body = '';
  if (m.type === 'city') body = item(S.autoPlace ? `Current location · ${S.locating ? 'locating…' : S.place.name}` : 'Current location', 'cityAuto', {}, S.autoPlace)
    + `<div class="h">Cities</div>` + Places.CITIES.map((c) => item(`${c.name} · ${c.zone}`, 'city', { c: c.name }, !S.autoPlace && c.name === S.place.name)).join('');
  if (m.type === 'wx' && S.weather) body = `<div class="h">${esc(S.place.name)} · ${wxLabel(S.weather.code)} · feels ${Math.round(S.weather.feels)}°</div>`
    + S.weather.hours.filter((h) => h.time > Date.now() - 1800000).map((h) => `<button>${hhmm(new Date(h.time), S.place.tz)}  ${Math.round(h.temp)}°  rain ${h.rain}%</button>`).join('') + `<div class="h">Data: Open-Meteo</div>`;
  return `<div class="menu" style="left:${m.x}px;top:${m.y}px">${body}</div>`;
}

function openMenu(type, el, extra = {}) {
  const r = el.getBoundingClientRect(), box = $('#island').getBoundingClientRect();
  S.menu = { type, x: Math.min(r.left - box.left, box.width - 220), y: r.bottom - box.top + 4, ...extra };
  render(true);
  const el2 = $('.menu');
  if (el2) { S.menu.h = el2.offsetHeight; render(); }
}

/* ================= Weather & Location ================= */
function setPlace(p) {
  S.place = p;
  loadWeather();
  render(true);
}

async function locateUser() {
  if (!S.autoPlace || S.locating) return;
  S.locating = true;
  const r = await nusa.locate().catch(() => null);
  S.locating = false;
  if (!S.autoPlace) return;
  if (!r) return render(true);
  const last = LS.get('autoPlace', null);
  const near = last && last.tz === r.tz && Math.abs(last.lat - r.lat) < 0.03 && Math.abs(last.lon - r.lon) < 0.03;
  if (!near) LS.set('autoPlace', r);
  const p = Places.place(near ? last : r);
  if (p.name !== S.place.name || p.lat !== S.place.lat || p.lon !== S.place.lon || p.tz !== S.place.tz) setPlace(p);
  else render(true);
}

function chime(freqs) {
  try {
    const ctx = new AudioContext();
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.16;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1);
    });
    setTimeout(() => ctx.close(), 2500);
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=8&timeformat=unixtime`;
    const d = await (await fetch(url)).json();
    const h = d.hourly;
    S.weather = { temp: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code, day: d.current.is_day === 1,
      hours: h.time.map((t, i) => ({ time: t * 1000, temp: h.temperature_2m[i], rain: h.precipitation_probability[i] ?? 0, code: h.weather_code[i] })) };
    const now = Date.now();
    const wet = S.weather.hours.find((x) => x.time > now - 1800000 && x.time < now + 7200000 && x.rain >= 60);
    if (wet && now - lastRain > 3 * 3600000 && !isRain(S.weather.code) && S.focus?.phase !== 'focus') {
      lastRain = now;
      showFlash({ kind: 'rain', time: hhmm(new Date(wet.time), S.place.tz), chance: wet.rain }, 8);
    }
    render();
  } catch {}
}

/* ================= Focus & Quick Timer ================= */
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
  showFlash({ kind: 'focusEnd', rest: f.phase === 'rest', title: f.title }, 60);
}
function startTimer(m) {
  clearTimeout(timerDone);
  S.timer = { end: Date.now() + m * 60000, total: m * 60000 };
  timerDone = setTimeout(() => { S.timer = null; chime([880, 660, 880]); render(true); if (!S.expanded) showFlash({ kind: 'done' }, 4); }, m * 60000);
  render(true);
}

/* ================= Live 1s Updates ================= */
const LIVE = {
  timerLeft: () => S.timer ? clock((S.timer.end - Date.now()) / 1000 + 0.999) : '',
  focusLeft: () => S.focus ? clock((S.focus.end - Date.now()) / 1000 + 0.999) : '',
  focusRing: () => ringSVG('focus'),
  idle: () => idleHTML(),
  mbar: () => { const m = S.media; if (!m?.duration) return ''; return `<i style="width:${Math.min(100, (S.scrub ?? mediaPos()) / m.duration * 100)}%"></i>`; },
  mtime: () => { const m = S.media; if (!m?.duration) return ''; return `<span>${clock(Math.min(S.scrub ?? mediaPos(), m.duration))}</span><span>${clock(m.duration)}</span>`; },
  volLevel: () => S.audio ? `<i style="width:${(S.audio.muted ? 0 : S.audio.vol) * 100}%"></i>` : '',
  volFlash: volFlashHTML,
  agenda: agendaHTML, wxCard: wxCardHTML,
  cdTime: () => clock(TimerLib.remainingCountdown(S.cd) / 1000 + (S.cd.running ? 0.999 : 0)),
  swTime: () => {
    const ms = TimerLib.elapsedStopwatch(S.sw);
    return `${clock(ms / 1000)}.${pad(Math.floor((ms % 1000) / 10))}`;
  },
  pomoTime: () => clock(TimerLib.remainingPomodoro(S.pomo) / 1000 + (S.pomo.running ? 0.999 : 0)),
};

const mediaPos = () => { const m = S.media; return (m?.position || 0) + (m?.playing ? (Date.now() - m.at) / 1000 : 0); };

function live() {
  for (const el of document.querySelectorAll('[data-live]')) {
    const html = LIVE[el.dataset.live]?.() ?? '';
    if (el._last !== html) { el._last = html; el.innerHTML = html; }
  }
}

let idleStep = -1;
function idleHTML() {
  const items = [...(S.weather ? ['wx'] : []), 'clock', ...(S.cfg.sysNotch && S.sys ? ['sys'] : [])];
  const step = Math.floor(Date.now() / 5000);
  const k = items[step % items.length];
  const anim = step !== idleStep ? ' style="animation:morphIn .4s var(--soft) both;display:inline-flex;gap:5px;align-items:center"' : ' style="display:inline-flex;gap:5px;align-items:center"';
  idleStep = step;
  if (k === 'wx') return `<span${anim}>${IC[wxIcon(S.weather.code, S.weather.day)]}<span class="mono">${Math.round(S.weather.temp)}°</span></span>`;
  if (k === 'sys') return `<span${anim}><span style="color:var(--mint)">${IC.system}</span><span class="mono">${S.sys.cpu}% · ↓${fmtSpeed(S.sys.net.downBps)}</span></span>`;
  return `<span${anim}><span style="color:var(--dim)">${IC.clock}</span><span class="mono">${hhmm(new Date())}</span></span>`;
}

/* ================= IPC Events ================= */
let closeTimer = null;
nusa.on('yield', (on) => {
  S.yielded = on;
  if (on) { S.hover = false; if (!S.pinned) S.expanded = false; }
  $('#island').classList.toggle('yield', on && !S.flash);
  render();
});

nusa.on('hover', (over) => {
  S.hover = over;
  clearTimeout(closeTimer);
  if (!over && S.expanded && !S.pinned && !S.menu) closeTimer = setTimeout(() => { S.expanded = false; render(); }, 250);
  render();
});

nusa.on('open-panel', () => { S.expanded = true; nusa.focus(); render(true); });
window.addEventListener('blur', () => { if (S.expanded && !S.pinned && !S.menu) { S.expanded = false; render(); } });

nusa.on('media', (st) => {
  const before = S.media;
  S.media = st;
  if (st?.art && st.art !== before?.art) computeTint(st.art);
  if (!st?.art) S.tint = null;
  const newTrack = before?.title && st?.title && st.title !== before.title && st.playing;
  const changed = mediaSig(before) !== mediaSig(st);
  if (newTrack && !S.expanded && S.focus?.phase !== 'focus') showFlash({ kind: 'track' }, 2.6);
  else if (lastKey === 'x:music') {
    if (!S.music.online && changed) refreshBody();
    render();
  }
  else render(changed && (lastKey === 'music' || lastKey === 'x:home'));
});
const mediaSig = (x) => JSON.stringify(x && [x.title, x.artist, x.album, x.art, x.hiArt, x.icon, x.app, x.playing, x.canSeek, x.noTimeline, Math.round(x.duration || 0)]);

nusa.on('clip', (raw) => {
  if (!S.cfg.clipsEnabled) return;
  const item = typeof raw === 'string' ? { type: 'text', text: raw } : raw;
  if (!item) return;
  const sig = item.type === 'text' ? 't:' + item.text : item.type === 'image' ? 'i:' + item.hash : 'f:' + (item.files || []).map((f) => f.path).join('|');
  if (item.type === 'text' && !item.text?.trim()) return;
  const entry = { ...item, id: uid(), sig };
  if (S.clips[0]?.sig === sig) return;
  S.clips = [entry, ...S.clips.filter((c) => c.sig !== sig)].slice(0, 30);
  if (S.expanded && !S.settingsOpen && S.tab === 'clips') render(true);
});

let volDragging = false;
nusa.on('audio', (a) => {
  const before = S.audio;
  if (volDragging && a) a = { ...a, vol: S.audio?.vol ?? a.vol };
  S.audio = a;
  if (!a) return render(lastKey.startsWith('x:'));
  const changed = before && before.id === a.id && (Math.abs(before.vol - a.vol) > 0.004 || before.muted !== a.muted);
  if (changed && !S.expanded && !['task', 'focusEnd', 'device', 'phoneDrop', 'waterRemind', 'timerDone', 'notif'].includes(S.flash?.kind)) showFlash({ kind: 'volume', level: a.vol, muted: a.muted }, 1.6);
  if (S.expanded && (!before || before.muted !== a.muted || before.id !== a.id)) render(true);
  else live();
});

nusa.on('device', (d) => {
  if (S.expanded) return;
  showFlash({ kind: 'device', name: d.name.replace(/^.*\((.*)\)\s*$/, '$1') || d.name, detail: d.detail }, 4);
});

nusa.on('system', (snap) => {
  S.sys = snap;
  if (snap) {
    S.sysHist.push({ cpu: snap.cpu, mem: snap.mem.pct });
    if (S.sysHist.length > 60) S.sysHist.shift();
  }
  if (S.expanded && !S.settingsOpen && S.tab === 'system') render(true);
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
    S.cfg.notifEnabled = false;
    saveCfg();
    showFlash({ kind: 'notif', app: 'Nusa', title: 'Notification access denied', body: 'Enable in Windows Settings' }, 5);
    return;
  }
  if (S.cfg.notifMuted.includes(n.app)) return;
  if (!S.expanded && S.focus?.phase !== 'focus') {
    showFlash({ kind: 'notif', app: n.app, title: n.title, body: n.body }, 5);
  }
});

nusa.on('phonedrop-state', (st) => {
  S.phoneDrop = st?.active ? { active: true, url: st.url } : { active: false, url: null };
  if (S.expanded && !S.settingsOpen && S.tab === 'tray') render(true);
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

/* ================= Dragging, Seeking, Swiping ================= */
function dragOn(el, onMove, onEnd) {
  const at = (e) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const move = (e) => onMove(at(e));
  const up = (e) => { try { el.releasePointerCapture(e.pointerId); } catch {} el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('drag'); onEnd?.(at(e)); };
  return (e) => { try { el.setPointerCapture(e.pointerId); } catch {} el.classList.add('drag'); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); move(e); };
}

document.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest('.bar.seek');
  if (bar && seekable(S.media)) {
    const dur = S.media.duration;
    dragOn(bar, (f) => { S.scrub = f * dur; live(); }, (f) => { nusa.media(`seek ${(f * dur).toFixed(2)}`); S.media = { ...S.media, position: f * dur, at: Date.now() }; S.scrub = null; live(); })(e);
    return;
  }
  const vt = e.target.closest('#volTrack');
  if (vt && S.audio) {
    volDragging = true;
    let last = 0;
    const set = (f) => {
      S.audio = { ...S.audio, vol: f, muted: f === 0 ? S.audio.muted : false }; live();
      if (Date.now() - last > 40) { last = Date.now(); nusa.volume(f); }
    };
    dragOn(vt, set, (f) => { nusa.volume(f); setTimeout(() => { volDragging = false; }, 400); })(e);
  }
});

const swipe = { total: 0, fired: false, idle: null };
document.addEventListener('wheel', (e) => {
  if (S.expanded || !S.media?.title || !e.target.closest('#island')) return;
  clearTimeout(swipe.idle);
  swipe.idle = setTimeout(() => { swipe.total = 0; swipe.fired = false; }, 220);
  if (swipe.fired || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
  swipe.total += e.deltaX;
  if (Math.abs(swipe.total) < 45) return;
  swipe.fired = true;
  const next = swipe.total > 0;
  nusa.media(next ? 'next' : 'prev');
  const island = $('#island');
  island.style.translate = `calc(-50% + ${next ? -7 : 7}px) 0`;
  setTimeout(() => { island.style.translate = ''; }, 140);
}, { passive: true });

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea')) return;
  e.preventDefault();
  if (e.target.closest('#island')) nusa.contextMenu();
});

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', (e) => { e.preventDefault(); if (hasFiles(e)) e.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (!S.expanded || S.tab !== 'tray' || !S.dropping) { S.expanded = true; S.settingsOpen = false; S.tab = 'tray'; S.dropping = true; render(true); }
});
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget && document.documentElement.contains(e.relatedTarget)) return;
  if (S.dropping) { S.dropping = false; if (S.expanded) render(true); }
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  S.dropping = false;
  const paths = [...(e.dataTransfer?.files || [])].map((f) => nusa.filePath(f)).filter(Boolean);
  for (const p of paths) await addToShelf(p);
  if (S.expanded) render(true);
});
document.addEventListener('dragstart', (e) => {
  if (e.target.id === 'dragSelBtn') {
    e.preventDefault();
    nusa.trayDragMany(S.shelfSel);
    return;
  }
  const clipCard = e.target.closest?.('[data-clip-id]');
  if (clipCard) {
    e.preventDefault();
    const c = findClip(clipCard.dataset.clipId);
    if (c) nusa.clipDrag(c);
    return;
  }
  const it = e.target.closest?.('.sitem');
  if (!it) return;
  e.preventDefault();
  if (it.dataset.ni != null) {
    const n = S.shelfNotes[+it.dataset.ni];
    if (n) nusa.trayDragText(n.text);
  } else if (it.dataset.i != null) {
    const p = S.shelf[+it.dataset.i];
    if (S.shelfSel.length > 1 && S.shelfSel.includes(p)) nusa.trayDragMany(S.shelfSel);
    else nusa.fileDrag(p);
  }
});

/* ================= Mirror & Cover Tint ================= */
async function toggleMirror() {
  if (S.mirror?.stream) return stopMirror(true);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    S.mirror = { stream };
  } catch { S.mirror = { denied: true }; }
  render(true);
}
function stopMirror(rerender) {
  S.mirror?.stream?.getTracks().forEach((t) => t.stop());
  S.mirror = null;
  if (rerender) render(true);
}

function computeTint(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
      const px = g.getImageData(0, 0, 24, 24).data;
      let best = null;
      for (let i = 0; i < px.length; i += 4) {
        const [r, gr, b] = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
        const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), sat = mx ? (mx - mn) / mx : 0;
        if (sat * mx > (best?.score ?? 0.12)) best = { score: sat * mx, r, g: gr, b, mx };
      }
      if (!best) { S.tint = null; return render(); }
      const k = Math.max(1, 0.88 / best.mx);
      S.tint = '#' + [best.r, best.g, best.b].map((v) => Math.round(Math.min(1, v * k) * 255).toString(16).padStart(2, '0')).join('');
    } catch { S.tint = null; }
    render(true);
  };
  img.src = src;
}

/* ================= Inputs & Clicks ================= */
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'musicQ') { S.music.query = e.target.value; musicSearch(); }
  else if (id === 'taskIn') {
    S.taskText = e.target.value;
    const due = S.taskPick?.[1] ?? TaskParser.parse(S.taskText).due;
    $('#taskPreview').innerHTML = S.taskText && due ? `<span class="chip on">${IC.bell}${dueText(new Date(due))}</span>` : '';
  } else if (id === 'clipQ') { S.clipQuery = e.target.value; render(true); $('#clipQ')?.focus(); }
  else if (id === 'clipSnip') { S.clipSnippet = e.target.value; }
  else if (id === 'noteIn') { S.noteText = e.target.value; }
  else if (id === 'colorIn') {
    S.colorHex = e.target.value;
    if (Tools.colorInfo(S.colorHex)) render(true);
    $('#colorIn')?.focus();
  } else if (id === 'calcIn') {
    S.calcExpr = e.target.value;
    render(true);
    const el = $('#calcIn');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (id === 'qrIn') {
    S.qrText = e.target.value;
    render(true);
    const el = $('#qrIn');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (id === 'convIn') {
    S.convVal = e.target.value;
    render(true);
    const el = $('#convIn');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (id === 'tzRange') {
    S.tzOffset = +e.target.value;
    render(true);
  }
});

document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'convFrom') { S.convFrom = e.target.value; render(true); }
  else if (id === 'convTo') { S.convTo = e.target.value; render(true); }
  else if (id === 'wGoal' || id === 'wSip' || id === 'wBottle' || id === 'wStart' || id === 'wEnd') {
    const val = Math.max(1, Number(e.target.value) || 0);
    const key = { wGoal: 'goalMl', wSip: 'sipMl', wBottle: 'bottleMl', wStart: 'startHour', wEnd: 'endHour' }[id];
    S.water = { ...S.water, [key]: id === 'wStart' || id === 'wEnd' ? Math.min(24, Math.max(0, Number(e.target.value) || 0)) : val };
    saveWater(); render(true);
  } else if (id === 'setTheme') {
    S.theme = e.target.value; LS.set('theme', S.theme); applyTheme(); render(true);
  } else if (id === 'setCity') {
    const v = e.target.value;
    if (v === 'auto') { S.autoPlace = true; LS.set('city', 'auto'); locateUser(); }
    else { S.autoPlace = false; LS.set('city', v); setPlace(Places.city(v)); }
  } else if (id === 'setClipMode') {
    S.cfg.clipsMode = e.target.value; saveCfg(); render(true);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.target.id === 'taskIn') addTask();
    else if (e.target.id === 'noteIn' && S.noteText.trim()) {
      S.shelfNotes = [{ text: S.noteText.trim() }, ...S.shelfNotes];
      S.noteText = ''; LS.set('shelfNotes', S.shelfNotes); render(true);
    } else if (e.target.id === 'clipSnip' && S.clipSnippet.trim()) {
      const entry = { id: uid(), type: 'text', text: S.clipSnippet.trim(), sig: 't:' + S.clipSnippet.trim() };
      S.pinnedClips = [entry, ...S.pinnedClips];
      S.clipSnippet = ''; LS.set('pinnedClips', S.pinnedClips); render(true);
    } else if (e.target.id === 'calcIn') {
      const res = Tools.calc(S.calcExpr);
      if (res.ok) {
        S.calcHist = [{ expr: S.calcExpr, res: res.formatted }, ...S.calcHist].slice(0, 12);
        LS.set('calcHist', S.calcHist); render(true);
      }
    }
  }
  if (e.key === 'Escape') {
    if (S.menu) { S.menu = null; render(true); }
    else if (S.settingsOpen) { S.settingsOpen = false; render(true); }
    else if (S.expanded) { S.expanded = false; render(); }
  }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (S.menu && !e.target.closest('.menu')) { S.menu = null; if (!el || el.dataset.act.endsWith('Menu')) return render(true); }
  if (!el) {
    if (!S.expanded && e.target.closest('#island')) {
      if (S.flash?.kind === 'task') { S.flash = null; S.tab = 'tasks'; }
      else if (S.flash?.kind === 'notif') { S.flash = null; nusa.notifSettings(); return render(); }
      S.expanded = true; nusa.focus(); render(true);
    }
    return;
  }
  const d = el.dataset;
  const task = () => S.tasks.find((t) => t.id === d.id);
  const A = {
    tab: () => { S.settingsOpen = false; S.tab = d.tab; LS.set('tab', S.tab); S.menu = null; render(true); },
    pin: () => { S.pinned = !S.pinned; render(true); },
    gear: async () => { S.loginAtBoot = await nusa.loginItem(); S.settingsOpen = !S.settingsOpen; S.menu = null; render(true); },
    closeSettings: () => { S.settingsOpen = false; render(true); },
    login: async () => { S.loginAtBoot = await nusa.loginItem(!S.loginAtBoot); render(true); },
    quit: () => window.close(),
    cfgToggle: () => { S.cfg[d.k] = !S.cfg[d.k]; saveCfg(); render(true); },
    tabToggle: () => { S.cfg.tabs[d.k] = !S.cfg.tabs[d.k]; if (d.k === 'system' && !S.cfg.tabs.system) S.cfg.sysEnabled = false; saveCfg(); render(true); },
    notifUnmuteAll: () => { S.cfg.notifMuted = []; saveCfg(); render(true); },
    notifMuteApp: () => { e.stopPropagation(); if (d.app && !S.cfg.notifMuted.includes(d.app)) { S.cfg.notifMuted.push(d.app); saveCfg(); } S.flash = null; render(); },
    timer: () => startTimer(+d.m),
    timerStop: () => { clearTimeout(timerDone); S.timer = null; render(true); },
    wxMenu: () => openMenu('wx', el),
    cityMenu: () => openMenu('city', el),
    city: () => { S.autoPlace = false; LS.set('city', d.c); S.menu = null; setPlace(Places.city(d.c)); },
    cityAuto: () => { S.autoPlace = true; LS.set('city', 'auto'); S.menu = null; render(true); locateUser(); },
    mprev: () => nusa.media('prev'), mnext: () => nusa.media('next'), mtoggle: () => nusa.media('toggle'),
    openSource: () => { const m = S.media; if (m) nusa.openSource({ pid: m.pid, path: m.path, source: m.source }); },
    muteToggle: () => { if (S.audio) { nusa.mute(!S.audio.muted); S.audio = { ...S.audio, muted: !S.audio.muted }; render(true); } },
    calDay: () => { S.calSel = +d.t; render(true); },
    calSettings: () => nusa.calendarSettings(),
    mirror: () => toggleMirror(),
    // Tray
    fileOpen: () => nusa.fileOpen(S.shelf[+d.i]),
    fileRemove: () => { e.stopPropagation(); removeFromShelf(S.shelf[+d.i]); },
    fileSel: () => { e.stopPropagation(); const p = d.path; S.shelfSel = S.shelfSel.includes(p) ? S.shelfSel.filter((x) => x !== p) : [...S.shelfSel, p]; render(true); },
    removeSelected: () => { S.shelf = S.shelf.filter((p) => !S.shelfSel.includes(p)); S.shelfSel = []; LS.set('shelf', S.shelf); syncShelfMain(); render(true); },
    addShelfNote: () => { if (!S.noteText.trim()) return; S.shelfNotes = [{ text: S.noteText.trim() }, ...S.shelfNotes]; S.noteText = ''; LS.set('shelfNotes', S.shelfNotes); render(true); },
    noteCopy: () => { const n = S.shelfNotes[+d.ni]; if (n) nusa.copy(n.text); },
    noteRemove: () => { e.stopPropagation(); S.shelfNotes.splice(+d.ni, 1); LS.set('shelfNotes', S.shelfNotes); render(true); },
    fileShow: () => nusa.fileShow(S.shelf[S.shelf.length - 1]),
    trayClear: () => { S.shelf = []; S.shelfNotes = []; S.shelfSel = []; LS.set('shelf', []); LS.set('shelfNotes', []); syncShelfMain(); render(true); },
    // Phone Drop
    pdStart: async () => { const info = await nusa.phonedropStart(); if (info?.url) { S.phoneDrop = { active: true, url: info.url }; render(true); } },
    pdStop: () => { nusa.phonedropStop(); S.phoneDrop = { active: false, url: null }; render(true); },
    pdCopyUrl: () => { if (S.phoneDrop.url) nusa.copy(S.phoneDrop.url); },
    pdApprove: async () => { e.stopPropagation(); await nusa.phonedropApprove(d.id); S.flash = null; render(); },
    pdDecline: () => { e.stopPropagation(); nusa.phonedropDecline(d.id); S.flash = null; render(); },
    // Music
    mjump: () => { const s = S.music.queue[+d.k]; if (s) nusa.senandung('POST', '/api/remote/cmd', { cmd: 'jump', index: s.i }); },
    mplay: () => { const s = S.music.results[+d.k]; if (s) nusa.senandung('POST', '/api/remote/cmd', { cmd: 'play', item: s }); },
    mqueue: () => { e.stopPropagation(); const s = S.music.results[+d.k]; if (s) nusa.senandung('POST', '/api/remote/cmd', { cmd: 'queue', item: s }); },
    // Tasks & Focus
    pick: () => { S.taskPick = S.taskPick?.[0] === d.l ? null : [d.l, +d.t]; render(true); $('#taskIn')?.focus(); },
    taskToggle: () => { const t = task(); if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; saveTasks(); refreshBody(); } },
    taskDel: () => { S.tasks = S.tasks.filter((t) => t.id !== d.id); saveTasks(); refreshBody(); },
    taskDone: () => { const t = task(); if (t) { t.done = true; t.doneAt = Date.now(); saveTasks(); } S.flash = null; render(); },
    taskSnooze: () => { const t = task(); if (t) { t.due = Date.now() + 600000; t.notified = false; saveTasks(); } S.flash = null; render(); },
    focus: () => startFocus(), break: () => startBreak(), focusStop: () => { clearTimeout(focusDone); S.focus = null; render(true); },
    focusTask: () => startFocus(25, task()),
    dismiss: () => { e.stopPropagation(); S.flash = null; render(); },
    // Clips
    clipsToggle: () => { S.cfg.clipsEnabled = !S.cfg.clipsEnabled; saveCfg(); render(true); },
    addSnippet: () => {
      if (!S.clipSnippet.trim()) return;
      const entry = { id: uid(), type: 'text', text: S.clipSnippet.trim(), sig: 't:' + S.clipSnippet.trim() };
      S.pinnedClips = [entry, ...S.pinnedClips]; S.clipSnippet = ''; LS.set('pinnedClips', S.pinnedClips); render(true);
    },
    clipCopy: () => {
      const c = findClip(d.id);
      if (!c) return;
      nusa.clipCopy(c); S.copied = c.id; render(true);
      setTimeout(() => { S.copied = null; render(true); }, 1200);
    },
    clipPin: () => {
      e.stopPropagation();
      const idx = S.pinnedClips.findIndex((c) => c.id === d.id);
      if (idx >= 0) S.pinnedClips.splice(idx, 1);
      else { const c = S.clips.find((x) => x.id === d.id); if (c) S.pinnedClips = [c, ...S.pinnedClips]; }
      LS.set('pinnedClips', S.pinnedClips); render(true);
    },
    clipDel: () => {
      e.stopPropagation();
      S.pinnedClips = S.pinnedClips.filter((c) => c.id !== d.id);
      S.clips = S.clips.filter((c) => c.id !== d.id);
      LS.set('pinnedClips', S.pinnedClips); render(true);
    },
    // Water
    waterDrink: () => { const r = Water.logSip(S.water, S.water.sipMl); S.water = r.state; S.waterRefill = r.refillNeeded; saveWater(); render(true); },
    waterDrinkFlash: () => { const r = Water.logSip(S.water, S.water.sipMl); S.water = r.state; S.waterRefill = r.refillNeeded; saveWater(); S.flash = null; render(); },
    waterSnooze: () => { S.water = Water.snooze(S.water, Date.now(), 15); saveWater(); S.flash = null; render(); },
    waterUndo: () => { S.water = Water.undoSip(S.water); S.waterRefill = false; saveWater(); render(true); },
    waterCfgToggle: () => { S.waterCfgOpen = !S.waterCfgOpen; render(true); },
    waterRemindToggle: () => { S.water = { ...S.water, remind: !S.water.remind }; saveWater(); render(true); },
    waterReset: () => { S.water = Water.resetDay(S.water, localDateStr()); S.waterRefill = false; saveWater(); render(true); },
    // Timer / Stopwatch / Pomodoro
    tmMode: () => { S.timerMode = d.m; render(true); },
    cdToggle: () => { S.cd = S.cd.running ? TimerLib.pauseCountdown(S.cd) : TimerLib.startCountdown(S.cd); render(true); },
    cdAdj: () => { S.cd = TimerLib.adjustCountdown(S.cd, +d.d); render(true); },
    cdPreset: () => { S.cd = TimerLib.createCountdown(+d.m); render(true); },
    cdReset: () => { S.cd = TimerLib.createCountdown(Math.round(S.cd.durationMs / 60000)); render(true); },
    cdRestart: () => { S.cd = TimerLib.startCountdown(TimerLib.createCountdown(Math.round(S.cd.durationMs / 60000))); S.flash = null; render(true); },
    swToggle: () => { S.sw = S.sw.running ? TimerLib.pauseStopwatch(S.sw) : TimerLib.startStopwatch(S.sw); render(true); },
    swLap: () => { S.sw = TimerLib.lapStopwatch(S.sw); render(true); },
    swReset: () => { S.sw = TimerLib.resetStopwatch(); render(true); },
    pomoToggle: () => { S.pomo = S.pomo.running ? TimerLib.pausePomodoro(S.pomo) : TimerLib.startPomodoro(S.pomo); syncPomoFocus(); render(true); },
    pomoSkip: () => { S.pomo = TimerLib.advancePomodoro(S.pomo); syncPomoFocus(); render(true); },
    pomoReset: () => { S.pomo = TimerLib.resetPomodoro(S.pomo); syncPomoFocus(); render(true); },
    // System
    sysNotchToggle: () => { S.cfg.sysNotch = !S.cfg.sysNotch; saveCfg(); render(true); },
    // Tools
    toolSub: () => { S.toolsSub = d.m; render(true); },
    copyVal: () => { if (d.v) nusa.copy(d.v); },
    useColor: () => { S.colorHex = d.c; render(true); },
    pickColor: async () => {
      try {
        const res = await new EyeDropper().open();
        if (res?.sRGBHex) {
          S.colorHex = res.sRGBHex;
          S.colorHist = [res.sRGBHex, ...S.colorHist.filter((x) => x !== res.sRGBHex)].slice(0, 8);
          LS.set('colorHist', S.colorHist); render(true);
        }
      } catch {}
    },
    copyQrSvg: () => { const svg = $('#qrWrap')?.innerHTML; if (svg) nusa.copy(svg); },
    qrFromClip: () => { const c = S.clips.find((x) => x.type === 'text')?.text; if (c) { S.qrText = c; render(true); } },
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
    else if (!warned) { warned = true; if (!S.expanded) showFlash({ kind: 'low', percent: S.battery.level }, 4); }
  };
  read();
  b.addEventListener('chargingchange', () => {
    read();
    if (S.expanded) return render(true);
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

window.__nusa = { S, render, showFlash, startFocus, startTimer, applyTheme, BUILTIN_THEMES };
