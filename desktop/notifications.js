const { execFile } = require('child_process');

let timer = null;
let busy = false;
let activeChild = null;
let initialized = false;
let deniedEmitted = false;
const seenIds = new Set();

const PS_NOTIFS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) {
  $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op))
  if (-not $task.Wait(8000)) { throw 'timeout' }
  $task.Result
}
[Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$acc = Await ($listener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
if ([string]$acc -eq 'Denied') {
  Write-Output '{"denied":true}'
  exit
}
if ([string]$acc -ne 'Allowed') {
  Write-Output '{"items":[]}'
  exit
}
$notifs = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
$out = @()
foreach ($n in $notifs) {
  $appName = ''
  try { $appName = [string]$n.AppInfo.DisplayInfo.DisplayName } catch {}
  $title = ''
  $body = ''
  try {
    $binding = $n.Notification.Visual.GetBinding('ToastGeneric')
    if ($null -ne $binding) {
      $texts = @($binding.GetTextElements() | ForEach-Object { $_.Text })
      if ($texts.Count -gt 0) { $title = [string]$texts[0] }
      if ($texts.Count -gt 1) { $body = ($texts[1..($texts.Count - 1)] -join ' ') }
    }
  } catch {}
  $out += @{ id = [string]$n.Id; app = $appName; title = $title; body = $body }
}
@{ items = @($out) } | ConvertTo-Json -Compress -Depth 4
`;

function pollWindows() {
  return new Promise((resolve) => {
    const enc = Buffer.from(PS_NOTIFS, 'utf16le').toString('base64');
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 10000 },
      (err, stdout) => {
        if (activeChild === child) activeChild = null;
        if (err) {
          resolve(null);
          return;
        }
        try {
          const line = String(stdout).trim().split(/\r?\n/).pop();
          if (!line) {
            resolve(null);
            return;
          }
          const parsed = JSON.parse(line);
          if (parsed && parsed.denied) {
            resolve({ denied: true });
            return;
          }
          const rawItems = parsed && parsed.items;
          const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
          resolve({ denied: false, items });
        } catch {
          resolve(null);
        }
      }
    );
    activeChild = child;
  });
}

async function tick(cb) {
  if (busy || !timer) return;
  busy = true;
  try {
    const res = await pollWindows();
    if (!timer || !res) return;

    if (res.denied) {
      if (!deniedEmitted) {
        deniedEmitted = true;
        if (typeof cb === 'function') {
          try {
            cb({ error: 'denied' });
          } catch {
            // ignore
          }
        }
      }
      stop();
      return;
    }

    if (!initialized) {
      for (const item of res.items) {
        if (item && item.id) seenIds.add(String(item.id));
      }
      initialized = true;
      return;
    }

    for (const item of res.items) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      if (typeof cb === 'function') {
        try {
          cb({
            id,
            app: item.app || '',
            title: item.title || '',
            body: item.body || '',
            icon: null,
          });
        } catch {
          // ignore
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
  if (process.platform !== 'win32') return;
  initialized = false;
  deniedEmitted = false;
  seenIds.clear();

  timer = setInterval(() => {
    tick(cb);
  }, 2000);
  tick(cb);
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
  initialized = false;
  deniedEmitted = false;
  seenIds.clear();
}

module.exports = { start, stop };
