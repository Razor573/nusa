const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let timer = null;
let busy = false;
let activeChild = null;
let lastState = null;

const KNOWN_APPS = {
  'discord': 'Discord',
  'chrome': 'Chrome',
  'msedge': 'Edge',
  'firefox': 'Firefox',
  'brave': 'Brave',
  'opera': 'Opera',
  'vivaldi': 'Vivaldi',
  'obs64': 'OBS Studio',
  'obs32': 'OBS Studio',
  'obs': 'OBS Studio',
  'zoom': 'Zoom',
  'teams': 'Teams',
  'ms-teams': 'Teams',
  'slack': 'Slack',
  'skype': 'Skype',
  'webexmta': 'Webex',
  'ciscocollabhost': 'Webex',
  'code': 'VS Code',
  'telegram': 'Telegram',
  'whatsapp': 'WhatsApp',
  'signal': 'Signal',
  'spotify': 'Spotify',
  'audacity': 'Audacity',
  'voicemeeter': 'Voicemeeter',
  'nvidia broadcast': 'NVIDIA Broadcast',
  'streamlabs obs': 'Streamlabs',
};

function formatAppName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let name = raw.trim();
  if (!name) return null;

  // NonPackaged keys use '#' as path separator, e.g. C:#Users#...#Discord.exe
  if (name.includes('#') || name.includes('\\') || name.includes('/')) {
    const parts = name.split(/[#\\/]/).filter(Boolean);
    name = parts[parts.length - 1] || name;
  }

  // Strip .exe suffix
  name = name.replace(/\.exe$/i, '');

  // Packaged UWP keys look like Microsoft.WindowsCamera_8wekyb3d8bbwe
  if (name.includes('_')) {
    const base = name.split('_')[0];
    if (base) name = base;
  }
  if (name.includes('.')) {
    const segs = name.split('.').filter(Boolean);
    const tail = segs[segs.length - 1];
    if (tail && tail.toLowerCase() !== 'app') {
      name = tail;
    } else if (segs.length >= 2) {
      name = segs[segs.length - 2];
    }
  }

  const lower = name.toLowerCase();
  if (KNOWN_APPS[lower]) return KNOWN_APPS[lower];

  // Capitalize first character
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const PS_PRIVACY = `
$ErrorActionPreference = 'SilentlyContinue'
function Get-ActiveApp($cap) {
  $base = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\$cap"
  if (-not (Test-Path $base)) { return $null }
  $items = Get-ChildItem -Path $base
  foreach ($item in $items) {
    if ($item.PSChildName -eq 'NonPackaged') {
      $npItems = Get-ChildItem -Path $item.PSPath
      foreach ($np in $npItems) {
        $p = Get-ItemProperty -Path $np.PSPath
        if ($p.LastUsedTimeStop -eq 0 -and $p.LastUsedTimeStart -gt 0) {
          return $np.PSChildName
        }
      }
    } else {
      $p = Get-ItemProperty -Path $item.PSPath
      if ($p.LastUsedTimeStop -eq 0 -and $p.LastUsedTimeStart -gt 0) {
        return $item.PSChildName
      }
    }
  }
  return $null
}
$mic = Get-ActiveApp 'microphone'
$cam = Get-ActiveApp 'webcam'
@{ mic = $mic; cam = $cam } | ConvertTo-Json -Compress
`;

function pollWindows() {
  return new Promise((resolve) => {
    const enc = Buffer.from(PS_PRIVACY, 'utf16le').toString('base64');
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (activeChild === child) activeChild = null;
        if (err) {
          resolve({ mic: { active: false, app: null }, cam: { active: false, app: null } });
          return;
        }
        try {
          const line = String(stdout).trim().split(/\r?\n/).pop();
          const parsed = JSON.parse(line);
          const micApp = formatAppName(parsed.mic);
          const camApp = formatAppName(parsed.cam);
          resolve({
            mic: { active: Boolean(parsed.mic), app: micApp },
            cam: { active: Boolean(parsed.cam), app: camApp },
          });
        } catch {
          resolve({ mic: { active: false, app: null }, cam: { active: false, app: null } });
        }
      }
    );
    activeChild = child;
  });
}

function checkLinuxMic() {
  return new Promise((resolve) => {
    execFile('pactl', ['list', 'source-outputs'], { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ active: false, app: null });
        return;
      }
      const text = String(stdout);
      if (!/Source Output #/i.test(text)) {
        resolve({ active: false, app: null });
        return;
      }
      const match = text.match(/application\.name\s*=\s*"([^"]+)"/i);
      const app = match ? formatAppName(match[1]) : null;
      resolve({ active: true, app });
    });
  });
}

async function checkLinuxCam() {
  try {
    const devs = await fs.promises.readdir('/dev');
    const videoDevs = new Set(devs.filter((d) => /^video\d+$/.test(d)).map((d) => `/dev/${d}`));
    if (videoDevs.size === 0) return { active: false, app: null };

    const procs = await fs.promises.readdir('/proc');
    for (const pid of procs) {
      if (!/^\d+$/.test(pid)) continue;
      const fdDir = `/proc/${pid}/fd`;
      let fds;
      try {
        fds = await fs.promises.readdir(fdDir);
      } catch {
        continue;
      }
      for (const fd of fds) {
        try {
          const target = await fs.promises.readlink(path.join(fdDir, fd));
          if (videoDevs.has(target)) {
            let app = null;
            try {
              const comm = await fs.promises.readFile(`/proc/${pid}/comm`, 'utf8');
              app = formatAppName(comm.trim());
            } catch {
              // ignore
            }
            return { active: true, app };
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return { active: false, app: null };
}

async function pollLinux() {
  const [mic, cam] = await Promise.all([checkLinuxMic(), checkLinuxCam()]);
  return { mic, cam };
}

function statesEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.mic.active === b.mic.active &&
    a.mic.app === b.mic.app &&
    a.cam.active === b.cam.active &&
    a.cam.app === b.cam.app
  );
}

async function tick(cb) {
  if (busy) return;
  busy = true;
  try {
    let state;
    if (process.platform === 'win32') {
      state = await pollWindows();
    } else if (process.platform === 'linux') {
      state = await pollLinux();
    } else {
      state = { mic: { active: false, app: null }, cam: { active: false, app: null } };
    }
    if (!statesEqual(state, lastState)) {
      lastState = state;
      if (typeof cb === 'function') {
        try {
          cb(state);
        } catch {
          // ignore callback errors
        }
      }
    }
  } catch {
    // never throw
  } finally {
    busy = false;
  }
}

function start(cb) {
  stop();
  lastState = null;
  tick(cb);
  timer = setInterval(() => {
    tick(cb);
  }, 2000);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (activeChild) {
    try {
      activeChild.kill();
    } catch {
      // ignore
    }
    activeChild = null;
  }
  busy = false;
  lastState = null;
}

module.exports = { start, stop };
