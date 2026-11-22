// node test/run.js — comprehensive unit & integration tests for Nusa
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

require('../app/lib/places.js');
require('../app/lib/tasks.js');
require('../app/lib/water.js');
require('../app/lib/timer.js');
require('../app/lib/tools.js');
require('../app/lib/qr.js');
require('../app/lib/lyrics.js');
require('../app/lib/ical.js');
const PhoneDrop = require('../phonedrop.js');

const { Places, TaskParser, Water, TimerLib, Tools, QR, Lyrics, ICal } = globalThis;

let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(cond ? 'ok  ' : 'FAIL', name, extra);
  if (!cond) fail++;
};
const approx = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) < eps;

// 1. Prayer & Quran removal checks
const repoRoot = path.resolve(__dirname, '..', '..');
const removedFiles = [
  'desktop/app/lib/prayer.js',
  'Sources/Prayer.swift',
  'Sources/PrayerViews.swift',
  'Sources/Quran.swift',
  'assets/adhan.mp3',
  'assets/quran.json',
];
for (const rel of removedFiles) {
  ok(`removed: ${rel}`, !fs.existsSync(path.join(repoRoot, rel)));
}

const indexPath = path.join(repoRoot, 'desktop/app/index.html');
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, 'utf8');
  ok('index.html has no prayer/adhan/quran refs', !/prayer|adhan|quran/i.test(html));
}

const appJsPath = path.join(repoRoot, 'desktop/app/app.js');
if (fs.existsSync(appJsPath)) {
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  ok('app.js has no Prayer./Quran refs', !/Prayer\.|Quran/.test(appJs));
}

// 2. Places module
ok('Places.CITIES has 14 cities', Array.isArray(Places.CITIES) && Places.CITIES.length === 14);
const jkt = Places.city('Jakarta');
ok('Places.city("Jakarta")', jkt && jkt.name === 'Jakarta' && jkt.tz === 'Asia/Jakarta');
ok('Places.zoneLabel("Asia/Makassar") === "WITA"', Places.zoneLabel('Asia/Makassar') === 'WITA');
ok('Places.zoneLabel("Asia/Jayapura") === "WIT"', Places.zoneLabel('Asia/Jayapura') === 'WIT');
ok('Places.place invalid tz falls back to Asia/Jakarta', Places.place({ name: 'X', lat: 1, lon: 2, tz: 'Not/AZone' }).tz === 'Asia/Jakarta');

// 3. TaskParser (14 existing ID + EN test cases)
const now = new Date(2026, 10, 8, 17, 30);
const fmt = (d) => d ? `${['Sun', 'Mon', 'Tue'][d.getDay()]} ${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-';
for (const [input, title, due] of [
  ['meeting besok jam 2 siang', 'meeting', 'Mon 9 14:00'],
  ['Rapat QC besok jam 9', 'Rapat QC', 'Mon 9 09:00'],
  ['minum obat 30 menit lagi', 'minum obat', 'Sun 8 18:00'],
  ['telpon ibu nanti malam', 'telpon ibu', 'Sun 8 20:00'],
  ['upload video jam 7 malam', 'upload video', 'Sun 8 19:00'],
  ['bayar listrik jam 9', 'bayar listrik', 'Mon 9 09:00'],
  ['beli galon lusa', 'beli galon', 'Tue 10 09:00'],
  ['cek mesin jam 15.30', 'cek mesin', 'Mon 9 15:30'],
  ['beresin laporan', 'beresin laporan', '-'],
  ['Call Budi tomorrow at 9am', 'Call Budi', 'Mon 9 09:00'],
  ['Submit report in 2 hours', 'Submit report', 'Sun 8 19:30'],
  ['Rekap journal untuk 1 jam lagi', 'Rekap journal', 'Sun 8 18:30'],
  ['cek email dalam 30 menit', 'cek email', 'Sun 8 18:00'],
  ['Gym tonight', 'Gym', 'Sun 8 20:00'],
]) {
  const r = TaskParser.parse(input, now);
  ok(`TaskParser: "${input}"`, r.title === title && fmt(r.due) === due, `-> "${r.title}" @ ${fmt(r.due)}`);
}

// 4. Water tracker
{
  let st = Water.createState('2026-11-08', { goalMl: 1000, sipMl: 250, bottleMl: 500, startHour: 8, endHour: 22, remind: false });
  ok('Water.createState defaults', st.date === '2026-11-08' && st.entries.length === 0 && st.remind === false);

  const t10 = new Date(2026, 10, 8, 10, 0).getTime();
  const r1 = Water.logSip(st, 250, t10);
  ok('Water.logSip #1', r1.totalMl === 250 && !r1.goalReached && !r1.refillNeeded);

  const t10b = new Date(2026, 10, 8, 10, 30).getTime();
  const r2 = Water.logSip(r1.state, 250, t10b);
  ok('Water.logSip #2 bottle refillNeeded', r2.totalMl === 500 && !r2.goalReached && r2.refillNeeded);

  const undone = Water.undoSip(r2.state);
  ok('Water.undoSip restores count', undone.entries.length === 1 && Water.totalMl(undone) === 250);

  const t14 = new Date(2026, 10, 8, 14, 15).getTime();
  const r3 = Water.logSip(r2.state, 500, t14);
  ok('Water.logSip goalReached', r3.totalMl === 1000 && r3.goalReached === true);

  const buckets = Water.hourlyBuckets(r3.state);
  ok('Water.hourlyBuckets', buckets.length === 24 && buckets[10] === 500 && buckets[14] === 500 && buckets[0] === 0);

  // Reminder logic
  let remSt = Water.createState('2026-11-08', { goalMl: 2000, sipMl: 250, startHour: 8, endHour: 22, remind: false });
  ok('Water.nextReminderDue false when remind: false', Water.nextReminderDue(remSt, t10) === false);

  remSt.remind = true;
  const t07 = new Date(2026, 10, 8, 7, 0).getTime();
  const t22 = new Date(2026, 10, 8, 22, 0).getTime();
  ok('Water.nextReminderDue false before startHour', Water.nextReminderDue(remSt, t07) === false);
  ok('Water.nextReminderDue false at/after endHour', Water.nextReminderDue(remSt, t22) === false);
  ok('Water.nextReminderDue true in active hours', Water.nextReminderDue(remSt, t10) === true);

  const snoozed = Water.snooze(remSt, t10, 15);
  ok('Water.nextReminderDue respects snooze', Water.nextReminderDue(snoozed, t10 + 5 * 60000) === false);
  ok('Water.nextReminderDue resumes after snooze', Water.nextReminderDue(snoozed, t10 + 16 * 60000) === true);

  const reset = Water.resetDay(r3.state, '2026-11-09');
  ok('Water.resetDay', reset.date === '2026-11-09' && reset.entries.length === 0 && reset.bottleCarryMl === 0);
}

// 5. TimerLib (Countdown, Stopwatch, Pomodoro)
{
  // Countdown
  let cd = TimerLib.createCountdown(5);
  ok('TimerLib.createCountdown', cd.durationMs === 300000 && cd.remainingMs === 300000 && !cd.running);
  cd = TimerLib.startCountdown(cd, 10000);
  ok('TimerLib.startCountdown', cd.running && cd.endAt === 310000);
  cd = TimerLib.adjustCountdown(cd, 1, 20000); // 290s remaining + 60s = 350s
  ok('TimerLib.adjustCountdown +1m', TimerLib.remainingCountdown(cd, 20000) === 350000);
  cd = TimerLib.adjustCountdown(cd, -1, 20000);
  ok('TimerLib.adjustCountdown -1m', TimerLib.remainingCountdown(cd, 20000) === 290000);
  cd = TimerLib.pauseCountdown(cd, 50000);
  ok('TimerLib.pauseCountdown', !cd.running && cd.remainingMs === 260000);

  // Stopwatch
  let sw = TimerLib.createStopwatch();
  sw = TimerLib.startStopwatch(sw, 1000);
  sw = TimerLib.lapStopwatch(sw, 3500); // total 2500, split 2500
  sw = TimerLib.lapStopwatch(sw, 5000); // total 4000, split 1500
  ok('TimerLib.lapStopwatch splits & totals',
    sw.laps.length === 2 &&
    sw.laps[0].totalMs === 2500 && sw.laps[0].splitMs === 2500 &&
    sw.laps[1].totalMs === 4000 && sw.laps[1].splitMs === 1500
  );
  sw = TimerLib.resetStopwatch();
  ok('TimerLib.resetStopwatch', !sw.running && sw.elapsedMs === 0 && sw.laps.length === 0);

  // Pomodoro 4-cycle transitions
  let p = TimerLib.createPomodoro({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 4 });
  ok('Pomodoro initial focus cycle 1', p.phase === 'focus' && p.cycle === 1 && p.totalMs === 25 * 60000);
  p = TimerLib.advancePomodoro(p); // 1st focus -> short break
  ok('Pomodoro 1st focus -> short break', p.phase === 'rest' && p.totalMs === 5 * 60000 && p.completedToday === 1);
  p = TimerLib.advancePomodoro(p); // -> 2nd focus
  p = TimerLib.advancePomodoro(p); // -> 2nd short break
  p = TimerLib.advancePomodoro(p); // -> 3rd focus
  p = TimerLib.advancePomodoro(p); // -> 3rd short break
  p = TimerLib.advancePomodoro(p); // -> 4th focus
  ok('Pomodoro 4th focus', p.phase === 'focus' && p.cycle === 4);
  p = TimerLib.advancePomodoro(p); // 4th focus -> long break
  ok('Pomodoro 4th focus -> long break', p.phase === 'rest' && p.totalMs === 15 * 60000 && p.completedToday === 4);
  p = TimerLib.advancePomodoro(p); // -> wraps to cycle 1 focus
  ok('Pomodoro wraps to cycle 1 focus', p.phase === 'focus' && p.cycle === 1);
}

// 6. Tools & QR
{
  ok('Tools.calc 1250*15%', Tools.calc('1250*15%').value === 187.5);
  ok('Tools.calc 200+10%', Tools.calc('200+10%').value === 220);
  ok('Tools.calc 2^10', Tools.calc('2^10').value === 1024);
  ok('Tools.calc sqrt(2)', approx(Tools.calc('sqrt(2)').value, Math.SQRT2));
  ok('Tools.calc sin(30)', approx(Tools.calc('sin(30)').value, 0.5));
  ok('Tools.calc 5!', Tools.calc('5!').value === 120);
  ok('Tools.calc 0xFF', Tools.calc('0xFF').value === 255);
  ok('Tools.calc 0b1010', Tools.calc('0b1010').value === 10);
  ok('Tools.calc invalid expr', Tools.calc('2 + * 3').ok === false);

  const col = Tools.colorInfo('#5cdba8');
  ok('Tools.colorInfo("#5cdba8")',
    col &&
    col.rgb === 'rgb(92, 219, 168)' &&
    /^hsl\(\d+, \d+%, \d+%\)$/.test(col.hsl) &&
    typeof col.contrastWhite === 'number' && col.contrastWhite > 1 &&
    typeof col.contrastBlack === 'number' && col.contrastBlack > 1
  );

  ok('Tools.convertUnit 100 C -> F', Tools.convertUnit(100, 'C', 'F', 'temperature') === 212);
  ok('Tools.convertUnit 1 km -> m', Tools.convertUnit(1, 'km', 'm', 'length') === 1000);
  ok('Tools.convertUnit 1 GB -> MB', Tools.convertUnit(1, 'GB', 'MB', 'data') === 1000);

  const sampleDate = new Date('2026-11-08T12:00:00Z');
  const zJkt = Tools.formatInZone(sampleDate, 'Asia/Jakarta', 0);
  const zJktPlus2 = Tools.formatInZone(sampleDate, 'Asia/Jakarta', 2);
  const zNyc = Tools.formatInZone(sampleDate, 'America/New_York', 0);
  ok('Tools.formatInZone',
    zJkt.time === '19:00' && zJktPlus2.time === '21:00' && zNyc.time === '07:00'
  );

  const qr = QR.encode('https://github.com/Razor573/nusa');
  const isSquareBool = qr && qr.size >= 21 &&
    Array.isArray(qr.modules) && qr.modules.length === qr.size &&
    qr.modules.every((row) => Array.isArray(row) && row.length === qr.size && row.every((v) => typeof v === 'boolean'));
  ok('QR.encode square boolean matrix >= 21x21', isSquareBool);

  const svg = QR.toSVG('hello');
  ok('QR.toSVG returns <svg', typeof svg === 'string' && svg.startsWith('<svg') && svg.includes('</svg>'));
}

// 7. PhoneDrop HTTP server integration test
function httpRequest(options, bodyBuffer = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

const SystemMod = require('../system.js');
const PrivacyMod = require('../privacy.js');
const NotifMod = require('../notifications.js');

const locJs = fs.readFileSync(path.join(__dirname, '..', 'location.js'), 'utf8');
ok('location.js has no sholat/kiblat/prayer/quran refs', !/\b(sholat|kiblat|prayer|quran|adhan)\b/i.test(locJs));
const iconsJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'icons.js'), 'utf8');
ok('icons.js has no dead moon/book/north prayer/quran icons', !/\b(moon|book|north)\s*:/.test(iconsJs));

const sysSnap = SystemMod.snapshot();
ok('System.snapshot shape',
  typeof sysSnap.cpu === 'number' &&
  typeof sysSnap.mem?.pct === 'number' &&
  typeof sysSnap.disk?.free === 'number' &&
  typeof sysSnap.uptimeSec === 'number');
ok('Privacy & Notifications modules export start/stop',
  typeof PrivacyMod.start === 'function' && typeof PrivacyMod.stop === 'function' &&
  typeof NotifMod.start === 'function' && typeof NotifMod.stop === 'function');

// 8. Lyrics (LRC parser & activeLineIndex)
{
  const parsed = Lyrics.parseLRC('[ar:Artist]\n[00:12.50] line 1\n[01:05.00] line 2');
  ok('Lyrics.parseLRC parses timestamps & ignores metadata tags',
    Array.isArray(parsed) &&
    parsed.length === 2 &&
    approx(parsed[0].timeSec, 12.5) && parsed[0].text === 'line 1' &&
    approx(parsed[1].timeSec, 65) && parsed[1].text === 'line 2');

  const unsorted = Lyrics.parseLRC('[ti:Song]\n[01:05.00] line 2\n[00:12.50] line 1');
  ok('Lyrics.parseLRC sorts lines chronologically',
    unsorted.length === 2 &&
    approx(unsorted[0].timeSec, 12.5) && unsorted[0].text === 'line 1' &&
    approx(unsorted[1].timeSec, 65) && unsorted[1].text === 'line 2');

  ok('Lyrics.activeLineIndex(lines, 13) === 0', Lyrics.activeLineIndex(parsed, 13) === 0);
  ok('Lyrics.activeLineIndex(lines, 66) === 1', Lyrics.activeLineIndex(parsed, 66) === 1);
  ok('Lyrics.activeLineIndex(lines, 5) === -1', Lyrics.activeLineIndex(parsed, 5) === -1);
}

// 9. ICal (.ics VEVENT parser)
{
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'SUMMARY:Before Window',
    'DTSTART:20261122T070000Z',
    'DTEND:20261122T080000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Design ',
    ' Review',
    'DTSTART:20261122T090000Z',
    'DTEND:20261122T103000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Standup',
    'DTSTART:20261122T110000Z',
    'DURATION:PT30M',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:After Window',
    'DTSTART:20261122T180000Z',
    'DTEND:20261122T190000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const fromMs = Date.UTC(2026, 10, 22, 8, 30, 0);
  const toMs = Date.UTC(2026, 10, 22, 17, 0, 0);
  const evs = ICal.parseICS(ics, fromMs, toMs);

  ok('ICal.parseICS filters by [fromMs, toMs]', evs.length === 2);
  ok('ICal.parseICS parses folded SUMMARY & DTEND',
    evs[0] &&
    evs[0].title === 'Design Review' &&
    evs[0].start === Date.UTC(2026, 10, 22, 9, 0, 0) &&
    evs[0].minutes === 90);
  ok('ICal.parseICS parses DURATION',
    evs[1] &&
    evs[1].title === 'Standup' &&
    evs[1].start === Date.UTC(2026, 10, 22, 11, 0, 0) &&
    evs[1].minutes === 30);
}

// 10. Static UI/Settings verification against desktop/app/app.js & index.html
{
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const html = fs.readFileSync(indexPath, 'utf8');

  const expectedNav = [
    'General',
    'Display',
    'Pages',
    'Appearance',
    'Music and lyrics',
    'Notifications',
    'Widgets',
    'To-do',
    'Pomodoro',
    'Water',
    'Shelf',
    'HUD and popups',
    'About',
  ];

  const navMatch = appJs.match(/const SETTINGS_NAV\s*=\s*\[([\s\S]*?)\];/);
  const labels = [];
  if (navMatch) {
    const itemRe = /\[\s*'[^']+'\s*,\s*'([^']+)'/g;
    let m;
    while ((m = itemRe.exec(navMatch[1])) !== null) {
      labels.push(m[1]);
    }
  }

  ok('Settings sidebar has exact 13 categories in order',
    labels.length === expectedNav.length &&
    expectedNav.every((lbl, i) => labels[i] === lbl),
    `got [${labels.join(', ')}]`);

  ok('app.js & index.html have no Prayer/Quran/Ask Nusa/Translate',
    !/\b(Prayer|Quran|Ask Nusa|Translate)\b/i.test(appJs) &&
    !/\b(Prayer|Quran|Ask Nusa|Translate)\b/i.test(html));

  ok('app.js & index.html have no PRO badge',
    !/\bPRO\b/.test(appJs) && !/\bPRO\b/.test(html));

  for (const required of ['Lyrics not available', 'Not Playing', 'Nusa mascot', 'Hide in full screen']) {
    ok(`app.js contains "${required}"`, appJs.includes(required));
  }
}

async function testPhoneDrop() {
  const tmpDownloads = fs.mkdtempSync(path.join(os.tmpdir(), 'nusa-test-pd-'));
  let receivedReq = null;
  let savedFiles = null;

  try {
    const shelfFile = path.join(tmpDownloads, 'shelf-share.txt');
    fs.writeFileSync(shelfFile, 'shared from shelf', 'utf8');
    const info = await PhoneDrop.start({
      app: { getPath: () => tmpDownloads },
      getShelf: () => [shelfFile],
      onRequest: (req) => { receivedReq = req; },
      onFiles: (files) => { savedFiles = files; },
    });

    ok('PhoneDrop.start returns port & token', Boolean(info && info.port > 0 && info.token));

    const resOk = await httpRequest({
      hostname: '127.0.0.1',
      port: info.port,
      path: `/?t=${info.token}`,
      method: 'GET',
    });
    ok('PhoneDrop GET /?t=<token> returns 200 HTML',
      resOk.status === 200 && /html/i.test(resOk.headers['content-type'] || '') && resOk.body.includes('<html'));

    const resBad = await httpRequest({
      hostname: '127.0.0.1',
      port: info.port,
      path: '/?t=bad',
      method: 'GET',
    });
    ok('PhoneDrop GET /?t=bad returns 403', resBad.status === 403);

    const boundary = '----NusaTestBoundary7MA4YWxkTrZu0gW';
    const fileContent = 'hello from phone drop test';
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="hello.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${fileContent}\r\n` +
      `--${boundary}--\r\n`,
      'utf8'
    );

    const resUp = await httpRequest({
      hostname: '127.0.0.1',
      port: info.port,
      path: `/upload?t=${info.token}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
    }, multipartBody);

    const upJson = JSON.parse(resUp.body || '{}');
    ok('PhoneDrop POST /upload triggers onRequest',
      resUp.status === 200 && upJson.ok === true && receivedReq && receivedReq.id === upJson.id && receivedReq.files.length === 1);

    const approved = PhoneDrop.approve(upJson.id);
    ok('PhoneDrop.approve saves to downloads dir',
      approved.length === 1 &&
      fs.existsSync(approved[0]) &&
      fs.readFileSync(approved[0], 'utf8') === fileContent &&
      Array.isArray(savedFiles) && savedFiles[0] === approved[0]);

    const resDl = await httpRequest({
      hostname: '127.0.0.1',
      port: info.port,
      path: `/file?t=${info.token}&i=0`,
      method: 'GET',
    });
    ok('PhoneDrop GET /file downloads shelf item', resDl.status === 200 && resDl.body === 'shared from shelf');

    const resUp2 = await httpRequest({
      hostname: '127.0.0.1',
      port: info.port,
      path: `/upload?t=${info.token}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
    }, multipartBody);
    const upJson2 = JSON.parse(resUp2.body || '{}');
    const declinedTmp = receivedReq?.files?.[0]?.tmpPath;
    PhoneDrop.decline(upJson2.id);
    ok('PhoneDrop.decline cleans up staged temp file', Boolean(declinedTmp && !fs.existsSync(declinedTmp)));

    PhoneDrop.stop();
    ok('PhoneDrop.stop closes cleanly', PhoneDrop.status().active === false);
  } finally {
    PhoneDrop.stop();
    fs.rmSync(tmpDownloads, { recursive: true, force: true });
  }
}

testPhoneDrop()
  .then(() => {
    process.exit(fail ? 1 : 0);
  })
  .catch((err) => {
    console.error('FAIL PhoneDrop uncaught error:', err);
    process.exit(1);
  });
