const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ALLOWED_EVENTS = [
  'hover', 'media', 'clip', 'open-panel', 'audio', 'device', 'yield',
  'system', 'privacy', 'notif', 'phonedrop-request', 'phonedrop-files', 'phonedrop-state',
];

contextBridge.exposeInMainWorld('nusa', {
  platform: process.platform,
  setRect: (r) => ipcRenderer.send('rect', r),
  media: (cmd) => ipcRenderer.send('media-cmd', cmd),
  volume: (level) => ipcRenderer.send('volume', level),
  mute: (on) => ipcRenderer.send('mute', on),
  openSource: (src) => ipcRenderer.send('open-source', src),
  copy: (t) => ipcRenderer.send('copy', t),
  open: (url) => ipcRenderer.send('open', url),
  focus: () => ipcRenderer.send('focus'),
  loginItem: (on) => ipcRenderer.invoke('login-item', on),
  contextMenu: () => ipcRenderer.send('context-menu'),
  calendar: (start, days) => ipcRenderer.invoke('calendar', start, days),
  locate: () => ipcRenderer.invoke('locate'),
  calendarSettings: () => ipcRenderer.send('calendar-settings'),
  senandung: (method, route, body) => ipcRenderer.invoke('senandung', method, route, body),
  // File Shelf (Tray)
  filePath: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  fileInfo: (p) => ipcRenderer.invoke('file-info', p),
  fileOpen: (p) => ipcRenderer.send('file-open', p),
  fileShow: (p) => ipcRenderer.send('file-show', p),
  fileDrag: (p) => ipcRenderer.send('file-drag', p),
  trayDragMany: (paths) => ipcRenderer.send('tray-drag-many', paths),
  trayDragText: (text) => ipcRenderer.send('tray-drag-text', text),
  shelfSync: (paths) => ipcRenderer.send('shelf-sync', paths),
  // Clipboard History (Clips)
  clipsConfig: (cfg) => ipcRenderer.send('clips-config', cfg),
  clipCopy: (item) => ipcRenderer.send('clip-copy', item),
  clipDrag: (item) => ipcRenderer.send('clip-drag', item),
  // System, Privacy, Notifications, Phone Drop
  systemWatch: (st) => ipcRenderer.send('system-watch', st),
  privacyWatch: (on) => ipcRenderer.send('privacy-watch', on),
  notifWatch: (on) => ipcRenderer.send('notif-watch', on),
  notifSettings: () => ipcRenderer.send('notif-settings'),
  phonedropStart: () => ipcRenderer.invoke('phonedrop-start'),
  phonedropStop: () => ipcRenderer.send('phonedrop-stop'),
  phonedropApprove: (id) => ipcRenderer.invoke('phonedrop-approve', id),
  phonedropDecline: (id) => ipcRenderer.send('phonedrop-decline', id),
  on: (channel, fn) => {
    if (ALLOWED_EVENTS.includes(channel)) ipcRenderer.on(channel, (_e, v) => fn(v));
  },
});
