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
  arrow: (s = 20) => svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', s),
  down2: (s = 20) => svg('<path d="m6 9 6 6 6-6"/>', s, 1.8),
  walletO: (s = 22) => svg('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><path d="M15.5 12h1.5"/><path d="M4 9h16"/>', s, 1.6),
  house: (s = 22) => svg('<path d="M3.5 10.2 12 3.5l8.5 6.7V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5z"/>', s, 1.5),
  receipt: (s = 20) => svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6"/><path d="M9 12h6"/>', s, 1.5),
  dots: (s = 20) => svg('<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>', s, 1.5),
  sliders: (s = 20) => svg('<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>', s, 1.5),
  refresh: (s = 20) => svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>', s, 1.5),
  plusCircle: (s = 22) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>', s, 1.6),
  notes: (s = 20) => svg('<path d="M14.5 3.5H6a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M14.5 3.5v5h5"/><path d="M8 13h8"/><path d="M8 16.5h5"/>', s, 1.6),
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
};

// Little square icon used in lists. kind: 'out' (red, down), 'in' (green, up), 'move' (neutral)
export function bubble(kind) {
  if (kind === 'out') return `<span class="bubble out">${icon.down()}</span>`;
  if (kind === 'in') return `<span class="bubble in">${icon.up()}</span>`;
  if (kind === 'stocks') return `<span class="bubble">${icon.stocks()}</span>`;
  return `<span class="bubble">${icon.swap()}</span>`;
}
