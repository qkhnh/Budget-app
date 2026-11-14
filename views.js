// views.js
// The four tab screens. Each function takes the state and returns HTML. No events, no storage.
// Layout follows the "Roam" reference: big rounded slabs (charcoal, warm grey, white) that interlock with
// matching notches, one sunflower-gold accent for progress and tags, a gold timeline with a badge riding on it,
// pill tags everywhere, and Insights drawn as a route over a dark area with a white sheet for the chosen day.

import * as B from './budget-core.js';
import { esc, fmt, dayLabel, periodLabelLong, icon, weekday } from './ui.js';

const seqOf = (id) => Number(String(id).replace(/\D/g, '')) || 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const f2 = (n) => n.toFixed(2);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dMon = (iso) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const rangeLabel = (pid) => { const r = B.periodRange(pid); return `${dMon(r.start)} – ${dMon(B.addDays(r.end, -1))}`; };

// ---- Shared pieces --------------------------------------------------------------

// A number that counts up when first shown (app.js animates elements with data-k).
export const num = (key, v, cls = '') => `<span class="cnt ${cls}" data-k="${esc(key)}" data-v="${B.round2(v)}">${fmt(v)}</span>`;

// Pill chips: the chosen one sits on a sliding pill (app.js moves it).
export function chips(options, current, act, groupLabel, dataKey = 'mode', role = 'group') {
  const i = Math.max(0, options.findIndex(([v]) => v === current));
  const tabs = role === 'tablist';
  return `<div class="chips-row" role="${tabs ? 'tablist' : 'group'}" aria-label="${esc(groupLabel)}">
    <span class="chip-thumb" aria-hidden="true"></span>
    ${options.map(([v, l], k) => `<button class="chip-btn ${k === i ? 'on' : ''}" ${tabs ? `role="tab" aria-selected="${k === i}"` : `aria-pressed="${k === i}"`} data-act="${act}" data-${dataKey}="${v}" data-chip-i="${k}">${esc(l)}</button>`).join('')}
  </div>`;
}

// Status pill: a small coloured dot, then the word.
export const statusLine = (tone, word) => `<span class="tag status ${tone}"><i aria-hidden="true"></i>${esc(word)}</span>`;

export function level(p) {
  if (p.level === 'over') return ['red', 'Over budget'];
  if (p.daysLeft > 0 && p.dailyPace > 0 && p.perDayLeft < p.dailyPace - 0.005) return ['gold', 'Spending fast'];
  return ['gold', 'Under pace'];
}

// The faint street pattern on dark slabs: a few straight and gently curved lines and two rounded blocks.
export const streets = () => `<svg class="streets" viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  <path d="M-10 40 C 60 36, 120 70, 190 58 S 300 20, 380 30"/><path d="M-10 110 L 120 92 L 210 120 L 380 96"/>
  <path d="M60 -10 L 74 180"/><path d="M150 -10 C 140 50, 170 90, 160 180"/><path d="M250 -10 L 236 180"/><path d="M320 -10 C 330 60, 300 120, 316 180"/>
  <rect x="84" y="128" width="54" height="34" rx="10"/><rect x="256" y="46" width="44" height="40" rx="10"/><path d="M-10 150 C 80 160, 200 140, 380 156"/>
</g></svg>`;

// signed: activity amounts (+$ green for money in). Unsigned: balances (red only when below 0).
function row({ title, sub = '', amount = null, signed = true, act = '', right = '' }) {
  let amt = '';
  if (amount !== null) {
    const r = B.round2(amount);
    const cls = signed ? (r > 0 ? 'green' : '') : r < 0 ? 'red' : '';
    amt = `<div class="amt ${cls}">${fmt(amount, { sign: signed })}</div>`;
  }
  const tag = act ? 'button' : 'div';
  return `<${tag} class="row" ${act}><div class="grow"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${amt}${right}</${tag}>`;
}

// Spends and transfers of one month's budget, as list items.
function budgetItems(state, periodId) {
  const items = B.spendsInPeriod(state, periodId).map((s) => ({
    date: s.date, seq: seqOf(s.id), kind: 'Spend', title: s.note || 'Spend', amount: -s.amount, spendId: s.id,
    act: `data-act="edit-spend" data-id="${esc(s.id)}"`,
  }));
  for (const t of B.transfersFor(state, { type: 'budget', periodId })) {
    const incoming = t.direction === 'in';
    const other = B.accountName(state, incoming ? t.from : t.to);
    items.push({
      date: t.date, seq: seqOf(t.id), kind: incoming ? 'Moved in' : t.to.type === 'stocks' ? 'To stocks' : 'Moved out',
      title: t.note || (incoming ? `From ${other}` : `To ${other}`), amount: incoming ? t.amount : -t.amount,
      act: `data-act="open-transfer" data-id="${esc(t.id)}"`,
    });
  }
  return items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.seq - a.seq);
}

// Accordion card for one day (used on the account pages).
export function dayAccordion(date, items, today, open) {
  const total = sum(items.map((x) => x.amount));
  const id = `day-${date ?? 'earlier'}`;
  return `<div class="acc ${open ? 'open' : ''}" data-acc>
    <button class="acc-head" data-act="toggle-acc" aria-expanded="${open}" aria-controls="${id}">
      <span class="acc-tile">${date ? Number(date.slice(8)) : '–'}</span>
      <span class="acc-text"><span class="sub">${date ? esc(dayLabel(date, today)) : 'Earlier'}</span><span class="acc-total ${B.round2(total) > 0 ? 'green' : ''}">${fmt(total, { sign: true })}</span></span>
      <span class="acc-chev">${icon.down2(20)}</span>
    </button>
    <div class="acc-body" id="${id}"><div class="acc-inner">
      ${items.map((it) => `<button class="acc-item" ${it.act}><span class="sub">${esc(it.kind)}</span><span class="acc-line"><span>${esc(it.title)}</span><b class="${B.round2(it.amount) > 0 ? 'green' : ''}">${fmt(it.amount, { sign: true })}</b></span></button>`).join('')}
    </div></div>
  </div>`;
}

// ---- The gold timeline ---------------------------------------------------------------
// Start dot, end dot, and a gold badge riding on the line at today's place in the budget period.
// The days' running totals ride along in data-days so the badge can be dragged (app.js).

function timeline(state, p, today, { mini = false, drag = true } = {}) {
  const days = B.spendByDay(state, p.start, p.end);
  let run = 0;
  const cum = days.map((d) => B.round2((run += d.total)));
  const n = days.length;
  const idx = Math.max(0, Math.min(n - 1, days.findIndex((d) => d.date === today)));
  const frac = n ? (idx + 0.5) / n : 0;
  const over = p.level === 'over';
  const data = esc(JSON.stringify(days.map((d, i) => [d.date, cum[i]])));
  const badge = drag
    ? `<div class="tl-badge" data-tl-badge role="slider" tabindex="0" aria-label="Day in this month, drag to look back" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${idx + 1}" aria-valuetext="${esc(dMon(today))}">${icon.walletO(22)}</div>`
    : `<div class="tl-badge small" aria-hidden="true">${icon.walletO(16)}</div>`;
  return `<div class="timeline ${over ? 'over' : ''} ${mini ? 'mini' : ''}" style="--f:${f2(frac)}" ${drag ? `data-timeline data-days="${data}" data-total="${B.round2(p.total)}" data-today="${idx}"` : ''}>
    ${mini ? '' : `<div class="tl-top"><span class="tl-end">${esc(dMon(p.start))}</span><b data-tl-center>${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left</b><span class="tl-end">${esc(dMon(B.addDays(p.end, -1)))}</span></div>`}
    <div class="tl-line"><i class="tl-dot start"></i><i class="tl-done"></i><i class="tl-rest"></i><i class="tl-dot end"></i>${badge}</div>
    ${mini ? '' : `<div class="tl-bottom"><span>Spent <b data-tl-spent>${num('home-spent', p.spent)}</b></span>
      <span class="tag dark" data-tl-perday>${num('home-perday', p.perDayLeft)} / day</span>
      <span>Left <b data-tl-left class="${over ? 'red-on-dark' : ''}">${num('home-left', p.remaining)}</b></span></div>`}
  </div>`;
}

// ---- Home -----------------------------------------------------------------------

function header(title, right = '') {
  return `<header class="top-bar"><h1>${esc(title)}</h1>${right}</header>`;
}

export function renderHome(state, today, ui) {
  const d = B.dashboard(state, today);
  const p = d.period;
  const out = [header('Budget', '<button class="round avatar" data-act="goto" data-tab="settings" aria-label="Settings">K</button>')];

  if (d.empty) {
    out.push(`<section class="slab dark"><div class="slab-top"><h2>No data yet</h2></div>
      <p class="on-dark-muted">Import a backup to load your budget, or set up a lump sum in Settings.</p>
      <button class="btn gold wide" data-act="goto" data-tab="settings">Go to Settings</button></section>`);
    return out.join('');
  }

  // The dark month slab and the grey card under it interlock; + sits in the lens between them.
  const month = !p.hasBudget && !p.imported
    ? `<section class="slab dark notch-b">${streets()}<div class="slab-top"><h2>This month</h2><span class="tag dark">${esc(rangeLabel(p.periodId))}</span></div>
      <p class="on-dark-muted">No budget for ${esc(B.periodLabel(p.periodId))} yet. Add the next lump sum in Settings, under Plans.</p>
      <button class="btn gold" data-act="goto" data-tab="settings">Open Plans</button></section>`
    : `<section class="slab dark notch-b">${streets()}
      <div class="slab-top"><h2>This month</h2><span class="tag dark">${esc(rangeLabel(p.periodId))}</span></div>
      ${timeline(state, p, today)}
    </section>`;

  // Grey card: Rent when it needs attention, otherwise the last spend.
  const r = d.rent;
  const items = budgetItems(state, p.periodId);
  let grey;
  if (r.status !== 'none') {
    const lbl = { overdue: `Was due · ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} ago`, 'due-today': 'Due today', upcoming: `Next due · ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}` }[r.status];
    grey = `<div class="slab-top"><h2>Rent</h2><button class="round frost-light" data-act="rent-options" data-period="${esc(r.periodId)}" aria-label="Rent options">${icon.dots(20)}</button></div>
      <div class="glyph" aria-hidden="true">${icon.house(120)}</div>
      <div class="slab-bottom"><div><div class="label">${esc(lbl)}</div><div class="value">${esc(dMon(r.dueDate))}</div></div>
        <span class="tag gold">${r.amount ? fmt(r.amount) : esc(lbl)}</span></div>`;
  } else {
    const last = items.find((x) => x.spendId);
    grey = last
      ? `<div class="slab-top"><h2>${esc(last.title)}</h2><button class="round frost-light" ${last.act} aria-label="Edit this spend">${icon.dots(20)}</button></div>
        <div class="glyph" aria-hidden="true">${icon.receipt(120)}</div>
        <div class="slab-bottom"><div><div class="label">Last spend</div><div class="value">${esc(dayLabel(last.date, today))} · ${esc(dMon(last.date))}</div></div>
          <span class="tag gold">${fmt(-last.amount)}</span></div>`
      : `<div class="slab-top"><h2>Nothing spent yet</h2></div>
        <div class="glyph" aria-hidden="true">${icon.receipt(120)}</div>
        <div class="slab-bottom"><div><div class="label">This month</div><div class="value">${esc(rangeLabel(p.periodId))}</div></div></div>`;
  }
  out.push(`<div class="slab-pair">
    ${month}
    <div class="lens"><button class="gold-circle" data-act="add" aria-label="Add a spend">${icon.plus(24)}</button></div>
    <section class="slab grey notch-t">${grey}</section>
  </div>`);

  // Recent transactions on a white sheet. Words only (no icon boxes).
  const shown = ui.homeAll ? items : items.slice(0, 8);
  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Recent transactions</h3>${items.length > 8 ? `<button class="link" data-act="toggle-recent">${ui.homeAll ? 'Show less' : 'See all'}</button>` : ''}</div>
    ${items.length
    ? `<div class="list">${shown.map((it) => row({ title: it.title, sub: it.date ? dayLabel(it.date, today) : 'Earlier', amount: it.amount, act: it.act })).join('')}</div>`
    : '<p class="empty">Nothing spent this month yet.</p>'}
  </section>`);
  return out.join('');
}

export function monthRowSub(m) {
  if (m.status === 'open') return m.remaining < 0 ? 'Over budget, not done' : 'Left over, not done';
  if (m.doneNote) return m.doneNote;
  const outs = m.moves.filter((x) => x.direction === 'out');
  if (outs.length) return `Moved to ${[...new Set(outs.map((x) => (x.to.type === 'stocks' ? 'Stocks' : x.to.type === 'out' ? 'Spent' : x.to.type === 'budget' ? 'Budget' : x.to.type === 'pot' ? 'Salary' : 'Other')))].join(', ')}`;
  return 'Nothing left';
}

const donePill = (m) => (m.status === 'open' ? statusLine('red', 'Not done') : `<span class="tag chip">${icon.check(12)} Done</span>`);
const monthRow = (m) => `<button class="row month-row" data-act="open-month" data-period="${esc(m.periodId)}">
  <div class="grow"><div class="title">${esc(m.label)}</div><div class="sub">${esc(monthRowSub(m))}</div></div>
  <span class="end"><span class="tag ${m.remaining < -0.004 ? 'chip red-text' : 'chip'}">${m.remaining < -0.004 ? `${fmt(-m.remaining)} over` : `${fmt(m.remaining)} left`}</span>${donePill(m)}</span></button>`;

// ---- Insights: the month as a route ----------------------------------------------

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function route(days, counts, pace, today, sel, perDayLeft) {
  const n = days.length;
  const W = 340;
  const H = 230;
  let run = 0;
  const cum = days.map((d) => (run += d.total));
  const todayI = days.findIndex((d) => d.date === today);
  const last = todayI >= 0 ? todayI : (days[n - 1].date < today ? n - 1 : -1);
  const maxY = niceMax(Math.max(1, ...cum, pace * n));
  const x = (i) => 18 + (n === 1 ? 0.5 : i / (n - 1)) * (W - 36);
  const y = (v) => H - 18 - (v / maxY) * (H - 50);
  const pts = cum.slice(0, last + 1).map((v, i) => [x(i), y(v)]);
  const path = pts.length > 1 ? `M ${pts.map((q) => `${f2(q[0])} ${f2(q[1])}`).join(' L ')}` : '';
  const tail = pts.length > 1 ? `M ${pts.slice(-3).map((q) => `${f2(q[0])} ${f2(q[1])}`).join(' L ')}` : '';
  // Markers on days with spends; in Month view skip ones that would overlap the previous marker.
  let lastX = -99;
  let lastYm = -99;
  const markers = [];
  days.forEach((d, i) => {
    if (i > last || !counts[i]) return;
    const px = x(i);
    const py = y(cum[i]);
    if (i !== sel && Math.hypot(px - lastX, py - lastYm) < (n > 8 ? 30 : 40)) return;
    lastX = px;
    lastYm = py;
    markers.push(`<button class="marker ${i === sel ? 'on' : ''} ${n > 8 ? 'small' : ''}" style="left:${f2((px / W) * 100)}%;top:${f2((py / H) * 100)}%;--d:${Math.round((i / Math.max(1, last)) * 800)}ms" data-act="pick-day" data-i="${i}" aria-label="${esc(dayLabel(d.date, today))} ${esc(dMon(d.date))}, ${counts[i]} spend${counts[i] === 1 ? '' : 's'}, ${fmt(d.total)}">${icon.receipt(n > 8 ? 13 : 16)}<span class="count">${counts[i]}</span></button>`);
  });
  const t = last >= 0 ? pts[last] : null;
  return `<div class="route" data-route style="--n:${n}">
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${pace > 0 ? `<line class="pace-line" x1="${x(0)}" y1="${f2(y(0))}" x2="${x(n - 1)}" y2="${f2(y(pace * n))}"/>` : ''}
      ${path ? `<path class="route-line" d="${path}" pathLength="1"/>` : ''}
      ${tail && todayI >= 0 ? `<path class="route-tail" d="${tail}"/>` : ''}
    </svg>
    ${markers.join('')}
    ${t && todayI >= 0 ? `<span class="you" style="left:${f2((t[0] / W) * 100)}%;top:${f2((t[1] / H) * 100)}%" aria-hidden="true"></span>
      <span class="tag frost left-pill${t[0] / W > 0.7 ? ' below' : ''}" style="${t[0] / W > 0.7 ? `left:${f2(Math.min(70, (t[0] / W) * 100))}%;top:${f2(Math.min(88, (t[1] / H) * 100 + 9))}%` : `left:${f2((t[0] / W) * 100 + 6)}%;top:${f2(Math.min(88, (t[1] / H) * 100 + 3))}%`}">${fmt(perDayLeft)} / day left</span>` : ''}
  </div>`;
}

// A little gold squiggle of one day's spends.
function squiggle(values) {
  const W = 110;
  const H = 34;
  if (!values.length) return '';
  const vs = values.length === 1 ? [values[0], values[0]] : values;
  const max = Math.max(...vs, 1);
  const pts = vs.map((v, i) => [4 + (i / (vs.length - 1)) * (W - 8), H - 4 - (v / max) * (H - 10)]);
  let d = `M ${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const mx = (ax + bx) / 2;
    d += ` C ${f2(mx)} ${f2(ay)}, ${f2(mx)} ${f2(by)}, ${f2(bx)} ${f2(by)}`;
  }
  return `<svg class="squiggle" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" pathLength="1"/></svg>`;
}

function breakdown(p) {
  const parts = [
    ...p.fixed.map((f) => ({ name: f.name, value: f.amount, cls: 'seg-grey' })),
    { name: 'Spent', value: p.spent, cls: p.level === 'over' ? 'seg-red' : 'seg-gold' },
    { name: 'Moved out', value: p.transfersOut, cls: 'seg-dark' },
    { name: 'Left', value: Math.max(0, p.remaining), cls: 'seg-light' },
  ].filter((x) => x.value > 0.004);
  const total = sum(parts.map((x) => x.value)) || 1;
  return `<div class="breakdown">${parts.map((x) => `<span class="${x.cls}" style="flex:${x.value}"></span>`).join('')}</div>
    <div class="legend">${parts.map((x) => `<span><i class="${x.cls}"></i>${esc(x.name)} <b>${fmt(x.value)}</b> <span class="muted">${Math.round((x.value / total) * 100)}%</span></span>`).join('')}</div>`;
}

export function renderInsights(state, today, ui) {
  const { mode } = ui.insights;
  const cur = B.periodIdOf(today);
  let range;
  let lbl;
  let atLatest;
  let pid;
  if (mode === 'month') {
    pid = ui.insights.periodId ?? cur;
    range = B.periodRange(pid);
    lbl = rangeLabel(pid);
    atLatest = pid >= cur;
  } else {
    const start = ui.insights.weekOf ?? B.weekRange(today).start;
    range = { start, end: B.addDays(start, 7) };
    lbl = `${dMon(start)} – ${dMon(B.addDays(start, 6))}`;
    atLatest = range.end > today;
    pid = B.periodIdOf(start);
  }
  const days = B.spendByDay(state, range.start, range.end);
  const spends = state.spends.filter((s) => s.date >= range.start && s.date < range.end);
  const counts = days.map((d) => spends.filter((s) => s.date === d.date).length);
  const spendDays = counts.filter(Boolean).length;
  const p = B.periodSummary(state, pid, today);
  const todayI = days.findIndex((d) => d.date === today);
  const sel = Math.max(0, Math.min(days.length - 1, ui.insDay ?? (todayI >= 0 ? todayI : days.length - 1)));
  const dayList = spends.filter((s) => s.date === days[sel].date);
  const dayTotal = days[sel].total;
  const biggest = dayList.length ? Math.max(...dayList.map((s) => s.amount)) : 0;
  const pace = p.dailyPace;
  const st = pace > 0 ? (dayTotal <= pace + 0.004 ? ['gold', 'Under pace'] : ['red', 'Over pace']) : null;

  const out = [`<section class="route-area">
    ${streets()}
    <header class="route-head">
      <button class="round frost" data-act="insights-step" data-step="-1" aria-label="Previous">${icon.left()}</button>
      <div class="route-title"><h1>Insights</h1><div class="on-dark-sub">${spends.length} spend${spends.length === 1 ? '' : 's'} · ${spendDays} day${spendDays === 1 ? '' : 's'}</div></div>
      <div class="route-right">
        <button class="round frost" data-act="insights-step" data-step="1" aria-label="Next" ${atLatest ? 'disabled' : ''}>${icon.right()}</button>
        <button class="round frost" data-act="ins-filter" aria-label="Week or month, ${spendDays} days with spends">${icon.sliders(20)}<span class="count">${spendDays}</span></button>
      </div>
    </header>
    <div class="route-meta"><span class="tag dark">${mode === 'week' ? 'Week' : 'Month'} · ${esc(lbl)}</span><span class="tag dark">Spent ${num(`ins-spent-${mode}`, sum(days.map((x) => x.total)))}</span></div>
    ${route(days, counts, pace, today, sel, p.perDayLeft)}
    ${pace > 0 ? `<p class="route-note">Thin line: your budget spread evenly, ${fmt(pace)} a day.</p>` : ''}
  </section>`];

  out.push(`<div class="day-wrap"><section class="day-sheet notch-b" data-day-sheet>
    <div class="day-top"><h2>${esc(weekday(days[sel].date))} ${esc(dMon(days[sel].date))}</h2>${st ? statusLine(...st) : ''}</div>
    <div class="day-bottom">
      <div class="day-chips">
        <div><div class="label">Spends</div><span class="tag gold">${dayList.length}</span></div>
        <div><div class="label">Biggest</div><span class="tag chip">${fmt(biggest)}</span></div>
      </div>
      <div class="day-spark"><div class="sub">${fmt(dayTotal)} · ${dayList.length} spend${dayList.length === 1 ? '' : 's'}</div>${squiggle(dayList.map((s) => s.amount))}</div>
    </div>
  </section>
  <div class="lens bottom"><button class="round frost-light" data-act="ins-today" aria-label="Back to today">${icon.refresh(20)}</button></div></div>`);

  if (mode === 'month' && (p.hasBudget || p.imported)) {
    out.push(`<section class="sheet-card"><div class="card-top"><h3>Where this month's money went</h3></div>${breakdown(p)}</section>`);
  }
  const open = B.monthsStatus(state, today).filter((m) => m.status === 'open');
  if (open.length) out.push(`<section class="sheet-card"><div class="card-top"><h3>Months to sort out</h3></div><div class="list">${open.map(monthRow).join('')}</div></section>`);
  return out.join('');
}

// ---- Accounts -------------------------------------------------------------------

export function renderAccounts(state, today) {
  const pid = B.periodIdOf(today);
  const p = B.periodSummary(state, pid, today);
  const sal = B.potLedger(state);
  const oth = B.bucketLedger(state);
  const st = B.stocksSummary(state);
  const months = B.monthsStatus(state, today);
  const out = [header('Accounts', `<button class="round frost-light" data-act="transfer" aria-label="Transfer">${icon.swap(20)}</button>`)];
  const target = st.sent + st.stillFromSalary;
  const sf = target > 0 ? Math.min(1, st.sent / target) : 0;
  const lens = '<div class="lens empty" aria-hidden="true"></div>';
  out.push(`<div class="slab-stack">
    <button class="slab dark notch-b tap" data-act="open-page" data-page="budget">${streets()}
      <div class="slab-top"><h2>Budget</h2><span class="tag dark">${esc(rangeLabel(pid))}</span></div>
      <div class="big-money ${p.level === 'over' ? 'red-on-dark' : ''}">${num('acc-budget', p.remaining)}</div>
      <div class="on-dark-muted">Left this month · ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} to go</div>
      ${timeline(state, p, today, { mini: true, drag: false })}
    </button>
    ${lens}
    <button class="slab grey notch-t notch-b tap" data-act="open-page" data-page="salary">
      <div class="slab-top"><h2>Salary</h2></div>
      <div class="big-money">${num('acc-salary', sal.totals.balance)}</div>
      <div class="slab-bottom"><div><div class="label">Free</div><div class="value">${fmt(sal.totals.free)}</div></div><span class="tag gold">${fmt(sal.totals.reserved)} for stocks</span></div>
    </button>
    ${lens}
    <button class="slab white notch-t notch-b tap" data-act="open-page" data-page="other">
      <div class="slab-top"><h2>Other expenses</h2></div>
      <div class="big-money">${num('acc-other', oth.totals.balance)}</div>
      <div class="tag-row">${oth.buckets.map((b) => `<span class="tag chip">${esc(b.name)}</span>`).join('') || '<span class="sub">No categories yet</span>'}</div>
    </button>
    ${lens}
    <button class="slab grey notch-t tap" data-act="open-page" data-page="stocks">
      <div class="slab-top"><h2>Stocks</h2></div>
      <div class="big-money">${num('acc-stocks', st.sent)}</div>
      <div class="label">Sent so far · ${fmt(st.stillFromSalary)} still to send</div>
      <div class="timeline light mini" style="--f:${f2(sf)}"><div class="tl-line"><i class="tl-dot start"></i><i class="tl-done"></i><i class="tl-rest"></i><i class="tl-dot end"></i><div class="tl-badge small" aria-hidden="true">${icon.stocks(14)}</div></div>
        <div class="tl-ends"><span>$0</span><span>${fmt(target)}</span></div></div>
    </button>
  </div>`);
  if (months.length) out.push(`<section class="sheet-card"><div class="card-top"><h3>Past months</h3></div><div class="list">${months.slice(0, 12).map(monthRow).join('')}</div></section>`);
  return out.join('');
}

// ---- Settings -------------------------------------------------------------------

const delBtn = (act, attrs) => `<button class="round frost-light small del" data-act="${act}" ${attrs} aria-label="Delete">${icon.trash(16)}</button>`;
const setRow = (act, name, value, extra = '') => `<button class="row set-row" data-act="${act}" ${extra}><div class="grow"><div class="title">${esc(name)}</div></div><div class="amt">${esc(value)}</div><span class="chev">${icon.right(18)}</span></button>`;

export function renderSettings(state, today, statusLine2, ui) {
  const s = state.settings;
  const cur = B.periodIdOf(today);
  const out = [header('Settings')];

  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Appearance</h3></div>
    ${chips([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], ui.theme, 'theme', 'Appearance', 'theme')}
    <p class="sub">System follows your iPhone's light or dark mode.</p>
  </section>`);

  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Stocks</h3></div>
    <div class="list">${setRow('open-form', 'Minimum from each salary', fmt(s.stockMin), 'data-form-type="stockMin"')}</div>
    <p class="sub">Each salary you log keeps this much for stocks. Salary already logged keeps its own minimum.</p>
  </section>`);

  const rentRows = [0, 1].map((k) => {
    const id = B.shiftPeriod(cur, k);
    const paid = state.rentPaid[id];
    return row({
      title: `Rent due ${B.dm(B.periodRange(id).start)}`, sub: paid ? `Paid ${B.dm(paid)}` : 'Not paid',
      right: `<button class="tag-btn ${paid ? 'gold' : ''}" data-act="rent-toggle" data-period="${id}">${paid ? `${icon.check(12)} Paid` : 'Mark paid'}</button>`,
    });
  }).join('');
  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Rent</h3></div>
    <div class="list">
      ${setRow('open-form', 'Rent per month', s.rentPerMonth ? fmt(s.rentPerMonth) : 'From the lump sum', 'data-form-type="rent"')}
      ${setRow('open-form', 'Remind me', s.rentRemindDays === 0 ? 'On the day' : `${s.rentRemindDays} day${s.rentRemindDays === 1 ? '' : 's'} before`, 'data-form-type="rent"')}
      ${rentRows}
    </div>
  </section>`);

  const lumps = [...state.lumpSums].sort((a, b) => a.firstPeriod.localeCompare(b.firstPeriod)).map((l) => {
    const last = B.shiftPeriod(l.firstPeriod, l.months - 1);
    const perMonth = (l.amount - l.rentPerMonth * l.months) / l.months;
    return row({
      title: `${periodLabelLong(l.firstPeriod).split(' to ')[0]} to ${periodLabelLong(last).split(' to ')[1]}`,
      sub: `${fmt(l.amount)}, rent ${fmt(l.rentPerMonth)} x ${l.months} = ${fmt(perMonth)} a month`,
      right: delBtn('del-lump', `data-id="${esc(l.id)}"`),
    });
  }).join('');
  const insts = state.instalments.map((x) => row({
    title: x.name,
    sub: `${fmt(x.total)} over ${x.months} months from ${periodLabelLong(x.firstPeriod).split(' to ')[0]} = ${fmt(x.total / x.months)} a month`,
    right: delBtn('del-inst', `data-id="${esc(x.id)}"`),
  })).join('');
  const overrides = Object.entries(state.baseOverrides ?? {}).sort().map(([id, v]) => row({
    title: periodLabelLong(id), sub: `Budget set to ${fmt(v)}`, right: delBtn('del-override', `data-period="${id}"`),
  })).join('');

  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Plans</h3></div>
    <div class="plan-head"><b>Lump sums</b><p class="sub">Money from parents for several months. Rent is taken out, the rest is split evenly.</p></div>
    <div class="list">${lumps || '<p class="empty">None yet.</p>'}</div>
    <button class="btn chip-btn-wide wide" data-act="open-form" data-form-type="lump">${icon.plus(16)} Add a lump sum</button>
    ${insts ? `<div class="plan-head"><b>Taken off the top</b><p class="sub">These come out of the budget before you spend. Delete them if you log these costs yourself.</p></div><div class="list">${insts}</div>` : ''}
    <div class="plan-head"><b>Set one month's budget</b><p class="sub">Use a fixed amount for one month instead of the lump sum split.</p></div>
    <div class="list">${overrides || '<p class="empty">None.</p>'}</div>
    <button class="btn chip-btn-wide wide" data-act="open-form" data-form-type="override">${icon.plus(16)} Set a month</button>
  </section>`);

  out.push(`<section class="sheet-card">
    <div class="card-top"><h3>Backup</h3></div>
    <p class="sub">Your data lives only on this phone. Export a backup now and then, and before deleting the app.</p>
    <div class="btn-row">
      <button class="btn chip-btn-wide" data-act="export">Export backup</button>
      <label class="btn chip-btn-wide file-btn">Import backup<input type="file" accept="application/json,.json" data-act="import"></label>
    </div>
  </section>`);

  out.push(`<div class="status-line">${esc(statusLine2)}</div>`);
  return out.join('');
}

export { budgetItems };
