// The logo: the signature rings. Segments sit in their own slots, so nothing overlaps.
const PAL = { blue: '#0a84ff', indigo: '#5e5ce6', purple: '#af52de', pink: '#ff375f', orange: '#ff9f0a', yellow: '#ffd60a', green: '#30d158', teal: '#00c7be', cyan: '#64d2ff' };
const rad = (d) => (d * Math.PI) / 180;
const arc = (cx, cy, r, a0, a1) => {
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0)), x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
// [radius, [start deg, end deg, colour]...]   0deg = 3 o'clock, clockwise
const FULL = { w: 48, rings: [
  [335, [[-100, 10, PAL.blue], [32, 112, PAL.purple], [136, 228, PAL.pink]]],
  [260, [[-30, 82, PAL.teal], [108, 202, PAL.green], [228, 300, PAL.cyan]]],
  [185, [[-120, -20, PAL.yellow], [6, 116, PAL.orange], [142, 214, PAL.pink]]],
  [110, [[-60, 62, PAL.indigo], [92, 204, PAL.blue]]],
] };
const SIMPLE = { w: 78, rings: [
  [315, [[-100, 20, PAL.blue], [60, 150, PAL.purple], [175, 240, PAL.pink]]],
  [215, [[-40, 70, PAL.teal], [100, 200, PAL.green]]],
  [115, [[-120, 0, PAL.yellow], [30, 170, PAL.orange]]],
] };
const ringsSVG = (v) => v.rings.map(([r, segs]) => segs.map(([a, b, c]) => `<path d="${arc(512, 512, r, a, b)}" stroke="${c}"/>`).join('')).join('');
// full icon: dark squircle + rings + centre dot
const iconSVG = (variant = 'full') => {
  const v = variant === 'simple' ? SIMPLE : FULL;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2e33"/><stop offset="1" stop-color="#121214"/></linearGradient></defs><rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/><g fill="none" stroke-width="${v.w}" stroke-linecap="round">${ringsSVG(v)}</g>${variant === 'simple' ? '' : '<circle cx="512" cy="512" r="40" fill="#f5f5f7"/>'}</svg>`;
};
// rings only, transparent: for use on any background
const markSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 824 824" width="512" height="512"><g fill="none" stroke-width="${FULL.w}" stroke-linecap="round">${ringsSVG(FULL)}</g><circle cx="512" cy="512" r="40" fill="currentColor"/></svg>`;
module.exports = { iconSVG, markSVG };
