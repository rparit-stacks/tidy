const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (kb) => { const b = Math.max(0, kb) * 1024; if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(b >= 100 * 1024 ** 3 ? 0 : 1) + ' GB'; if (b >= 1024 ** 2) return Math.round(b / 1024 ** 2) + ' MB'; return Math.round(b / 1024) + ' KB'; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  Plan: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  Home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  Applications: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  Documents: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  Downloads: 'M12 4v12m0 0l-4-4m4 4l4-4M5 20h14',
  Desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  Pictures: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01',
  Music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  Movies: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  'Hidden Files': 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-2.2 3M6.6 7.6C4.5 9 3.2 10.9 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.8',
  'App Data': 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  Developer: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  'Caches & Logs': 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  Leftovers: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  'Large Files': 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 12h16',
};
const SECTIONS = [
  { n: 'Applications', c: '#0a84ff' }, { n: 'Documents', c: '#5e5ce6' }, { n: 'App Data', c: '#ff7a45' }, { n: 'Hidden Files', c: '#00c7be' }, { n: 'Downloads', c: '#32ade6' }, { n: 'Desktop', c: '#bf5af2' },
  { n: 'Pictures', c: '#ff375f' }, { n: 'Music', c: '#ff9f0a' }, { n: 'Movies', c: '#ff6b6b' }, { n: 'Developer', c: '#30d158' },
  { n: 'Caches & Logs', c: '#e3a008' }, { n: 'Leftovers', c: '#ac8e68' }, { n: 'Large Files', c: '#64d2ff' },
];
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.n, s]));
const svgIcon = (n, c) => `<span class="ico" style="--c:${c || 'var(--accent)'}"><svg viewBox="0 0 24 24"><path d="${ICON[n]}"/></svg></span>`;
const SEV_LABEL = { safe: 'Safe', caution: 'Review', critical: 'Critical', protected: 'Protected' };
const SEV_COLOR = { safe: 'var(--safe)', caution: 'var(--caution)', critical: 'var(--crit)' };

const STAGES = [
  ['Reading installed apps', 'Reading installed apps'], ['Applications', 'Applications'], ['Your folders', 'Documents, Downloads, Pictures…'], ['App data hidden by Finder', 'Hidden app data (WhatsApp, Mail…)'], ['Hidden files in your home folder', 'Hidden files in your home folder'],
  ['Package manager and build caches', 'Package caches'], ['Gradle wrapper distributions', 'Gradle versions'], ['App caches and logs', 'Caches and logs'],
  ['Mobile development', 'Android and iOS tools'], ['Docker', 'Docker'], ['Large files (> 300 MB)', 'Large files over 300 MB'],
  ['Project build outputs', 'Project build outputs'], ['Orphaned app data', 'Leftover app data'],
];

const state = { ai: { status: 'idle', plan: null, hide: localStorage.getItem('tidy.hide') !== '0' }, items: [], view: 'home', dryRun: true, projectsDir: null, scanning: false, disk: null, filter: 'all', sort: 'size', stage: -1, scanStart: 0, scanDone: false };
// Sizes never count twice: an item inside another listed folder is already part of that folder.
const sum = (l) => { const sorted = [...l].sort((a, b) => a.path.length - b.path.length); const kept = []; let n = 0;
  for (const i of sorted) { if (kept.some((p) => i.path.startsWith(p + '/'))) continue; kept.push(i.path); n += i.sizeKB || 0; } return n; };
const sec = (n) => state.items.filter((i) => i.section === n);
// Selected items, without children whose parent folder is also selected (so sizes never count twice).
const selected = () => { const l = state.items.filter((i) => i.selected && i.severity !== 'protected'); const ps = l.map((i) => i.path); return l.filter((i) => !ps.some((p) => p !== i.path && i.path.startsWith(p + '/'))); };
const JUNK = new Set(['node_modules', '__pycache__', '.venv', 'venv', 'Pods', '.gradle', '.next', '.cache', 'DerivedData', '.pytest_cache']);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const art = (host, o) => { if (host && !host.classList.contains('art')) Rings.mount(host, o); };
const tilde = (p) => p.replace(/^\/Users\/[^/]+/, '~');

function animNum(el, to, f = fmt) {
  cancelAnimationFrame(el._r);
  const from = el._v || 0, t0 = performance.now(), d = reduced ? 0 : 650;
  if (!d || from === to) { el._v = to; el.textContent = f(to); return; }
  const step = (t) => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 4); el._v = from + (to - from) * e; el.textContent = f(Math.round(el._v)); if (p < 1) el._r = requestAnimationFrame(step); else el._v = to; };
  el._r = requestAnimationFrame(step);
}

/* ---------------- sidebar ---------------- */
function buildNav() {
  const mk = (n, i, c) => `<button class="nav-i" data-v="${esc(n)}" style="--i:${i}">${svgIcon(n, c)}<span class="t">${esc(n)}</span><span class="n"></span><span class="dot"></span></button>`;
  $('#nav').innerHTML = mk('Home', 0, 'var(--accent)').replace('<span class="t">Home', '<span class="t">Overview') +
    mk('Plan', 1, '#af52de').replace('<span class="t">Plan', '<span class="t">Smart plan') +
    '<div class="nav-h">Your Mac</div>' + SECTIONS.slice(0, 9).map((s, i) => mk(s.n, i + 1, s.c)).join('') +
    '<div class="nav-h">Clean up</div>' + SECTIONS.slice(9).map((s, i) => mk(s.n, i + 10, s.c)).join('');
  $$('.nav-i').forEach((b) => b.onclick = () => setView(b.dataset.v));
}
function updateNav() {
  $$('.nav-i').forEach((b) => {
    const v = b.dataset.v;
    b.setAttribute('aria-current', v === state.view);
    if (v === 'Home' || v === 'Plan') return;
    const l = sec(v); $('.n', b).textContent = l.length ? fmt(sum(l)) : (state.scanning ? '…' : '');
    b.classList.toggle('has-sel', l.some((i) => i.selected));
  });
}

/* ---------------- views ---------------- */
let homeBuilt = false;
function setView(v) {
  state.view = v; state.filter = 'all'; state.browse = null;
  $('#crumb').textContent = '';
  const view = $('#view'); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); view.scrollTop = 0;
  if (v === 'Home') { homeBuilt = false; buildHome(); updateHome(); } else if (v === 'Plan') renderPlan(); else renderSection();
  updateNav();
}

function buildHome() {
  homeBuilt = true;
  const segs = SECTIONS.map((s) => `<circle class="seg" data-s="${esc(s.n)}" style="--c:${s.c}" cx="60" cy="60" r="48"><title>${esc(s.n)}</title></circle>`).join('');
  $('#view').innerHTML = `
  <div class="hello"><h1>Overview</h1><p id="hp"></p></div>
  <section class="card scancard ${state.scanDone ? 'done' : ''}" id="scancard" aria-label="Scan progress">
    <div class="scan-viz"><i class="pulse"></i><i class="pulse p2"></i>
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-sweep" cx="50" cy="50" r="47"/><circle class="ring-bg" cx="50" cy="50" r="46" style="stroke-width:7"/><circle class="ring-fg" id="ring" cx="50" cy="50" r="46" style="stroke-width:7;stroke-dasharray:289"/></svg>
      <div class="scan-pct"><b id="pct">0%</b><span id="elapsed">0s</span></div></div>
    <div class="scan-info"><h2 id="sh">Scanning your Mac</h2><p id="sp">Reading only. Nothing is changed.</p>
      <div class="stats"><div><b id="st-n">0</b>items found</div><div><b id="st-s">0 KB</b>found so far</div><div><b id="st-t">0 / 0</b>steps</div></div>
      <div class="stages" id="stages"></div></div>
  </section>
  <div class="hero">
    <section class="card"><h2>Storage</h2>
      <div class="donut-wrap"><div class="donut" role="img" id="donut-a11y"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="48"/>${segs}<circle class="seg other" id="seg-other" cx="60" cy="60" r="48"><title>Other (system, apps data, not scanned)</title></circle></svg>
        <div class="donut-c"><b id="d-free">—</b><span id="d-sub">free</span></div></div>
        <div class="legend" id="d-legend"></div></div></section>
    <section class="card reclaim"><h2>Safe to clean</h2><div class="big" id="r-big">—</div><p id="r-sub">Scan to find caches, logs and leftovers that apps rebuild by themselves.</p>
      <div class="row-btn"><button id="r-go" class="btn primary" disabled>Review safe items</button></div></section>
  </div>
  <div class="charts">
    <section class="card"><h2>Space by section</h2><div class="bars" id="bars"></div></section>
    <div class="col">
      <section class="card"><h2>How risky is it to remove?</h2><div class="sevbar" id="sevbar"></div><div class="sev" id="sev"></div></section>
      <section class="card"><h2>Largest items</h2><div class="top-list" id="toplist"></div></section>
    </div>
  </div>
  <h2 class="sec-t">Browse and clean</h2><div class="tiles" id="tiles"></div>`;
  $('#bars').innerHTML = SECTIONS.map((s) => `<div class="bar-r" data-s="${esc(s.n)}" style="--c:${s.c}" role="button" tabindex="0"><div class="lb"><em></em>${esc(s.n)}</div><div class="tr"><i></i></div><div class="v">—</div></div>`).join('');
  $$('.bar-r').forEach((b) => { b.onclick = () => setView(b.dataset.s); b.onkeydown = (e) => { if (e.key === 'Enter') setView(b.dataset.s); }; });
  $('#tiles').innerHTML = SECTIONS.map((s, i) => `<button class="tile loading" data-s="${esc(s.n)}" style="--i:${i};--c:${s.c}">${svgIcon(s.n, s.c)}<div class="nm">${esc(s.n)}</div><div class="sz">—</div><div class="meta">Waiting…</div><div class="mix"><i style="background:var(--safe)"></i><i style="background:var(--caution)"></i><i style="background:var(--crit)"></i></div></button>`).join('');
  $$('.tile').forEach((t) => t.onclick = () => setView(t.dataset.s));
  $('#r-go').onclick = reviewSafe;
  art($('.hello'), { x: 0.91, y: 0.5, scale: 0.47, rings: 7, alpha: 0.7, fade: 'left', seed: 5 });
  art($('.reclaim'), { x: 1.02, y: 1.02, scale: 0.55, rings: 6, alpha: 0.5, fade: 'corner', palette: ['#30d158', '#34c759', '#00c7be', '#8be28b'], seed: 3 });
  $('#stages').innerHTML = stageList().map(([, label], i) => `<div class="st" data-i="${i}"><i></i>${esc(label)}</div>`).join('');
  $('#sev').innerHTML = ['safe', 'caution', 'critical'].map((k) => `<div style="--c:${SEV_COLOR[k]}"><b data-k="${k}">—</b><span>${SEV_LABEL[k]}</span><small></small></div>`).join('');
  $('#sevbar').innerHTML = ['safe', 'caution', 'critical'].map((k) => `<i data-k="${k}" style="--c:${SEV_COLOR[k]}"></i>`).join('');
}
const stageList = () => STAGES.filter(([k]) => k !== 'Project build outputs' || state.projectsDir);

function updateScanCard() {
  const card = $('#scancard'); if (!card) return;
  const list = stageList(), n = list.length;
  const idx = state.scanDone ? n : Math.max(0, state.stage);
  $$('.st', card).forEach((el, i) => { el.className = 'st ' + (i < idx ? 'ok' : i === idx && state.scanning ? 'now' : ''); });
  const frac = state.scanDone ? 1 : Math.min(0.98, (idx + 0.45) / n);
  $('#ring').style.strokeDashoffset = 289 * (1 - frac);
  $('#pct').textContent = Math.round(frac * 100) + '%';
  $('#st-n').textContent = state.items.length; $('#st-s').textContent = fmt(sum(state.items)); $('#st-t').textContent = `${Math.min(idx + (state.scanDone ? 0 : 1), n)} / ${n}`;
  $('#sh').textContent = state.scanDone ? 'Scan complete' : 'Scanning your Mac';
  $('#sp').textContent = state.scanDone ? `Found ${state.items.length} items in ${Math.round((performance.now() - state.scanStart) / 1000)}s. Nothing has been changed.` : (list[idx] ? `Now checking: ${list[idx][1]}` : '');
  card.classList.toggle('done', state.scanDone && card.dataset.hide === '1');
}
setInterval(() => { const e = $('#elapsed'); if (e && state.scanning) e.textContent = Math.round((performance.now() - state.scanStart) / 1000) + 's'; }, 500);

function updateHome() {
  if (!homeBuilt) return;
  const items = state.items, total = sum(items), safe = items.filter((i) => i.severity === 'safe');
  const hp = $('#hp'); hp.innerHTML = state.scanning ? '<span class="scan-line"><span class="spin"></span>Scanning… results appear as they are found</span>' : items.length ? `${items.length} items · ${fmt(sum(safe))} safe to clean${state.lastScan ? ' · updated ' + ago(state.lastScan) : ''}` : 'Starting…';
  updateScanCard();
  // donut
  const d = state.disk, C = 2 * Math.PI * 48;
  const usedKB = d ? d.usedKB : total, totalKB = d ? d.totalKB : Math.max(total, 1);
  let off = 0;
  const parts = SECTIONS.map((s) => ({ s, kb: sum(sec(s.n)) }));
  const other = Math.max(0, usedKB - total);
  const place = (el, kb) => { const len = Math.min(C - off, (kb / totalKB) * C); const g = len > 3 ? 1.5 : 0; el.style.strokeDasharray = `${Math.max(0, len - g)} ${C}`; el.style.strokeDashoffset = -off; off += len; };
  parts.forEach(({ s, kb }) => place($(`.seg[data-s="${CSS.escape(s.n)}"]`), kb));
  place($('#seg-other'), other);
  if (d) { animNum($('#d-free'), d.availKB); $('#d-sub').textContent = `free of ${fmt(d.totalKB)}`; }
  $('#donut-a11y').setAttribute('aria-label', d ? `${fmt(d.availKB)} free of ${fmt(d.totalKB)}` : 'Storage');
  $('#d-legend').innerHTML = [...parts.filter((p) => p.kb > 0).sort((a, b) => b.kb - a.kb).slice(0, 7).map((p) => `<span style="--c:${p.s.c}"><em></em>${esc(p.s.n)}<b>${fmt(p.kb)}</b></span>`),
    d ? `<span style="--c:color-mix(in srgb,var(--ink3) 60%,transparent)"><em></em>Other<b>${fmt(other)}</b></span>` : ''].join('');
  // reclaim
  animNum($('#r-big'), sum(safe));
  $('#r-sub').textContent = safe.length ? `${safe.length} items that apps rebuild on their own, or belong to apps you no longer have. Nothing personal is included.` : state.scanning ? 'Looking for caches, logs and leftovers…' : 'Nothing safe to clean right now.';
  $('#r-go').disabled = !safe.length;
  // bars
  const max = Math.max(1, ...parts.map((p) => p.kb)), ranked = [...parts].sort((a, b) => b.kb - a.kb);
  $$('.bar-r').forEach((r) => { const p = parts.find((x) => x.s.n === r.dataset.s); $('i', r).style.width = (p.kb / max) * 100 + '%'; $('.v', r).textContent = p.kb ? fmt(p.kb) : '—'; r.style.order = ranked.indexOf(p); r.setAttribute('aria-label', `${p.s.n}: ${fmt(p.kb)}`); });
  // severity
  ['safe', 'caution', 'critical'].forEach((k) => { const l = items.filter((i) => i.severity === k), kb = sum(l);
    $(`.sev b[data-k="${k}"]`).textContent = fmt(kb); $(`.sev b[data-k="${k}"]`).parentElement.querySelector('small').textContent = `${l.length} item${l.length === 1 ? '' : 's'}`;
    $(`.sevbar i[data-k="${k}"]`).style.width = (total ? (kb / total) * 100 : 0) + '%'; });
  // tiles
  SECTIONS.forEach((s) => { const t = $(`.tile[data-s="${CSS.escape(s.n)}"]`), l = sec(s.n), kb = sum(l);
    t.classList.toggle('loading', state.scanning && !l.length);
    $('.sz', t).textContent = l.length ? fmt(kb) : '—'; $('.meta', t).textContent = l.length ? `${l.length} item${l.length === 1 ? '' : 's'}` : state.scanning ? 'Scanning…' : 'Nothing found';
    const mix = $$('.mix i', t); ['safe', 'caution', 'critical'].forEach((k, n) => { mix[n].style.width = (kb ? (sum(l.filter((i) => i.severity === k)) / kb) * 100 : 0) + '%'; }); });
  // largest
  const top = [...items].sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 6);
  $('#toplist').innerHTML = top.length ? top.map((i) => `<div class="r" data-s="${esc(i.section)}"><div><div class="a">${esc(i.name)}</div><div class="b">${esc(i.section)} · ${SEV_LABEL[i.severity]}</div></div><div class="s">${fmt(i.sizeKB)}</div></div>`).join('') : '<div class="note">Nothing yet.</div>';
  $$('#toplist .r').forEach((r) => r.onclick = () => setView(r.dataset.s));
}


/* ---------------- shared list card (spacious, expandable) ---------------- */
ICON.Folder = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
ICON.File = 'M6 3h8l4 4v14H6zM14 3v4h4';
function cardRow(it, o = {}) {
  const dis = it.severity === 'protected', c = o.color || (SEC[it.section] || {}).c || 'var(--accent)';
  const glyph = it.section === 'Applications' ? 'Applications' : it.isDir ? 'Folder' : 'File';
  const sub = o.sub ?? it.note ?? '';
  return `<div class="row item ${it.selected ? 'on' : ''} ${dis ? 'dis' : ''}" data-id="${esc(it.id)}" data-p="${esc(it.path)}" style="--i:${Math.min(o.idx || 0, 24)};--c:${c}">
    <label class="ck"><input type="checkbox" ${it.selected ? 'checked' : ''} ${dis ? 'disabled' : ''} aria-label="Select ${esc(it.name)}"></label>
    <span class="gl">${svgIcon(glyph, c)}</span>
    <div class="mid"><div class="nm">${esc(it.name)}</div><div class="sub">${esc(sub)}</div></div>
    <div class="rt"><div class="rt-top">${it.isDir && !o.noOpen ? '<button class="open" title="See what is inside">Open ›</button>' : ''}<span class="pill ${it.severity}">${SEV_LABEL[it.severity]}</span></div>
      <div class="sz">${it.sizeKB ? fmt(it.sizeKB) : '—'}</div>${o.max ? `<div class="bar"><i style="width:${Math.max(3, (it.sizeKB / o.max) * 100)}%"></i></div>` : ''}</div>
    <button class="chev-btn" aria-expanded="false" aria-label="Details"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="detail"><div class="detail-in"><div class="d-body">
      ${o.why ? `<div class="d-row"><span>Claude says</span><p>${esc(o.why)}</p></div>` : ''}
      <div class="d-row"><span>If you delete it</span><p>${esc(it.impact || (dis ? 'Protected. Tidy never deletes this.' : ''))}</p></div>
      <div class="d-row"><span>Location</span><p class="mono">${esc(tilde(it.path))}</p></div>
      <div class="d-acts"><button class="btn reveal">Show in Finder</button></div></div></div></div></div>`;
}
function wireRow(r, it, { onCheck, onOpen }) {
  const cb = $('input', r), chev = $('.chev-btn', r);
  const toggle = () => { const open = !r.classList.contains('exp'); r.classList.toggle('exp', open); chev.setAttribute('aria-expanded', open); };
  cb.onchange = () => onCheck(cb.checked);
  r.addEventListener('click', (e) => { if (e.target.closest('label,input,.open,.reveal')) return; toggle(); });
  $('.reveal', r).onclick = () => window.api.reveal(it.path);
  const ob = $('.open', r); if (ob) ob.onclick = (e) => { e.stopPropagation(); onOpen(); };
}

/* ---------------- section page ---------------- */
function renderSection(keepScroll) {
  const name = state.view, S = SEC[name]; if (!S) return;
  if (state.browse) return;
  const all = sec(name);
  let list = all.filter((i) => state.filter === 'all' || i.severity === state.filter);
  const by = { size: (a, b) => b.sizeKB - a.sizeKB, name: (a, b) => a.name.localeCompare(b.name), used: (a, b) => (a.lastUsed || '0').localeCompare(b.lastUsed || '0') };
  list = [...list].sort(by[state.sort] || by.size);
  const max = Math.max(1, ...all.map((i) => i.sizeKB));
  const cats = [...new Set(list.map((i) => i.category))];
  const row = (i, idx) => cardRow(i, { idx, max });
  let n = 0;
  const body = !list.length ? `<div class="empty"><b>${all.length ? 'No items match this filter' : state.scanning ? 'Scanning…' : 'Nothing found here'}</b>${all.length ? '' : 'This section is empty or not accessible.'}</div>`
    : cats.map((c) => `${cats.length > 1 ? `<div class="group-h">${esc(c)}</div>` : ''}<div class="list">${list.filter((i) => i.category === c).map((i) => row(i, n++)).join('')}</div>`).join('');
  const counts = (k) => k === 'all' ? all.length : all.filter((i) => i.severity === k).length;
  const allSel = list.length && list.filter((i) => i.severity !== 'protected').every((i) => i.selected);
  const st = keepScroll ? $('#view').scrollTop : 0;
  $('#view').innerHTML = `
    <div class="sec-head">${svgIcon(name, S.c)}<div><h1>${esc(name)}</h1><p>${fmt(sum(all))} · ${all.length} item${all.length === 1 ? '' : 's'}</p></div></div>
    <div class="tools"><div class="chips">${['all', 'safe', 'caution', 'critical'].map((k) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${k === 'all' ? 'All' : SEV_LABEL[k]} · ${counts(k)}</button>`).join('')}</div>
      <div class="tools-r"><button class="btn smart-sm" id="ask" title="Claude inspects this section and explains what can go">✦ Analyse with Claude</button><label class="note selall"><input type="checkbox" id="selall" ${allSel ? 'checked' : ''}> Select all shown</label>
      <div class="sort">Sort <select id="sort"><option value="size">Size</option><option value="name">Name</option>${name === 'Applications' ? '<option value="used">Last used</option>' : ''}</select></div></div></div>${body}`;
  $('#sort').value = state.sort; $('#view').scrollTop = st;
  art($('.sec-head'), { x: 0.92, y: 0.5, scale: 0.47, rings: 7, alpha: 0.75, fade: 'left', palette: Rings.tints(S.c), seed: name.length * 7 });
  $$('.chip').forEach((c) => c.onclick = () => { state.filter = c.dataset.f; renderSection(); });
  $('#sort').onchange = (e) => { state.sort = e.target.value; renderSection(); };
  $('#ask').onclick = () => analyseSection(name);
  $('#selall').onchange = (e) => { list.forEach((i) => { if (i.severity !== 'protected') i.selected = e.target.checked; }); renderSection(true); afterSelect(); };
  $$('#view .row').forEach((r) => { const it = state.items.find((x) => String(x.id) === r.dataset.id);
    wireRow(r, it, { onCheck: (v) => { it.selected = v; r.classList.toggle('on', v); afterSelect(); }, onOpen: () => openBrowse(name, it.path, it.path.replace(/\/[^/]+$/, '')) }); });
}

/* ---------------- browse inside a folder ---------------- */
async function openBrowse(section, dir, root) {
  state.browse = { section, path: dir, root: root || state.browse?.root || dir };
  const S = SEC[section];
  $('#view').innerHTML = `<div class="sec-head">${svgIcon(section, S.c)}<div><h1>${esc(dir.split('/').pop())}</h1><p><span class="scan-line"><span class="spin"></span>Reading what is inside…</span></p></div></div>`;
  const view = $('#view'); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  const list = await window.api.browse(dir);
  if (!state.browse || state.browse.path !== dir) return;
  renderBrowse(list);
}
function itemFor(e, section) {
  let it = state.items.find((i) => i.path === e.path); if (it) return it;
  const junk = JUNK.has(e.name);
  return { id: 'b:' + e.path, section, category: 'Picked from folders', name: e.name, path: e.path, sizeKB: e.sizeKB, kind: 'path', isDir: e.isDir, selected: false, trash: !junk, tag: junk ? 'REVIEW' : 'PERSONAL', severity: junk ? 'caution' : 'critical', note: tilde(e.path), impact: junk ? 'Rebuilt by your package manager or the next build.' : 'Your own file or folder. Moved to the Trash and restorable until you empty it.' };
}
function renderBrowse(list) {
  const { section, path, root } = state.browse, S = SEC[section];
  const rel = path === root ? [] : path.slice(root.length + 1).split('/');
  const crumbs = [`<button class="crumb-b" data-p="${esc(root)}">${esc(root.split('/').pop())}</button>`, ...rel.map((seg, n) => `<button class="crumb-b" data-p="${esc(root + '/' + rel.slice(0, n + 1).join('/'))}">${esc(seg)}</button>`)].join('<span class="sep">›</span>');
  const max = Math.max(1, ...list.map((e) => e.sizeKB));
  const asItem = (e) => e.protected ? { id: 'p:' + e.path, section, name: e.name, path: e.path, sizeKB: e.sizeKB, isDir: e.isDir, severity: 'protected', selected: false, impact: 'Protected. Tidy never deletes this.' } : itemFor(e, section);
  const rows = list.length ? list.map((e, idx) => cardRow(asItem(e), { idx, max, sub: `${e.isDir ? 'Folder' : 'File'}${e.hidden ? ' · hidden by Finder' : ''}` })).join('') : '<div class="empty"><b>Empty folder</b></div>';
  $('#view').innerHTML = `<div class="crumbs"><button class="back" id="b-back">‹ ${esc(section)}</button><div class="trail">${crumbs}</div></div>
    <div class="sec-head">${svgIcon(section, S.c)}<div><h1>${esc(path.split('/').pop())}</h1><p>${fmt(list.reduce((n, e) => n + e.sizeKB, 0))} · ${list.length} item${list.length === 1 ? '' : 's'} inside, including hidden ones</p></div></div>
    <div class="list" style="margin-top:16px">${rows}</div>`;
  art($('.sec-head'), { x: 0.92, y: 0.5, scale: 0.47, rings: 7, alpha: 0.75, fade: 'left', palette: Rings.tints(S.c), seed: 17 });
  $('#b-back').onclick = () => { state.browse = null; renderSection(); };
  $$('.crumb-b').forEach((b) => b.onclick = () => (b.dataset.p === root ? (state.browse = null, renderSection()) : openBrowse(section, b.dataset.p)));
  $$('#view .row').forEach((r) => { const e = list.find((x) => x.path === r.dataset.p); const it = asItem(e);
    wireRow(r, it, { onCheck: (v) => { it.selected = v; if (!state.items.includes(it)) state.items.push(it); r.classList.toggle('on', v); afterSelect(); }, onOpen: () => openBrowse(section, e.path) }); });
}

/* ---------------- smart scan: staged analysis with Claude Code (no API key) ---------------- */
const AI_STAGES = [['inventory', 'Measure what is there'], ['triage', 'Choose what to inspect'], ['evidence', 'Inspect each place'], ['decide', 'Decide and explain'], ['deeper', 'Look closer where unsure'], ['plan', 'Build the plan']];
const secOf = (n) => SEC[n] || SEC['Large Files'];
async function startSmart(scope) {
  if (state.ai.status === 'running') return;
  state.ai = { ...state.ai, status: 'running', plan: null, error: null, stage: 'inventory', msg: 'Starting…', usage: { input: 0, output: 0, calls: 0 }, t0: performance.now(), scope, seen: [] };
  setView('Plan');
  const r = await window.api.aiRun({ scope: { ...scope, fresh: state.ai.fullRun }, goal: '' });
  if (r.error) { state.ai = { ...state.ai, status: r.error === 'cancelled' ? 'idle' : 'error', error: r }; if (state.view === 'Plan') renderPlan(); return; }
  // turn plan entries into items, reusing what the normal scan already knows about the same path
  const picks = r.plan.map((x) => {
    let it = state.items.find((i) => i.path === x.path);
    const sev = x.severity, tag = sev === 'safe' ? 'SAFE' : sev === 'critical' ? 'PERSONAL' : 'REVIEW';
    if (!it) { it = { id: 'ai:' + x.path, section: x.section, category: 'From Smart scan', name: x.name, path: x.path, sizeKB: x.sizeKB, kind: x.isApp ? 'app' : 'path', isDir: x.isDir, selected: false, trash: x.trash, tag, severity: sev, note: x.what }; state.items.push(it); }
    it.impact = `${x.what}. ${x.why}`; it.sizeKB = it.sizeKB || x.sizeKB;
    if (it.severity !== 'protected') { it.severity = (it.severity === 'critical' || sev === 'critical') ? 'critical' : sev; it.tag = it.severity === 'safe' ? 'SAFE' : it.severity === 'critical' ? 'PERSONAL' : 'REVIEW'; }
    return { item: it, act: x.verdict, why: x.why, what: x.what, conf: x.conf, reused: x.reused, evidence: x.evidence };
  });
  state.ai = { ...state.ai, status: 'done', plan: { ...r, picks } };
  updateNav();
  if (state.view === 'Plan') renderPlan();
}
window.api.onAiProgress((m) => {
  if (state.ai.status !== 'running') return;
  state.ai = { ...state.ai, stage: m.stage, msg: m.msg, usage: m.usage || state.ai.usage }; state.ai.seen = state.ai.seen.includes(m.stage) ? state.ai.seen : [...state.ai.seen, m.stage];
  if (state.view === 'Plan') updatePlanProgress();
});
function updatePlanProgress() {
  const a = state.ai, el = $('#ai-card'); if (!el) return;
  const cur = AI_STAGES.findIndex(([k]) => k === a.stage);
  $$('.st', el).forEach((s, i) => { s.className = 'st ' + (i < cur ? 'ok' : i === cur ? 'now' : ''); });
  $('#ai-msg').textContent = a.msg; const u = a.usage || {};
  $('#ai-tok').textContent = `${(u.input || 0).toLocaleString()} in · ${(u.output || 0).toLocaleString()} out · ${u.calls || 0} Claude call${u.calls === 1 ? '' : 's'}`;
  $('#ai-ring').style.strokeDashoffset = 289 * (1 - Math.min(0.96, (cur + 0.5) / AI_STAGES.length));
}
setInterval(() => { const e = $('#ai-el'); if (e && state.ai.status === 'running') e.textContent = Math.round((performance.now() - state.ai.t0) / 1000) + 's'; }, 500);

function renderPlan() {
  const a = state.ai, sections = SECTIONS.filter((s) => !['Applications'].includes(s.n) || true);
  const picker = `<div class="scopes">
      <button class="scope" data-s="mac"><span class="ico" style="--c:#0a84ff"><svg viewBox="0 0 24 24"><path d="M3 5h18v11H3zM8 20h8M12 16v4"/></svg></span><b>Entire Mac</b><span>Home folder, hidden files, app data and applications</span></button>
      <button class="scope" data-s="folder"><span class="ico" style="--c:#5e5ce6"><svg viewBox="0 0 24 24"><path d="${ICON.Folder}"/></svg></span><b>Choose a folder…</b><span>Analyse everything inside one folder, any depth</span></button>
      <div class="scope sel"><span class="ico" style="--c:#00c7be"><svg viewBox="0 0 24 24"><path d="${ICON.Developer}"/></svg></span><b>One section</b><select id="scope-sec">${SECTIONS.map((s) => `<option>${esc(s.n)}</option>`).join('')}</select><button class="btn" id="scope-sec-go">Analyse</button></div></div>
    <div class="plan-opts"><label class="privacy"><input type="checkbox" id="hide" ${a.hide ? 'checked' : ''}><span><b>Hide names of personal items</b> when sending to Claude (recommended). Only the kind and size are shared.</span></label>
      <label class="privacy"><input type="checkbox" id="fullrun" ${a.fullRun ? 'checked' : ''}><span><b>Full re-analysis</b> Ignore what Tidy remembers. Slower and uses more tokens; normally not needed.</span></label></div>`;
  let body = '';
  if (a.status === 'running') {
    body = `<section class="card ai-card" id="ai-card"><div class="scan-viz"><i class="pulse"></i><i class="pulse p2"></i><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-sweep" cx="50" cy="50" r="47"/><circle class="ring-bg" cx="50" cy="50" r="46" style="stroke-width:7"/><circle class="ring-fg" id="ai-ring" cx="50" cy="50" r="46" style="stroke-width:7;stroke:#7d5cff;stroke-dasharray:289;stroke-dashoffset:289"/></svg><div class="scan-pct"><svg class="spark" viewBox="0 0 24 24"><path d="${ICON.Plan}"/></svg><span id="ai-el">0s</span></div></div>
      <div class="scan-info"><h2>Analysing ${esc(a.scope.type === 'mac' ? 'your Mac' : a.scope.type === 'folder' ? tilde(a.scope.path) : a.scope.name)}</h2><p id="ai-msg">${esc(a.msg)}</p>
      <div class="stages" style="margin-top:12px">${AI_STAGES.map(([, l]) => `<div class="st"><i></i>${l}</div>`).join('')}</div>
      <div class="usage" id="ai-tok" style="margin-top:12px"></div><button class="btn" id="ai-cancel" style="margin-top:12px">Cancel</button></div></section>`;
  } else if (a.status === 'error') {
    const e = a.error; const msg = e.error === 'not-found' ? 'Claude Code was not found. Install it, then run <b>claude</b> once in Terminal and sign in with your team account.' : e.error === 'timeout' ? 'Claude took too long. Try again.' : `Claude could not finish.${e.detail ? ' <span class="note">' + esc(e.detail) + '</span>' : ''}`;
    body = `<section class="card plan-empty"><h2>Smart scan did not work</h2><p>${msg}</p></section>`;
  } else if (a.status === 'done') {
    const P = a.plan, picks = P.picks, ys = picks.filter((p) => p.act === 'd'), cs = picks.filter((p) => p.act !== 'd'), yKB = sum(ys.map((p) => p.item)), cKB = sum(cs.map((p) => p.item)), u = P.usage || {};
    let n = 0; const row = (p) => cardRow(p.item, { idx: n++, why: p.why, sub: p.what, noOpen: false });
    body = `<section class="card plan-hero"><h2>Claude suggests</h2><div class="big"><span id="plan-big">0 KB</span><small>safe to remove</small></div>
      <p>${P.summary} ${fmt(cKB)} more needs your decision.</p>
      <div class="row-btn"><button class="btn primary" id="plan-sel" ${ys.length ? '' : 'disabled'}>Select recommended · ${fmt(yKB)}</button><button class="btn" id="plan-all" ${picks.length ? '' : 'disabled'}>Select all ${picks.length}</button></div>
      <div class="facts"><div><b>${P.considered}</b>places measured</div><div><b>${P.inspected}</b>inspected</div><div><b>${P.reused}</b>remembered</div><div><b>${P.deeper}</b>looked at closer</div><div><b>${P.total}s</b>total</div></div>
      <div class="usage">${(u.input || 0).toLocaleString()} tokens in · ${(u.output || 0).toLocaleString()} out · ${u.calls || 0} calls · about $${(u.cost || 0).toFixed(3)}${P.reused ? ` · ${P.reused} places reused from memory, no tokens spent` : ''}</div></section>
      ${ys.length ? `<div class="group-h">Recommended to remove · ${fmt(yKB)}</div><div class="list">${ys.map(row).join('')}</div>` : ''}
      ${cs.length ? `<div class="group-h">Review first · ${fmt(cKB)}</div><div class="list">${cs.map(row).join('')}</div>` : ''}
      ${picks.length ? '' : '<div class="empty"><b>Nothing worth removing here</b>Claude found no clear wins.</div>'}`;
  } else body = `<section class="card plan-empty"><h2>Pick where to look</h2><p>Smart scan measures the area, lets Claude choose what deserves a closer look, inspects those places (age, git state, contents, file types), then explains for each one what it is and whether to delete it. Places that have not changed since last time are remembered, so repeat runs are fast and use few tokens.</p></section>`;
  $('#view').innerHTML = `<div class="hello"><h1>Smart plan</h1><p>Claude analyses an area and tells you what it is and why it can go. Nothing is deleted until you review it.</p></div>${a.status === 'running' ? '' : picker}${body}`;
  art($('.hello'), { x: 0.91, y: 0.5, scale: 0.47, rings: 7, alpha: 0.8, fade: 'left', palette: ['#7d5cff', '#0a84ff', '#30c9e8', '#af52de', '#5e5ce6'], seed: 31 });
  art($('.ai-card'), { x: 0.93, y: 0.5, scale: 0.46, rings: 8, alpha: 0.75, fade: 'none', palette: ['#7d5cff', '#0a84ff', '#30c9e8', '#af52de'], seed: 13, speed: 2.2 });
  art($('.plan-hero'), { x: 0.94, y: 0.5, scale: 0.46, rings: 7, alpha: 0.7, fade: 'none', palette: ['#7d5cff', '#0a84ff', '#30c9e8', '#af52de'], seed: 19 });
  const hide = $('#hide'); if (hide) hide.onchange = (e) => { state.ai.hide = e.target.checked; try { localStorage.setItem('tidy.hide', e.target.checked ? '1' : '0'); } catch {} };
  const fr = $('#fullrun'); if (fr) fr.onchange = (e) => { state.ai.fullRun = e.target.checked; };
  $$('.scope[data-s]').forEach((b) => b.onclick = async () => { if (b.dataset.s === 'mac') startSmart({ type: 'mac', hide: state.ai.hide }); else { const p = await window.api.pickFolder(); if (p) startSmart({ type: 'folder', path: p, hide: state.ai.hide }); } });
  const sg = $('#scope-sec-go'); if (sg) sg.onclick = () => analyseSection($('#scope-sec').value);
  const cn = $('#ai-cancel'); if (cn) cn.onclick = () => window.api.aiCancel();
  if (a.status === 'running') updatePlanProgress();
  if (a.status === 'done') {
    const picks = a.plan.picks; animNum($('#plan-big'), sum(picks.filter((p) => p.act === 'd').map((p) => p.item)));
    $('#plan-sel').onclick = () => { picks.forEach((p) => { if (p.act === 'd') p.item.selected = true; }); renderPlan(); afterSelect(); review(); };
    $('#plan-all').onclick = () => { picks.forEach((p) => { p.item.selected = true; }); renderPlan(); afterSelect(); };
    $$('#view .row').forEach((r) => { const it = state.items.find((x) => String(x.id) === r.dataset.id); if (!it) return; wireRow(r, it, { onCheck: (v) => { it.selected = v; r.classList.toggle('on', v); afterSelect(); }, onOpen: () => openBrowse(it.section, it.path, it.path.replace(/\/[^/]+$/, '')) }); });
  }
}
function analyseSection(name) { startSmart({ type: 'section', name, paths: sec(name).map((i) => i.path), hide: state.ai.hide }); }

/* ---------------- selection bar ---------------- */
function afterSelect() { updateBar(); updateNav(); }
function updateBar() {
  const s = selected(), kb = sum(s);
  $('#sb-n').textContent = `${s.length} selected`; $('#sb-size').textContent = fmt(kb);
  $('#selbar').classList.toggle('show', s.length > 0);
  $('#sb-go').textContent = state.dryRun ? 'Review (dry run)…' : 'Review & delete…';
}

/* ---------------- scan ---------------- */
let raf = 0;
const refresh = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (state.view === 'Home') updateHome(); else if (state.view === 'Plan') { /* static */ } else if (state.scanning) { const ph = $('.sec-head p'); if (ph) ph.textContent = `${fmt(sum(sec(state.view)))} · ${sec(state.view).length} items`; } updateNav(); updateBar(); }); };

async function doScan(fresh) {
  if (state.scanning) return;
  state.scanning = true; state.scanDone = false; state.stage = 0; state.items = []; state.scanStart = performance.now();
  $('#scan').disabled = true; $('#scan').textContent = 'Scanning…';
  if (state.view !== 'Home') setView('Home'); else { homeBuilt = false; buildHome(); }
  updateHome(); updateNav(); updateBar();
  window.api.disk().then((d) => { state.disk = d; refresh(); });
  try {
    const final = await window.api.scan({ projectsDir: state.projectsDir, fresh: fresh === true }); state.lastScan = Date.now();
    const keep = new Map(state.items.map((i) => [i.id, i.selected]));
    state.items = final.map((i) => ({ ...i, selected: keep.has(i.id) ? keep.get(i.id) : i.selected }));
  } catch (e) { $('#hp') && ($('#hp').textContent = 'Scan failed: ' + e.message); }
  state.scanning = false; state.scanDone = true;
  $('#scan').disabled = false; $('#scan').textContent = 'Scan';
  if (state.view === 'Home') { updateHome(); const c = $('#scancard'); if (c) { c.dataset.hide = '0'; setTimeout(() => { if (c.isConnected) { c.dataset.hide = '1'; updateScanCard(); } }, 2600); } } else renderSection(true);
  updateNav(); updateBar();
}
window.api.onProgress((m) => { const list = stageList(); const i = list.findIndex(([k]) => k === m); if (i >= 0) state.stage = i; refresh(); });
window.api.onItem((it) => { state.items.push(it); refresh(); });

/* ---------------- review sheet ---------------- */
const warnIcon = '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg>';
const infoIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>';
const okIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>';
function sheet(html) { const o = $('#sheet'); $('.sheet').style.cssText = ''; $('#sheet-body').innerHTML = html; o.classList.remove('closing'); o.hidden = false; }
function closeSheet() { const o = $('#sheet'); o.classList.add('closing'); setTimeout(() => { o.hidden = true; o.classList.remove('closing'); }, reduced ? 0 : 180); }

function reviewSafe() { state.items.forEach((i) => { if (i.severity === 'safe') i.selected = true; }); if (state.view !== 'Home') renderSection(true); afterSelect(); review(); }

async function review() {
  const sel = selected(); if (!sel.length) return;
  sheet('<div class="spinner"></div><h2 id="sheet-title">Checking…</h2><p>Looking for running apps and leftover files.</p>');
  const prep = await window.api.prepare(sel);
  const crit = sel.filter((i) => i.severity === 'critical'), cau = sel.filter((i) => i.severity === 'caution'), ok = sel.filter((i) => i.severity === 'safe');
  const grouped = (l) => { const m = new Map(); l.forEach((i) => m.set(i.impact, [...(m.get(i.impact) || []), i])); return [...m]; };
  const chev = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const group = (l) => grouped(l).map(([imp, its]) => `<li class="grp"><div class="l"><b>${its.length} item${its.length > 1 ? 's' : ''}</b><span>${fmt(sum(its))}</span></div><div class="i">${esc(imp)}</div>
    <button type="button" class="disc" aria-expanded="false">${chev}<span>Show ${its.length > 1 ? 'all ' + its.length + ' items' : 'item'}</span></button>
    <div class="fold"><div class="fold-in"><div class="mini">${its.map((i) => `<div class="mr"><span class="dot" style="--c:${(SEC[i.section] || {}).c || 'var(--accent)'}"></span><span class="mn">${esc(i.name)}</span><span class="ms">${fmt(i.sizeKB)}</span></div>`).join('')}</div></div></div></li>`).join('');
  const resKB = sum(prep.residuals);
  sheet(`
    <h2 id="sheet-title">${state.dryRun ? 'Dry run: nothing will be deleted' : `Delete ${sel.length} item${sel.length > 1 ? 's' : ''}?`}</h2>
    <p>${state.dryRun ? 'This only shows what would happen.' : 'Read the warnings below before you continue.'}</p>
    <div class="sum"><div><b>${sel.length}</b>items</div><div><b>${fmt(prep.totalKB)}</b>to free</div>${prep.residuals.length ? `<div><b>${fmt(resKB)}</b>leftovers</div>` : ''}</div>
    ${crit.length ? `<section class="tier crit"><h3>${warnIcon}Critical · ${crit.length} item${crit.length > 1 ? 's' : ''}</h3><p class="why">These may hold your own data or work. Check each one.</p><ul>
      ${crit.map((i) => `<li><div class="l">${esc(i.name)}<span>${fmt(i.sizeKB)}</span></div><div class="i">${esc(i.impact)}</div></li>`).join('')}</ul></section>` : ''}
    ${cau.length ? `<section class="tier cau"><h3>${infoIcon}Check first · ${cau.length} item${cau.length > 1 ? 's' : ''}</h3><p class="why">Safe to remove if you know you do not need them.</p><ul>${group(cau)}</ul></section>` : ''}
    ${ok.length ? `<section class="tier ok"><h3>${okIcon}Safe · ${ok.length} item${ok.length > 1 ? 's' : ''}</h3><ul>${group(ok)}</ul></section>` : ''}
    ${prep.quit.length ? `<div class="plain"><h3>These apps will be quit first</h3><ul>${prep.quit.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    ${sel.some((i) => i.trash || i.kind === 'app') ? '<p class="note" style="margin-top:12px">Files and apps go to the Trash, so you can still restore them until you empty it.</p>' : ''}
    ${prep.residuals.length ? `<div class="plain"><h3>Also remove files left behind by the apps you are deleting</h3>${prep.residuals.map((r, i) => `<label><input type="checkbox" class="res" data-i="${i}" checked><span>${esc(r.path.replace(/^\/Users\/[^/]+/, '~'))} <span class="note">${fmt(r.sizeKB)}</span></span></label>`).join('')}</div>` : ''}
    ${crit.length && !state.dryRun ? '<label class="ack"><input type="checkbox" id="ack"><span>I have checked the critical items and want to continue.</span></label>' : ''}
    <div class="actions"><button class="btn" id="cancel">Cancel</button><button class="btn ${state.dryRun ? 'primary' : 'danger'}" id="go" ${crit.length && !state.dryRun ? 'disabled' : ''}>${state.dryRun ? 'Run dry run' : `Delete ${fmt(prep.totalKB)}`}</button></div>`);
  $('#cancel').onclick = closeSheet;
  $$('.disc').forEach((b) => b.onclick = () => { const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open); b.nextElementSibling.classList.toggle('open', open); const t = $('span', b); t.textContent = t.textContent.replace(open ? 'Show' : 'Hide', open ? 'Hide' : 'Show'); });
  const ack = $('#ack'); if (ack) ack.onchange = () => { $('#go').disabled = !ack.checked; };
  $('#go').onclick = async () => {
    const residuals = $$('.res').filter((c) => c.checked).map((c) => prep.residuals[+c.dataset.i]);
    sheet('<div class="spinner"></div><h2 id="sheet-title">Working…</h2><p id="prog">Starting</p>');
    showReport(await window.api.execute({ items: sel, residuals, dryRun: state.dryRun }));
  };
}
function showReport(r) {
  sheet(`<svg class="done-check" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/><path d="M13 23l6 6 12-13"/></svg>
    <h2 id="sheet-title">${r.dryRun ? 'Dry run complete' : 'Done'}</h2><p>${r.dryRun ? 'Nothing was deleted. This is what would be freed.' : ''}</p>
    <div class="kv"><span>${r.dryRun ? 'Would free' : 'Freed'}</span><b>${fmt(r.freedKB)}</b><span>Items</span><b>${r.count}</b><span>Free space before</span><b>${esc(r.before.avail)}</b><span>Free space after</span><b>${r.dryRun ? '—' : esc(r.after.avail)}</b></div>
    ${r.failed.length ? `<div class="plain"><h3>Needs manual attention</h3><ul>${r.failed.map((f) => `<li>${esc(f.path)}<div class="note">${esc(f.error)}</div></li>`).join('')}</ul></div>` : '<p>No failures.</p>'}
    <p class="note" style="margin-top:10px">Log: ${esc(r.logFile.replace(/^\/Users\/[^/]+/, '~'))}</p>
    <div class="actions">${r.dryRun ? '<button class="btn" id="reveal">Show log</button>' : ''}${r.dryRun ? '' : '<button class="btn" id="rescan">Rescan</button>'}<button class="btn primary" id="ok">Close</button></div>`);
  const rv = $('#reveal'); if (rv) rv.onclick = () => window.api.reveal(r.logFile);
  const prune = () => { if (r.dryRun) return; const gone = new Set(r.deleted || []); const removed = state.items.filter((i) => gone.has(i.path)); state.items = state.items.filter((i) => !gone.has(i.path)); for (const d of removed) for (const i of state.items) if (d.path.startsWith(i.path + '/')) i.sizeKB = Math.max(0, i.sizeKB - d.sizeKB); window.api.disk().then((x) => { state.disk = x; if (state.view === 'Home') updateHome(); }); state.view === 'Home' ? updateHome() : renderSection(true); updateNav(); updateBar(); };
  $('#ok').onclick = () => { closeSheet(); prune(); };
  const rs = $('#rescan'); if (rs) rs.onclick = () => { closeSheet(); doScan(); };
}
window.api.onExecProgress((m) => { const p = $('#prog'); if (p) p.textContent = m; });

/* ---------------- sheet: drag down to dismiss (1:1 tracking, rubber band, momentum projection) ---------------- */
(function sheetDrag() {
  const sh = $('.sheet'), RUBBER = 0.55, DIM = 180;
  const rubber = (x) => (x * DIM * RUBBER) / (DIM + RUBBER * Math.abs(x));
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
  let drag = false, y0 = 0, dy = 0, v = 0, last = 0, lastT = 0;
  sh.addEventListener('pointerdown', (e) => {
    if (!$('#cancel') || e.target.closest('button,input,label,summary,select,a') || sh.scrollTop > 0) return;
    drag = true; y0 = last = e.clientY; lastT = e.timeStamp; dy = v = 0; sh.setPointerCapture(e.pointerId); sh.style.transition = 'none'; sh.style.animation = 'none';
  });
  sh.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = e.clientY - y0; dy = d >= 0 ? d : -rubber(-d);        // soft resistance upward
    v = ((e.clientY - last) / Math.max(1, e.timeStamp - lastT)) * 1000; last = e.clientY; lastT = e.timeStamp;
    sh.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!drag) return; drag = false;
    const landing = dy + project(v);                                   // where the flick is going, not where it was released
    if (landing > 220 || v > 900) {
      sh.style.transition = 'transform .35s cubic-bezier(.4,0,1,1)'; sh.style.transform = 'translateY(110vh)';
      $('#sheet').style.transition = 'opacity .3s'; $('#sheet').style.opacity = 0;
      setTimeout(() => { $('#sheet').hidden = true; $('#sheet').style.cssText = ''; sh.style.cssText = ''; }, reduced ? 0 : 320);
    } else { sh.style.transition = ''; sh.style.transform = ''; sh.style.animation = ''; }
  };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
})();

/* ---------------- chrome ---------------- */
function setMode(dry) {
  state.dryRun = dry; $('#m-dry').classList.toggle('on', dry); $('#m-real').classList.toggle('on', !dry);
  $('#m-dry').setAttribute('aria-pressed', dry); $('#m-real').setAttribute('aria-pressed', !dry); $('.seg').classList.toggle('real', !dry); updateBar();
}
async function checkFDA() {
  const r = await window.api.checkFDA(), el = $('#fda');
  el.className = 'fda' + (r.ok ? '' : ' bad');
  el.innerHTML = r.ok ? 'Full Disk Access: on' : 'Full Disk Access is off, so some folders are hidden. <button id="fda-open">Open Settings</button>';
  if (!r.ok) $('#fda-open').onclick = window.api.openFDASettings;
}
$('#scan').onclick = () => doScan(false); $('#fullscan').onclick = () => doScan(true); $('#smart').onclick = () => setView('Plan'); $('#sb-go').onclick = review;
$('#sb-clear').onclick = () => { state.items.forEach((i) => { i.selected = false; }); if (state.view !== 'Home') renderSection(true); afterSelect(); };
$('#m-dry').onclick = () => setMode(true); $('#m-real').onclick = () => setMode(false);
$('#pick').onclick = async () => { const p = await window.api.pickFolder(); if (p) { state.projectsDir = p; $('#proj').textContent = p.split('/').pop(); } };
$('#sheet').onclick = (e) => { if (e.target.id === 'sheet' && $('#cancel')) closeSheet(); };
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); doScan(false); } if (e.key === 'Escape' && $('#cancel')) closeSheet(); });

let gateTimer, fdaOk = false;
function setStep(id, ok) { const el = $(id); el.classList.toggle('done', ok); }
async function startup() {
  const c = await window.api.cached();
  if (c && c.items && c.items.length) { state.items = c.items; state.lastScan = c.t; state.scanDone = true; if (c.projectsDir) { state.projectsDir = c.projectsDir; $('#proj').textContent = c.projectsDir.split('/').pop(); }
    window.api.disk().then((d) => { state.disk = d; }); if (state.view === 'Home') { homeBuilt = false; buildHome(); updateHome(); const sc = $('#scancard'); if (sc) { sc.classList.add('done'); sc.dataset.hide = '1'; } } updateNav(); updateBar(); }
  doScan(false);                                              // quick refresh: only changed places are measured again
}
function closeGate() { clearInterval(gateTimer); const g = $('#gate'); g.classList.add('out'); setTimeout(() => { g.hidden = true; }, reduced ? 0 : 350); checkFDA(); startup(); }
async function gateCheck() { const r = await window.api.checkFDA(); fdaOk = r.ok; setStep('#step-fda', r.ok); $('#gate-continue').disabled = !r.ok; if (r.ok) $('#fda-text').textContent = 'Full Disk Access is on. Tidy can see hidden app data and system-protected folders.'; return r.ok; }
async function claudeCheck() { const r = await window.api.claudeCheck(); setStep('#step-claude', r.found); $('#claude-help').hidden = r.found; $('#claude-text').innerHTML = r.found ? 'Claude Code found. <b>Smart scan</b> is ready, using your own Claude login.' : 'Only needed for <b>Smart scan</b>, where Claude explains what each large item is and whether it can go. Uses your own Claude login, no API key. Everything else works without it.'; return r.found; }
$('#gate-open').onclick = window.api.openFDASettings; $('#gate-re').onclick = gateCheck; $('#gate-show').onclick = () => window.api.revealSelf();
$('#claude-re').onclick = claudeCheck; $('#claude-docs').onclick = () => window.api.openUrl('https://docs.claude.com/en/docs/claude-code/overview');
$('#cmd-copy').onclick = async (e) => { try { await navigator.clipboard.writeText($('#cmd-text').textContent); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); } catch {} };
$('#gate-continue').onclick = closeGate; $('#gate-skip').onclick = closeGate;
window.api.whoAmI().then((w) => { $('#gate-who').textContent = w; });

buildNav(); setMode(true); setView('Home');
gateCheck().then((ok) => { if (ok) setTimeout(() => { if (!$('#gate').hidden && !$('#gate').classList.contains('out')) { /* wait for the user to read the screen */ } }, 0); gateTimer = setInterval(() => { gateCheck(); claudeCheck(); }, 2000); });
claudeCheck(); Rings.mount($('#gate'), { x: 0.5, y: 0.5, scale: 0.5, rings: 12, fade: 'left', seed: 7 });
