// sheets.js
// Screens that slide up over the tabs: the keypad (spend / salary / transfer), account details and small forms.
// Each function returns HTML. app.js owns the sheet stack and handles the events.

import * as B from './budget-core.js';
import { esc, fmt, big, dateChip, dayLabel, periodLabelLong, refKey, icon, bubble, logo, count } from './ui.js';

const closeBtn = '<button class="icon-btn tile" data-act="close-sheet" aria-label="Close">' + icon.close() + '</button>';
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

const noteButton = (sh) => `<button class="chip-input note-btn ${sh.note ? '' : 'empty-note'}" data-act="open-note">${esc(sh.note || 'Add a note')}</button>`;

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
    chips = `${noteButton(sh)}
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
    chips = `${noteButton(sh)}
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
    <button class="btn primary wide save-btn" data-act="save-entry">${editing ? 'Save changes' : 'Save'}</button>
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
    <div class="card amount-card"><div class="card-label">${icon.bolt()}<span>Balance</span></div><div class="numrow"><span class="num">${count(`pot-${p.id}`, p.balance, 'money', p.balance < 0 ? 'red' : '')}</span></div></div>
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
    <div class="card list-card"><div class="card-label">${icon.list()}<span>Activity</span></div>${activityList(state, ref, today)}</div>
  </div>`;
}

function bucketSheet(sh, state, today) {
  const b = B.bucketLedger(state).buckets.find((x) => x.id === sh.id);
  if (!b) return null;
  const ref = { type: 'bucket', bucketId: b.id };
  const key = esc(refKey(ref));
  return `<div class="inner">
    ${head(b.name, `<button class="icon-btn" data-act="rename-bucket" data-id="${esc(b.id)}" aria-label="Rename">${icon.tag(18)}</button>`)}
    <div class="card amount-card"><div class="card-label">${icon.list()}<span>Balance</span></div><div class="numrow"><span class="num">${count(`bucket-${b.id}`, b.balance, 'money', b.balance < 0 ? 'red' : '')}</span></div></div>
    <div class="grid3">
      <button class="btn soft" data-act="transfer" data-from="in" data-to="${key}">${icon.up(16)} Add</button>
      <button class="btn soft" data-act="transfer" data-from="${key}" data-to="out">${icon.down(16)} Spend</button>
      <button class="btn soft" data-act="transfer" data-from="${key}">${icon.swap(16)} Move</button>
    </div>
    <div class="card list-card"><div class="card-label">${icon.list()}<span>Activity</span></div>${activityList(state, ref, today)}</div>
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
    <div class="card amount-card"><div class="card-label">${icon.clock()}<span>${p.remaining < 0 ? 'Over budget' : 'Left'}</span></div>
      <div class="numrow"><span class="num">${count(`month-${sh.periodId}`, p.remaining, 'money', p.remaining < 0 ? 'red' : '')}</span><span class="unit">${done ? 'Done' : 'Not done'}</span></div>
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
    <div class="card list-card"><div class="card-label">${icon.swap(14)}<span>Moves</span></div>${activityList(state, ref, today)}</div>
  </div>`;
}

function transferSheet(sh, state, today) {
  const t = state.transfers.find((x) => x.id === sh.id);
  if (!t) return null;
  return `<div class="inner">
    ${head('Transfer')}
    <div class="card amount-card"><div class="card-label">${icon.swap(14)}<span>Amount</span></div><div class="numrow"><span class="num">${count(`transfer-${t.id}`, t.amount, 'money')}</span></div></div>
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

const pageHead = (title, right = '<span class="ghost"></span>') => `<div class="sheet-head nav">
  <button class="icon-btn tile" data-act="close-sheet" aria-label="Back">${icon.left()}</button><h3>${esc(title)}</h3>${right}</div>`;

const pageHero = (label, amount, sub = '', key = label) => `<div class="card amount-card">
  <div class="card-label">${icon.coin()}<span>${esc(label)}</span></div>
  <div class="numrow"><span class="num">${count(`page-${key}`, amount, 'money', B.round2(amount) < 0 ? 'red' : '')}</span></div>
  ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
</div>`;

const listRow = ({ title, sub = '', amount, act }) => `<button class="row" ${act}>
  <div class="grow"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
  <div class="amt ${B.round2(amount) < 0 ? 'red' : ''}">${fmt(amount)}</div><span class="chev">${icon.right(18)}</span></button>`;

function budgetPage(state, today) {
  const pid = B.periodIdOf(today);
  const p = B.periodSummary(state, pid, today);
  const key = esc(refKey({ type: 'budget', periodId: pid }));
  return `<div class="inner">
    ${pageHead('Budget')}
    ${pageHero(p.level === 'over' ? 'Over budget' : 'Left this month', p.remaining, B.periodLabel(pid))}
    <div class="card" style="padding-top:6px;padding-bottom:6px">
      <div class="kv"><span>Budget</span><span>${fmt(p.opening)}</span></div>
      ${p.transfersIn ? `<div class="kv"><span>Moved in</span><span class="green">+${fmt(p.transfersIn)}</span></div>` : ''}
      ${p.transfersOut ? `<div class="kv"><span>Moved out</span><span>${fmt(p.transfersOut)}</span></div>` : ''}
      <div class="kv"><span>Spent</span><span>${fmt(p.spent)}</span></div>
      <div class="kv"><span>Per day left</span><span>${fmt(p.perDayLeft)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn soft" data-act="transfer" data-to="${key}">${icon.up(16)} Add money</button>
      <button class="btn soft" data-act="transfer" data-from="${key}">${icon.swap(16)} Move money</button>
    </div>
    <button class="btn soft wide" data-act="goto" data-tab="insights">${icon.chart(16)} See spending</button>
    <div class="card list-card"><div class="card-label">${icon.swap(14)}<span>Moves this month</span></div>${activityList(state, { type: 'budget', periodId: pid }, today)}</div>
  </div>`;
}

function salaryPage(state) {
  const sal = B.potLedger(state);
  const pots = [...sal.pots].reverse();
  return `<div class="inner">
    ${pageHead('Salary')}
    ${pageHero('Total salary', sal.totals.balance, `${fmt(sal.totals.reserved)} for stocks · ${fmt(sal.totals.free)} free`)}
    <div class="btn-row">
      <button class="btn" data-act="log-salary">${icon.plus(16)} Log salary</button>
      <button class="btn soft" data-act="transfer" data-to="stocks">${icon.stocks(16)} To stocks</button>
    </div>
    <div class="card list-card"><div class="card-label">${icon.bolt()}<span>Each month's pay</span></div><div class="list">
      ${pots.map((x) => listRow({
    title: x.label || 'Salary',
    sub: [x.receivedOn ? `Received ${B.dm(x.receivedOn)}` : '', x.reserved > 0.004 ? `${fmt(x.reserved)} for stocks` : ''].filter(Boolean).join(' · '),
    amount: x.balance, act: `data-act="open-pot" data-id="${esc(x.id)}"`,
  })).join('') || '<div class="empty">No salary logged yet.</div>'}
    </div></div>
  </div>`;
}

function otherPage(state) {
  const oth = B.bucketLedger(state);
  return `<div class="inner">
    ${pageHead('Other expenses')}
    ${pageHero('Total set aside', oth.totals.balance)}
    <button class="btn wide" data-act="new-bucket">${icon.plus(16)} New category</button>
    <div class="card list-card"><div class="card-label">${icon.list()}<span>Categories</span></div><div class="list">
      ${oth.buckets.map((b) => listRow({
    title: b.name, sub: b.spent > 0.004 ? `${fmt(b.spent)} spent` : '', amount: b.balance,
    act: `data-act="open-bucket" data-id="${esc(b.id)}"`,
  })).join('') || '<div class="empty">No categories yet.</div>'}
    </div></div>
  </div>`;
}

function stocksPage(state, today) {
  const st = B.stocksSummary(state);
  const deposits = [...st.deposits].reverse();
  return `<div class="inner">
    ${pageHead('Stocks')}
    ${pageHero('Sent so far', st.sent, `${fmt(st.stillFromSalary)} still to send from salary`)}
    <button class="btn wide" data-act="transfer" data-to="stocks">${icon.stocks(16)} Send to stocks</button>
    <div class="card list-card"><div class="card-label">${icon.pie()}<span>Sent</span></div><div class="list">
      ${deposits.map((t) => listRow({
    title: `From ${B.accountName(state, t.from)}`,
    sub: [t.date ? dayLabel(t.date, today) : 'Before the app', t.note].filter(Boolean).join(' · '),
    amount: t.amount, act: `data-act="open-transfer" data-id="${esc(t.id)}"`,
  })).join('') || '<div class="empty">Nothing sent yet.</div>'}
    </div></div>
  </div>`;
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

// ---- Step screens (Settings) ----------------------------------------------------
// Multi-field settings become full-screen steps with a ruler you drag under a fixed needle.
// Each step edits one field; the last step saves through the same core calls the old forms used.

export const FLOWS = {
  stockMin: {
    save: 'Save',
    steps: [{ field: 'stockMin', kind: 'amount', title: ['Stock Money', 'Each Salary'], sub: 'Kept from every salary you log, for stocks.', max: 3000, step: 10 }],
  },
  rent: {
    save: 'Save',
    steps: [{ field: 'rentPerMonth', kind: 'amount', title: ['Set Your', 'Rent'], sub: "We'll take it out before you spend.", unit: '/ month', max: 5000, step: 5 }],
  },
  override: {
    save: 'Save',
    steps: [
      { field: 'periodId', kind: 'month', title: ['Pick The', 'Month'], sub: 'The month that gets its own budget.' },
      { field: 'amount', kind: 'amount', title: ['Set Your', 'Budget'], sub: "We'll use this instead of the lump sum split.", unit: '/ month', max: 5000, step: 5, preview: 'day' },
    ],
  },
  lump: {
    save: 'Add lump sum',
    steps: [
      { field: 'firstPeriod', kind: 'month', title: ['First', 'Month'], sub: 'The first month this money covers.' },
      { field: 'months', kind: 'count', title: ['How Many', 'Months?'], sub: 'How long the money has to last.', unit: 'months', min: 1, max: 12, step: 1 },
      { field: 'amount', kind: 'amount', title: ['Set Your', 'Budget'], sub: "The whole amount for all the months. We'll split it across them for you.", max: 30000, step: 50, preview: 'lump' },
      { field: 'rentPerMonth', kind: 'amount', title: ['Set Your', 'Rent'], sub: "We'll take it out before you spend.", unit: '/ month', max: 5000, step: 5, preview: 'lump' },
    ],
  },
};

export function flowStart(flow, state, today) {
  const s = state.settings;
  const cur = B.periodIdOf(today);
  const vals = {
    stockMin: { stockMin: s.stockMin ?? 0 },
    rent: { rentPerMonth: s.rentPerMonth ?? 0 },
    override: { periodId: cur, amount: 0 },
    lump: { firstPeriod: cur, months: 3, amount: 0, rentPerMonth: s.rentPerMonth ?? 0 },
  }[flow];
  return { type: 'flow', flow, step: 0, vals, manual: false };
}

const TICK = 8; // px between ruler ticks
export const rulerMin = (st) => st.min ?? 0;
export const rulerCount = (st) => Math.round((st.max - rulerMin(st)) / st.step);

export function pickText(st, v) {
  if (st.kind === 'count') return String(Math.round(v));
  return fmt(v).replace(/\.00$/, '');
}

// "That gives you $x a month" under the ruler, from the same sum the Plans list shows.
export function flowPreview(sh, st) {
  const v = sh.vals;
  if (st.preview === 'lump' && v.months > 0 && v.amount > 0) {
    return `That gives you ${fmt((v.amount - (v.rentPerMonth || 0) * v.months) / v.months)} a month`;
  }
  if (st.preview === 'day' && v.amount > 0) {
    const days = B.periodRange(v.periodId);
    const n = Math.round((new Date(days.end) - new Date(days.start)) / 864e5);
    return `About ${fmt(v.amount / n)} a day`;
  }
  return '';
}

export const flowReady = (sh, st) => st.kind !== 'amount' || Number(sh.vals[st.field]) > 0;

function flowSheet(sh, state, today) {
  const def = FLOWS[sh.flow];
  const st = def.steps[sh.step];
  const last = sh.step === def.steps.length - 1;
  const v = sh.vals[st.field];
  const dots = def.steps.length > 1
    ? `<div class="dots" aria-label="Step ${sh.step + 1} of ${def.steps.length}">${def.steps.map((_, i) => `<i class="${i === sh.step ? 'on' : ''}"></i>`).join('')}</div>` : '';
  let body;
  if (st.kind === 'month') {
    const cur = B.periodIdOf(today);
    const ids = [];
    for (let k = -3; k <= 9; k++) ids.push(B.shiftPeriod(cur, k));
    body = `<div class="card list-card month-pick"><div class="list">${ids.map((id) => `<button class="row ${id === v ? 'picked' : ''}" data-act="flow-pick" data-v="${id}" aria-pressed="${id === v}">
      <div class="grow"><div class="title">${esc(B.periodLabel(id))}</div>${id === cur ? '<div class="sub">This month</div>' : ''}</div>
      <span class="radio">${id === v ? icon.check(14) : ''}</span></button>`).join('')}</div></div>`;
  } else {
    const n = rulerCount(st);
    const ticks = Array.from({ length: n + 1 }, (_, i) => `<i class="${i % 10 === 0 ? 'l' : i % 5 === 0 ? 'm' : ''}"></i>`).join('');
    body = `<div class="picker">
      <button class="pick-value" data-act="flow-manual" aria-label="Type the amount"><span data-pick-text>${esc(pickText(st, v))}</span>${st.unit ? ` <span class="unit">${esc(st.unit)}</span>` : ''}</button>
      <input class="input pick-input" data-pick-input inputmode="${st.kind === 'count' ? 'numeric' : 'decimal'}" value="${v || ''}" placeholder="0" ${sh.manual ? '' : 'hidden'} aria-label="${esc(st.title.join(' '))}">
      <div class="ruler-wrap">
        <div class="ruler-pick" data-ruler tabindex="0" role="slider" aria-label="${esc(st.title.join(' '))}"
          aria-valuemin="${rulerMin(st)}" aria-valuemax="${st.max}" aria-valuenow="${v}" aria-valuetext="${esc(pickText(st, v))}"
          data-min="${rulerMin(st)}" data-step="${st.step}" data-tick="${TICK}">
          <div class="ruler-track">${ticks}</div>
        </div>
        <i class="needle" aria-hidden="true"></i>
      </div>
      <div class="pick-preview" data-pick-preview>${esc(flowPreview(sh, st))}</div>
    </div>`;
  }
  return `<div class="inner flow">
    <div class="flow-top">
      <button class="icon-btn tile" data-act="${sh.step ? 'flow-back' : 'close-sheet'}" aria-label="${sh.step ? 'Back' : 'Close'}">${sh.step ? icon.left() : icon.close()}</button>
      <div class="brand">${logo(22)}<span>Budget</span></div>
      ${dots || '<span class="ghost"></span>'}
    </div>
    <h1 class="flow-title">${esc(st.title[0])}<br>${esc(st.title[1])}</h1>
    <p class="sub flow-sub">${esc(st.sub)}</p>
    ${body}
    <div class="flow-actions">
      ${st.kind === 'month' ? '' : '<button class="btn secondary wide" data-act="flow-manual">Enter manually</button>'}
      <button class="btn primary wide" data-act="flow-next" ${flowReady(sh, st) ? '' : 'disabled'}>${last ? esc(def.save) : 'Continue'} ${icon.arrow(18)}</button>
    </div>
  </div>`;
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
    case 'flow': return flowSheet(sh, state, today);
    case 'page-budget': return budgetPage(state, today);
    case 'page-salary': return salaryPage(state);
    case 'page-other': return otherPage(state);
    case 'page-stocks': return stocksPage(state, today);
    default: return null;
  }
}
