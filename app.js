// app.js
// Thin UI over budget-core.js. All maths lives in budget-core.js; this file only draws and stores.
// Data is kept in this browser's localStorage. Use Export backup to keep a copy.

import * as B from './budget-core.js';

const KEY = 'budget-state-v1';
const APP_VERSION = '0.1.0';
const app = document.getElementById('app');
let state = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const num = (v) => Number(String(v).replace(',', '.'));

function load() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, B.exportState(state)); } catch { /* storage blocked: Export backup still works */ }
}

function commit(fn) {
  try {
    state = fn(state);
    save();
    render();
  } catch (e) {
    alert(e.message);
  }
}

async function init() {
  const raw = load();
  if (raw) {
    try { state = B.importState(raw); } catch { state = null; }
  }
  if (!state) {
    // seed.local.js holds the personal starting data and is never published. Without it we start empty.
    try { state = (await import('./seed.local.js')).seedState(); } catch { state = B.emptyState(); }
    save();
  }
  render();
}

// Tells you whether you are testing the real thing: installed app, offline files saved.
function installStatus() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const standalone = nav.standalone === true || (globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false);
  const https = typeof location !== 'undefined' && location.protocol === 'https:';
  const offlineReady = 'serviceWorker' in nav && Boolean(nav.serviceWorker.controller);
  return [
    `Version ${APP_VERSION}`,
    standalone ? 'running as an installed app' : 'running in a browser tab',
    offlineReady ? 'offline files saved' : https ? 'offline files not saved yet (reload once)' : 'offline needs https',
  ].join(' | ');
}

const LEVELS = {
  ok: 'On track',
  'over-base': 'Using salary',
  'near-ceiling': 'Close to your ceiling',
  'over-ceiling': 'Over your ceiling',
};

function render() {
  const today = B.todayISO();
  const d = B.dashboard(state, today);
  const p = d.period;
  const out = [];

  // Rent reminder
  const r = d.rent;
  if (r.status !== 'none') {
    const amt = r.amount ? ` (${B.money(r.amount)})` : '';
    const msg = {
      overdue: `Rent${amt} was due ${dm(r.dueDate)}, ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} ago.`,
      'due-today': `Rent${amt} is due today.`,
      upcoming: `Rent${amt} is due ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`} (${dm(r.dueDate)}).`,
    }[r.status];
    out.push(`<section class="card banner ${r.status === 'overdue' ? 'bad' : ''}">
      <div>${msg}</div>
      <div class="actions"><button data-act="rent-paid" data-period="${esc(r.periodId)}">Mark rent paid</button></div>
    </section>`);
  }

  // This month
  const rangeText = `${dm(p.start)} to ${dm(p.end)}`;
  if (!p.hasBudget) {
    out.push(`<section class="card"><h2>This month, ${rangeText}</h2>
      <div class="empty">No budget is set for this period yet. Import a backup below to load your setup.</div></section>`);
  } else {
    const fixedRows = p.fixed.map((f) => `<div class="row"><span>${esc(f.name)} (${f.number}/${f.of})</span><span>-${B.money(f.amount)}</span></div>`).join('');
    const ceilingLine = p.salaryLogged
      ? `Ceiling ${B.money(p.ceiling)} (available + this month's pay above your ${B.money(state.settings.stockMin)} stock minimum)`
      : `Ceiling: this month's pay is not logged yet, so only the budget is counted`;
    out.push(`<section class="card">
      <h2>This month, ${rangeText}</h2>
      <div class="hero ${p.remaining < 0 ? 'bad' : ''}">${B.money(p.remaining)}</div>
      <div class="sub">left of ${B.money(p.available)} <span class="badge ${p.level}">${LEVELS[p.level]}</span></div>
      <div style="margin-top:10px">
        <div class="row"><span>Base budget</span><span>${B.money(p.base)}</span></div>
        ${fixedRows}
        <div class="row"><span>Spent</span><span>${B.money(p.spent)}</span></div>
      </div>
      <div class="sub" style="margin-top:8px">${esc(ceilingLine)}</div>
      <form data-form="spend">
        <input name="amount" type="text" inputmode="decimal" placeholder="Amount" required>
        <input name="date" type="date" value="${today}" required>
        <input class="wide" name="note" type="text" placeholder="Note (optional)">
        <button class="wide" type="submit">Add spend</button>
      </form>
    </section>`);

    const spendRows = [...p.spends].reverse().map((s) =>
      `<div class="row"><span>${dm(s.date)}${s.note ? ` &middot; ${esc(s.note)}` : ''}</span><span>${B.money(s.amount)} <button class="x" data-act="del-spend" data-id="${esc(s.id)}" title="Delete">&times;</button></span></div>`).join('');
    out.push(`<section class="card"><h2>Spends this month</h2>${spendRows || '<div class="empty">Nothing logged yet.</div>'}</section>`);
  }

  // Salary pots
  const potRows = d.pots.pots.map((x) =>
    `<div class="row"><span>${esc(x.label || x.id)}<br><span class="sub">${B.money(x.reserved)} reserved for stocks, ${B.money(x.free)} free</span></span><span>${B.money(x.balance)}</span></div>`).join('');
  const short = d.pots.shortfall > 0 ? `<div class="bad" style="margin-top:8px">Overspent by ${B.money(d.pots.shortfall)} beyond all free salary.</div>` : '';
  out.push(`<section class="card"><h2>Salary pots</h2>
    ${potRows || '<div class="empty">No salary logged yet.</div>'}
    <div class="row"><strong>Total</strong><strong>${B.money(d.pots.totals.balance)}</strong></div>${short}
    <form data-form="salary">
      <input name="label" type="text" placeholder="Label, e.g. t9-t10" required>
      <input name="amount" type="text" inputmode="decimal" placeholder="Amount received" required>
      <input class="wide" name="receivedOn" type="date" value="${today}" required>
      <button class="wide" type="submit">Log salary</button>
    </form></section>`);

  // Stocks
  const st = d.stock;
  const leftRows = st.leftovers.filter((x) => x.pending > 0.005).map((x) =>
    `<div class="row"><span>Leftover ${dm(B.periodRange(x.periodId).start)} to ${dm(B.periodRange(x.periodId).end)}</span><span>${B.money(x.pending)}</span></div>`).join('');
  out.push(`<section class="card"><h2>Stocks to deposit</h2>
    ${leftRows}
    <div class="row"><span>Salary reserves (${B.money(state.settings.stockMin)} minimum per month)</span><span>${B.money(st.reservedFromSalary)}</span></div>
    <div class="row"><strong>Deposit together</strong><strong>${B.money(st.total)}</strong></div>
    <div class="actions"><button data-act="deposit" ${st.total < 0.005 ? 'disabled' : ''}>I deposited all of this</button></div>
  </section>`);

  // Irregular
  const ir = d.irregular;
  const irRows = [...ir.planned, ...ir.paid].map((x) =>
    `<div class="row"><span>${esc(x.name)} <span class="sub">${x.status}${x.date ? `, ${dm(x.date)}` : ''}</span></span><span>${B.money(x.amount)} ${x.status === 'planned' ? `<button class="ghost" data-act="irr-paid" data-id="${esc(x.id)}">Paid</button>` : ''}</span></div>`).join('');
  out.push(`<section class="card"><h2>Irregular costs (not in the monthly budget)</h2>
    ${irRows || '<div class="empty">None.</div>'}
    <form data-form="irregular">
      <input name="name" type="text" placeholder="e.g. Flight tickets" required>
      <input name="amount" type="text" inputmode="decimal" placeholder="Amount" required>
      <button class="wide" type="submit">Add</button>
    </form></section>`);

  // Settings and backup
  out.push(`<section class="card"><h2>Settings and backup</h2>
    <form data-form="settings">
      <input name="stockMin" type="text" inputmode="decimal" value="${state.settings.stockMin}" aria-label="Minimum of each month's salary for stocks">
      <button type="submit">Save stock minimum</button>
    </form>
    <div class="actions">
      <button class="ghost" data-act="export">Export backup</button>
      <label class="file"><span>Import backup</span><input type="file" accept="application/json,.json" data-act="import"></label>
    </div>
    <div class="sub" style="margin-top:8px">Data lives only on this device. Export a backup now and then.</div>
    <div class="sub" style="margin-top:4px">${esc(installStatus())}</div>
  </section>`);

  app.innerHTML = `<header><h1>Budget</h1><div class="sub">Today ${dm(today)}</div></header>${out.join('')}`;
}

// ---- Events ---------------------------------------------------------------------

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  switch (f.dataset.form) {
    case 'spend':
      commit((s) => B.addSpend(s, { date: fd.get('date'), amount: num(fd.get('amount')), note: String(fd.get('note') || '') }));
      break;
    case 'salary':
      commit((s) => B.addSalary(s, { label: String(fd.get('label')), amount: num(fd.get('amount')), receivedOn: fd.get('receivedOn') }));
      break;
    case 'irregular':
      commit((s) => B.addIrregular(s, { name: String(fd.get('name')), amount: num(fd.get('amount')) }));
      break;
    case 'settings':
      commit((s) => B.updateSettings(s, { stockMin: num(fd.get('stockMin')) }));
      break;
  }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const today = B.todayISO();
  switch (b.dataset.act) {
    case 'rent-paid':
      commit((s) => B.markRentPaid(s, b.dataset.period, today));
      break;
    case 'del-spend':
      if (confirm('Delete this spend?')) commit((s) => B.removeSpend(s, b.dataset.id));
      break;
    case 'irr-paid':
      commit((s) => B.markIrregularPaid(s, b.dataset.id, today));
      break;
    case 'deposit': {
      const d = B.dashboard(state, today);
      const parts = [
        ...d.stock.leftovers.filter((x) => x.pending > 0.005).map((x) => ({ type: 'leftover', periodId: x.periodId, amount: x.pending })),
        ...d.pots.pots.filter((x) => x.reserved > 0.005).map((x) => ({ type: 'pot', potId: x.id, amount: x.reserved })),
      ];
      if (parts.length && confirm(`Record a stock deposit of ${B.money(d.stock.total)}?`)) {
        commit((s) => B.recordStockDeposit(s, { date: today, parts }));
      }
      break;
    }
    case 'export': {
      const blob = new Blob([B.exportState(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `budget-backup-${today}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset?.act !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  if (confirm('Replace everything in this browser with the backup?')) commit(() => B.importState(text));
});

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol === 'https:') {
  // Only on https (the real hosted site). Skipped on plain http so local edits are never cached.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (state) render(); });
}

init();
