// Abstract background: slowly turning disk rings. Segments live in their own slots, so nothing overlaps.
// Rings.mount(hostElement, { palette, x, y, scale, alpha, rings, inner, seed, fade }) -> adds a canvas behind the host's content.
(() => {
  const COLORS = ['#0a84ff', '#5e5ce6', '#af52de', '#ff375f', '#ff7a45', '#ffd60a', '#30d158', '#00c7be', '#64d2ff'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, dark = matchMedia('(prefers-color-scheme: dark)');
  const inst = new Set(); let raf = 0;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, t) => { const c = hex(h).map((v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const tints = (c) => [c, mix(c, 0.35), mix(c, -0.25), mix(c, 0.6), mix(c, -0.45)];

  function mount(host, o = {}) {
    const cv = document.createElement('canvas'); cv.className = 'art-cv fade-' + (o.fade || 'none'); cv.setAttribute('aria-hidden', 'true');
    host.classList.add('art'); host.prepend(cv);
    const ctx = cv.getContext('2d'), pal = o.palette || COLORS, n = o.rings || 10, inner = o.inner ?? 0.12;
    let seed = o.seed || 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rings = Array.from({ length: n }, (_, i) => {
      const k = 2 + Math.floor(rnd() * 3), slot = Math.PI * 2 / k, off = rnd() * 6.283;
      return { f: inner + (i / Math.max(1, n - 1)) * (1 - inner), w: 3 + (i % 4) * 3, sp: (i % 2 ? 1 : -1) * (0.05 + (i % 5) * 0.022) * (o.speed || 1),
        segs: Array.from({ length: k }, (_, j) => { const l = slot * (0.3 + rnd() * 0.45); return { a: off + j * slot + rnd() * (slot - l), l, c: pal[Math.floor(rnd() * pal.length)] }; }) };   // one segment per slot: never overlap
    });
    let W = 0, H = 0, mx = 0, my = 0, tx = 0, ty = 0, vis = true;
    const size = () => { const d = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; if (!W || !H) return; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); if (reduced) draw(0); };
    function draw(t) {
      if (!W || !H) return;
      mx += (tx - mx) * 0.04; my += (ty - my) * 0.04; ctx.clearRect(0, 0, W, H); ctx.lineCap = 'round';
      const outer = Math.min(W, H) * (o.scale ?? 0.6), cx = W * (o.x ?? 0.5) + mx * 14, cy = H * (o.y ?? 0.5) + my * 10;
      const step = outer * (1 - inner) / Math.max(1, n - 1), cap = step * 0.62;
      ctx.globalAlpha = (dark.matches ? 0.95 : 0.85) * (o.alpha ?? 1);
      rings.forEach((g, i) => { ctx.lineWidth = Math.min(g.w * (outer / 260 + 0.45), cap);
        g.segs.forEach((s) => { const a0 = s.a + (reduced ? 0 : t / 1000) * g.sp; ctx.beginPath(); ctx.arc(cx + mx * i * 0.9, cy + my * i * 0.7, g.f * outer, a0, a0 + s.l); ctx.strokeStyle = s.c; ctx.stroke(); }); });
      ctx.globalAlpha = 1;
    }
    const it = { host, draw, get vis() { return vis; } }; inst.add(it);
    new ResizeObserver(size).observe(cv); size();
    new IntersectionObserver((e) => { vis = e[0].isIntersecting; }).observe(cv);
    if (!reduced) { addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true }); if (!raf) raf = requestAnimationFrame(loop); }
    return { destroy() { inst.delete(it); cv.remove(); } };
  }
  function loop(t) { for (const it of inst) { if (!it.host.isConnected) { inst.delete(it); continue; } if (it.vis) it.draw(t); } raf = inst.size ? requestAnimationFrame(loop) : 0; }
  window.Rings = { mount, tints, COLORS };
})();
