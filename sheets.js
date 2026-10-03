// sheets.js
// Screens that slide up over the tabs: the keypad (spend / salary / transfer), account details and small forms.
// Each function returns HTML. app.js owns the sheet stack and handles the events.

import * as B from './budget-core.js';
import { esc, fmt, big, dateChip, dayLabel, periodLabelLong, refKey, icon, bubble } from './ui.js';

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
        <div class="seg">${[['spend', 'Spend'], ['salary', 'Salary'], ['transfer', 'Transfer']].map(([m, l]) => `<button class="${sh.mode === m ? 'on' : ''}" data-act="entry-mode" data-mode="${m}">${l}</button>`).join('')}</div>
        <span class="ghost"></span></div>`;

  const dateChipHTML = (field, prefix = '') => `<label class="chip">${icon.calendar()}<span>${prefix}${esc(dateChip(sh[field], today))}</span><input type="date" data-field="${field}" value="${esc(sh[field])}" required></label>`;

  let fromto = '';
  let chips = '';
  if (sh.mode === 'spend' || editing) {
    chips = `${noteButton(sh)}
      <div class="chips">${dateChipHTML('date')}</div>`;
  } else if (sh.mode === 'salary') {
    const auto = B.salaryLabel(sh.earned);
    const cur = B.periodIdOf(today);
    const earnedOpts = [-4, -3, -2, -1, 0].map((k) => B.shiftPeriod(cur, k))
      .map((id) => `<option value="${id}" ${id === sh.earned ? 'selected' : ''}>Earned ${esc(B.periodLabel(id))}</option>`).join('');
    chips = `<input class="chip-input" data-field="label" placeholder="${esc(auto)}" value="${esc(sh.label)}" maxlength="30" aria-label="Label">
      <div class="chips">${dateChipHTML('date', 'Received ')}
        <label class="chip">${icon.tag()}<span>Earned ${esc(B.periodLabel(sh.earned))}</span><select data-field="earned">${earnedOpts}</select></label>
      </div>`;
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

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];
  return `<div class="inner">
    ${top}
    ${fromto}
    <div class="amount-area">
      <div class="amount-line"><span data-amount>${amountHTML(sh.buf)}</span>
        <button class="icon-btn" data-act="key" data-key="back" aria-label="Delete last digit">${icon.back(20)}</button></div>
      <div class="amount-hint" data-hint>${esc(entryHint(sh, state, today))}</div>
    </div>
    ${chips}
    <div class="keypad">
      ${keys.map((k) => `<button data-act="key" data-key="${k}">${k}</button>`).join('')}
      <button class="ok" data-act="save-entry" aria-label="Save">${icon.check(26)}</button>
    </div>
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
    <div class="center" style="font-size:44px">${big(p.balance, p.balance < 0 ? 'red' : '')}</div>
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
    <div class="center" style="font-size:44px">${big(b.balance, b.balance < 0 ? 'red' : '')}</div>
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
    <div class="center">
      <div style="font-size:44px">${big(p.remaining, p.remaining < 0 ? 'red' : '')}</div>
      <div class="sub">${p.remaining < 0 ? 'over budget' : 'left'} · ${done ? 'Done' : 'Not done'}</div>
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
    : done ? '' : '<button class="btn soft" data-act="mark-done">Tick off as done</button>'}
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
    <div class="center" style="font-size:44px">${big(t.amount)}</div>
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

const pageHead = (title, right = '<span class="ghost"></span>') => `<div class="sheet-head">
  <button class="icon-btn" data-act="close-sheet" aria-label="Back">${icon.left()}</button><h3>${esc(title)}</h3>${right}</div>`;

const pageHero = (label, amount, sub = '') => `<div class="center" style="padding:8px 0 4px">
  <div class="tiny">${esc(label)}</div>
  <div style="font-size:44px">${big(amount, B.round2(amount) < 0 ? 'red' : '')}</div>
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
    <div class="tiny">Moves this month</div>
    ${activityList(state, { type: 'budget', periodId: pid }, today)}
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
    <div class="tiny">Each month's pay</div>
    <div class="card" style="padding-top:4px;padding-bottom:4px"><div class="list">
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
    <div class="tiny">Categories</div>
    <div class="card" style="padding-top:4px;padding-bottom:4px"><div class="list">
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
    <div class="tiny">Sent</div>
    <div class="card" style="padding-top:4px;padding-bottom:4px"><div class="list">
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
function noteSheet(sh, state) {
  const notes = B.recentNotes(state, 9);
  return `<div class="inner">
    ${head('Note', '<button class="text-btn" data-act="note-done">Done</button>')}
    ${notes.length ? `<div class="tiny">Used before</div>
    <div class="note-grid">${notes.map((n) => `<button data-act="pick-note" data-note="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <input class="input" id="note-input" value="${esc(sh.note)}" placeholder="Type a note" maxlength="60" enterkeyhint="done" autocomplete="off">
  </div>`;
}

function doneSheet(sh) {
  return `<div class="inner">
    ${head(`Tick off ${B.periodLabel(sh.periodId)}`)}
    <form class="form" data-form="mark-done">
      <label class="field"><span>Note (optional)</span><input class="input" name="note" placeholder="e.g. Left it in the account" maxlength="60"></label>
      <button class="btn">Mark as done</button>
    </form>
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
    case 'page-budget': return budgetPage(state, today);
    case 'page-salary': return salaryPage(state);
    case 'page-other': return otherPage(state);
    case 'page-stocks': return stocksPage(state, today);
    default: return null;
  }
}
