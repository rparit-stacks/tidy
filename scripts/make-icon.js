// Renders assets/icon.icns from an SVG using Electron itself (no extra tools). Run: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const { iconSVG } = require('./logo-svg');
app.on('window-all-closed', () => {});   // keep running between the two renders
app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'assets'); const set = path.join(out, 'icon.iconset'); fs.mkdirSync(set, { recursive: true });
  const render = async (svg) => {
    const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`));
    await new Promise((r) => setTimeout(r, 400)); const img = await win.webContents.capturePage(); win.destroy(); return img;
  };
  const full = await render(iconSVG('full')), simple = await render(iconSVG('simple'));
  fs.writeFileSync(path.join(out, 'icon-1024.png'), full.toPNG()); fs.writeFileSync(path.join(out, 'icon-simple-preview.png'), simple.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
  const tight = (v) => iconSVG(v).replace('viewBox="0 0 1024 1024" width="1024" height="1024"', 'viewBox="100 100 824 824" width="824" height="824"');
  fs.writeFileSync(path.join(out, 'logo-tight.svg'), tight('full')); fs.writeFileSync(path.join(out, 'logo-small.svg'), tight('simple'));
  fs.writeFileSync(path.join(out, 'logo.svg'), iconSVG('full')); fs.writeFileSync(path.join(out, 'logo-mark.svg'), require('./logo-svg').markSVG());
  for (const [n, s] of [['16', 16], ['16@2x', 32], ['32', 32], ['32@2x', 64], ['128', 128], ['128@2x', 256], ['256', 256], ['256@2x', 512], ['512', 512], ['512@2x', 1024]]) {
    const base = n.replace('@2x', ''); const src = s <= 64 ? simple : full;
    fs.writeFileSync(path.join(set, `icon_${base}x${base}${n.includes('@2x') ? '@2x' : ''}.png`), src.resize({ width: s, height: s, quality: 'best' }).toPNG());
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')]); fs.rmSync(set, { recursive: true });
  console.log('icon written'); app.quit();
});
