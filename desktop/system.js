const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

let timer = null;
let prevCpu = null;
let prevNet = null;
let lastNetSpeed = { downBps: 0, upBps: 0 };
let netBusy = false;
let psProc = null;
let psBuffer = '';
let psPendingResolve = null;

function readCpuTotals() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function getCpuPct() {
  const cur = readCpuTotals();
  if (!prevCpu) {
    prevCpu = cur;
    return 0;
  }
  const dIdle = cur.idle - prevCpu.idle;
  const dTotal = cur.total - prevCpu.total;
  prevCpu = cur;
  if (dTotal <= 0) return 0;
  const pct = Math.round((1 - dIdle / dTotal) * 100);
  return Math.max(0, Math.min(100, pct));
}

function getMem() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return { used, total, pct };
}

function getDisk() {
  try {
    const target = process.platform === 'win32' ? 'C:\\' : '/';
    if (typeof fs.statfsSync !== 'function') {
      return { free: 0, total: 0, pct: 0 };
    }
    const st = fs.statfsSync(target);
    const bsize = Number(st.bsize) || 0;
    const total = (Number(st.blocks) || 0) * bsize;
    const free = (Number(st.bavail ?? st.bfree) || 0) * bsize;
    const used = Math.max(0, total - free);
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    return { free, total, pct };
  } catch {
    return { free: 0, total: 0, pct: 0 };
  }
}

function readLinuxNetBytes() {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = raw.split(/\r?\n/).slice(2);
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const iface = trimmed.slice(0, colonIdx).trim();
      if (iface === 'lo') continue;
      const cols = trimmed.slice(colonIdx + 1).trim().split(/\s+/);
      if (cols.length >= 9) {
        rx += Number(cols[0]) || 0;
        tx += Number(cols[8]) || 0;
      }
    }
    return { rx, tx, ts: Date.now() };
  } catch {
    return null;
  }
}

const PS_NET_LOOP = `
$ErrorActionPreference = 'SilentlyContinue'
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $rx = [int64]0
  $tx = [int64]0
  Get-NetAdapterStatistics | ForEach-Object {
    $rx += $_.ReceivedBytes
    $tx += $_.SentBytes
  }
  [Console]::Out.WriteLine("$rx,$tx")
  [Console]::Out.Flush()
}
`;

function ensureWindowsNetProc() {
  if (psProc && !psProc.killed) return psProc;
  const enc = Buffer.from(PS_NET_LOOP, 'utf16le').toString('base64');
  psBuffer = '';
  psProc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
  );

  psProc.stdout.on('data', (chunk) => {
    psBuffer += chunk.toString('utf8');
    const nl = psBuffer.indexOf('\n');
    if (nl !== -1) {
      const line = psBuffer.slice(0, nl).trim();
      psBuffer = psBuffer.slice(nl + 1);
      if (psPendingResolve) {
        const resolve = psPendingResolve;
        psPendingResolve = null;
        const parts = line.split(',');
        if (parts.length === 2) {
          const rx = Number(parts[0]);
          const tx = Number(parts[1]);
          if (Number.isFinite(rx) && Number.isFinite(tx)) {
            resolve({ rx, tx, ts: Date.now() });
            return;
          }
        }
        resolve(null);
      }
    }
  });

  psProc.on('exit', () => {
    if (psPendingResolve) {
      const resolve = psPendingResolve;
      psPendingResolve = null;
      resolve(null);
    }
    psProc = null;
  });

  psProc.on('error', () => {
    if (psPendingResolve) {
      const resolve = psPendingResolve;
      psPendingResolve = null;
      resolve(null);
    }
    psProc = null;
  });

  return psProc;
}

function readWindowsNetBytes() {
  return new Promise((resolve) => {
    const proc = ensureWindowsNetProc();
    if (!proc || !proc.stdin.writable) {
      resolve(null);
      return;
    }
    const timeout = setTimeout(() => {
      if (psPendingResolve === done) {
        psPendingResolve = null;
        resolve(null);
      }
    }, 1800);

    const done = (val) => {
      clearTimeout(timeout);
      resolve(val);
    };

    psPendingResolve = done;
    try {
      proc.stdin.write('\n');
    } catch {
      clearTimeout(timeout);
      psPendingResolve = null;
      resolve(null);
    }
  });
}

async function sampleNet() {
  if (netBusy) return;
  netBusy = true;
  try {
    let cur = null;
    if (process.platform === 'linux') {
      cur = readLinuxNetBytes();
    } else if (process.platform === 'win32') {
      cur = await readWindowsNetBytes();
    }
    if (cur) {
      if (prevNet) {
        const dt = (cur.ts - prevNet.ts) / 1000;
        if (dt > 0.05) {
          const downBps = Math.max(0, Math.round((cur.rx - prevNet.rx) / dt));
          const upBps = Math.max(0, Math.round((cur.tx - prevNet.tx) / dt));
          lastNetSpeed = { downBps, upBps };
        }
      }
      prevNet = cur;
    }
  } catch {
    // ignore sampling errors
  } finally {
    netBusy = false;
  }
}

function snapshot() {
  return {
    cpu: getCpuPct(),
    mem: getMem(),
    net: { downBps: lastNetSpeed.downBps, upBps: lastNetSpeed.upBps },
    disk: getDisk(),
    uptimeSec: Math.floor(os.uptime()),
  };
}

function start(cb) {
  stop();
  prevCpu = readCpuTotals();
  prevNet = null;
  lastNetSpeed = { downBps: 0, upBps: 0 };

  if (process.platform === 'linux') {
    prevNet = readLinuxNetBytes();
  } else if (process.platform === 'win32') {
    sampleNet();
  }

  timer = setInterval(async () => {
    await sampleNet();
    if (typeof cb === 'function') {
      try {
        cb(snapshot());
      } catch {
        // ignore callback errors
      }
    }
  }, 1000);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (psProc) {
    try {
      psProc.kill();
    } catch {
      // ignore
    }
    psProc = null;
  }
  psPendingResolve = null;
  psBuffer = '';
  netBusy = false;
  prevCpu = null;
  prevNet = null;
}

module.exports = { start, stop, snapshot };
