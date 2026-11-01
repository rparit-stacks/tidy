const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { HOME } = require('./util');
const { scan } = require('./scanner');
const { prepare, execute } = require('./cleaner');

app.setName('Tidy');
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 900, minHeight: 600,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'active',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('fda:check', () => {
  for (const p of [path.join(HOME, 'Library/Mail'), path.join(HOME, 'Library/Safari'), path.join(HOME, '.Trash')]) {
    try { fs.readdirSync(p); return { ok: true }; } catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') return { ok: false }; }
  }
  return { ok: false };
});
ipcMain.handle('who', () => {
  const parent = process.env.TERM_PROGRAM === 'vscode' ? 'Visual Studio Code' : (process.env.TERM_PROGRAM || 'Terminal').replace('Apple_Terminal', 'Terminal');
  return app.isPackaged ? 'Tidy' : `Electron (or ${parent})`;
});
ipcMain.handle('reveal-self', () => shell.showItemInFolder(app.isPackaged ? path.resolve(process.execPath, '../../..') : process.execPath));
ipcMain.handle('fda:open', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'));
ipcMain.handle('folder:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('scan:run', (_e, opts) => scan(opts || {}, (m) => win.webContents.send('scan:progress', m), (it) => win.webContents.send('scan:item', it)));
ipcMain.handle('browse:list', async (_e, dir) => {
  const { run, duKB, pool, isProtected } = require('./util');
  const abs = path.resolve(dir);
  if (!abs.startsWith(HOME + path.sep) && abs !== HOME) return [];
  let ents = [];
  try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return []; }
  ents = ents.filter((e) => !['.DS_Store', '.localized'].includes(e.name));
  const out = await pool(ents, 8, async (e) => { const p = path.join(abs, e.name); return { name: e.name, path: p, isDir: e.isDirectory(), hidden: e.name.startsWith('.'), protected: isProtected(p), sizeKB: await duKB(p) }; });
  return out.sort((a, b) => b.sizeKB - a.sizeKB);
});
ipcMain.handle('claude:check', () => { const bin = require('./ai').findClaude(); return { found: !!bin, path: bin }; });
ipcMain.handle('open:url', (_e, u) => { if (/^https:\/\/(claude\.ai|docs\.claude\.com|docs\.anthropic\.com|github\.com)\//.test(String(u))) shell.openExternal(u); });
ipcMain.handle('scan:cached', () => { const l = require('./util').cache.data.last; return l ? { t: l.t, items: l.items, projectsDir: l.projectsDir } : null; });
ipcMain.handle('ai:run', (_e, opts) => require('./ai').smartAnalyze(opts, (p) => win.webContents.send('ai:progress', p)));
ipcMain.handle('ai:cancel', () => require('./ai').cancel());
ipcMain.handle('disk:info', async () => {
  const { run } = require('./util');
  for (const v of ['/System/Volumes/Data', '/']) {
    const r = await run('df', ['-k', v]);
    const c = (r.stdout.trim().split('\n')[1] || '').split(/\s+/);
    const total = parseInt(c[1], 10), avail = parseInt(c[3], 10);
    if (total) { const used = total - avail; return { totalKB: total, usedKB: used, availKB: avail }; }
  }
  return null;
});
ipcMain.handle('clean:prepare', (_e, items) => prepare(items));
ipcMain.handle('clean:execute', (_e, payload) => execute(payload, (m) => win.webContents.send('clean:progress', m)));
ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
