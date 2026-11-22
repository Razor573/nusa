const fs = require('fs');
const path = require('path');
const dst = path.join(__dirname, '..', 'app', 'assets');
fs.rmSync(dst, { recursive: true, force: true });
