const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout || 120000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

// ---- persistent cache: unchanged parts are never measured again ----
const CACHE_FILE = path.join(HOME, 'Library', 'Application Support', 'Tidy', 'scan-cache.json');
const TTL = 24 * 3600 * 1000;                   // deep changes inside a folder do not touch its mtime, so refresh daily
let CACHE = { du: {}, finds: {}, inv: {}, ai: {}, last: null };
try { CACHE = { ...CACHE, ...JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) }; } catch {}
let saveTimer = null, FRESH = false;
function saveCache() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(CACHE)); } catch {} }, 400); }
const cache = { get data() { return CACHE; }, save: saveCache, setFresh(v) { FRESH = !!v; }, get fresh() { return FRESH; }, TTL };
const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

async function duKB(p) {
  const m = mtimeOf(p), c = CACHE.du[p];
  if (!FRESH && c && c.m === m && Date.now() - c.t < TTL) return c.kb;
  const r = await run('du', ['-sk', p], { timeout: 300000 });
  const n = parseInt((r.stdout.split('\t')[0] || '').trim(), 10);
  const kb = Number.isFinite(n) ? n : 0;
  CACHE.du[p] = { kb, m, t: Date.now() }; saveCache();
  return kb;
}
// find/grep results reused for a day unless a full rescan is requested; deleted paths are filtered by the caller
async function cachedRun(key, cmd, args, opts) {
  const c = CACHE.finds[key];
  if (!FRESH && c && Date.now() - c.t < TTL) return { ok: true, stdout: c.out, stderr: '', cached: true };
  const r = await run(cmd, args, opts);
  if (r.ok || r.stdout) { CACHE.finds[key] = { t: Date.now(), out: r.stdout }; saveCache(); }
  return r;
}
// keep every cache truthful after a delete, without rescanning: drop the paths and shrink their parents
function applyDeleted(entries) {                 // [{path,sizeKB}]
  const gone = entries.map((e) => e.path);
  const under = (p) => gone.some((g) => p === g || p.startsWith(g + '/'));
  for (const { path: g, sizeKB } of entries) {
    let par = path.dirname(g);
    while (par.length > 1) { const c = CACHE.du[par]; if (c) c.kb = Math.max(0, c.kb - sizeKB); const iv = Object.values(CACHE.inv); for (const inv of iv) { const row = inv.map && inv.map[par]; if (row !== undefined) inv.map[par] = Math.max(0, row - sizeKB); } if (par === HOME) break; par = path.dirname(par); }
  }
  for (const k of Object.keys(CACHE.du)) if (under(k)) delete CACHE.du[k];
  for (const inv of Object.values(CACHE.inv)) if (inv.map) for (const k of Object.keys(inv.map)) if (under(k)) delete inv.map[k];
  for (const k of Object.keys(CACHE.ai)) if (under(CACHE.ai[k].path || '')) delete CACHE.ai[k];
  for (const f of Object.values(CACHE.finds)) f.out = f.out.split('\n').filter((l) => !under(l)).join('\n');
  if (CACHE.last) {
    CACHE.last.items = CACHE.last.items.filter((i) => !under(i.path));
    for (const { path: g, sizeKB } of entries) for (const i of CACHE.last.items) if (g.startsWith(i.path + '/')) i.sizeKB = Math.max(0, i.sizeKB - sizeKB);
  }
  saveCache();
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
function listDir(p) { try { return fs.readdirSync(p); } catch { return []; } }

// Paths that must never be deleted. Contents of Documents/Music/etc. CAN be removed (to the Trash,
// only when the user picks them); the folders themselves, ~/.ssh, .git internals and anything outside
// ~ and /Applications cannot.
const PROTECTED_EXACT = new Set(['Documents', 'Pictures', 'Movies', 'Music', 'Desktop', 'Downloads', 'Library', 'Applications', 'Public', '.ssh', '.Trash'].map((d) => path.join(HOME, d)));
function isProtected(p) {
  const abs = path.resolve(p);
  if (abs === HOME || abs === '/' || PROTECTED_EXACT.has(abs)) return true;
  if (abs.split(path.sep).includes('.git')) return true;
  if (abs.startsWith(path.join(HOME, '.ssh') + path.sep)) return true;
  if (!(abs.startsWith(HOME + path.sep) || abs.startsWith('/Applications/'))) return true;
  return false;
}

function fmtKB(kb) {
  const b = kb * 1024;
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + ' GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + ' MB';
  return Math.round(b / 1024) + ' KB';
}

module.exports = { HOME, cache, cachedRun, applyDeleted, run, duKB, pool, exists, listDir, isProtected, fmtKB };
