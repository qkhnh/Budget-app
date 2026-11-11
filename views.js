// views.js
// The four tab screens. Each function takes the state and returns HTML. No events, no storage.
// Layout follows the "Solora" reference: an app bar, a big light title, then a tight column of soft cards.

import * as B from './budget-core.js';
import { esc, fmt, big, dayLabel, periodLabelLong, icon, bubble, logo, count } from './ui.js';

const seqOf = (id) => Number(String(id).replace(/\D/g, '')) || 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- Shared pieces --------------------------------------------------------------

// Logo and name on the left; small square tiles on the right (bell last). The bell gets a red dot for rent.
export function appBar({ alert = false, tiles = '' } = {}) {
  return `<header class="appbar">
    <div class="brand">${logo(24)}<span>Budget</span></div>
    <div class="appbar-tiles">${tiles}
      <button class="tile" data-act="alerts" aria-label="${alert ? 'Alerts: rent needs attention' : 'Alerts'}">${icon.bell(20)}${alert ? '<i class="dot"></i>' : ''}</button>
    </div>
  </header>`;
}

function title(text, sub = '', extra = '') {
  return `<section class="hero-title"><h1>${esc(text)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${extra}</section>`;
}

// A card label: small filled grey icon, then the text.
const label = (ic, text, right = '') => `<div class="card-head"><div class="card-label">${ic}<span>${esc(text)}</span></div>${right}</div>`;

// signed: activity amounts (+$ green for money in). Unsigned: balances (red only when below 0).
function row({ kind, title: t, sub = '', amount = null, signed = true, act = '', right = '' }) {
  let amt = '';
  if (amount !== null) {
    const r = B.round2(amount);
    const cls = signed ? (r > 0 ? 'green' : '') : r < 0 ? 'red' : '';
    amt = `<div class="amt ${cls}">${fmt(amount, { sign: signed })}</div>`;
  }
  const tag = act ? 'button' : 'div';
  return `<${tag} class="row" ${act}>${kind ? bubble(kind) : ''}<div class="grow"><div class="title">${esc(t)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${amt}${right}</${tag}>`;
}

// Segmented control: grey track, white thumb that slides (app.js moves it before the screen changes).
export function seg(options, current, act, groupLabel) {
  const i = Math.max(0, options.findIndex(([v]) => v === current));
  return `<div class="seg" role="group" aria-label="${esc(groupLabel)}" style="--n:${options.length};--sel:${i}">
    <span class="seg-thumb" aria-hidden="true"></span>
    ${options.map(([v, l], k) => `<button class="${k === i ? 'on' : ''}" aria-pressed="${k === i}" data-act="${act}" data-${act === 'theme' ? 'theme' : 'mode'}="${v}" data-seg-i="${k}"><span class="seg-text">${esc(l)}</span>${ring()}</button>`).join('')}
  </div>`;
}

// The small rotating ring of 8 dots shown while a tab or segment is loading.
export const ring = () => `<span class="ring" aria-hidden="true">${'<i></i>'.repeat(8)}</span>`;

// Spends and transfers of one month's budget, as list items.
function budgetItems(state, periodId) {
  const items = B.spendsInPeriod(state, periodId).map((s) => ({
    date: s.date, seq: seqOf(s.id), spend: true, kind: 'out', title: s.note || 'Spend', amount: -s.amount,
    act: `data-act="edit-spend" data-id="${esc(s.id)}"`,
  }));
  for (const t of B.transfersFor(state, { type: 'budget', periodId })) {
    const incoming = t.direction === 'in';
    const other = B.accountName(state, incoming ? t.from : t.to);
    items.push({
      date: t.date, seq: seqOf(t.id), kind: incoming ? 'in' : t.to.type === 'stocks' ? 'stocks' : 'move',
      title: t.note || (incoming ? `From ${other}` : `To ${other}`), amount: incoming ? t.amount : -t.amount,
      act: `data-act="open-transfer" data-id="${esc(t.id)}"`,
    });
  }
  return items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.seq - a.seq);
}

// On track / spending fast / over budget, from values the core already gives.
function status(p) {
  if (p.level === 'over') return ['red', 'Over budget'];
  if (p.daysLeft > 0 && p.dailyPace > 0 && p.perDayLeft < p.dailyPace - 0.005) return ['amber', 'Spending fast'];
  return ['green', 'On track'];
}

// ---- Dial gauge: 270° ring with radial ticks, gold arc and knob ----------------------

const CX = 120;
const CY = 120;
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const f2 = (n) => n.toFixed(2);

function dial(p) {
  const over = p.level === 'over';
  // The ring shows what is left, like a fuel gauge. Over budget: the whole ring turns red.
  const frac = over ? 1 : p.total > 0 ? Math.max(0, Math.min(1, p.remaining / p.total)) : 0;
  const R = 84;
  const [sx, sy] = polar(R, 135);
  const [ex, ey] = polar(R, 45);
  const arc = `M ${f2(sx)} ${f2(sy)} A ${R} ${R} 0 1 1 ${f2(ex)} ${f2(ey)}`;
  const N = 40;
  const ticks = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const deg = 135 + 270 * t;
    const [x1, y1] = polar(100, deg);
    const [x2, y2] = polar(110, deg);
    const on = t <= frac + 1e-9 && frac > 0;
    const op = (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.9 + 0.05)))).toFixed(2);
    ticks.push(`<line class="tick ${on ? 'on' : ''}" style="--t:${i};opacity:${op}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`);
  }
  const pct = p.total > 0 ? Math.round((p.spent / p.total) * 100) : 0;
  return `<div class="card dial-card ${over ? 'over' : ''}" data-card>
    <div class="dial">
      <svg viewBox="0 0 240 240" role="img" aria-label="${fmt(p.remaining)} ${over ? 'over budget' : 'left'} of ${fmt(p.total)}">
        <g class="ticks">${ticks.join('')}</g>
        <path class="dial-track" d="${arc}" pathLength="100"/>
        ${frac > 0 ? `<path class="dial-arc" d="${arc}" pathLength="100" style="--off:${f2(100 - frac * 100)}"/>
        <g class="knob" style="--rot:${f2(270 * frac)}deg"><circle cx="${f2(sx)}" cy="${f2(sy)}" r="6"/></g>` : ''}
      </svg>
      <div class="dial-centre">
        ${count('home-left', p.remaining, 'big', over ? 'red' : '')}
        <div class="sub">${over ? 'over budget' : 'left this month'}</div>
      </div>
      <span class="dial-end left">$0</span>
      <span class="dial-end right">${fmt(p.total)}</span>
    </div>
    <div class="dial-foot"><span>Spent <b>${fmt(p.spent)}</b></span><span>${pct}% of the month's money</span></div>
  </div>`;
}

// ---- Home -----------------------------------------------------------------------

function alertsCard(r) {
  if (r.status === 'none') return '';
  const amt = r.amount ? fmt(r.amount) : '';
  const text = {
    overdue: [`Rent was due ${B.dm(r.dueDate)}`, `${r.daysLate} day${r.daysLate === 1 ? '' : 's'} ago${amt ? ` · ${amt}` : ''}`],
    'due-today': ['Rent is due today', amt],
    upcoming: [`Rent is due ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}`, `${B.dm(r.dueDate)}${amt ? ` · ${amt}` : ''}`],
  }[r.status];
  const main = text[0].replace(/^Rent /, '');
  return `<div class="card alerts" id="alerts" data-card>
    ${label(icon.warn(), 'Alerts', `<span class="card-icon-right">${icon.refresh(18)}</span>`)}
    <div class="alert-row">
      <span class="alert-tile ${r.status === 'overdue' ? 'bad' : 'warn'}">${icon.warn(16)}</span>
      <div class="grow"><div class="sub">Rent${text[1] ? ` · ${esc(text[1])}` : ''}</div><div class="alert-main">${esc(main[0].toUpperCase() + main.slice(1))}</div></div>
      <button class="pill-btn" data-act="rent-paid" data-period="${esc(r.periodId)}">Mark paid</button>
    </div>
  </div>`;
}

function statTile(key, ic, name, value, f, unit, change = '') {
  return `<div class="card stat" data-card>
    ${label(ic, name)}
    <div class="numrow"><span class="num">${count(key, value, f)}</span>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}${change}</div>
  </div>`;
}

export function renderHome(state, today, ui) {
  const d = B.dashboard(state, today);
  const p = d.period;
  const rentAlert = d.rent.status !== 'none';
  const out = [appBar({ alert: rentAlert })];

  if (d.empty) {
    out.push(`<section class="step-empty">
      <h1>No Data<br>Yet</h1>
      <div class="sub">Import a backup to load your budget, or set up a lump sum in Settings.</div>
      <button class="btn primary wide" data-act="goto" data-tab="settings">Go to Settings ${icon.arrow(18)}</button>
    </section>`);
    return out.join('');
  }

  const [tone, word] = status(p);
  out.push(title('This month', B.periodLabel(p.periodId), `<div class="status ${tone}"><i></i>${word}</div>`));

  if (!p.hasBudget && !p.imported) {
    out.push(`<div class="card" data-card>
      ${label(icon.warn(), `No budget for ${B.periodLabel(p.periodId)} yet`)}
      <div class="sub" style="margin:6px 0 14px">Add the next lump sum in Settings, under Plans.</div>
      <button class="btn secondary wide" data-act="goto" data-tab="settings">Open Plans</button>
    </div>`);
  } else {
    out.push(dial(p));
    const diff = B.round2(p.perDayLeft - p.dailyPace);
    const change = p.daysLeft > 0 && p.dailyPace > 0 && diff !== 0
      ? `<span class="chg ${diff > 0 ? 'green' : 'red'}" aria-label="${fmt(Math.abs(diff))} a day ${diff > 0 ? 'more' : 'less'} than the plan">${fmt(diff, { sign: true })}</span>`
      : '';
    out.push(`<div class="grid2">
      ${statTile('home-perday', icon.coin(), 'Per day left', p.perDayLeft, 'money', '/ day', change)}
      ${statTile('home-days', icon.clock(), 'Days left', p.daysLeft, 'int', p.daysLeft === 1 ? 'day' : 'days')}
    </div>`);
  }

  out.push(alertsCard(d.rent));

  const items = budgetItems(state, p.periodId);
  const shown = ui.homeAll ? items : items.slice(0, RECENT);
  const more = items.length > RECENT
    ? `<button class="tile-btn" data-act="toggle-recent">${ui.homeAll ? 'Show less' : 'See all'}</button>` : '';
  out.push(`<div class="card list-card" data-card>
    ${label(icon.list(), 'Recent transactions', more)}
    ${items.length
    ? `<div class="list">${shown.map((it) => row({
      kind: it.kind, title: it.title, sub: it.date ? dayLabel(it.date, today) : 'Earlier', amount: it.amount, act: it.act,
    })).join('')}</div>`
    : `<div class="empty">Nothing spent this month yet.</div>
       <button class="btn secondary wide" data-act="add">${icon.plus(16)} Add a spend</button>`}
  </div>`);
  return out.join('');
}

const RECENT = 8;

function monthRowSub(m) {
  if (m.status === 'open') return m.remaining < 0 ? 'Over budget, not done' : 'Left over, not done';
  if (m.doneNote) return m.doneNote;
  const outs = m.moves.filter((x) => x.direction === 'out');
  if (outs.length) return `Moved to ${[...new Set(outs.map((x) => (x.to.type === 'stocks' ? 'Stocks' : x.to.type === 'out' ? 'Spent' : x.to.type === 'budget' ? 'Budget' : x.to.type === 'pot' ? 'Salary' : 'Other')))].join(', ')}`;
  return 'Nothing left';
}

function monthPill(m) {
  return m.status === 'open' ? '<span class="pill warn">Not done</span>' : `<span class="pill">${icon.check(12)} Done</span>`;
}

// Finished months still holding money (or over budget) that K has not dealt with yet.
function monthsToSortOut(state, today) {
  const open = B.monthsStatus(state, today).filter((m) => m.status === 'open');
  if (!open.length) return '';
  return `<div class="card list-card" data-card>${label(icon.warn(), 'Months to sort out')}<div class="list">${open.map((m) => row({
    title: m.label, sub: monthRowSub(m), amount: m.remaining, signed: false,
    act: `data-act="open-month" data-period="${esc(m.periodId)}"`, right: `<span class="chev">${icon.right(18)}</span>`,
  })).join('')}</div></div>`;
}

// ---- Insights -------------------------------------------------------------------

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// Spending per day: ghost tracks, sand bars, tick ruler and a cursor you can drag (app.js handles the drag).
function spendChart(days, pace, today, mode, cursor, spent, perDay) {
  const n = days.length;
  const max = niceMax(Math.max(10, pace * 1.15, ...days.map((d) => d.total)));
  const WL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const at = days[cursor];
  const bars = days.map((d, i) => `<div class="bar ${i === cursor ? 'on' : ''}" style="--h:${f2(Math.min(1, d.total / max))};--i:${i}" data-v="${B.round2(d.total)}" data-l="${esc(dayLabel(d.date, today))}"><i class="fill"></i></div>`).join('');
  const shows = (i) => mode === 'week' || i % 7 === 0;
  const labels = days.map((d, i) => {
    const text = mode === 'week' ? WL[i] : String(Number(d.date.slice(8)));
    // The cursor's day is always labelled; labels right next to it hide so they never overlap.
    const near = i !== cursor && !shows(cursor) && Math.abs(i - cursor) <= 2;
    return `<span class="${shows(i) ? 'show' : ''} ${i === cursor ? 'on' : ''} ${near ? 'near' : ''}" style="--i:${i}" data-i="${i}">${text}</span>`;
  }).join('');
  const ticks = Array.from({ length: n * 4 + 1 }, (_, k) => `<i class="${k % 4 === 0 ? 'major' : ''}"></i>`).join('');
  return `<div class="card chart-card" data-card data-chart style="--n:${n};--c:${cursor}">
    ${label(icon.bolt(), `Spent · ${at ? dayLabel(at.date, today) : ''}`)}
    <div class="numrow chart-num">
      <span class="num" data-scrub-value>${count('ins-day', at ? at.total : 0, 'money')}</span>
      <span class="side"><span class="muted">Total</span> <b>${fmt(spent)}</b><br><span class="muted">Per day</span> <b>${fmt(perDay)}</b></span>
    </div>
    <div class="scrub" role="img" aria-label="Spending per day. Drag to see each day.">
      <div class="bars ${mode}">${bars}${pace > 0 ? `<div class="pace" style="--p:${f2(Math.min(1, pace / max))}" title="Your budget spread evenly"></div>` : ''}</div>
      <div class="axis">${labels}</div>
      <div class="ruler">${ticks}</div>
      <div class="cursor" aria-hidden="true"></div>
    </div>
    ${pace > 0 ? `<div class="sub chart-note">Dashed line: your budget spread evenly, ${fmt(pace)} a day.</div>` : ''}
  </div>`;
}

// Running total through the period: a gold line over thin day lines, sharing the cursor.
function runningChart(days, today, cursor) {
  const n = days.length;
  let run = 0;
  const cum = days.map((d) => (run += d.total));
  const max = niceMax(Math.max(10, ...cum));
  const W = 300;
  const H = 120;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => H - 6 - (v / max) * (H - 16);
  const lastIdx = days.findIndex((d) => d.date > today);
  const upto = lastIdx === -1 ? n : Math.max(1, lastIdx);
  const pts = cum.slice(0, upto).map((v, i) => `${f2(x(i))} ${f2(y(v))}`).join(' L ');
  const lines = days.map((_, i) => `<line x1="${f2(x(i))}" x2="${f2(x(i))}" y1="${H}" y2="${f2(H - 18 - ((i * 37) % 23))}"/>`).join('');
  const todayI = days.findIndex((d) => d.date === today);
  const at = cum[cursor] ?? 0;
  return `<div class="card chart-card line-card" data-card data-line style="--n:${n};--c:${cursor}">
    ${label(icon.pie(), `Running total · ${days[cursor] ? dayLabel(days[cursor].date, today) : ''}`)}
    <div class="numrow chart-num"><span class="num" data-cum-value>${count('ins-cum', at, 'money')}</span></div>
    <div class="scrub" role="img" aria-label="Running total of spending. Drag to see each day.">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="line-svg">
        <g class="day-lines">${lines}</g>
        ${todayI >= 0 ? `<line class="today-mark" x1="${f2(x(todayI))}" x2="${f2(x(todayI))}" y1="0" y2="${H}"/>` : ''}
        ${upto > 1 ? `<path class="gold-line" d="M ${pts}" pathLength="1"/>` : ''}
      </svg>
      <div class="cursor" aria-hidden="true"></div>
    </div>
    <div class="cum-data" hidden>${cum.map((v) => `<i data-v="${B.round2(v)}"></i>`).join('')}</div>
  </div>`;
}

// Progress bar with the value label riding on the end of the fill.
function progress(key, pct, current, target, ic, name, big0, unit) {
  const p = Math.max(0, Math.min(100, pct));
  return `${label(ic, name)}
    <div class="numrow"><span class="num">${count(key, big0, 'int')}</span><span class="unit">${esc(unit)}</span></div>
    <div class="prog" style="--p:${f2(p)}%">
      <div class="prog-labels"><span class="muted">0</span><b class="prog-now">${esc(current)}</b><span class="muted">${esc(target)}</span></div>
      <div class="prog-bar"><i></i></div>
    </div>`;
}

function moneyWent(p) {
  const parts = [
    ...p.fixed.map((f) => ({ name: f.name, value: f.amount })),
    { name: 'Spent', value: p.spent },
    { name: 'Moved out', value: p.transfersOut },
  ].filter((x) => x.value > 0.004);
  const left = Math.max(0, p.remaining);
  const used = sum(parts.map((x) => x.value));
  const total = used + left || 1;
  const pct = (used / total) * 100;
  const all = [...parts, ...(left > 0.004 ? [{ name: 'Left', value: left }] : [])];
  return `<div class="card" data-card>
    ${progress('ins-used', pct, fmt(used), fmt(used + left), icon.pie(), "Where this month's money went", Math.round(pct), '% used')}
    <div class="legend">${all.map((x, k) => `<span><i class="${x.name === 'Left' ? 'left' : k === 0 ? 'a' : 'b'}"></i>${esc(x.name)} <b>${fmt(x.value)}</b> <span class="muted">${Math.round((x.value / total) * 100)}%</span></span>`).join('')}</div>
  </div>`;
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
    lbl = B.periodLabel(pid);
    atLatest = pid >= cur;
  } else {
    const start = ui.insights.weekOf ?? B.weekRange(today).start;
    range = { start, end: B.addDays(start, 7) };
    lbl = `${B.dm(start)} to ${B.dm(B.addDays(start, 6))}`;
    atLatest = range.end > today;
    pid = B.periodIdOf(start);
  }
  const days = B.spendByDay(state, range.start, range.end);
  const spent = sum(days.map((d) => d.total));
  const elapsed = days.filter((d) => d.date <= today).length || days.length;
  const p = B.periodSummary(state, pid, today);
  const todayI = days.findIndex((d) => d.date === today);
  const cursor = Math.min(days.length - 1, Math.max(0, ui.insights.cursor ?? (todayI >= 0 ? todayI : days.length - 1)));

  const out = [appBar({ alert: B.dashboard(state, today).rent.status !== 'none' }), title('Insights')];
  out.push(seg([['week', 'Week'], ['month', 'Month']], mode, 'insights-mode', 'Show by'));
  out.push(`<div class="stepper">
    <button class="tile" data-act="insights-step" data-step="-1" aria-label="Previous">${icon.left()}</button>
    <b>${esc(lbl)}</b>
    <button class="tile" data-act="insights-step" data-step="1" aria-label="Next" ${atLatest ? 'disabled' : ''}>${icon.right()}</button>
  </div>`);
  out.push(spendChart(days, p.dailyPace, today, mode, cursor, spent, spent / elapsed));
  out.push(runningChart(days, today, cursor));
  if (mode === 'month' && (p.hasBudget || p.imported)) out.push(moneyWent(p));
  out.push(monthsToSortOut(state, today));
  return out.join('');
}

// ---- Accounts -------------------------------------------------------------------

function pastMonths(state, today) {
  const cur = B.periodIdOf(today);
  const now = B.periodSummary(state, cur, today);
  const ended = B.monthsStatus(state, today).slice(0, 6).reverse();
  const cols = [...ended.map((m) => ({ id: m.periodId, v: m.remaining, now: false })), { id: cur, v: now.remaining, now: true }];
  const maxAbs = Math.max(1, ...cols.map((c) => Math.abs(c.v)));
  const avg = ended.length ? sum(ended.map((m) => m.remaining)) / ended.length : null;
  const mon = (id) => MONTHS[Number(B.periodRange(id).start.slice(5, 7)) - 1];
  return `<div class="card" data-card>
    ${label(icon.clock(), 'Past months')}
    <div class="numrow"><span class="num">${count('acc-left', now.remaining, 'money', now.remaining < 0 ? 'red' : '')}</span><span class="unit">left this month</span>
      ${avg !== null ? `<span class="side-stat"><span class="muted">Average:</span> <b>${fmt(avg)}</b></span>` : ''}</div>
    <div class="proj" style="--n:${cols.length}">
      ${cols.map((c, i) => `<div class="proj-col" style="--i:${i}"><div class="proj-track"><i class="${c.now ? 'now' : c.v < 0 ? 'neg' : 'pos'}" style="--h:${f2(Math.max(0.04, Math.abs(c.v) / maxAbs))}"></i></div><span class="${c.now ? 'on' : ''}">${mon(c.id)}</span></div>`).join('')}
    </div>
  </div>`;
}

export function renderAccounts(state, today) {
  const pid = B.periodIdOf(today);
  const p = B.periodSummary(state, pid, today);
  const sal = B.potLedger(state);
  const oth = B.bucketLedger(state);
  const st = B.stocksSummary(state);
  const months = B.monthsStatus(state, today);
  const out = [appBar({
    alert: B.dashboard(state, today).rent.status !== 'none',
    tiles: `<button class="tile" data-act="transfer" aria-label="Transfer">${icon.swap(20)}</button>`,
  }), title('Accounts')];

  // Each card opens its own page with the details and actions.
  const card = (page, key, ic, name, amount, sub, red = false, extra = '') => `<button class="card tap acct" data-card data-act="open-page" data-page="${page}">
    ${label(ic, name, `<span class="chev-tile">${icon.right(18)}</span>`)}
    <div class="numrow"><span class="num">${count(key, amount, 'money', red ? 'red' : '')}</span></div>
    <div class="sub">${esc(sub)}</div>${extra}
  </button>`;
  out.push(card('budget', 'acc-budget', icon.coin(), 'Budget', p.remaining, `Left this month, ${B.periodLabel(pid)}`, p.level === 'over'));
  out.push(card('salary', 'acc-salary', icon.bolt(), 'Salary', sal.totals.balance, `${fmt(sal.totals.reserved)} for stocks · ${fmt(sal.totals.free)} free`));
  out.push(card('other', 'acc-other', icon.list(), 'Other expenses', oth.totals.balance, oth.buckets.map((b) => b.name).join(', ') || 'No categories yet'));
  const target = st.sent + st.stillFromSalary;
  const stockPct = target > 0 ? (st.sent / target) * 100 : 0;
  out.push(card('stocks', 'acc-stocks', icon.pie(), 'Stocks', st.sent, `Sent so far · ${fmt(st.stillFromSalary)} still to send`, false,
    target > 0 ? `<div class="prog" style="--p:${f2(stockPct)}%"><div class="prog-labels"><span class="muted">0</span><b class="prog-now">${Math.round(stockPct)}%</b><span class="muted">${fmt(target)}</span></div><div class="prog-bar"><i></i></div></div>` : ''));

  if (months.length) {
    out.push(pastMonths(state, today));
    out.push(`<div class="card list-card" data-card>${label(icon.list(), 'Each month')}<div class="list">${months.slice(0, 12).map((m) => row({
      title: m.label, sub: monthRowSub(m), amount: m.remaining, signed: false,
      act: `data-act="open-month" data-period="${esc(m.periodId)}"`, right: monthPill(m),
    })).join('')}</div></div>`);
  }
  return out.join('');
}

// ---- Settings -------------------------------------------------------------------

const delBtn = (act, attrs) => `<button class="bubble del" data-act="${act}" ${attrs} aria-label="Delete">${icon.trash(16)}</button>`;

// A settings row that opens a step screen: name on the left, current value and a chevron on the right.
const flowRow = (flow, name, value) => `<button class="row set-row" data-act="open-flow" data-flow="${flow}">
  <div class="grow"><div class="title">${esc(name)}</div></div><div class="amt">${esc(value)}</div><span class="chev">${icon.right(18)}</span></button>`;

export function renderSettings(state, today, statusLine, ui) {
  const s = state.settings;
  const cur = B.periodIdOf(today);
  const out = [appBar({ alert: B.dashboard(state, today).rent.status !== 'none' }), title('Settings')];

  // Appearance as the reference's mode tiles: icon on top, label under.
  out.push(`<div class="card" data-card>
    ${label(icon.sun(14), 'Appearance')}
    <div class="modes" role="radiogroup" aria-label="Theme">
      ${[['light', 'Light', icon.sun(22)], ['dark', 'Dark', icon.moon(22)], ['system', 'System', icon.auto(22)]].map(([v, l, ic]) => `<button class="mode ${ui.theme === v ? 'on' : ''}" role="radio" aria-checked="${ui.theme === v}" data-act="theme" data-theme="${v}">${ic}<span>${l}</span></button>`).join('')}
    </div>
    <div class="sub">System follows your iPhone's light or dark mode.</div>
  </div>`);

  out.push(`<div class="card list-card" data-card>
    ${label(icon.pie(), 'Stocks')}
    <div class="list">${flowRow('stockMin', 'Minimum from each salary', fmt(s.stockMin))}</div>
    <div class="sub">Each salary you log keeps this much for stocks. Salary already logged keeps its own minimum.</div>
  </div>`);

  const rentRows = [0, 1].map((k) => {
    const id = B.shiftPeriod(cur, k);
    const paid = state.rentPaid[id];
    return row({
      title: `Rent due ${B.dm(B.periodRange(id).start)}`, sub: paid ? `Paid ${B.dm(paid)}` : 'Not paid',
      right: `<button class="pill ${paid ? 'ok' : ''}" data-act="rent-toggle" data-period="${id}">${paid ? `${icon.check(12)} Paid` : 'Mark paid'}</button>`,
    });
  }).join('');
  out.push(`<div class="card list-card" data-card>
    ${label(icon.clock(), 'Rent')}
    <div class="list">
      ${flowRow('rent', 'Rent per month', s.rentPerMonth ? fmt(s.rentPerMonth) : 'From the lump sum')}
      <label class="row set-row"><div class="grow"><div class="title">Remind me</div></div>
        <select class="inline-select" data-act="rent-remind" aria-label="Remind me">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === s.rentRemindDays ? 'selected' : ''}>${n === 0 ? 'On the day' : `${n} day${n === 1 ? '' : 's'} before`}</option>`).join('')}</select>
        <span class="chev">${icon.right(18)}</span></label>
      ${rentRows}
    </div>
  </div>`);

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

  out.push(`<div class="card list-card" data-card>
    ${label(icon.list(), 'Plans')}
    <div class="plan-head"><b>Lump sums</b><div class="sub">Money from parents for several months. Rent is taken out, the rest is split evenly.</div></div>
    <div class="list">${lumps || '<div class="empty">None yet.</div>'}</div>
    <button class="btn secondary wide" data-act="open-flow" data-flow="lump">${icon.plus(16)} Add a lump sum</button>
    ${insts ? `<div class="plan-head"><b>Taken off the top</b><div class="sub">These come out of the budget before you spend. Delete them if you log these costs yourself.</div></div>
    <div class="list">${insts}</div>` : ''}
    <div class="plan-head"><b>Set one month's budget</b><div class="sub">Use a fixed amount for one month instead of the lump sum split.</div></div>
    <div class="list">${overrides || '<div class="empty">None.</div>'}</div>
    <button class="btn secondary wide" data-act="open-flow" data-flow="override">${icon.plus(16)} Set a month</button>
  </div>`);

  out.push(`<div class="card" data-card>
    ${label(icon.bolt(), 'Backup')}
    <div class="sub" style="margin-bottom:12px">Your data lives only on this phone. Export a backup now and then, and before deleting the app.</div>
    <div class="btn-row">
      <button class="btn secondary" data-act="export">Export backup</button>
      <label class="btn secondary file-btn">Import backup<input type="file" accept="application/json,.json" data-act="import"></label>
    </div>
  </div>`);

  out.push(`<div class="status-line">${esc(statusLine)}</div>`);
  return out.join('');
}
