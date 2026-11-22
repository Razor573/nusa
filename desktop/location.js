// Lokasi user buat cuaca:
// 1. Windows: Location bawaan Windows (WiFi/GPS, akurat sampai ratusan meter) lewat PowerShell + WinRT
// 2. Cadangan (Location dimatiin / Linux / gagal): perkiraan dari IP (ipwho.is, level kota)
// Nama kotanya dari BigDataCloud reverse-geocode (gratis, tanpa key). Koordinat yang dikirim dibulatkan ±1 km.
const { execFile } = require('child_process');

const PS_LOCATE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); if (-not $task.Wait(12000)) { throw 'timeout' }; $task.Result }
[Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType = WindowsRuntime] | Out-Null
$acc = Await ([Windows.Devices.Geolocation.Geolocator]::RequestAccessAsync()) ([Windows.Devices.Geolocation.GeolocationAccessStatus])
if ([string]$acc -ne 'Allowed') { Write-Output '{"denied":true}'; exit }
$g = New-Object Windows.Devices.Geolocation.Geolocator
$pos = Await ($g.GetGeopositionAsync([TimeSpan]::FromMinutes(10), [TimeSpan]::FromSeconds(10))) ([Windows.Devices.Geolocation.Geoposition])
$p = $pos.Coordinate.Point.Position
Write-Output (@{ lat = $p.Latitude; lon = $p.Longitude; accuracy = $pos.Coordinate.Accuracy } | ConvertTo-Json -Compress)
`;

function windowsLocation() {
  return new Promise((resolve) => {
    const enc = Buffer.from(PS_LOCATE, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 30000 }, (err, out) => {
        try {
          const o = JSON.parse(String(out).trim().split(/\r?\n/).pop());
          resolve(Number.isFinite(o.lat) && Number.isFinite(o.lon) ? { lat: o.lat, lon: o.lon, source: 'windows' } : null);
        } catch { resolve(null); }
      });
  });
}

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function ipLocation() {
  try {
    const j = await getJSON('https://ipwho.is/?fields=success,city,latitude,longitude,timezone');
    if (j.success && Number.isFinite(j.latitude)) return { lat: j.latitude, lon: j.longitude, name: j.city, tz: j.timezone?.id, source: 'ip' };
  } catch {}
  return null;
}

async function cityName(lat, lon) {
  try {
    const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&localityLanguage=id`);
    return j.city || j.locality || j.principalSubdivision || null;
  } catch { return null; }
}

/** → { lat, lon, name, tz, source: 'windows'|'ip' } atau null kalau offline total. */
async function locate() {
  const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let loc = process.platform === 'win32' ? await windowsLocation() : null;
  const ip = loc ? null : await ipLocation();
  loc = loc || ip;
  if (!loc) return null;
  const name = (await cityName(loc.lat, loc.lon)) || loc.name || 'Current location';
  // Zona waktu: ikut jam komputer (yang dilihat user); kalau kosong, pakai zona dari IP
  return { lat: +loc.lat.toFixed(4), lon: +loc.lon.toFixed(4), name, tz: sysTz || loc.tz || 'Asia/Jakarta', source: loc.source };
}

module.exports = { locate };
