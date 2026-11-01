const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const { HOME, applyDeleted, run, duKB, exists, listDir, isProtected, fmtKB } = require('./util');
const { installedApps } = require('./scanner');

const LOG_DIR = path.join(HOME, 'Library', 'Logs', 'MacCleaner');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runningApps() {
  const r = await run('ps', ['-axo', 'comm=']);
  return r.stdout.split('\n').filter((l) => l.includes('.app/'));
}

// Which running apps own the data in these items?
async function appsToQuit(items) {
  const running = await runningApps();
  const names = new Set();
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const runningNames = running.map((l) => { const m = l.match(/\/([^/]+)\.app\//); return m ? m[1] : null; }).filter(Boolean);
  const uniq = [...new Set(runningNames)];
  for (const it of items) {
    const key = norm(path.basename(it.path)).replace(/^com[a-z]+/, '');
    const own = it.kind === 'app' ? path.basename(it.path, '.app') : null;
    for (const n of uniq) {
      const nn = norm(n);
      if (own && own === n) names.add(n);
      else if (!own && nn.length > 3 && (norm(path.basename(it.path)).includes(nn) || (key.length > 3 && nn.includes(key)))) names.add(n);
    }
  }
  names.delete('Finder'); names.delete('Electron'); names.delete('Terminal');
  return [...names];
}

async function residualsFor(appItems) {
  const dirs = ['Application Support', 'Preferences', 'Caches', 'Logs', 'HTTPStorages', 'WebKit', 'Saved Application State', 'Containers']
    .map((d) => path.join(HOME, 'Library', d)).concat(path.join(HOME, '.config'));
  const out = [];
  for (const a of appItems) {
    const name = path.basename(a.path, '.app');
    const id = a.bundleId || '';
    for (const d of dirs) {
      for (const f of listDir(d)) {
        const hit = (id && (f === id || f.startsWith(id + '.') || f === id + '.plist' || f === id + '.savedState')) || f === name;
        if (hit) { const p = path.join(d, f); out.push({ path: p, app: name, sizeKB: await duKB(p) }); }
      }
    }
  }
  return out;
}

async function prepare(items) {
  const apps = items.filter((i) => i.kind === 'app');
  const totalKB = items.reduce((n, i) => n + (i.sizeKB || 0), 0);
  return { totalKB, quit: await appsToQuit(items), residuals: await residualsFor(apps), protectedHit: items.filter((i) => i.kind === 'path' && isProtected(i.path)).map((i) => i.path) };
}

function osaQuote(s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

async function adminRm(p, why) {
  const script = `do shell script "rm -rf ${osaQuote(shQuote(p))}" with prompt "${osaQuote(why)}" with administrator privileges`;
  return run('osascript', ['-e', script], { timeout: 300000 });
}

async function quitApp(name) {
  await run('osascript', ['-e', `quit app "${osaQuote(name)}"`]);
  for (let i = 0; i < 8; i++) {
    await sleep(1000);
    const still = (await runningApps()).some((l) => l.includes(`/${name}.app/`));
    if (!still) return true;
  }
  return false;
}

async function freeSpace() {
  const r = await run('df', ['-H', '/']);
  const line = r.stdout.trim().split('\n')[1] || '';
  const cols = line.split(/\s+/);
  return { size: cols[1], used: cols[2], avail: cols[3], raw: r.stdout.trim() };
}

async function execute({ items, residuals, dryRun }, send) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `${dryRun ? 'dryrun' : 'clean'}-${stamp}.log`);
  const log = (l) => fs.appendFileSync(logFile, `${new Date().toISOString()} ${l}\n`);
  const before = await freeSpace();
  const freed = { kb: 0 };
  const failed = [];
  const done = [];
  log(`${dryRun ? 'DRY RUN' : 'REAL RUN'} started. Free before: ${before.avail}`);

  const quitList = dryRun ? [] : await appsToQuit(items);
  for (const a of quitList) { send(`Quitting ${a}…`); const ok = await quitApp(a); log(`quit ${a}: ${ok ? 'ok' : 'STILL RUNNING'}`); if (!ok) failed.push({ path: a, error: 'App did not quit; its data was skipped' }); }
  const blocked = new Set(failed.map((f) => f.path));

  const all = [
    ...items.map((i) => ({ ...i })),
    ...residuals.map((r) => ({ kind: 'path', path: r.path, sizeKB: r.sizeKB, name: path.basename(r.path), residual: true })),
  ];
  let dockerDone = false;

  for (const it of all) {
    send(`${dryRun ? 'Would remove' : 'Removing'} ${it.name}`);
    if (it.kind !== 'simruntime' && isProtected(it.path)) { failed.push({ path: it.path, error: 'Protected path, refused' }); log(`REFUSED protected ${it.path}`); continue; }
    if (dryRun) { log(`WOULD DELETE ${it.path} (${fmtKB(it.sizeKB)})`); freed.kb += it.sizeKB; done.push(it.path); continue; }
    try {
      if (it.kind === 'docker') {
        const r = await run('docker', ['system', 'prune', '-a', '--volumes', '-f'], { timeout: 600000 });
        if (!r.ok) throw new Error(r.stderr || 'docker prune failed');
        await run('osascript', ['-e', 'quit app "Docker"']); await sleep(8000);
        await run('open', ['-a', 'Docker']);
        dockerDone = true;
      } else if (it.kind === 'simruntime') {
        const r = await run('xcrun', ['simctl', 'runtime', 'delete', it.runtimeId], { timeout: 300000 });
        if (!r.ok) throw new Error(r.stderr || 'simctl failed');
      } else if (it.trash && !it.residual) {
        if (!exists(it.path)) continue;
        await shell.trashItem(it.path); // user data: always reversible
      } else if (it.kind === 'app') {
        if (it.rootOwned) {
          const r = await adminRm(it.path, `Mac Cleaner needs your password to remove ${it.name}, which is owned by the system.`);
          if (!r.ok) throw new Error(r.stderr || 'admin removal cancelled');
        } else {
          await shell.trashItem(it.path); // reversible
        }
      } else {
        if (!exists(it.path)) continue;
        await fs.promises.rm(it.path, { recursive: true, force: true });
      }
      log(`DELETED ${it.path} (${fmtKB(it.sizeKB)})`);
      freed.kb += it.sizeKB; done.push(it.path);
    } catch (e) {
      log(`FAILED ${it.path}: ${e.message}`);
      failed.push({ path: it.path, error: e.message.trim().slice(0, 200) });
    }
  }
  if (!dryRun) { const g = new Set(done); applyDeleted(all.filter((i) => g.has(i.path)).map((i) => ({ path: i.path, sizeKB: i.sizeKB || 0 }))); }
  const after = await freeSpace();
  log(`Finished. Freed ~${fmtKB(freed.kb)}. Free after: ${after.avail}`);
  return { dryRun, freedKB: freed.kb, before, after, failed, count: done.length, deleted: done, logFile, dockerDone };
}

module.exports = { prepare, execute };
