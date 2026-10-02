// budget-core.js
// Pure budget logic. No UI, no storage, no dependencies. Works in Node and in the browser.
//
// Conventions
// - Money is a plain number at full precision. Round only for display (round2 / money).
// - Dates are 'YYYY-MM-DD' strings. Pass "today" in explicitly so everything stays testable.
// - A budget period runs from the 28th to the next 28th (end date exclusive).
//   Its id is the month of the starting 28th: '2026-09' = 2026-09-28 up to 2026-10-28.
// - Every state-changing function returns a NEW state and leaves the old one untouched.

export const STATE_VERSION = 1;

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

// Round half away from zero. EPSILON nudges values like 1.005 (stored as 1.00499...) up to 1.01.
export const round2 = (x) => {
  const r = (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
  return r + 0; // turns -0 into 0
};
export const money = (x) => {
  const r = round2(x);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toFixed(2)}`;
};

// ---------------------------------------------------------------------------
// Dates and periods
// ---------------------------------------------------------------------------

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error(`Invalid date "${s}", expected YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid date "${s}"`);
  }
  return { y, m: mo, d, ms };
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b).ms - parseDate(a).ms) / DAY_MS);
}

export function addDays(s, n) {
  const dt = new Date(parseDate(s).ms + n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function parsePeriod(id) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(id));
  if (!m) throw new Error(`Invalid period id "${id}", expected YYYY-MM`);
  return { y: Number(m[1]), m: Number(m[2]) };
}

const periodIndex = (id) => {
  const { y, m } = parsePeriod(id);
  return y * 12 + (m - 1);
};

export function shiftPeriod(id, n) {
  const idx = periodIndex(id) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function periodIdOf(date) {
  const { y, m, d } = parseDate(date);
  if (d >= 28) return `${y}-${pad(m)}`;
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function periodRange(id) {
  parsePeriod(id);
  return { start: `${id}-28`, end: `${shiftPeriod(id, 1)}-28` };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function emptyState() {
  return {
    version: STATE_VERSION,
    seq: 0,
    settings: {
      stockMin: 500, // minimum of each month's salary to set aside for stocks
      rentRemindDays: 2, // remind this many days before the 28th
      ceilingWarnPct: 0.9, // warn when spending reaches this share of the ceiling
      rentPerMonth: null, // used for the rent reminder when no lump sum covers the period
    },
    lumpSums: [], // { id, firstPeriod, months, amount, rentPerMonth }
    baseOverrides: {}, // fixed base budget for one period, wins over the lump sum: { '2026-09': 1121 }
    instalments: [], // { id, name, total, months, firstPeriod }
    spends: [], // { id, date, amount, note }
    pots: [], // salary pots: { id, label, amount, receivedOn, earnedPeriod, stockMin, spends: [{amount, note}] }
    stockDeposits: [], // { id, date, parts: [{type:'pot', potId, amount} | {type:'leftover', periodId, amount}] }
    periodOverrides: {}, // imported history: { '2026-08': { leftover: 208 } }
    rentPaid: {}, // { '2026-09': '2026-09-28' }  (key = period whose 28th the rent is due)
    irregular: [], // { id, name, amount, date, status: 'planned' | 'paid' }
  };
}

function update(state, fn) {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function nextId(draft, prefix) {
  draft.seq += 1;
  return `${prefix}${draft.seq}`;
}

function assertAmount(n, what = 'amount') {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${what} must be a positive number`);
  }
}

export function updateSettings(state, patch) {
  return update(state, (d) => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in d.settings)) throw new Error(`Unknown setting "${k}"`);
      if (k === 'stockMin' && !(typeof v === 'number' && v >= 0)) throw new Error('stockMin must be 0 or more');
      if (k === 'rentRemindDays' && !(Number.isInteger(v) && v >= 0 && v <= 7)) throw new Error('rentRemindDays must be 0 to 7');
      if (k === 'ceilingWarnPct' && !(typeof v === 'number' && v > 0 && v <= 1)) throw new Error('ceilingWarnPct must be above 0 and at most 1');
      if (k === 'rentPerMonth' && !(v === null || (typeof v === 'number' && v > 0))) throw new Error('rentPerMonth must be a positive number');
      d.settings[k] = v;
    }
  });
}

// ---------------------------------------------------------------------------
// Base budget and fixed (upfront) items
// ---------------------------------------------------------------------------

export function lumpFor(state, periodId) {
  const i = periodIndex(periodId);
  return (
    state.lumpSums.find((l) => {
      const s = periodIndex(l.firstPeriod);
      return i >= s && i < s + l.months;
    }) ?? null
  );
}

// Monthly budget excluding rent. A per-period override wins (used for the last month of the old budget).
// Otherwise it is (lump sum - rent for the cycle) / months. Null if nothing covers the period.
export function baseBudgetFor(state, periodId) {
  parsePeriod(periodId);
  const ov = state.baseOverrides?.[periodId];
  if (typeof ov === 'number') return ov;
  const l = lumpFor(state, periodId);
  return l ? (l.amount - l.rentPerMonth * l.months) / l.months : null;
}

export function setBaseOverride(state, periodId, amount) {
  parsePeriod(periodId);
  assertAmount(amount, 'base budget');
  return update(state, (d) => {
    d.baseOverrides = { ...(d.baseOverrides ?? {}), [periodId]: amount };
  });
}

// Instalments (concert, bus) active in a period. They drop off by themselves when finished.
export function fixedItemsFor(state, periodId) {
  const i = periodIndex(periodId);
  return state.instalments.flatMap((x) => {
    const s = periodIndex(x.firstPeriod);
    if (i < s || i >= s + x.months) return [];
    return [{ id: x.id, name: x.name, amount: x.total / x.months, number: i - s + 1, of: x.months }];
  });
}

// ---------------------------------------------------------------------------
// Spends
// ---------------------------------------------------------------------------

export function addSpend(state, { date, amount, note = '' }) {
  parseDate(date);
  assertAmount(amount);
  return update(state, (d) => {
    d.spends.push({ id: nextId(d, 's'), date, amount, note });
  });
}

export function removeSpend(state, id) {
  if (!state.spends.some((s) => s.id === id)) throw new Error(`No spend with id "${id}"`);
  return update(state, (d) => {
    d.spends = d.spends.filter((s) => s.id !== id);
  });
}

export function spendsInPeriod(state, periodId) {
  const { start, end } = periodRange(periodId);
  return state.spends.filter((s) => s.date >= start && s.date < end).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Period summary: the main number K watches
// ---------------------------------------------------------------------------
//   available  = base budget minus upfront items (what the month is allowed to spend)
//   remaining  = available - spent (negative means salary is being used)
//   ceiling    = available + spendable part of the salary earned in this period
//   level      = ok | over-base | near-ceiling | over-ceiling

export function periodSummary(state, periodId) {
  const base = baseBudgetFor(state, periodId);
  const hasBudget = base !== null;
  const fixed = fixedItemsFor(state, periodId);
  const fixedTotal = sum(fixed.map((f) => f.amount));
  const available = hasBudget ? base - fixedTotal : 0;
  const spends = spendsInPeriod(state, periodId);
  const spent = sum(spends.map((s) => s.amount));
  const remaining = available - spent;
  const overflow = Math.max(0, spent - available);
  const leftover = Math.max(0, remaining);

  const potsHere = state.pots.filter((p) => p.earnedPeriod === periodId);
  const salaryLogged = potsHere.length > 0;
  const salaryAllowance = sum(potsHere.map((p) => Math.max(0, p.amount - p.stockMin)));
  const ceiling = available + salaryAllowance;

  let level;
  if (spent <= available) level = 'ok';
  else if (!salaryLogged) level = 'over-base';
  else if (spent > ceiling) level = 'over-ceiling';
  else if (spent >= ceiling * state.settings.ceilingWarnPct) level = 'near-ceiling';
  else level = 'over-base';

  return {
    periodId, ...periodRange(periodId), hasBudget, base, fixed, fixedTotal, available,
    spends, spent, remaining, overflow, leftover, salaryLogged, salaryAllowance, ceiling, level,
  };
}

// ---------------------------------------------------------------------------
// Salary pots
// ---------------------------------------------------------------------------

// Log the pay that actually landed. earnedPeriod defaults to the period just before the one the
// money arrived in (pay lands around the 30th / 1st for work done up to the 28th).
export function addSalary(state, { label, amount, receivedOn, earnedPeriod }) {
  parseDate(receivedOn);
  assertAmount(amount);
  const earned = earnedPeriod ?? shiftPeriod(periodIdOf(receivedOn), -1);
  parsePeriod(earned);
  return update(state, (d) => {
    d.pots.push({
      id: nextId(d, 'pot'), label: label ?? '', amount, receivedOn, earnedPeriod: earned,
      stockMin: d.settings.stockMin, spends: [],
    });
  });
}

function totalOverflow(state) {
  const ids = new Set(state.spends.map((s) => periodIdOf(s.date)));
  let t = 0;
  for (const id of ids) t += periodSummary(state, id).overflow;
  return t;
}

// Balance of every pot. Overspending beyond the base budget is taken from the oldest pot first,
// and only from the part above that pot's stock reserve.
export function potLedger(state) {
  const moved = {};
  for (const dep of state.stockDeposits) {
    for (const part of dep.parts) {
      if (part.type === 'pot') moved[part.potId] = (moved[part.potId] ?? 0) + part.amount;
    }
  }
  const fifo = state.pots
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.receivedOn ?? '').localeCompare(b.p.receivedOn ?? '') || a.i - b.i)
    .map((x) => x.p);

  let toDraw = totalOverflow(state);
  const pots = fifo.map((p) => {
    const stockMoved = moved[p.id] ?? 0;
    const spentOther = sum(p.spends.map((s) => s.amount));
    const before = p.amount - stockMoved - spentOther;
    const reserved = Math.min(Math.max(0, p.stockMin - stockMoved), Math.max(0, before));
    const free = Math.max(0, before - reserved);
    const drawn = Math.min(free, toDraw);
    toDraw -= drawn;
    return {
      id: p.id, label: p.label, amount: p.amount, receivedOn: p.receivedOn, earnedPeriod: p.earnedPeriod,
      stockMoved, spentOther, drawn, balance: before - drawn, reserved, free: free - drawn,
    };
  });

  return {
    pots,
    totals: {
      balance: sum(pots.map((p) => p.balance)),
      reserved: sum(pots.map((p) => p.reserved)),
      free: sum(pots.map((p) => p.free)),
    },
    shortfall: toDraw < 1e-9 ? 0 : toDraw, // overspend that no pot could cover
  };
}

// ---------------------------------------------------------------------------
// Stocks: leftover of closed months + salary reserves, deposited together to save on fees
// ---------------------------------------------------------------------------

export function leftoverStatus(state, today) {
  parseDate(today);
  const ids = new Set([
    ...Object.keys(state.periodOverrides),
    ...Object.keys(state.baseOverrides ?? {}),
    ...state.spends.map((s) => periodIdOf(s.date)),
  ]);
  for (const l of state.lumpSums) {
    for (let k = 0; k < l.months; k++) ids.add(shiftPeriod(l.firstPeriod, k));
  }
  const rows = [];
  for (const id of [...ids].sort()) {
    if (periodRange(id).end > today) continue; // period still open
    const s = periodSummary(state, id);
    const leftover = state.periodOverrides[id]?.leftover ?? (s.hasBudget ? s.leftover : 0);
    const deposited = sum(
      state.stockDeposits.flatMap((d) => d.parts.filter((p) => p.type === 'leftover' && p.periodId === id).map((p) => p.amount)),
    );
    rows.push({ periodId: id, leftover, deposited, pending: Math.max(0, leftover - deposited) });
  }
  return rows;
}

export function stockSummary(state, today) {
  const leftovers = leftoverStatus(state, today);
  const pendingLeftover = sum(leftovers.map((r) => r.pending));
  const reservedFromSalary = potLedger(state).totals.reserved;
  return { leftovers, pendingLeftover, reservedFromSalary, total: pendingLeftover + reservedFromSalary };
}

// parts: [{ type:'pot', potId, amount }, { type:'leftover', periodId, amount }]
export function recordStockDeposit(state, { date, parts }) {
  parseDate(date);
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('A stock deposit needs at least one part');
  const ledger = potLedger(state);
  const pending = Object.fromEntries(leftoverStatus(state, date).map((r) => [r.periodId, r.pending]));
  const usedPot = {};
  const usedLeft = {};
  for (const part of parts) {
    assertAmount(part.amount, 'deposit part amount');
    if (part.type === 'pot') {
      const pot = ledger.pots.find((p) => p.id === part.potId);
      if (!pot) throw new Error(`No pot with id "${part.potId}"`);
      usedPot[part.potId] = (usedPot[part.potId] ?? 0) + part.amount;
      if (usedPot[part.potId] > pot.balance + 1e-9) throw new Error(`Pot "${pot.label}" only has ${money(pot.balance)}`);
    } else if (part.type === 'leftover') {
      usedLeft[part.periodId] = (usedLeft[part.periodId] ?? 0) + part.amount;
      if (usedLeft[part.periodId] > (pending[part.periodId] ?? 0) + 1e-9) {
        throw new Error(`Period ${part.periodId} only has ${money(pending[part.periodId] ?? 0)} pending`);
      }
    } else {
      throw new Error(`Unknown deposit part type "${part.type}"`);
    }
  }
  return update(state, (d) => {
    d.stockDeposits.push({ id: nextId(d, 'dep'), date, parts: structuredClone(parts) });
  });
}

// ---------------------------------------------------------------------------
// Rent reminder (rent is tracked, not part of the monthly budget)
// ---------------------------------------------------------------------------

export function markRentPaid(state, dueId, paidOn) {
  parsePeriod(dueId);
  parseDate(paidOn);
  return update(state, (d) => {
    d.rentPaid[dueId] = paidOn;
  });
}

const rentAmount = (state, id) => lumpFor(state, id)?.rentPerMonth ?? state.settings.rentPerMonth ?? null;

// status: 'overdue' | 'due-today' | 'upcoming' | 'none'
export function rentReminder(state, today) {
  const pid = periodIdOf(today);
  const { start, end } = periodRange(pid);
  if (!state.rentPaid[pid]) {
    const daysLate = daysBetween(start, today);
    return {
      status: daysLate === 0 ? 'due-today' : 'overdue', periodId: pid, dueDate: start,
      daysLate, amount: rentAmount(state, pid),
    };
  }
  const nextId2 = shiftPeriod(pid, 1);
  const daysUntil = daysBetween(today, end);
  if (!state.rentPaid[nextId2] && daysUntil <= state.settings.rentRemindDays) {
    return {
      status: 'upcoming', periodId: nextId2, dueDate: end,
      daysUntil, amount: rentAmount(state, nextId2),
    };
  }
  return { status: 'none' };
}

// ---------------------------------------------------------------------------
// Irregular costs (flights etc.): tracked separately, never part of the monthly budget
// ---------------------------------------------------------------------------

export function addIrregular(state, { name, amount, date = null, status = 'planned' }) {
  assertAmount(amount);
  if (date !== null) parseDate(date);
  if (!['planned', 'paid'].includes(status)) throw new Error('status must be planned or paid');
  return update(state, (d) => {
    d.irregular.push({ id: nextId(d, 'irr'), name, amount, date, status });
  });
}

export function markIrregularPaid(state, id, date) {
  parseDate(date);
  if (!state.irregular.some((x) => x.id === id)) throw new Error(`No irregular cost with id "${id}"`);
  return update(state, (d) => {
    const item = d.irregular.find((x) => x.id === id);
    item.status = 'paid';
    item.date = date;
  });
}

export function irregularSummary(state) {
  const planned = state.irregular.filter((x) => x.status === 'planned');
  const paid = state.irregular.filter((x) => x.status === 'paid');
  return {
    planned, paid,
    plannedTotal: sum(planned.map((x) => x.amount)),
    paidTotal: sum(paid.map((x) => x.amount)),
  };
}

// ---------------------------------------------------------------------------
// Export / import (backup, since data lives only in the phone's browser storage)
// ---------------------------------------------------------------------------

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

const REQUIRED_KEYS = ['settings', 'lumpSums', 'instalments', 'spends', 'pots', 'stockDeposits', 'periodOverrides', 'rentPaid', 'irregular'];

export function importState(json) {
  let s;
  try {
    s = JSON.parse(json);
  } catch {
    throw new Error('Backup is not valid JSON');
  }
  if (!s || typeof s !== 'object' || s.version !== STATE_VERSION) {
    throw new Error(`Unsupported backup version (expected ${STATE_VERSION})`);
  }
  for (const k of REQUIRED_KEYS) {
    if (!(k in s)) throw new Error(`Backup is missing "${k}"`);
  }
  s.baseOverrides ??= {}; // added after the first backups were possible
  s.settings = { ...emptyState().settings, ...s.settings };
  return s;
}

// ---------------------------------------------------------------------------
// One call for the home screen
// ---------------------------------------------------------------------------

export function dashboard(state, today) {
  return {
    today,
    period: periodSummary(state, periodIdOf(today)),
    pots: potLedger(state),
    stock: stockSummary(state, today),
    rent: rentReminder(state, today),
    irregular: irregularSummary(state),
  };
}
