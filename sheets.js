// sheets.js
// Screens that slide up over the tabs: the keypad (spend / salary / transfer), account details and small forms.
// Each function returns HTML. app.js owns the sheet stack and handles the events.

import * as B from './budget-core.js';
import { esc, fmt, big, dateChip, dayLabel, periodLabelLong, refKey, icon, bubble } from './ui.js';
import { chips, num, level, statusLine, dayAccordion, budgetItems, rangeLabel, streets, dMon } from './views.js';

const closeBtn = '<button class="icon-btn" data-act="close-sheet" aria-label="Close">' + icon.close() + '</button>';
const head = (title, right = '<span class="ghost"></span>') => `<div class="sheet-head">${closeBtn}<h3>${esc(title)}</h3>${right}</div>`;

// ---- Account pickers ------------------------------------------------------------

export function accountOptions(state, today, dir) {
  const cur = B.periodIdOf(today);
  const groups = [];
  const budgets = [cur, ...B.monthsStatus(state, today).filter((m) => m.status === 'open').map((m) => m.periodId)];
  groups.push(['Budget', budgets.map((id) => ({
    ref: { type: 'budget', periodId: id },
    text: `Budget ${B.periodLabel(id)}${id === cur ? ' (this month)' : ''} · ${fmt(B.periodSummary(state, id).remaining)}`,
  }))]);
  groups.push(['Salary', [...B.potLedger(state).pots].reverse().map((p) => ({
    ref: { type: 'pot', potId: p.id }, text: `Salary ${p.label} · ${fmt(p.balance)}`,
  }))]);
  groups.push(['Other expenses', B.bucketLedger(state).buckets.map((b) => ({
    ref: { type: 'bucket', bucketId: b.id }, text: `${b.name} · ${fmt(b.balance)}`,
  }))]);
  if (dir === 'from') groups.push(['Outside', [{ ref: { type: 'in' }, text: 'New money (from outside)' }]]);
  else groups.push(['Out', [{ ref: { type: 'stocks' }, text: 'Stocks' }, { ref: { type: 'out' }, text: 'Spent (paid for something)' }]]);
  return groups.filter(([, opts]) => opts.length);
}

function selectOptions(groups, selectedKey) {
  return groups.map(([label, opts]) => `<optgroup label="${esc(label)}">${opts.map((o) => {
    const k = refKey(o.ref);
    return `<option value="${esc(k)}" ${k === selectedKey ? 'selected' : ''}>${esc(o.text)}</option>`;
  }).join('')}</optgroup>`).join('');
}

// ---- Keypad entry ---------------------------------------------------------------

const noteButton = (sh, state) => {
  const recent = B.recentNotes(state, 8);
  const all = sh.note && !recent.includes(sh.note) ? [sh.note, ...recent] : recent;
  return `<div class="note-chips" role="group" aria-label="Note">
    ${all.map((n) => `<button class="chip-btn ${n === sh.note ? 'on' : ''}" aria-pressed="${n === sh.note}" data-act="entry-note" data-note="${esc(n)}">${esc(n)}</button>`).join('')}
    <button class="chip-btn type-note" data-act="open-note">${icon.plus(14)} ${all.length ? 'Other note' : 'Add a note'}</button>
  </div>`;
};

export function amountHTML(buf) {
  if (!buf) return '<span class="big placeholder"><span class="cur">$</span>0</span>';
  const [int, dec] = buf.split('.');
  const grouped = Number(int || '0').toLocaleString('en-AU');
  return `<span class="big"><span class="cur">$</span>${grouped}${dec !== undefined ? `.${dec}` : ''}</span>`;
}

export function entryHint(sh, state, today) {
  if (sh.mode === 'spend' || sh.mode === 'edit') {
    const p = B.periodSummary(state, B.periodIdOf(sh.date || today));
    if (!p.hasBudget && !p.imported) return 'No budget set for that month';
    return `${fmt(p.remaining)} left in ${B.periodLabel(p.periodId)}`;
  }
  if (sh.mode === 'salary') return `${fmt(state.settings.stockMin)} of it will be kept for stocks`;
  if (sh.mode === 'transfer') {
    const bal = sh.from && sh.from.type !== 'in' ? B.balanceOf(state, sh.from) : null;
    return bal === null ? '' : `${B.accountName(state, sh.from)} has ${fmt(bal)}`;
  }
  return '';
}

function entrySheet(sh, state, today) {
  const editing = sh.mode === 'edit';
  const top = editing
    ? head('Edit spend', `<button class="icon-btn" style="color:var(--red)" data-act="delete-spend" aria-label="Delete">${icon.trash()}</button>`)
    : `<div class="sheet-head">${closeBtn}
        <div class="seg" role="group" aria-label="Type">${[['spend', 'Spend'], ['salary', 'Salary'], ['transfer', 'Transfer']].map(([m, l]) => `<button class="${sh.mode === m ? 'on' : ''}" aria-pressed="${sh.mode === m}" data-act="entry-mode" data-mode="${m}">${l}</button>`).join('')}</div>
        <span class="ghost"></span></div>`;

  const dateChipHTML = (field, prefix = '') => `<label class="chip">${icon.calendar()}<span>${prefix}${esc(dateChip(sh[field], today))}</span><input type="date" data-field="${field}" value="${esc(sh[field])}" required></label>`;

  let fromto = '';
  let chips = '';
  if (sh.mode === 'spend' || editing) {
    chips = `${noteButton(sh, state)}
      <div class="chips">${dateChipHTML('date')}</div>`;
  } else if (sh.mode === 'salary') {
    // The earned month is worked out from the received date (pay is for the month before);
    // it only suggests the name, and can still be changed on the salary's detail screen.
    const auto = B.salaryLabel(sh.earned);
    chips = `<button class="chip-input note-btn" data-act="open-name">Name: ${esc(sh.label || auto)}</button>
      <div class="chips">${dateChipHTML('date', 'Received ')}</div>`;
  } else {
    const fromGroups = accountOptions(state, today, 'from');
    const toGroups = accountOptions(state, today, 'to');
    fromto = `<div class="fromto">
      <label><span class="k">From</span><span class="v">${esc(B.accountName(state, sh.from))}</span>${icon.right(16)}<select data-field="from">${selectOptions(fromGroups, refKey(sh.from))}</select></label>
      <label><span class="k">To</span><span class="v">${esc(B.accountName(state, sh.to))}</span>${icon.right(16)}<select data-field="to">${selectOptions(toGroups, refKey(sh.to))}</select></label>
    </div>`;
    chips = `${noteButton(sh, state)}
      <div class="chips">${dateChipHTML('date')}</div>`;
  }

  // Delete sits in the keypad's bottom-right corner so it never moves; hold it to clear.
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];
  return `<div class="inner">
    ${top}
    ${fromto}
    <div class="amount-area">
      <div class="amount-line"><span data-amount>${amountHTML(sh.buf)}</span></div>
      <div class="amount-hint" data-hint>${esc(entryHint(sh, state, today))}</div>
    </div>
    ${chips}
    <div class="keypad">
      ${keys.map((k) => `<button data-act="key" data-key="${k}">${k}</button>`).join('')}
      <button class="back" data-act="key" data-key="back" aria-label="Delete last digit, hold to clear">${icon.back(26)}</button>
    </div>
    <div class="fixed-bar"><button class="btn wide save-btn" data-act="save-entry">${editing ? 'Save changes' : 'Save'}</button></div>
  </div>`;
}

// ---- Detail sheets --------------------------------------------------------------

function activityList(state, ref, today) {
  const moves = [...B.transfersFor(state, ref)].reverse();
  if (!moves.length) return '<div class="empty">No activity yet.</div>';
  return `<div class="list">${moves.map((t) => {
    const incoming = t.direction === 'in';
    const other = B.accountName(state, incoming ? t.from : t.to);
    const kind = incoming ? 'in' : t.to.type === 'stocks' ? 'stocks' : t.to.type === 'out' ? 'out' : 'move';
    const when = t.date ? dayLabel(t.date, today) : 'Before the app';
    const r = B.round2(incoming ? t.amount : -t.amount);
    return `<button class="row" data-act="open-transfer" data-id="${esc(t.id)}">${bubble(kind)}
      <div class="grow"><div class="title">${esc(incoming ? `From ${other}` : t.to.type === 'out' ? (t.note || 'Spent') : `To ${other}`)}</div>
      <div class="sub">${esc([when, t.to.type === 'out' ? '' : t.note].filter(Boolean).join(' · '))}</div></div>
      <div class="amt ${r > 0 ? 'green' : ''}">${fmt(r, { sign: true })}</div></button>`;
  }).join('')}</div>`;
}

function potSheet(sh, state, today) {
  const p = B.potLedger(state).pots.find((x) => x.id === sh.id);
  if (!p) return null;
  const ref = { type: 'pot', potId: p.id };
  return `<div class="inner">
    ${head(`Salary ${p.label}`, `<button class="icon-btn" data-act="edit-pot" data-id="${esc(p.id)}" aria-label="Edit">${icon.tag(18)}</button>`)}
    <div class="card hero sheet-hero"><div class="tiny">Balance</div><div>${big(p.balance, p.balance < 0 ? 'red' : '')}</div></div>
    <div class="card" style="padding-top:6px;padding-bottom:6px">
      <div class="kv"><span>Received</span><span>${fmt(p.amount)}${p.receivedOn ? ` on ${B.dm(p.receivedOn)}` : ''}</span></div>
      <div class="kv"><span>Earned</span><span>${p.earnedPeriod ? esc(B.periodLabel(p.earnedPeriod)) : 'Not set'}</span></div>
      <div class="kv"><span>Kept for stocks</span><span>${fmt(p.reserved)}</span></div>
      <div class="kv"><span>Free</span><span>${fmt(p.free)}</span></div>
      <div class="kv"><span>Sent to stocks</span><span>${fmt(p.toStocks)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn soft" data-act="transfer" data-from="${esc(refKey(ref))}">${icon.swap(16)} Move money</button>
      <button class="btn" data-act="transfer" data-from="${esc(refKey(ref))}" data-to="stocks" data-amount="${B.round2(p.reserved) || ''}">${icon.stocks(16)} To stocks</button>
    </div>
    <div class="tiny">Activity</div>
    ${activityList(state, ref, today)}
  </div>`;
}

function bucketSheet(sh, state, today) {
  const b = B.bucketLedger(state).buckets.find((x) => x.id === sh.id);
  if (!b) return null;
  const ref = { type: 'bucket', bucketId: b.id };
  const key = esc(refKey(ref));
  return `<div class="inner">
    ${head(b.name, `<button class="icon-btn" data-act="rename-bucket" data-id="${esc(b.id)}" aria-label="Rename">${icon.tag(18)}</button>`)}
    <div class="card hero sheet-hero"><div class="tiny">Balance</div><div>${big(b.balance, b.balance < 0 ? 'red' : '')}</div></div>
    <div class="grid3">
      <button class="btn soft" data-act="transfer" data-from="in" data-to="${key}">${icon.up(16)} Add</button>
      <button class="btn soft" data-act="transfer" data-from="${key}" data-to="out">${icon.down(16)} Spend</button>
      <button class="btn soft" data-act="transfer" data-from="${key}">${icon.swap(16)} Move</button>
    </div>
    <div class="tiny">Activity</div>
    ${activityList(state, ref, today)}
    <button class="btn danger" data-act="delete-bucket" data-id="${esc(b.id)}">Delete category</button>
  </div>`;
}

function monthSheet(sh, state, today) {
  const m = B.monthsStatus(state, today).find((x) => x.periodId === sh.periodId);
  const p = B.periodSummary(state, sh.periodId);
  const ref = { type: 'budget', periodId: sh.periodId };
  const done = m?.status === 'done';
  const ticked = Boolean(state.monthsDone?.[sh.periodId]);
  return `<div class="inner">
    ${head(B.periodLabel(sh.periodId))}
    <div class="card hero sheet-hero">
      <div class="tiny">${p.remaining < 0 ? 'Over budget' : 'Left'}</div>
      <div>${big(p.remaining, p.remaining < 0 ? 'red' : '')}</div>
      <div class="sub">${done ? 'Done' : 'Not done'}</div>
    </div>
    <div class="card" style="padding-top:6px;padding-bottom:6px">
      ${p.imported ? `<div class="kv"><span>Left over (from before the app)</span><span>${fmt(p.opening)}</span></div>` : `<div class="kv"><span>Budget</span><span>${fmt(p.available)}</span></div>`}
      ${p.transfersIn ? `<div class="kv"><span>Moved in</span><span class="green">+${fmt(p.transfersIn)}</span></div>` : ''}
      ${p.spent ? `<div class="kv"><span>Spent</span><span>${fmt(p.spent)}</span></div>` : ''}
      ${p.transfersOut ? `<div class="kv"><span>Moved out</span><span>${fmt(p.transfersOut)}</span></div>` : ''}
      ${ticked && state.monthsDone[sh.periodId].note ? `<div class="kv"><span>Note</span><span>${esc(state.monthsDone[sh.periodId].note)}</span></div>` : ''}
    </div>
    <div class="btn-row">
      ${p.remaining > 0.004 ? `<button class="btn" data-act="transfer" data-from="${esc(refKey(ref))}" data-amount="${B.round2(p.remaining)}">${icon.swap(16)} Move what's left</button>` : ''}
      ${p.remaining < -0.004 ? `<button class="btn" data-act="transfer" data-to="${esc(refKey(ref))}" data-amount="${B.round2(-p.remaining)}">${icon.swap(16)} Cover it</button>` : ''}
      ${ticked ? '<button class="btn soft" data-act="unmark-done">Mark not done</button>'
    : done ? '' : '<button class="btn soft" data-act="mark-done">Mark as done</button>'}
    </div>
    <div class="tiny">Moves</div>
    ${activityList(state, ref, today)}
  </div>`;
}

function transferSheet(sh, state, today) {
  const t = state.transfers.find((x) => x.id === sh.id);
  if (!t) return null;
  return `<div class="inner">
    ${head('Transfer')}
    <div class="card hero sheet-hero"><div class="tiny">Amount</div><div>${big(t.amount)}</div></div>
    <div class="card" style="padding-top:6px;padding-bottom:6px">
      <div class="kv"><span>From</span><span>${esc(B.accountName(state, t.from))}</span></div>
      <div class="kv"><span>To</span><span>${esc(B.accountName(state, t.to))}</span></div>
      <div class="kv"><span>Date</span><span>${t.date ? esc(dayLabel(t.date, today)) : 'Before the app'}</span></div>
      ${t.note ? `<div class="kv"><span>Note</span><span>${esc(t.note)}</span></div>` : ''}
    </div>
    <button class="btn danger" data-act="delete-transfer" data-id="${esc(t.id)}">Delete transfer</button>
  </div>`;
}

// ---- Account pages (open from the cards on Accounts) -----------------------------

const listRow = ({ title, sub = '', amount, act }) => `<button class="row" ${act}>
  <div class="grow"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
  <div class="amt ${B.round2(amount) < 0 ? 'red' : ''}">${fmt(amount)}</div><span class="chev">${icon.right(18)}</span></button>`;

const kvCard = (rows) => `<div class="card kv-card">${rows.filter(Boolean).map(([k, v, cls = '']) => `<div class="kv"><span>${esc(k)}</span><span class="${cls}">${esc(v)}</span></div>`).join('')}</div>`;

function page(sh, { title, status, key, amount, red = false, pill, link = '', text = '', tabs, body, headAct = '', action }) {
  const tab = tabs.some(([v]) => v === sh.tab) ? sh.tab : tabs[0][0];
  return `<div class="inner page-wrap">
    <div class="page-head">${streets()}
      <button class="round on-dark" data-act="close-sheet" aria-label="Back">${icon.left()}</button>
      ${headAct || '<span></span>'}
    </div>
    <div class="page-panel">
      <div class="grabber" aria-hidden="true"></div>
      <div class="page-top">
        <div class="grow"><h2>${esc(title)}</h2>${status}</div>
        <div class="rating">${pill ? `<span class="outline-pill">${esc(pill)}</span>` : ''}${link}</div>
      </div>
      <div class="money huge ${red ? 'red' : ''}">${num(key, amount)}</div>
      ${text ? `<p class="page-text">${esc(text)}</p>` : ''}
      ${tabs.length > 1 ? chips(tabs, tab, 'page-tab', 'Sections', 'tab', 'tablist') : ''}
      <div class="page-body">${body[tab]}</div>
    </div>
    <div class="fixed-bar">${action}</div>
  </div>`;
}

function budgetPage(sh, state, today) {
  const pid = B.periodIdOf(today);
  const p = B.periodSummary(state, pid, today);
  const key = esc(refKey({ type: 'budget', periodId: pid }));
  const pct = p.total > 0 ? Math.round((p.spent / p.total) * 100) : 0;
  const items = budgetItems(state, pid);
  const days = [];
  for (const it of items) {
    const last = days.at(-1);
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }
  const lumps = state.lumpSums.filter((l) => l.firstPeriod <= pid && B.shiftPeriod(l.firstPeriod, l.months - 1) >= pid);
  const override = state.baseOverrides?.[pid];
  return page(sh, {
    title: 'Budget', status: statusLine(...level(p)), key: 'page-budget', amount: p.remaining, red: p.level === 'over',
    pill: `${pct}% spent`, link: '<button class="link" data-act="goto" data-tab="insights">See spending</button>',
    text: `Left this month, ${rangeLabel(pid)}. ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left.`,
    tabs: [['activity', 'Activity'], ['details', 'Details'], ['plans', 'Plans']],
    body: {
      activity: days.length ? `<div class="acc-list">${days.map((x, i) => dayAccordion(x.date, x.items, today, i === 0)).join('')}</div>` : '<p class="empty">No activity yet.</p>',
      details: `${kvCard([
        ['Budget', fmt(p.opening)],
        p.transfersIn ? ['Moved in', `+${fmt(p.transfersIn)}`, 'green'] : null,
        p.transfersOut ? ['Moved out', fmt(p.transfersOut)] : null,
        ['Spent', fmt(p.spent)],
        ['Per day left', fmt(p.perDayLeft)],
      ])}<button class="btn secondary wide" data-act="transfer" data-to="${key}">${icon.up(16)} Add money</button>`,
      plans: `<div class="card list-card"><div class="list">
        ${override !== undefined ? `<div class="row"><div class="grow"><div class="title">Budget set for this month</div><div class="sub">${fmt(override)}</div></div></div>` : ''}
        ${lumps.map((l) => `<div class="row"><div class="grow"><div class="title">Lump sum from ${esc(periodLabelLong(l.firstPeriod).split(' to ')[0])}</div><div class="sub">${fmt(l.amount)} over ${l.months} months, rent ${fmt(l.rentPerMonth)}</div></div></div>`).join('')}
        ${override === undefined && !lumps.length ? '<p class="empty">No plan covers this month.</p>' : ''}
      </div></div><button class="btn secondary wide" data-act="goto" data-tab="settings">Open Plans</button>`,
    },
    headAct: `<button class="round on-dark" data-act="transfer" data-from="${key}" aria-label="Transfer">${icon.swap(20)}</button>`,
    action: `<button class="btn wide fixed-pill" data-act="transfer" data-from="${key}">Move money</button>`,
  });
}

function salaryPage(sh, state) {
  const sal = B.potLedger(state);
  const pots = [...sal.pots].reverse();
  return page(sh, {
    title: 'Salary', status: statusLine(sal.totals.reserved > 0.004 ? 'amber' : 'green', sal.totals.reserved > 0.004 ? `${fmt(sal.totals.reserved)} still for stocks` : 'Stocks are up to date'),
    key: 'page-salary', amount: sal.totals.balance, pill: `${fmt(sal.totals.free)} free`,
    link: '<button class="link" data-act="transfer" data-to="stocks">To stocks</button>',
    text: `${fmt(sal.totals.reserved)} for stocks · ${fmt(sal.totals.free)} free`,
    tabs: [['activity', 'Activity'], ['details', 'Details'], ['plans', 'Plans']],
    body: {
      activity: `<div class="card list-card"><div class="list">${pots.map((x) => listRow({
        title: x.label || 'Salary',
        sub: [x.receivedOn ? `Received ${B.dm(x.receivedOn)}` : '', x.reserved > 0.004 ? `${fmt(x.reserved)} for stocks` : ''].filter(Boolean).join(' · '),
        amount: x.balance, act: `data-act="open-pot" data-id="${esc(x.id)}"`,
      })).join('') || '<p class="empty">No salary logged yet.</p>'}</div></div>`,
      details: kvCard([['Total salary', fmt(sal.totals.balance)], ['For stocks', fmt(sal.totals.reserved)], ['Free', fmt(sal.totals.free)], ["Each month's pay", String(pots.length)]]),
      plans: `<div class="card list-card"><div class="list"><button class="row set-row" data-act="open-form" data-form-type="stockMin"><div class="grow"><div class="title">Minimum from each salary</div><div class="sub">Kept for stocks</div></div><div class="amt">${fmt(state.settings.stockMin)}</div><span class="chev">${icon.right(18)}</span></button></div></div>`,
    },
    headAct: `<button class="round on-dark" data-act="transfer" data-to="stocks" aria-label="Transfer to stocks">${icon.swap(20)}</button>`,
    action: `<button class="btn wide fixed-pill" data-act="log-salary">${icon.plus(16)} Log salary</button>`,
  });
}

function otherPage(sh, state) {
  const oth = B.bucketLedger(state);
  const spent = oth.buckets.reduce((a, b) => a + b.spent, 0);
  return page(sh, {
    title: 'Other expenses', status: statusLine('green', `${oth.buckets.length} categor${oth.buckets.length === 1 ? 'y' : 'ies'}`),
    key: 'page-other', amount: oth.totals.balance, pill: 'Total set aside',
    text: oth.buckets.map((b) => b.name).join(', ') || 'No categories yet',
    tabs: [['activity', 'Categories'], ['details', 'Details']],
    body: {
      activity: `<div class="card list-card"><div class="list">${oth.buckets.map((b) => listRow({
        title: b.name, sub: b.spent > 0.004 ? `${fmt(b.spent)} spent` : '', amount: b.balance,
        act: `data-act="open-bucket" data-id="${esc(b.id)}"`,
      })).join('') || '<p class="empty">No categories yet.</p>'}</div></div>`,
      details: kvCard([['Total set aside', fmt(oth.totals.balance)], ['Spent from it', fmt(spent)]]),
    },
    headAct: `<button class="round on-dark" data-act="transfer" aria-label="Transfer">${icon.swap(20)}</button>`,
    action: `<button class="btn wide fixed-pill" data-act="new-bucket">${icon.plus(16)} New category</button>`,
  });
}

function stocksPage(sh, state, today) {
  const st = B.stocksSummary(state);
  const deposits = [...st.deposits].reverse();
  const target = st.sent + st.stillFromSalary;
  return page(sh, {
    title: 'Stocks', status: statusLine(st.stillFromSalary > 0.004 ? 'amber' : 'green', st.stillFromSalary > 0.004 ? `${fmt(st.stillFromSalary)} still to send` : 'All sent'),
    key: 'page-stocks', amount: st.sent, pill: target > 0 ? `${Math.round((st.sent / target) * 100)}% sent` : 'Sent so far',
    text: `Sent so far · ${fmt(st.stillFromSalary)} still to send from salary`,
    tabs: [['activity', 'Activity'], ['details', 'Details'], ['plans', 'Plans']],
    body: {
      activity: `<div class="card list-card"><div class="list">${deposits.map((t) => listRow({
        title: `From ${B.accountName(state, t.from)}`,
        sub: [t.date ? dayLabel(t.date, today) : 'Before the app', t.note].filter(Boolean).join(' · '),
        amount: t.amount, act: `data-act="open-transfer" data-id="${esc(t.id)}"`,
      })).join('') || '<p class="empty">Nothing sent yet.</p>'}</div></div>`,
      details: kvCard([['Sent so far', fmt(st.sent)], ['Still to send', fmt(st.stillFromSalary)]]),
      plans: `<div class="card list-card"><div class="list"><button class="row set-row" data-act="open-form" data-form-type="stockMin"><div class="grow"><div class="title">Minimum from each salary</div></div><div class="amt">${fmt(state.settings.stockMin)}</div><span class="chev">${icon.right(18)}</span></button></div></div>`,
    },
    headAct: `<button class="round on-dark" data-act="transfer" data-to="stocks" aria-label="Transfer to stocks">${icon.swap(20)}</button>`,
    action: `<button class="btn wide fixed-pill" data-act="transfer" data-to="stocks">${icon.stocks(16)} Send to stocks</button>`,
  });
}

// ---- Small forms ----------------------------------------------------------------

function editPotSheet(sh, state, today) {
  const p = state.pots.find((x) => x.id === sh.id);
  if (!p) return null;
  const cur = B.periodIdOf(today);
  const opts = [];
  for (let k = -12; k <= 0; k++) {
    const id = B.shiftPeriod(cur, k);
    opts.push(`<option value="${id}" ${id === p.earnedPeriod ? 'selected' : ''}>${esc(periodLabelLong(id))}</option>`);
  }
  return `<div class="inner">
    ${head('Edit salary')}
    <form class="form" data-form="edit-pot" data-id="${esc(p.id)}">
      <label class="field"><span>Label</span><input class="input" name="label" value="${esc(p.label)}" required></label>
      <label class="field"><span>Amount received</span><input class="input" name="amount" inputmode="decimal" value="${esc(p.amount)}" required></label>
      <label class="field"><span>Received on</span><input class="input" type="date" name="receivedOn" value="${esc(p.receivedOn ?? '')}"></label>
      <label class="field"><span>Earned in</span><select class="input" name="earnedPeriod"><option value="">Not set</option>${opts.join('')}</select></label>
      <label class="field"><span>Keep for stocks</span><input class="input" name="stockMin" inputmode="decimal" value="${esc(p.stockMin)}"></label>
      <button class="btn">Save</button>
    </form>
    <button class="btn danger" data-act="delete-pot" data-id="${esc(p.id)}">Delete this salary</button>
  </div>`;
}

function bucketFormSheet(sh, state) {
  const b = sh.id ? state.buckets.find((x) => x.id === sh.id) : null;
  return `<div class="inner">
    ${head(b ? 'Rename category' : 'New category')}
    <form class="form" data-form="bucket" ${b ? `data-id="${esc(b.id)}"` : ''}>
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(b?.name ?? '')}" placeholder="e.g. Flights, Birthday" required maxlength="30"></label>
      ${b ? '' : '<label class="field"><span>Starting amount (optional)</span><input class="input" name="amount" inputmode="decimal" placeholder="0.00"></label>'}
      <button class="btn">${b ? 'Save' : 'Create'}</button>
    </form>
  </div>`;
}

// Tapping the note on the keypad screen opens this: notes used before (tap one to use it)
// and a box to type a new one, like CommBank's description picker.
// The same screen names a salary (field 'label'), suggesting the name from the month it was earned.
function noteSheet(sh, state) {
  const naming = sh.field === 'label';
  const choices = naming ? [sh.suggest] : B.recentNotes(state, 9);
  return `<div class="inner">
    ${head(naming ? 'Salary name' : 'Note', '<button class="text-btn" data-act="note-done">Done</button>')}
    ${choices.length ? `<div class="tiny">${naming ? 'Suggested' : 'Used before'}</div>
    <div class="note-grid">${choices.map((n) => `<button data-act="pick-note" data-note="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <input class="input" id="note-input" value="${esc(sh.note)}" placeholder="${naming ? esc(sh.suggest) : 'Type a note'}" maxlength="${naming ? 30 : 60}" enterkeyhint="done" autocomplete="off">
    ${naming ? '<div class="sub">The name shown for this salary, like in your Notes. Leave it empty to use the suggested one.</div>' : ''}
  </div>`;
}

function doneSheet(sh) {
  return `<div class="inner">
    ${head(`Mark ${B.periodLabel(sh.periodId)} as done`)}
    <form class="form" data-form="mark-done">
      <label class="field"><span>Note (optional)</span><input class="input" name="note" placeholder="e.g. Left it in the account" maxlength="60"></label>
      <button class="btn">Mark as done</button>
    </form>
  </div>`;
}

// ---- Settings forms (bottom sheets) ---------------------------------------------

function periodOptions(today, selected, back = 12, ahead = 12) {
  const cur = B.periodIdOf(today);
  const opts = [];
  for (let k = -back; k <= ahead; k++) {
    const id = B.shiftPeriod(cur, k);
    opts.push(`<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(periodLabelLong(id))}${id === cur ? ' (now)' : ''}</option>`);
  }
  return opts.join('');
}

function formSheet(sh, state, today) {
  const s = state.settings;
  const cur = B.periodIdOf(today);
  const bigField = (name, label, value, placeholder = '0.00') => `<label class="big-field"><span class="sub">${esc(label)}</span>
    <span class="big-input-wrap"><span class="big-cur">$</span><input class="big-input" name="${name}" inputmode="decimal" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off"></span></label>`;
  const forms = {
    stockMin: ['Minimum from each salary', `<form class="form" data-form="stockMin">
      ${bigField('stockMin', 'Kept for stocks from each salary you log', s.stockMin)}
      <p class="sub">Salary already logged keeps its own minimum.</p>
      <div class="fixed-bar"><button class="btn wide fixed-pill">Save</button></div></form>`],
    rent: ['Rent', `<form class="form" data-form="rent">
      ${bigField('rentPerMonth', 'Rent per month', s.rentPerMonth ?? '', 'From the lump sum')}
      <label class="field"><span>Remind me</span><select class="input" name="rentRemindDays">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === s.rentRemindDays ? 'selected' : ''}>${n === 0 ? 'On the day' : `${n} day${n === 1 ? '' : 's'} before`}</option>`).join('')}</select></label>
      <div class="fixed-bar"><button class="btn wide fixed-pill">Save rent settings</button></div></form>`],
    lump: ['Add a lump sum', `<form class="form" data-form="lump">
      ${bigField('amount', 'Amount', '')}
      <label class="field"><span>First month</span><select class="input" name="firstPeriod">${periodOptions(today, cur)}</select></label>
      <div class="inline">
        <label class="field"><span>Months</span><input class="input" name="months" inputmode="numeric" value="3"></label>
        <label class="field"><span>Rent per month</span><input class="input" name="rentPerMonth" inputmode="decimal" value="${esc(s.rentPerMonth ?? '')}"></label>
      </div>
      <div class="fixed-bar"><button class="btn wide fixed-pill">Add lump sum</button></div></form>`],
    override: ["Set one month's budget", `<form class="form" data-form="override">
      ${bigField('amount', 'Budget', '')}
      <label class="field"><span>Month</span><select class="input" name="periodId">${periodOptions(today, cur)}</select></label>
      <div class="fixed-bar"><button class="btn wide fixed-pill">Save</button></div></form>`],
  };
  const [title, body] = forms[sh.form];
  return `<div class="inner">${head(title)}${body}</div>`;
}

// ---- Rent options and the Week / Month picker -------------------------------------

function rentOptionsSheet(sh, state, today) {
  const r = B.dashboard(state, today).rent;
  const text = {
    overdue: `Was due ${dMon(r.dueDate ?? today)}, ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} ago`,
    'due-today': 'Due today',
    upcoming: `Due ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}, ${dMon(r.dueDate ?? today)}`,
    none: 'Paid for this month',
  }[r.status];
  return `<div class="inner">${head('Rent')}
    <div class="opt-top"><span class="sub">${esc(text)}</span>${r.amount ? `<span class="tag gold">${fmt(r.amount)}</span>` : ''}</div>
    <button class="btn chip-btn-wide wide" data-act="open-form" data-form-type="rent">Rent settings</button>
    <div class="fixed-bar"><button class="btn gold wide fixed-pill" data-act="rent-paid" data-period="${esc(sh.period)}">Mark paid</button></div>
  </div>`;
}

function modeSheet(sh) {
  return `<div class="inner">${head('Show by')}${chips([['week', 'Week'], ['month', 'Month']], sh.mode, 'set-mode', 'Show by')}<p class="sub">Week shows Monday to Sunday. Month follows your budget month.</p></div>`;
}

// ---- Dispatcher -----------------------------------------------------------------

export function renderSheet(sh, state, today) {
  switch (sh.type) {
    case 'entry': return entrySheet(sh, state, today);
    case 'pot': return potSheet(sh, state, today);
    case 'bucket': return bucketSheet(sh, state, today);
    case 'month': return monthSheet(sh, state, today);
    case 'transfer': return transferSheet(sh, state, today);
    case 'edit-pot': return editPotSheet(sh, state, today);
    case 'bucket-form': return bucketFormSheet(sh, state);
    case 'done': return doneSheet(sh);
    case 'note': return noteSheet(sh, state);
    case 'form': return formSheet(sh, state, today);
    case 'rent-options': return rentOptionsSheet(sh, state, today);
    case 'mode': return modeSheet(sh);
    case 'page-budget': return budgetPage(sh, state, today);
    case 'page-salary': return salaryPage(sh, state);
    case 'page-other': return otherPage(sh, state);
    case 'page-stocks': return stocksPage(sh, state, today);
    default: return null;
  }
}
