// views.js
// The four tab screens. Each function takes the state and returns HTML. No events, no storage.

import * as B from './budget-core.js';
import { esc, fmt, big, dayLabel, periodLabelLong, icon, bubble } from './ui.js';

const seqOf = (id) => Number(String(id).replace(/\D/g, '')) || 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ---- Shared pieces --------------------------------------------------------------

function header(title, sub = '', right = '') {
  return `<header class="top"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${right}</header>`;
}

// signed: activity amounts (+$ green for money in). Unsigned: balances (red only when below 0).
function row({ kind, title, sub = '', amount = null, signed = true, act = '', right = '' }) {
  let amt = '';
  if (amount !== null) {
    const r = B.round2(amount);
    const cls = signed ? (r > 0 ? 'green' : '') : r < 0 ? 'red' : '';
    amt = `<div class="amt ${cls}">${fmt(amount, { sign: signed })}</div>`;
  }
  const tag = act ? 'button' : 'div';
  return `<${tag} class="row" ${act}>${kind ? bubble(kind) : ''}<div class="grow"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${amt}${right}</${tag}>`;
}

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

function gauge(p) {
  const frac = p.total > 0 ? Math.min(1, p.spent / p.total) : p.spent > 0 ? 1 : 0;
  const over = p.level === 'over';
  const pt = (f) => {
    const a = Math.PI * (1 - f);
    return `${(100 + 80 * Math.cos(a)).toFixed(2)} ${(100 - 80 * Math.sin(a)).toFixed(2)}`;
  };
  const fill = frac > 0.002
    ? `<path d="M 20 100 A 80 80 0 0 1 ${pt(frac)}" stroke="${over ? 'var(--red)' : 'var(--ink)'}" stroke-width="18" stroke-linecap="round" fill="none"/>`
    : '';
  const pct = p.total > 0 ? Math.round((p.spent / p.total) * 100) : 0;
  return `<div class="card gauge-card hero">
    <div class="tiny">Spent ${pct}%</div>
    <div class="gauge">
      <svg viewBox="0 0 200 112" role="img" aria-label="${pct}% of this month's money spent">
        <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="var(--card-2)" stroke-width="18" stroke-linecap="round" fill="none"/>
        ${fill}
      </svg>
      <div class="label">
        ${big(p.remaining, over ? 'red' : '')}
        <div class="sub">${over ? 'over budget' : 'left this month'}</div>
      </div>
    </div>
    <div class="gauge-ends"><span>Spent ${fmt(p.spent)}</span><span>of ${fmt(p.total)}</span></div>
  </div>`;
}

function rentBanner(r) {
  if (r.status === 'none') return '';
  const amt = r.amount ? fmt(r.amount) : '';
  const text = {
    overdue: [`Rent was due ${B.dm(r.dueDate)}`, `${r.daysLate} day${r.daysLate === 1 ? '' : 's'} ago${amt ? ` · ${amt}` : ''}`],
    'due-today': ['Rent is due today', amt],
    upcoming: [`Rent is due ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}`, `${B.dm(r.dueDate)}${amt ? ` · ${amt}` : ''}`],
  }[r.status];
  const bad = r.status === 'overdue';
  return `<div class="banner ${bad ? 'bad' : 'warn'}">
    <span class="${bad ? 'red' : 'orange'}">${icon.alert()}</span>
    <div class="grow"><b>${esc(text[0])}</b><span class="sub">${esc(text[1])}</span></div>
    <button class="btn small" data-act="rent-paid" data-period="${esc(r.periodId)}">Mark paid</button>
  </div>`;
}

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

// ---- Home -----------------------------------------------------------------------

export function renderHome(state, today, ui) {
  const d = B.dashboard(state, today);
  const p = d.period;
  const out = [header('This month', B.periodLabel(p.periodId))];

  if (d.empty) {
    out.push(`<div class="card center" style="padding:28px 18px">
      <div style="font-size:20px;font-weight:700;margin-bottom:6px">No data yet</div>
      <div class="sub" style="margin-bottom:16px">Import a backup to load your budget, or set up a lump sum in Settings.</div>
      <button class="btn wide" data-act="goto" data-tab="settings">Go to Settings</button>
    </div>`);
    return out.join('');
  }

  out.push(rentBanner(d.rent));

  if (!p.hasBudget && !p.imported) {
    out.push(`<div class="card center" style="padding:24px 18px">
      <div style="font-weight:700;margin-bottom:4px">No budget for ${esc(B.periodLabel(p.periodId))} yet</div>
      <div class="sub" style="margin-bottom:14px">Add the next lump sum in Settings, under Plans.</div>
      <button class="btn soft" data-act="goto" data-tab="settings">Open Plans</button>
    </div>`);
  } else {
    out.push(gauge(p));
    out.push(`<div class="grid2">
      <div class="stat"><span class="tiny">Per day left</span><b>${fmt(p.perDayLeft)}</b></div>
      <div class="stat"><span class="tiny">Days left</span><b>${p.daysLeft}</b></div>
    </div>`);
  }

  const items = budgetItems(state, p.periodId);
  const shown = ui.homeAll ? items : items.slice(0, RECENT);
  out.push('<div class="section-title"><h2>Recent transactions</h2></div>');
  out.push(items.length
    ? `<div class="tx-list">${shown.map((it) => `<button class="tx" ${it.act}>
        <div class="grow"><div class="title">${esc(it.title)}</div><div class="sub">${esc(it.date ? dayLabel(it.date, today) : 'Earlier')}</div></div>
        <div class="amt ${B.round2(it.amount) > 0 ? 'green' : ''}">${fmt(it.amount, { sign: true })}</div>
      </button>`).join('')}</div>
      ${items.length > RECENT ? `<button class="btn soft wide" data-act="toggle-recent">${ui.homeAll ? 'Show less' : `Show all ${items.length}`}</button>` : ''}`
    : '<div class="empty">Nothing logged yet. Tap + to add a spend.</div>');
  return out.join('');
}

const RECENT = 8;

// Finished months still holding money (or over budget) that K has not dealt with yet.
function monthsToSortOut(state, today) {
  const open = B.monthsStatus(state, today).filter((m) => m.status === 'open');
  if (!open.length) return '';
  return `<div class="card"><div class="tiny">Months to sort out</div><div class="list">${open.map((m) => row({
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

function chart(days, pace, today, mode) {
  const W = 340;
  const H = 170;
  const top = 8;
  const bottom = 20;
  const left = 30;
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(10, pace * 1.15, ...days.map((d) => d.total)));
  const slot = (W - left) / days.length;
  const bw = Math.min(26, slot * 0.66);
  const rx = Math.min(6, bw / 2);
  const y = (v) => top + plotH - (v / max) * plotH;
  const parts = [];
  for (const v of [0, max / 2, max]) {
    parts.push(`<text x="0" y="${y(v) + 3}" font-size="10" fill="var(--muted)">${Math.round(v)}</text>`);
  }
  const WL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  days.forEach((d, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    parts.push(`<rect x="${x}" y="${top}" width="${bw}" height="${plotH}" rx="${rx}" fill="var(--card-2)" opacity=".6"/>`);
    if (d.total > 0) {
      const h = Math.max(rx * 2, (d.total / max) * plotH);
      parts.push(`<rect x="${x}" y="${top + plotH - h}" width="${bw}" height="${h}" rx="${rx}" fill="var(--ink)"/>`);
    }
    const label = mode === 'week' ? WL[i] : i % 7 === 0 ? String(Number(d.date.slice(8))) : '';
    if (label) {
      parts.push(`<text x="${x + bw / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="${d.date === today ? 'var(--text)' : 'var(--muted)'}" font-weight="${d.date === today ? 700 : 400}">${label}</text>`);
    }
  });
  if (pace > 0) {
    parts.push(`<line x1="${left}" x2="${W}" y1="${y(pace)}" y2="${y(pace)}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4"/>`);
  }
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending per day">${parts.join('')}</svg></div>`;
}

function breakdown(p) {
  const parts = [
    ...p.fixed.map((f, i) => ({ name: f.name, value: f.amount, color: i % 2 ? 'var(--faint)' : 'var(--muted)' })),
    { name: 'Spent', value: p.spent, color: p.level === 'over' ? 'var(--red)' : 'var(--ink)' },
    { name: 'Moved out', value: p.transfersOut, color: 'var(--orange)' },
    { name: 'Left', value: Math.max(0, p.remaining), color: 'var(--hero)' },
  ].filter((x) => x.value > 0.004);
  const total = sum(parts.map((x) => x.value)) || 1;
  return `<div class="breakdown">${parts.map((x) => `<span style="flex:${x.value};background:${x.color}"></span>`).join('')}</div>
    <div class="legend">${parts.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.name)} <span class="muted">${Math.round((x.value / total) * 100)}%</span></span>`).join('')}</div>`;
}

export function renderInsights(state, today, ui) {
  const { mode } = ui.insights;
  const cur = B.periodIdOf(today);
  let range;
  let label;
  let atLatest;
  let pid;
  if (mode === 'month') {
    pid = ui.insights.periodId ?? cur;
    range = B.periodRange(pid);
    label = B.periodLabel(pid);
    atLatest = pid >= cur;
  } else {
    const start = ui.insights.weekOf ?? B.weekRange(today).start;
    range = { start, end: B.addDays(start, 7) };
    label = `${B.dm(start)} to ${B.dm(B.addDays(start, 6))}`;
    atLatest = range.end > today;
    pid = B.periodIdOf(start);
  }
  const days = B.spendByDay(state, range.start, range.end);
  const spent = sum(days.map((d) => d.total));
  const elapsed = days.filter((d) => d.date <= today).length || days.length;
  const p = B.periodSummary(state, pid, today);

  const out = [header('Insights', '', `<div class="seg" role="tablist">
    <button class="${mode === 'week' ? 'on' : ''}" data-act="insights-mode" data-mode="week">Week</button>
    <button class="${mode === 'month' ? 'on' : ''}" data-act="insights-mode" data-mode="month">Month</button>
  </div>`)];

  out.push(`<div class="navbar">
    <button class="icon-btn" data-act="insights-step" data-step="-1" aria-label="Previous">${icon.left()}</button>
    <b>${esc(label)}</b>
    <button class="icon-btn" data-act="insights-step" data-step="1" aria-label="Next" ${atLatest ? 'disabled' : ''}>${icon.right()}</button>
  </div>`);

  out.push(`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="tiny">Spent</div><div style="font-size:30px">${big(spent)}</div></div>
      <div style="text-align:right"><div class="tiny">Per day</div><div style="font-size:30px">${big(spent / elapsed)}</div></div>
    </div>
    ${chart(days, p.dailyPace, today, mode)}
    <div class="sub">Dashed line: your budget spread evenly, ${fmt(p.dailyPace)} a day.</div>
  </div>`);

  if (mode === 'month' && (p.hasBudget || p.imported)) {
    out.push(`<div class="card"><div class="tiny" style="margin-bottom:8px">Where this month's money went</div>${breakdown(p)}</div>`);
  }

  out.push(monthsToSortOut(state, today));
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
  const out = [header('Accounts', '', `<button class="btn small" data-act="transfer">${icon.swap(16)} Transfer</button>`)];

  // Four short cards. Each opens its own screen with the details and actions.
  const card = (page, title, amount, sub, red = false) => `<button class="card tap ${page === 'budget' ? 'hero' : ''}" data-act="open-page" data-page="${page}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="tiny">${esc(title)}</div><span class="chev muted">${icon.right(18)}</span>
    </div>
    <div style="font-size:32px;margin-top:4px">${big(amount, red ? 'red' : '')}</div>
    <div class="sub">${esc(sub)}</div>
  </button>`;
  out.push(card('budget', 'Budget', p.remaining, `Left this month, ${B.periodLabel(pid)}`, p.level === 'over'));
  out.push(card('salary', 'Salary', sal.totals.balance, `${fmt(sal.totals.reserved)} for stocks · ${fmt(sal.totals.free)} free`));
  out.push(card('other', 'Other expenses', oth.totals.balance, oth.buckets.map((b) => b.name).join(', ') || 'No categories yet'));
  out.push(card('stocks', 'Stocks', st.sent, `Sent so far · ${fmt(st.stillFromSalary)} still to send`));

  if (months.length) {
    out.push(`<div class="section-title"><h2>Past months</h2></div>`);
    out.push(`<div class="card" style="padding-top:4px;padding-bottom:4px"><div class="list">${months.slice(0, 12).map((m) => row({
      title: m.label, sub: monthRowSub(m), amount: m.remaining, signed: false,
      act: `data-act="open-month" data-period="${esc(m.periodId)}"`, right: monthPill(m),
    })).join('')}</div></div>`);
  }
  return out.join('');
}

// ---- Settings -------------------------------------------------------------------

function periodOptions(today, selected, back = 12, ahead = 12) {
  const cur = B.periodIdOf(today);
  const opts = [];
  for (let k = -back; k <= ahead; k++) {
    const id = B.shiftPeriod(cur, k);
    opts.push(`<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(periodLabelLong(id))}${id === cur ? ' (now)' : ''}</option>`);
  }
  return opts.join('');
}

const delBtn = (act, attrs) => `<button class="bubble" style="color:var(--red)" data-act="${act}" ${attrs} aria-label="Delete">${icon.trash(16)}</button>`;

export function renderSettings(state, today, statusLine, ui) {
  const s = state.settings;
  const cur = B.periodIdOf(today);
  const out = [header('Settings')];

  out.push(`<div class="card form">
    <div class="tiny">Appearance</div>
    <div class="seg seg-wide" role="radiogroup" aria-label="Theme">
      ${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button class="${ui.theme === v ? 'on' : ''}" role="radio" aria-checked="${ui.theme === v}" data-act="theme" data-theme="${v}">${l}</button>`).join('')}
    </div>
    <div class="sub">System follows your iPhone's light or dark mode.</div>
  </div>`);

  out.push(`<div class="card form">
    <div class="tiny">Stocks</div>
    <form class="inline" data-form="stockMin">
      <label class="field"><span>Minimum from each salary</span><input class="input" name="stockMin" inputmode="decimal" value="${esc(s.stockMin)}"></label>
      <button class="btn">Save</button>
    </form>
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
  out.push(`<div class="card form">
    <div class="tiny">Rent</div>
    <form class="form" data-form="rent">
      <div class="inline">
        <label class="field"><span>Rent per month</span><input class="input" name="rentPerMonth" inputmode="decimal" value="${esc(s.rentPerMonth ?? '')}" placeholder="From the lump sum"></label>
        <label class="field"><span>Remind me</span><select class="input" name="rentRemindDays">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === s.rentRemindDays ? 'selected' : ''}>${n === 0 ? 'On the day' : `${n} day${n === 1 ? '' : 's'} before`}</option>`).join('')}</select></label>
      </div>
      <button class="btn soft">Save rent settings</button>
    </form>
    <div class="list">${rentRows}</div>
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

  out.push(`<div class="card form">
    <div class="tiny">Plans</div>
    <div><b>Lump sums</b><div class="sub">Money from parents for several months. Rent is taken out, the rest is split evenly.</div></div>
    <div class="list">${lumps || '<div class="empty">None yet.</div>'}</div>
    <details class="add"><summary class="btn soft small">${icon.plus(14)} Add a lump sum</summary>
      <form class="form" data-form="lump">
        <label class="field"><span>First month</span><select class="input" name="firstPeriod">${periodOptions(today, cur)}</select></label>
        <div class="inline">
          <label class="field"><span>Months</span><input class="input" name="months" inputmode="numeric" value="3"></label>
          <label class="field"><span>Amount</span><input class="input" name="amount" inputmode="decimal" placeholder="0.00"></label>
        </div>
        <label class="field"><span>Rent per month</span><input class="input" name="rentPerMonth" inputmode="decimal" value="${esc(s.rentPerMonth ?? '')}"></label>
        <button class="btn">Add lump sum</button>
      </form>
    </details>

    ${insts ? `<div style="margin-top:8px"><b>Taken off the top</b><div class="sub">These come out of the budget before you spend. Delete them if you log these costs yourself.</div></div>
    <div class="list">${insts}</div>` : ''}

    <div style="margin-top:8px"><b>Set one month's budget</b><div class="sub">Use a fixed amount for one month instead of the lump sum split.</div></div>
    <div class="list">${overrides || '<div class="empty">None.</div>'}</div>
    <details class="add"><summary class="btn soft small">${icon.plus(14)} Set a month</summary>
      <form class="form" data-form="override">
        <label class="field"><span>Month</span><select class="input" name="periodId">${periodOptions(today, cur)}</select></label>
        <label class="field"><span>Budget</span><input class="input" name="amount" inputmode="decimal" placeholder="0.00"></label>
        <button class="btn">Save</button>
      </form>
    </details>
  </div>`);

  out.push(`<div class="card form">
    <div class="tiny">Backup</div>
    <div class="sub">Your data lives only on this phone. Export a backup now and then, and before deleting the app.</div>
    <div class="btn-row">
      <button class="btn soft" data-act="export">Export backup</button>
      <label class="btn soft file-btn">Import backup<input type="file" accept="application/json,.json" data-act="import"></label>
    </div>
  </div>`);

  out.push(`<div class="status-line">${esc(statusLine)}</div>`);
  return out.join('');
}
