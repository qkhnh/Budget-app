// ui.js
// Small display helpers and icons shared by the screens. No state, no maths beyond formatting.

import * as B from './budget-core.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// $1,234.56 (rounded through the core, so full precision is kept until here)
export function fmt(x, { sign = false } = {}) {
  const r = B.round2(x);
  const s = Math.abs(r).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${r < 0 ? '-' : sign && r > 0 ? '+' : ''}$${s}`;
}

// Big amount with a small dollar sign and smaller cents, like Dime.
export function big(x, cls = '') {
  const r = B.round2(x);
  const [int, dec] = Math.abs(r).toFixed(2).split('.');
  const grouped = Number(int).toLocaleString('en-AU');
  return `<span class="big ${cls}">${r < 0 ? '-' : ''}<span class="cur">$</span>${grouped}<span class="dec">.${dec}</span></span>`;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (iso) => WD[B.dayOfWeek(iso)];

// 'Today', 'Yesterday', or 'Thu 1/10'
export function dayLabel(iso, today) {
  if (iso === today) return 'Today';
  if (iso === B.addDays(today, -1)) return 'Yesterday';
  return `${weekday(iso)} ${B.dm(iso)}`;
}

// Date chip text: 'Today, 3/10'
export function dateChip(iso, today) {
  const d = dayLabel(iso, today);
  return d === 'Today' || d === 'Yesterday' ? `${d}, ${B.dm(iso)}` : d;
}

// '28/9/26 to 28/10/26' for pickers that span years
export function periodLabelLong(id) {
  const { start, end } = B.periodRange(id);
  const yy = (iso) => iso.slice(2, 4);
  return `${B.dm(start)}/${yy(start)} to ${B.dm(end)}/${yy(end)}`;
}

// Account refs <-> <select> values: 'budget:2026-09', 'pot:pot4', 'bucket:b5', 'stocks', 'out', 'in'
export function refKey(ref) {
  if (ref.type === 'budget') return `budget:${ref.periodId}`;
  if (ref.type === 'pot') return `pot:${ref.potId}`;
  if (ref.type === 'bucket') return `bucket:${ref.bucketId}`;
  return ref.type;
}
export function parseRefKey(key) {
  const i = key.indexOf(':');
  const type = i < 0 ? key : key.slice(0, i);
  const id = i < 0 ? '' : key.slice(i + 1);
  if (type === 'budget') return { type, periodId: id };
  if (type === 'pot') return { type, potId: id };
  if (type === 'bucket') return { type, bucketId: id };
  return { type };
}

// Icons: 24px strokes in currentColor
const svg = (d, size = 22, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const icon = {
  home: (s) => svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>', s),
  chart: (s) => svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>', s),
  plus: (s) => svg('<path d="M12 5v14"/><path d="M5 12h14"/>', s, 2.4),
  wallet: (s) => svg('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>', s),
  gear: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s, 1.8),
  close: (s = 18) => svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>', s),
  left: (s = 20) => svg('<path d="m15 18-6-6 6-6"/>', s),
  right: (s = 20) => svg('<path d="m9 18 6-6-6-6"/>', s),
  up: (s = 18) => svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', s),
  down: (s = 18) => svg('<path d="M7 7l10 10"/><path d="M17 8v9H8"/>', s),
  swap: (s = 18) => svg('<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>', s),
  check: (s = 18) => svg('<path d="M5 12.5 10 17l9-10"/>', s, 2.4),
  back: (s = 22) => svg('<path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="m16 10-4 4"/><path d="m12 10 4 4"/>', s, 1.8),
  calendar: (s = 16) => svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>', s),
  tag: (s = 16) => svg('<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/>', s),
  trash: (s = 18) => svg('<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>', s),
  alert: (s = 22) => svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>', s),
  home2: (s = 20) => svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>', s),
  stocks: (s = 18) => svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>', s),
  gift: (s = 18) => svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/>', s, 1.8),
  arrow: (s = 18) => svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', s),
  refresh: (s = 18) => svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>', s, 1.8),
  // Filled glyphs: the small soft-grey icons in front of card labels, and the tab bar icons.
  bell: (s = 20) => fill('<path d="M12 2.5a6 6 0 0 0-6 6v3.6L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 12.1V8.5a6 6 0 0 0-6-6zM9.5 18.5a2.5 2.5 0 0 0 5 0z"/>', s),
  bolt: (s = 14) => fill('<path d="M13.5 2 5 13.5h6L10 22l9-12.5h-6.2z"/>', s),
  coin: (s = 14) => fill('<circle cx="12" cy="12" r="9.5"/><path fill="var(--card-solid, #fff)" d="M12.8 7v1.1c1.3.2 2.2 1 2.4 2.1h-1.7c-.1-.5-.6-.9-1.5-.9-.9 0-1.4.4-1.4.9 0 .5.4.8 1.6 1.1 1.8.4 3.1 1 3.1 2.6 0 1.2-.9 2-2.5 2.2V17h-1.6v-1c-1.4-.2-2.4-1-2.6-2.3h1.7c.1.6.7 1 1.7 1 1 0 1.5-.4 1.5-.9 0-.6-.5-.8-1.8-1.1-1.6-.4-2.8-1-2.8-2.5 0-1.1.9-1.9 2.3-2.1V7z"/>', s),
  clock: (s = 14) => fill('<path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm.9 4.5v5.2l3.6 2.1-.9 1.5-4.4-2.6V7z"/>', s),
  warn: (s = 14) => fill('<path d="M10.3 3.3a2 2 0 0 1 3.4 0l8 13.7A2 2 0 0 1 20 20H4a2 2 0 0 1-1.7-3zM11 9v5h2V9zm0 6.5V17.5h2V15.5z"/>', s),
  list: (s = 14) => fill('<path d="M5 3.5h14A1.5 1.5 0 0 1 20.5 5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM7 8v2h10V8zm0 4v2h10v-2zm0 4v2h6v-2z"/>', s),
  pie: (s = 14) => fill('<path d="M11 2.6A9.5 9.5 0 1 0 21.4 13H11z"/><path d="M13 2.6V11h8.4A9.5 9.5 0 0 0 13 2.6z"/>', s),
  sun: (s = 20) => fill('<circle cx="12" cy="12" r="4.5"/><path d="M11 1.5h2v3h-2zM11 19.5h2v3h-2zM1.5 11h3v2h-3zM19.5 11h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zM16.3 17.7l1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z"/>', s),
  moon: (s = 20) => fill('<path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/>', s),
  auto: (s = 20) => fill('<path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 2v15a7.5 7.5 0 0 1 0-15z"/>', s),
  homeFill: (s = 20) => fill('<path d="M12 2.8 2.6 10.6a1 1 0 0 0 .6 1.8H5V20a1.5 1.5 0 0 0 1.5 1.5h3.5V15.5h4V21.5h3.5A1.5 1.5 0 0 0 19 20v-7.6h1.8a1 1 0 0 0 .6-1.8z"/>', s),
  chartFill: (s = 20) => fill('<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 9.5V17h2.5v-4.5zm4.5-5V17h2.5V7.5zm4.5 3V17H19v-6.5z"/>', s),
  walletFill: (s = 20) => fill('<path d="M5.5 4h11A2.5 2.5 0 0 1 19 6.5V8H5.5a1 1 0 0 0 0 2H19.5A1.5 1.5 0 0 1 21 11.5v7A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-12A2.5 2.5 0 0 1 5.5 4zM16 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>', s),
  gearFill: (s = 20) => fill('<path d="M10.3 2h3.4l.6 2.8 1.8.8 2.4-1.6 2.4 2.4-1.6 2.4.8 1.8 2.8.6v3.4l-2.8.6-.8 1.8 1.6 2.4-2.4 2.4-2.4-1.6-1.8.8-.6 2.8h-3.4l-.6-2.8-1.8-.8-2.4 1.6-2.4-2.4 1.6-2.4-.8-1.8L2 13.7v-3.4l2.8-.6.8-1.8L4 5.5l2.4-2.4 2.4 1.6 1.8-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>', s),
};

function fill(d, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
}

// The app's mark: four soft gold petals, like the reference's logo.
export const logo = (s = 22) => `<svg class="logo" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><g fill="var(--gold)"><rect x="2" y="2" width="9.6" height="9.6" rx="4.8"/><rect x="12.4" y="2" width="9.6" height="9.6" rx="4.8" opacity=".75"/><rect x="2" y="12.4" width="9.6" height="9.6" rx="4.8" opacity=".75"/><rect x="12.4" y="12.4" width="9.6" height="9.6" rx="4.8"/></g></svg>`;

// Numbers that count up. The page shows the final value; app.js animates from 0 (or the old value) when it should.
// f: 'big' (big amount), 'money' ($1,234.56), 'int', 'pct' (whole number).
export function formatCount(v, f) {
  if (f === 'big') return big(v);
  if (f === 'money') return fmt(v);
  return String(Math.round(v));
}
export const count = (key, v, f = 'money', cls = '') => `<span class="cnt ${cls}" data-k="${esc(key)}" data-v="${Number(v) || 0}" data-f="${f}">${formatCount(v, f)}</span>`;

// Little square icon used in lists. kind: 'out' (red, down), 'in' (green, up), 'move' (neutral)
export function bubble(kind) {
  if (kind === 'out') return `<span class="bubble out">${icon.down()}</span>`;
  if (kind === 'in') return `<span class="bubble in">${icon.up()}</span>`;
  if (kind === 'stocks') return `<span class="bubble">${icon.stocks()}</span>`;
  return `<span class="bubble">${icon.swap()}</span>`;
}
