// Renders the installer window background (660x400 @1x and @2x) with the signature rings in two corners.
// Output: assets/dmg-background.tiff (HiDPI). Run through scripts/make-dmg.sh.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const NAME = require('../package.json').productName || 'App';
const logo = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-tight.svg'), 'utf8');
const C = ['#0a84ff', '#5e5ce6', '#af52de', '#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#00c7be', '#64d2ff'];
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rad = (d) => (d * Math.PI) / 180;
// Segments of one ring stay in their own slots inside the visible quarter, so nothing overlaps.
function corner(cx, cy, a0, a1) {
  let out = '';
  for (let i = 0; i < 7; i++) {
    const r = 36 + i * 17, w = 7 + (i % 3) * 2, k = 2 + (i % 2), slot = (a1 - a0) / k;
    for (let j = 0; j < k; j++) {
      const len = slot * (0.45 + rnd() * 0.4), s = a0 + j * slot + rnd() * (slot - len) * 0.8, e = s + len;
      const p = (a) => `${(cx + r * Math.cos(rad(a))).toFixed(1)} ${(cy + r * Math.sin(rad(a))).toFixed(1)}`;
      out += `<path d="M${p(s)}A${r} ${r} 0 0 1 ${p(e)}" stroke="${C[Math.floor(rnd() * C.length)]}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    }
  }
  return out;
}
const html = `<html><body style="margin:0;zoom:2"><div style="position:relative;width:660px;height:400px;overflow:hidden;background:#f5f5f7;font-family:-apple-system,'SF Pro Text',system-ui,sans-serif">
<svg width="660" height="400" style="position:absolute;inset:0">${corner(0, 400, -90, 0)}${corner(660, 0, 90, 180)}
<g stroke="#a1a1a6" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M268 190h116M366 172l20 18-20 18"/></g></svg>
<div style="position:absolute;left:0;right:0;top:20px;text-align:center"><div style="width:42px;height:42px;margin:0 auto">${logo.replace('<svg ', '<svg style="width:42px;height:42px" ')}</div>
<div style="font-size:21px;font-weight:700;letter-spacing:-.03em;color:#1d1d1f;margin-top:6px">Install ${NAME}</div></div>
<div style="position:absolute;left:0;right:0;top:218px;text-align:center;font-size:12.5px;color:#6e6e73"></div>
<div style="position:absolute;left:0;right:0;bottom:34px;text-align:center;font-size:12px;line-height:1.5;color:#6e6e73">Drag ${NAME} into Applications.<br><span style="color:#86868b">Claude Code is optional. It only adds Smart scan.</span></div>
</div></body></html>`;
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'assets');
  const win = new BrowserWindow({ width: 1320, height: 800, useContentSize: true, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  const w1 = path.join(out, 'dmg-bg.png'), w2 = path.join(out, 'dmg-bg@2x.png');
  fs.writeFileSync(w2, img.resize({ width: 1320, height: 800, quality: 'best' }).toPNG()); fs.writeFileSync(w1, img.resize({ width: 660, height: 400, quality: 'best' }).toPNG());
  execFileSync('sips', ['-s', 'dpiWidth', '72', '-s', 'dpiHeight', '72', w1], { stdio: 'ignore' }); execFileSync('sips', ['-s', 'dpiWidth', '144', '-s', 'dpiHeight', '144', w2], { stdio: 'ignore' });
  execFileSync('tiffutil', ['-cathidpicheck', w1, w2, '-out', path.join(out, 'dmg-background.tiff')], { stdio: 'ignore' });
  console.log('background written'); app.quit();
});
