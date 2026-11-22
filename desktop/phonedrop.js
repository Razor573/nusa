const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INACTIVITY_MS = 10 * 60 * 1000;
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

let server = null;
let sessionToken = null;
let sessionPort = null;
let sessionUrl = null;
let inactivityTimer = null;
let callbacks = {};
const stagedBatches = new Map();

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(nets)) {
    if (!Array.isArray(list)) continue;
    for (const iface of list) {
      if (!iface || iface.family !== 'IPv4' || iface.internal) continue;
      candidates.push(iface.address);
    }
  }
  const preferred = candidates.find(
    (ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
  return preferred || candidates[0] || '127.0.0.1';
}

function summarizeUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return 'Phone';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android[^;]*;\s*([^)]+?)\s*(?:Build|\))/i);
    if (m && m[1]) return m[1].trim();
    return 'Android';
  }
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Device';
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').trim();
  if (!base || base === '.' || base === '..') return `file_${Date.now()}`;
  return base;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeShelfItem(item) {
  if (typeof item === 'string') {
    return { filePath: item, name: path.basename(item) };
  }
  if (item && typeof item === 'object') {
    const filePath = item.path || item.filePath || '';
    const name = item.name || (filePath ? path.basename(filePath) : 'file');
    return { filePath, name };
  }
  return null;
}

function getDownloadsDir() {
  if (callbacks.app && typeof callbacks.app.getPath === 'function') {
    try {
      return path.join(callbacks.app.getPath('downloads'), 'Nusa');
    } catch {
      // fallback
    }
  }
  try {
    const electron = require('electron');
    if (electron && electron.app && typeof electron.app.getPath === 'function') {
      return path.join(electron.app.getPath('downloads'), 'Nusa');
    }
  } catch {
    // not in electron or app not ready
  }
  return path.join(os.homedir(), 'Downloads', 'Nusa');
}

function uniqueDestPath(dir, filename) {
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  let candidate = path.join(dir, filename);
  let idx = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${idx})${ext}`);
    idx += 1;
  }
  return candidate;
}

function moveFileSafe(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

function cleanupDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  if (!server) return;
  inactivityTimer = setTimeout(() => {
    const onState = callbacks.onState;
    stop();
    if (typeof onState === 'function') {
      try {
        onState({ active: false });
      } catch {
        // ignore
      }
    }
  }, INACTIVITY_MS);
}

function parseMultipart(body, boundary) {
  const files = [];
  const delim = Buffer.from(`--${boundary}`);
  const headerSep = Buffer.from('\r\n\r\n');
  let pos = body.indexOf(delim);
  if (pos === -1) return files;

  while (pos !== -1) {
    pos += delim.length;
    // Check for closing '--'
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;
    // Skip CRLF after boundary
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

    const headerEnd = body.indexOf(headerSep, pos);
    if (headerEnd === -1) break;

    const headerStr = body.slice(pos, headerEnd).toString('utf8');
    const dataStart = headerEnd + headerSep.length;
    const nextDelim = body.indexOf(delim, dataStart);
    if (nextDelim === -1) break;

    // Strip trailing CRLF before boundary
    let dataEnd = nextDelim;
    if (dataEnd >= 2 && body[dataEnd - 2] === 0x0d && body[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    }

    const dispMatch = headerStr.match(/Content-Disposition:[^\r\n]*filename="([^"]*)"/i);
    if (dispMatch && dispMatch[1]) {
      files.push({
        filename: dispMatch[1],
        data: body.subarray(dataStart, dataEnd),
      });
    }
    pos = nextDelim;
  }
  return files;
}

function renderMobileHtml(token, shelfItems) {
  const shelfHtml =
    shelfItems.length === 0
      ? '<p class="empty">No files on your desktop Shelf right now.</p>'
      : `<ul class="list">${shelfItems
          .map(
            (item, idx) =>
              `<li class="item"><span class="name">${escapeHtml(item.name)}</span><a class="dl" href="/file?t=${encodeURIComponent(token)}&i=${idx}">Save</a></li>`
          )
          .join('')}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nusa Phone Drop</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0d0f14; color: #f1f5f9; min-height: 100vh;
  }
  .wrap { max-width: 460px; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; font-weight: 600; }
  .sub { color: #94a3b8; font-size: 0.9rem; margin: 0 0 20px; }
  .card {
    background: #171a23; border: 1px solid #262b38; border-radius: 16px;
    padding: 18px; margin-bottom: 16px;
  }
  .card h2 { font-size: 1rem; margin: 0 0 12px; font-weight: 600; color: #e2e8f0; }
  input[type="file"] {
    display: block; width: 100%; padding: 12px; border-radius: 12px;
    background: #0d0f14; border: 1px dashed #3b4254; color: #cbd5e1;
    margin-bottom: 12px; font-size: 0.9rem;
  }
  button {
    width: 100%; padding: 13px 16px; border: 0; border-radius: 12px;
    background: #3b82f6; color: #fff; font-size: 1rem; font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  #status { margin-top: 10px; font-size: 0.88rem; color: #94a3b8; min-height: 1.2em; }
  .list { list-style: none; padding: 0; margin: 0; }
  .item {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid #242936;
  }
  .item:last-child { border-bottom: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.92rem; }
  .dl {
    flex-shrink: 0; text-decoration: none; background: #262b38; color: #f8fafc;
    padding: 7px 14px; border-radius: 10px; font-size: 0.85rem; font-weight: 500;
  }
  .empty { color: #64748b; font-size: 0.9rem; margin: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Nusa Phone Drop</h1>
    <p class="sub">Send files to your desktop or save from Shelf</p>
    <div class="card">
      <h2>Send to Desktop</h2>
      <form id="uploadForm" action="/upload?t=${encodeURIComponent(token)}" method="post" enctype="multipart/form-data">
        <input id="fileInput" type="file" name="files" multiple required>
        <button id="sendBtn" type="submit">Send</button>
      </form>
      <div id="status"></div>
    </div>
    <div class="card">
      <h2>Desktop Shelf</h2>
      ${shelfHtml}
    </div>
  </div>
<script>
(function () {
  var form = document.getElementById('uploadForm');
  var input = document.getElementById('fileInput');
  var btn = document.getElementById('sendBtn');
  var status = document.getElementById('status');
  form.addEventListener('submit', function (e) {
    if (!input.files || input.files.length === 0) return;
    e.preventDefault();
    btn.disabled = true;
    status.textContent = 'Sending...';
    var fd = new FormData();
    for (var i = 0; i < input.files.length; i++) {
      fd.append('files', input.files[i]);
    }
    fetch(form.action, { method: 'POST', body: fd })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        status.textContent = 'Sent ' + (data.count || 0) + ' file(s). Waiting for desktop approval.';
        input.value = '';
      })
      .catch(function (err) {
        status.textContent = 'Failed: ' + err.message;
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
})();
</script>
</body>
</html>`;
}

function handleRequest(req, res) {
  let reqUrl;
  try {
    reqUrl = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const token = reqUrl.searchParams.get('t');
  if (!sessionToken || token !== sessionToken) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  resetInactivityTimer();

  if (req.method === 'GET' && reqUrl.pathname === '/') {
    const rawShelf = typeof callbacks.getShelf === 'function' ? callbacks.getShelf() : [];
    const shelfItems = Array.isArray(rawShelf)
      ? rawShelf.map(normalizeShelfItem).filter((x) => x && x.filePath)
      : [];
    const html = renderMobileHtml(sessionToken, shelfItems);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/file') {
    const idx = Number(reqUrl.searchParams.get('i'));
    const rawShelf = typeof callbacks.getShelf === 'function' ? callbacks.getShelf() : [];
    const shelfItems = Array.isArray(rawShelf)
      ? rawShelf.map(normalizeShelfItem).filter((x) => x && x.filePath)
      : [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= shelfItems.length) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const item = shelfItems[idx];
    let stat;
    try {
      stat = fs.statSync(item.filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const safeName = sanitizeFilename(item.name);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${safeName.replace(/"/g, '')}"`,
    });
    const stream = fs.createReadStream(item.filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/upload') {
    const ct = req.headers['content-type'] || '';
    const bMatch = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!bMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
      return;
    }
    const boundary = bMatch[1] || bMatch[2];
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks);
        const parts = parseMultipart(body, boundary);
        if (parts.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No files uploaded' }));
          return;
        }

        const id = crypto.randomBytes(6).toString('hex');
        const tmpDir = path.join(os.tmpdir(), `nusa-drop-${id}`);
        fs.mkdirSync(tmpDir, { recursive: true });

        const stagedFiles = [];
        for (const part of parts) {
          const safeName = sanitizeFilename(part.filename);
          const tmpPath = uniqueDestPath(tmpDir, safeName);
          fs.writeFileSync(tmpPath, part.data);
          stagedFiles.push({
            name: path.basename(tmpPath),
            size: part.data.length,
            tmpPath,
          });
        }

        stagedBatches.set(id, { tmpDir, files: stagedFiles });

        if (typeof callbacks.onRequest === 'function') {
          try {
            callbacks.onRequest({
              id,
              device: summarizeUserAgent(req.headers['user-agent']),
              files: stagedFiles,
            });
          } catch {
            // ignore
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, count: stagedFiles.length }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Upload failed' }));
      }
    });

    req.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

function start(opts = {}) {
  stop();
  callbacks = {
    onRequest: opts.onRequest,
    onFiles: opts.onFiles,
    onState: opts.onState,
    getShelf: opts.getShelf,
    app: opts.app,
  };

  sessionToken = crypto.randomBytes(8).toString('hex');

  return new Promise((resolve, reject) => {
    const srv = http.createServer(handleRequest);
    server = srv;

    srv.on('error', (err) => {
      if (server === srv) {
        stop();
      }
      reject(err);
    });

    srv.listen(0, '0.0.0.0', () => {
      const addr = srv.address();
      sessionPort = addr && typeof addr === 'object' ? addr.port : 0;
      const ip = getLanIp();
      sessionUrl = `http://${ip}:${sessionPort}/?t=${sessionToken}`;
      resetInactivityTimer();

      const info = { url: sessionUrl, port: sessionPort, token: sessionToken };
      if (typeof callbacks.onState === 'function') {
        try {
          callbacks.onState({ active: true, ...info });
        } catch {
          // ignore
        }
      }
      resolve(info);
    });
  });
}

function stop() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  if (server) {
    try {
      server.closeAllConnections?.();
      server.close();
    } catch {
      // ignore
    }
    server = null;
  }
  for (const [, batch] of stagedBatches) {
    cleanupDir(batch.tmpDir);
  }
  stagedBatches.clear();
  sessionToken = null;
  sessionPort = null;
  sessionUrl = null;
}

function status() {
  return {
    active: Boolean(server),
    url: sessionUrl,
    port: sessionPort,
    token: sessionToken,
  };
}

function approve(id) {
  const batch = stagedBatches.get(id);
  if (!batch) return [];
  stagedBatches.delete(id);
  resetInactivityTimer();

  const destDir = getDownloadsDir();
  fs.mkdirSync(destDir, { recursive: true });

  const savedPaths = [];
  for (const f of batch.files) {
    if (!fs.existsSync(f.tmpPath)) continue;
    const destPath = uniqueDestPath(destDir, sanitizeFilename(f.name));
    moveFileSafe(f.tmpPath, destPath);
    savedPaths.push(destPath);
  }
  cleanupDir(batch.tmpDir);

  if (typeof callbacks.onFiles === 'function') {
    try {
      callbacks.onFiles(savedPaths);
    } catch {
      // ignore
    }
  }
  return savedPaths;
}

function decline(id) {
  const batch = stagedBatches.get(id);
  if (!batch) return;
  stagedBatches.delete(id);
  resetInactivityTimer();
  cleanupDir(batch.tmpDir);
}

module.exports = { start, stop, status, approve, decline };
