const fs = require('fs');
const path = require('path');
const { HOME, cache, cachedRun, run, duKB, pool, exists, listDir, isProtected } = require('./util');

const L = (...p) => path.join(HOME, 'Library', ...p);
let nextId = 1;
const mk = (o) => ({ id: nextId++, kind: 'path', selected: false, ...o });

const SECTION = {
  'Applications': 'Applications', 'Package & build caches': 'Developer', 'Mobile dev': 'Developer', 'Docker': 'Developer',
  'Project build outputs': 'Developer', 'App caches': 'Caches & Logs', 'App logs': 'Caches & Logs',
  'Orphaned app data': 'Leftovers', 'Large files': 'Large Files',
};
const SEVERITY = { SAFE: 'safe', REVIEW: 'caution', PERSONAL: 'critical', PROTECTED: 'protected' };
function applyDefaults(it) {
  it.section = it.section || SECTION[it.category] || it.category;
  if (it.isDir === undefined && it.kind === 'path') { try { it.isDir = fs.statSync(it.path).isDirectory(); } catch { it.isDir = false; } }
  it.severity = it.severity || SEVERITY[it.tag] || 'caution';
  if (!it.impact) {
    const safe = it.tag === 'SAFE';
    if (it.kind === 'app') it.impact = 'Removes the app. Its settings and leftover files can be removed too.';
    else if (it.kind === 'docker') it.impact = 'Deletes ALL unused images, containers and volumes. Data kept in Docker volumes (local databases, for example) is lost.';
    else if (it.kind === 'simruntime') it.impact = 'Simulators that use this runtime stop working until you download it again.';
    else if (it.category === 'Package & build caches') it.impact = safe ? 'Downloaded again automatically the next time a project needs it.' : 'May hold settings or tools. A project could re-download a lot of data.';
    else if (it.category === 'Mobile dev') it.impact = safe ? 'Downloaded again automatically when a project needs it.' : 'Projects or emulators that use this stop working until it is reinstalled.';
    else if (it.category === 'Project build outputs') it.impact = 'Rebuilt on the next build. Takes a little longer the first time.';
    else if (it.category === 'App caches' || it.category === 'App logs') it.impact = 'Apps rebuild this automatically. The first launch may be a little slower.';
    else if (it.category === 'Orphaned app data') it.impact = safe ? 'The app is gone, so nothing uses this.' : 'May belong to a command-line tool you still use.';
    else if (it.category === 'Large files') it.impact = 'One large file. Check you do not need it.';
    else it.impact = 'Moved to the Trash. You can restore it until you empty the Trash.';
  }
  return it;
}

function tagFor(p, base) {
  return isProtected(p) ? 'PROTECTED' : base;
}

// ---- installed apps (names + bundle ids) -------------------------------------------------
async function installedApps() {
  const dirs = ['/Applications', path.join(HOME, 'Applications')];
  const apps = [];
  for (const d of dirs) {
    for (const n of listDir(d)) {
      if (!n.endsWith('.app')) continue;
      const full = path.join(d, n);
      apps.push({ name: n.replace(/\.app$/, ''), path: full });
    }
  }
  await pool(apps, 8, async (a) => {
    const r = await run('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(a.path, 'Contents/Info.plist')]);
    a.bundleId = r.ok ? r.stdout.trim() : '';
  });
  return apps;
}

const norm = (s) => s.toLowerCase().replace(/\.app$/, '').replace(/[^a-z0-9]/g, '');

function orphanCheck(folderName, apps) {
  if (/^(com\.apple|apple|\.|cloudkit|group\.com\.apple)/i.test(folderName)) return null; // system
  const n = norm(folderName);
  if (!n) return null;
  for (const a of apps) {
    const an = norm(a.name);
    const bn = norm(a.bundleId || '');
    if (an && (an === n || n.includes(an) || an.includes(n))) return false;
    if (bn && (bn === n || n.includes(bn) || bn.includes(n))) return false;
  }
  return true;
}

async function mdfindBundleExists(id) {
  const r = await run('mdfind', [`kMDItemCFBundleIdentifier == '${id.replace(/'/g, '')}'`]);
  return r.ok && r.stdout.trim().length > 0;
}

// ---- references in the user's projects (gradle / NDK) -----------------------------------
async function projectRefs(projectsDir) {
  const refs = { gradle: new Set(), ndk: new Set() };
  if (!projectsDir) return refs;
  const g = await cachedRun('gw:' + projectsDir, 'find', [projectsDir, '-name', 'node_modules', '-prune', '-o', '-name', 'gradle-wrapper.properties', '-print'], { timeout: 180000 });
  for (const f of g.stdout.split('\n').filter(Boolean)) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/gradle-([\d.]+(?:-rc-\d+)?)-(?:bin|all)\.zip/);
      if (m) refs.gradle.add(m[1]);
    } catch {}
  }
  const n = await cachedRun('ndk:' + projectsDir, 'grep', ['-rhoE', '--include=metadata_generation_command.txt', '--include=build.gradle', '--include=build.gradle.kts', '--include=local.properties', '--include=FlutterExtension.kt', '(ndk/|ndkVersion[ =\\(]*["\']?|ndk.dir=.*/ndk/)[0-9]+\\.[0-9]+\\.[0-9]+', projectsDir], { timeout: 180000 });
  for (const line of n.stdout.split('\n')) {
    const m = line.match(/(\d+\.\d+\.\d+)$/);
    if (m) refs.ndk.add(m[1]);
  }
  // Flutter's bundled default NDK
  const fl = await run('which', ['flutter']);
  if (fl.ok) {
    const root = path.resolve(fs.realpathSync(fl.stdout.trim()), '..', '..');
    const f = await run('find', [path.join(root, 'packages/flutter_tools/gradle'), '-name', 'FlutterExtension.kt']);
    for (const file of f.stdout.split('\n').filter(Boolean)) {
      const m = fs.readFileSync(file, 'utf8').match(/ndkVersion[^"]*"(\d+\.\d+\.\d+)"/);
      if (m) refs.ndk.add(m[1]);
    }
  }
  return refs;
}

// ---- main scan ---------------------------------------------------------------------------
async function scan({ projectsDir, fresh }, progress, onItem = () => {}) {
  cache.setFresh(fresh);
  nextId = 1;
  const items = [];
  const push = (it) => { applyDefaults(it); items.push(it); onItem(it); };
  const sized = async (list) => pool(list, 6, async (it) => { it.sizeKB = await duKB(it.path); return it; });

  progress('Reading installed apps');
  const apps = await installedApps();

  progress('Applications');
  const appItems = await sized(apps.map((a) => mk({ category: 'Applications', name: a.name, path: a.path, bundleId: a.bundleId, kind: 'app', tag: 'REVIEW' })));
  await pool(appItems, 8, async (it) => {
    const r = await run('mdls', ['-name', 'kMDItemLastUsedDate', '-raw', it.path]);
    const v = r.stdout.trim();
    it.lastUsed = v && v !== '(null)' ? v.slice(0, 10) : null;
    it.note = it.lastUsed ? `Last used ${it.lastUsed}` : 'Last used: unknown';
    try { if (fs.statSync(it.path).uid === 0) it.rootOwned = true; } catch {}
    if (it.rootOwned) it.note += ' · needs admin password';
  });
  appItems.forEach(push);


  progress('Your folders');
  const LIB_RE = /\.(photoslibrary|musiclibrary|tvlibrary|imovielibrary|fcpbundle|logicx|band|aplibrary)$/i;
  const JUNK = ['node_modules', '__pycache__', '.venv', 'venv', 'Pods', '.gradle', '.next', '.cache', 'DerivedData', '.pytest_cache'];
  const isDirSafe = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  for (const folder of ['Documents', 'Downloads', 'Desktop', 'Pictures', 'Music', 'Movies']) {
    const dir = path.join(HOME, folder);
    const dl = folder === 'Downloads';
    const shown = new Set();
    // 1) top level, INCLUDING hidden items Finder does not show
    const entries = listDir(dir).filter((n) => !['.DS_Store', '.localized', '.Trash', '.CFUserTextEncoding'].includes(n) && n !== 'Icon\r').map((n) => path.join(dir, n));
    const top = entries.map((p) => {
      const n = path.basename(p), hidden = n.startsWith('.');
      const isGit = exists(path.join(p, '.git')), isLib = LIB_RE.test(n);
      const it = mk({ category: hidden ? 'Hidden items' : 'Top level', section: folder, name: n, path: p, isDir: isDirSafe(p), tag: dl || hidden ? 'REVIEW' : 'PERSONAL', trash: true, note: hidden ? 'Hidden by Finder · ' + p.replace(HOME, '~') : p.replace(HOME, '~') });
      if (isGit) { it.severity = 'critical'; it.tag = 'PERSONAL'; it.note = 'Project with a git repository (source code)'; it.impact = 'This is a code project. Uncommitted work and local-only history are lost. Moved to the Trash.'; }
      else if (isLib) { it.severity = 'critical'; it.tag = 'PERSONAL'; it.note = 'Media library'; it.impact = 'Your entire library. It cannot be rebuilt if you have no other copy. Moved to the Trash.'; }
      else if (hidden) it.impact = 'A hidden file or folder. Apps may still use it. Moved to the Trash.';
      else if (dl) it.impact = 'A file you downloaded. Moved to the Trash and restorable until you empty it.';
      else it.impact = 'Your own file or folder. Moved to the Trash and restorable until you empty it.';
      return it;
    });
    await sized(top);
    top.filter((i) => i.sizeKB > 0).forEach((i) => { shown.add(i.path); push(i); });

    // 2) deep: rebuildable folders at any depth (node_modules, .venv, Pods ...)
    const junkArgs = [dir, '-maxdepth', '8', '(', '-name', '.git', ')', '-prune', '-o', '-type', 'd', '('];
    JUNK.forEach((n, i) => { if (i) junkArgs.push('-o'); junkArgs.push('-name', n); });
    junkArgs.push(')', '-prune', '-print');
    const jr = await cachedRun('junk:' + dir, 'find', junkArgs, { timeout: 240000 });
    const junkDirs = jr.stdout.split('\n').filter((p) => p && !shown.has(p) && exists(p));
    const junkItems = await sized(junkDirs.map((p) => mk({ category: 'Rebuildable folders inside', section: folder, name: path.relative(dir, p), path: p, isDir: true, tag: 'REVIEW', note: 'Regenerated by npm install, pip, pod install or the next build', impact: 'Rebuilt by your package manager or the next build. Needs a reinstall and an internet connection.' })));
    junkItems.filter((i) => i.sizeKB > 20 * 1024).forEach((i) => { shown.add(i.path); push(i); });

    // 3) deep: large files (> 50 MB) anywhere inside, skipping packages and rebuildable folders
    const lf = [dir, '(', '-name', '.git', '-o', '-name', '*.photoslibrary', '-o', '-name', '*.musiclibrary', '-o', '-name', '*.app', '-o', '-name', '*.fcpbundle', '-o', '-name', '*.logicx'];
    JUNK.forEach((n) => lf.push('-o', '-name', n));
    lf.push(')', '-prune', '-o', '-type', 'f', '-size', '+50M', '-print');
    const fr = await cachedRun('big:' + dir, 'find', lf, { timeout: 240000 });
    const bigFiles = fr.stdout.split('\n').filter((p) => p && !shown.has(p) && path.dirname(p) !== dir && exists(p));
    const bigItems = await pool(bigFiles, 8, async (p) => { let kb = 0; try { kb = Math.round(fs.statSync(p).blocks * 512 / 1024); } catch {} return mk({ category: 'Large files inside', section: folder, name: path.relative(dir, p), path: p, sizeKB: kb, tag: dl ? 'REVIEW' : 'PERSONAL', trash: true, note: p.replace(HOME, '~'), impact: 'A large file buried inside a folder. Moved to the Trash and restorable until you empty it.' }); });
    bigItems.sort((x, y) => y.sizeKB - x.sizeKB).slice(0, 80).forEach(push);
  }


  progress('App data hidden by Finder');
  {
    const SKIP = /^(com\.apple\.|group\.com\.apple|apple|\.|cloudkit|systemgroup)/i;
    const MSG = /whatsapp|telegram|signal|wechat|line|slack|discord|messenger|skype|teams|zoom/i;
    const nice = (raw) => {
      const n = raw.replace(/^[A-Z0-9]{10}\./, '').replace(/^group\./, '').replace(/\.shared$/, '');
      const nn = norm(n);
      const hit = apps.find((a) => a.bundleId && nn && (norm(a.bundleId) === nn || nn.includes(norm(a.bundleId)) || norm(a.bundleId).includes(nn)));
      if (hit) return hit.name;
      const last = n.split('.').pop();
      return /^[a-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/.test(n) && last.length > 2 ? last.charAt(0).toUpperCase() + last.slice(1) : n;
    };
    const lib = (...p) => path.join(HOME, 'Library', ...p);
    const cand = [];
    const addDir = (dir, category, kind) => { for (const n of listDir(dir)) { if (SKIP.test(n)) continue; cand.push({ p: path.join(dir, n), n, category, kind }); } };
    addDir(lib('Containers'), 'App containers', 'crit');
    addDir(lib('Group Containers'), 'Shared app data', 'crit');
    addDir(lib('Application Support'), 'Application Support', 'caution');
    for (const [n, label] of [['Messages', 'Messages (iMessage chats and attachments)'], ['Mail', 'Mail (downloaded messages and attachments)'], ['Mobile Documents', 'iCloud Drive (local copies)']]) {
      if (exists(lib(n))) cand.push({ p: lib(n), n: label, category: 'Messages, Mail and iCloud', kind: 'crit', fixed: true });
    }
    const sizedC = (await pool(cand, 6, async (c) => ({ ...c, kb: await duKB(c.p) }))).filter((c) => c.kb > 20 * 1024);
    for (const c of sizedC) {
      const display = c.fixed ? c.n : (c.n === 'MobileSync' ? 'iPhone and iPad backups' : nice(c.n));
      const orphan = c.category === 'Application Support' && orphanCheck(c.n, apps) === true;
      const crit = c.kind === 'crit' || c.n === 'MobileSync';
      const msg = MSG.test(c.n) || MSG.test(display);
      const it = mk({ category: c.category, section: 'App Data', name: display, path: c.p, sizeKB: c.kb, trash: true, isDir: true, tag: crit ? 'PERSONAL' : 'REVIEW', note: c.p.replace(HOME, '~') });
      if (c.n === 'MobileSync') { it.impact = 'Backups of your iPhone or iPad. If you delete them and the device is lost, that data cannot be restored.'; it.note += ' · device backups'; }
      else if (msg) { it.impact = `${display} chats, photos and files stored on this Mac. Back them up to your phone or iCloud first. Moved to the Trash.`; it.note += ' · chats and media, hidden by Finder'; }
      else if (crit) { it.impact = `Everything ${display} keeps on this Mac (documents, databases, login). It starts empty afterwards, and anything not backed up is lost. Moved to the Trash.`; it.note += ' · hidden by Finder'; }
      else { it.impact = `Settings and local data for ${display}. It may sign you out or reset. Moved to the Trash.`; if (orphan) { it.note += ' · app not installed'; it.impact = `${display} is not installed, so nothing uses this. Moved to the Trash.`; } }
      push(it);
    }
  }


  progress('Hidden files in your home folder');
  {
    const COVERED = new Set(['Library', 'Applications', 'Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Movies', 'Public', '.Trash']);
    const CONTAINERS = ['.config', '.local', '.cache', '.var'];
    const nicer = (n) => n.replace(/^\./, '').replace(/[_]+/g, ' ');
    const RISKY = /backup|whatsapp|telegram|signal|wechat|photos|dump|\.sqlite|\.db$|recover/i;
    const HINT = { '.config': 'Settings and data for command-line tools and apps', '.local': 'Data for tools like pipx and uv', '.nvm': 'Node.js versions you installed (reinstall with nvm)', '.rustup': 'Rust toolchains', '.cargo': 'Rust packages and tools', '.cursor': 'Cursor editor extensions and data', '.vscode': 'VS Code extensions', '.claude': 'Claude Code settings and conversation history', '.gradle': 'Gradle caches and downloaded versions', '.platformio': 'PlatformIO boards and toolchains', '.pub-cache': 'Dart and Flutter packages', '.npm': 'npm download cache', '.m2': 'Maven downloads', '.docker': 'Docker settings' };
    const cand = [];
    for (const n of listDir(HOME)) { if (COVERED.has(n) || n === '.DS_Store' || !n.startsWith('.')) continue; cand.push({ p: path.join(HOME, n), n, parent: null }); }
    const top = (await pool(cand, 6, async (c) => ({ ...c, kb: await duKB(c.p) }))).filter((c) => c.kb > 10 * 1024);
    const kids = [];
    for (const c of top) if (CONTAINERS.includes(c.n)) for (const k of listDir(c.p)) kids.push({ p: path.join(c.p, k), n: k, parent: c.n });
    const kidSized = (await pool(kids, 6, async (c) => ({ ...c, kb: await duKB(c.p) }))).filter((c) => c.kb > 100 * 1024);
    const mkHidden = (c) => {
      const risky = RISKY.test(c.n);
      const prot = isProtected(c.p);
      const it = mk({ category: c.parent ? `Inside ~/${c.parent}` : 'Hidden in home folder', section: 'Hidden Files', name: nicer(c.n), path: c.p, sizeKB: c.kb, isDir: isDirSafe(c.p), trash: true,
        tag: prot ? 'PROTECTED' : risky ? 'PERSONAL' : 'REVIEW', note: c.p.replace(HOME, '~') + ' · hidden by Finder' + (HINT[c.n] ? ' · ' + HINT[c.n] : '') });
      it.impact = risky ? 'Looks like a backup or chat data (for example a WhatsApp backup from a phone tool). If it is your only copy it cannot be recovered. Moved to the Trash.'
        : (HINT[c.n] ? HINT[c.n] + '. ' : 'A hidden folder used by an app or tool. ') + 'Open it to see what is inside before deleting. Moved to the Trash.';
      return it;
    };
    top.forEach((c) => push(mkHidden(c)));
    kidSized.forEach((c) => push(mkHidden(c)));
  }

  progress('Package manager and build caches');
  const pkg = [
    '.npm', '.yarn', L('pnpm'), L('Caches', 'pnpm'), '.m2', '.gradle/caches', '.cocoapods', L('Caches', 'CocoaPods'),
    '.platformio', '.pub-cache', L('Caches', 'ms-playwright'),
  ].map((p) => (path.isAbsolute(p) ? p : path.join(HOME, p))).filter(exists);
  const pkgSkip = new Set(pkg.filter((p) => p.startsWith(L('Caches'))));
  const pkgItems = await sized(pkg.map((p) => mk({ category: 'Package & build caches', name: path.basename(p), path: p, tag: 'SAFE', note: p.replace(HOME, '~'), selected: true })));
  // ~/.m2 may hold settings.xml; ~/.cocoapods holds spec repos: still re-downloadable, but flag as review
  pkgItems.forEach((i) => { if (/\.m2$|\.pub-cache$|\.platformio$/.test(i.path)) { i.tag = 'REVIEW'; i.selected = false; i.note += ' · may hold settings or global tools'; } });
  pkgItems.forEach(push);

  progress('Gradle wrapper distributions');
  const refs = await projectRefs(projectsDir);
  const gd = path.join(HOME, '.gradle/wrapper/dists');
  const gradleItems = [];
  for (const d of listDir(gd)) {
    const m = d.match(/^gradle-([\d.]+(?:-rc-\d+)?)-(bin|all)$/);
    gradleItems.push(mk({ category: 'Package & build caches', name: `Gradle ${m ? m[1] : d} (wrapper)`, path: path.join(gd, d), ver: m && m[1] }));
  }
  await sized(gradleItems);
  gradleItems.forEach((i) => {
    if (!projectsDir) { i.tag = 'REVIEW'; i.note = 'Pick a projects folder to check references'; }
    else if (refs.gradle.has(i.ver)) { i.tag = 'REVIEW'; i.note = 'Referenced by a project'; }
    else { i.tag = 'SAFE'; i.selected = true; i.note = 'Not referenced by any gradle-wrapper.properties'; }
    push(i);
  });

  progress('App caches and logs');
  const caches = listDir(L('Caches')).filter((n) => !n.startsWith('.')).map((n) => path.join(L('Caches'), n)).filter((p) => !pkgSkip.has(p));
  const logs = listDir(L('Logs')).filter((n) => !n.startsWith('.') && n !== 'MacCleaner').map((n) => path.join(L('Logs'), n));
  const cacheItems = await sized([
    ...caches.map((p) => mk({ category: 'App caches', name: path.basename(p), path: p, tag: 'SAFE', selected: true, note: 'Regenerates automatically' })),
    ...logs.map((p) => mk({ category: 'App logs', name: path.basename(p), path: p, tag: 'SAFE', selected: true, note: 'Log files' })),
  ]);
  for (const it of cacheItems) {
    if (it.category === 'App caches' && orphanCheck(it.name, apps) === true) it.note = 'Cache of an app that is no longer installed';
    if (it.sizeKB > 1024) push(it); // hide < 1 MB noise
  }

  progress('Mobile development');
  const mobile = [];
  const sdk = L('Android', 'sdk');
  const ndkRoot = path.join(sdk, 'ndk');
  for (const v of listDir(ndkRoot)) mobile.push(mk({ category: 'Mobile dev', name: `Android NDK ${v}`, path: path.join(ndkRoot, v), ndkVer: v }));
  for (const sub of ['system-images']) for (const a of listDir(path.join(sdk, sub))) for (const b of listDir(path.join(sdk, sub, a))) mobile.push(mk({ category: 'Mobile dev', name: `System image ${a}/${b}`, path: path.join(sdk, sub, a, b), tag: 'REVIEW', note: 'Emulator system image' }));
  const avdRoot = path.join(HOME, '.android/avd');
  for (const d of listDir(avdRoot)) {
    if (!d.endsWith('.avd')) continue;
    const base = path.join(avdRoot, d);
    const snap = path.join(base, 'snapshots');
    if (exists(snap)) mobile.push(mk({ category: 'Mobile dev', name: `${d} snapshots`, path: snap, tag: 'SAFE', selected: true, note: 'Emulator snapshots (boot state)' }));
    mobile.push(mk({ category: 'Mobile dev', name: `AVD ${d}`, path: base, tag: 'REVIEW', severity: 'critical', impact: 'Deletes the whole emulator, including apps and files stored inside it.', note: 'Emulator device incl. userdata' }));
  }
  await sized(mobile);
  mobile.forEach((i) => {
    if (i.ndkVer) {
      if (!projectsDir) { i.tag = 'REVIEW'; i.note = 'Pick a projects folder to check references'; }
      else if (refs.ndk.has(i.ndkVer)) { i.tag = 'REVIEW'; i.note = 'Referenced by a project or Flutter default'; }
      else { i.tag = 'SAFE'; i.selected = true; i.note = 'No project or Flutter default references it'; }
    }
    push(i);
  });

  // iOS simulator runtimes
  const rt = await run('xcrun', ['simctl', 'runtime', 'list', '-j']);
  const dv = await run('xcrun', ['simctl', 'list', 'devices', '-j']);
  if (rt.ok) {
    try {
      const runtimes = Object.values(JSON.parse(rt.stdout));
      const devices = dv.ok ? JSON.parse(dv.stdout).devices || {} : {};
      for (const r of runtimes) {
        const rid = r.runtimeIdentifier || r.identifier;
        const count = Object.entries(devices).filter(([k]) => rid && k === rid).reduce((n, [, v]) => n + v.length, 0);
        push(mk({
          category: 'Mobile dev', kind: 'simruntime', name: `iOS Simulator ${r.platformIdentifier ? '' : ''}${r.version || ''} ${r.build ? '(' + r.build + ')' : ''}`.replace(/\s+/g, ' ').trim(),
          path: r.path || `simruntime:${r.identifier}`, runtimeId: r.identifier, sizeKB: Math.round((r.sizeBytes || 0) / 1024),
          tag: 'REVIEW', note: `${count} device${count === 1 ? '' : 's'} attached`, selected: false,
        }));
      }
    } catch {}
  }

  progress('Docker');
  const dockerRaw = L('Containers', 'com.docker.docker', 'Data', 'vms', '0', 'data', 'Docker.raw');
  const df = await run('docker', ['system', 'df']);
  if (df.ok || exists(dockerRaw)) {
    let kb = 0;
    try { kb = Math.round(fs.statSync(dockerRaw).blocks * 512 / 1024); } catch {}
    push(mk({ category: 'Docker', kind: 'docker', name: 'Docker images, containers, volumes', path: dockerRaw, sizeKB: kb, tag: 'REVIEW', severity: 'critical', note: (df.ok ? df.stdout.trim().split('\n').slice(1).map((l) => l.replace(/\s{2,}/g, ' · ')).join('  |  ') : 'Docker not running') + ' — runs prune -a --volumes' }));
  }

  progress('Large files (> 300 MB)');
  const skipDirs = [...['Documents', 'Downloads', 'Desktop', 'Pictures', 'Music', 'Movies'].map((d) => path.join(HOME, d) + path.sep), L('Containers', 'com.docker.docker'), L('Android'), L('Caches'), L('Developer', 'CoreSimulator')];
  const f = await cachedRun('large:' + HOME, 'find', [HOME, '(', '-name', 'node_modules', '-o', '-name', '.git', ')', '-prune', '-o', '-type', 'f', '-size', '+300M', '-print'], { timeout: 300000 });
  const large = f.stdout.split('\n').filter((p) => p && exists(p) && !skipDirs.some((s) => p.startsWith(s)) && !p.includes('/.Trash/'));
  const known = new Set(items.map((i) => i.path));
  await pool(large.filter((p) => !known.has(p)), 6, async (p) => {
    let kb = 0; try { kb = Math.round(fs.statSync(p).blocks * 512 / 1024); } catch {}
    const personal = /\.(mov|mp4|raw|heic|jpg|png|psd|key|pdf|sqlite|db|backup|photoslibrary)$/i.test(p) || /MobileSync|Photos Library|\.photoslibrary/.test(p);
    const inDl = p.startsWith(path.join(HOME, 'Downloads'));
    push(mk({ category: 'Large files', name: path.basename(p), path: p, sizeKB: kb, tag: tagFor(p, personal ? 'PERSONAL' : 'REVIEW'), trash: personal, note: p.replace(HOME, '~') + (inDl ? ' · in Downloads' : '') }));
  });

  if (projectsDir) {
    progress('Project build outputs');
    const names = ['build', 'dist', '.next', 'Pods', '.pio/build'];
    const args = [projectsDir, '(', '-name', 'node_modules', '-o', '-name', '.git', ')', '-prune', '-o', '-type', 'd', '('];
    names.forEach((n, i) => { if (i) args.push('-o'); args.push(n.includes('/') ? '-path' : '-name', n.includes('/') ? '*/' + n : n); });
    args.push(')', '-prune', '-print');
    const r = await cachedRun('proj:' + projectsDir, 'find', args, { timeout: 300000 });
    const dirs = r.stdout.split('\n').filter((x) => x && exists(x));
    const outs = await sized(dirs.map((p) => mk({ category: 'Project build outputs', name: path.relative(projectsDir, p), path: p, tag: tagFor(p, 'REVIEW'), note: 'Rebuildable output' })));
    outs.filter((o) => o.sizeKB > 1024).forEach(push);
  }

  progress('Orphaned app data');
  const orphanDirs = [L('Application Support'), path.join(HOME, '.config')];
  const cand = [];
  for (const d of orphanDirs) for (const n of listDir(d)) if (!n.startsWith('.') || d.endsWith('.config')) cand.push(path.join(d, n));
  const sizedCand = (await pool(cand, 6, async (p) => ({ p, kb: await duKB(p) }))).filter((c) => c.kb > 50 * 1024);
  for (const c of sizedCand) {
    const name = path.basename(c.p);
    if (items.some((i) => i.path === c.p)) continue;
    if (orphanCheck(name, apps) !== true) continue;
    const looksBundle = /^[a-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/.test(name);
    const confirmed = looksBundle && !(await mdfindBundleExists(name));
    push(mk({
      category: 'Orphaned app data', name, path: c.p, sizeKB: c.kb, tag: tagFor(c.p, confirmed ? 'SAFE' : 'REVIEW'), selected: confirmed,
      note: confirmed ? 'Orphaned — app uninstalled (bundle ID not found)' : 'No matching app in /Applications — verify before deleting (may be a CLI tool)',
    }));
  }

  const final = items.filter((i) => i.sizeKB > 0 || i.kind === 'app').sort((a, b) => b.sizeKB - a.sizeKB);
  cache.data.last = { t: Date.now(), items: final, projectsDir: projectsDir || null }; cache.save(); cache.setFresh(false);
  return final;
}

module.exports = { scan, installedApps };
