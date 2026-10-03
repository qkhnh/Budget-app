// budget-core.js
// Pure budget logic. No UI, no storage, no dependencies. Works in Node and in the browser.
//
// Conventions
// - Money is a plain number at full precision. Round only for display (round2 / money).
// - Dates are 'YYYY-MM-DD' strings. Pass "today" in explicitly so everything stays testable.
// - A budget period runs from the 28th to the next 28th (end date exclusive).
//   Its id is the month of the starting 28th: '2026-09' = 2026-09-28 up to 2026-10-28.
// - Every state-changing function returns a NEW state and leaves the old one untouched.
//
// Accounts work like bank accounts. Money moves between them with transfers.
//   { type: 'budget', periodId }  one month's budget. Spends come out of here.
//   { type: 'pot', potId }        one month's salary
//   { type: 'bucket', bucketId }  one category in Other expenses (Birthday, Flights, ...)
//   { type: 'stocks' }            money sent to the broker (only as "to")
//   { type: 'out' }               money spent outside the monthly budget, e.g. bought the flights (only as "to")
//   { type: 'in' }                new money from outside, e.g. from parents (only as "from")
// Nothing ever moves by itself. Leftover stays in its month until K moves it.

export const STATE_VERSION = 2;

const DAY_MS = 86400000;
const EPS = 1e-9;
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

// 'YYYY-MM-DD' -> 'd/m', the way K writes dates.
export const dm = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

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

// 0 = Sunday ... 6 = Saturday
export const dayOfWeek = (s) => new Date(parseDate(s).ms).getUTCDay();

// The Monday-to-Sunday week that contains the date (end exclusive).
export function weekRange(date) {
  const start = addDays(date, -((dayOfWeek(date) + 6) % 7));
  return { start, end: addDays(start, 7) };
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

export function periodLabel(id) {
  const { start, end } = periodRange(id);
  return `${dm(start)} to ${dm(end)}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function emptyState() {
  return {
    version: STATE_VERSION,
    seq: 0,
    settings: {
      stockMin: 500, // minimum of each month's salary to send to stocks
      rentRemindDays: 2, // remind this many days before the 28th
      rentPerMonth: null, // used for the rent reminder when no lump sum covers the period
    },
    lumpSums: [], // { id, firstPeriod, months, amount, rentPerMonth }
    baseOverrides: {}, // fixed base budget for one period, wins over the lump sum: { '2026-03': 900 }
    instalments: [], // { id, name, total, months, firstPeriod }
    spends: [], // budget spends: { id, date, amount, note }
    pots: [], // salary: { id, label, amount, receivedOn, earnedPeriod, stockMin }
    buckets: [], // Other expenses categories: { id, name, closed? }
    transfers: [], // { id, date, from, to, amount, note }  (date can be null for history from before the app)
    periodOverrides: {}, // history from before the app: { '2026-08': { leftover: 208 } }
    monthsDone: {}, // finished months K has ticked off: { '2026-08': { date, note } }
    rentPaid: {}, // { '2026-09': '2026-09-28' }  (key = period whose 28th the rent is due)
  };
}

export function isEmpty(state) {
  return !state.lumpSums.length && !Object.keys(state.baseOverrides).length && !state.pots.length
    && !state.spends.length && !state.buckets.length && !state.transfers.length
    && !Object.keys(state.periodOverrides).length;
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

function assertName(name, what = 'Name') {
  const n = String(name ?? '').trim();
  if (!n) throw new Error(`${what} cannot be empty`);
  return n;
}

function assertMonths(n) {
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error('months must be a whole number from 1 to 60');
}

function findOrThrow(list, id, what) {
  const x = list.find((i) => i.id === id);
  if (!x) throw new Error(`No ${what} with id "${id}"`);
  return x;
}

export function updateSettings(state, patch) {
  return update(state, (d) => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in d.settings)) throw new Error(`Unknown setting "${k}"`);
      if (k === 'stockMin' && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error('stockMin must be 0 or more');
      if (k === 'rentRemindDays' && !(Number.isInteger(v) && v >= 0 && v <= 7)) throw new Error('rentRemindDays must be 0 to 7');
      if (k === 'rentPerMonth' && !(v === null || (typeof v === 'number' && v > 0))) throw new Error('rentPerMonth must be a positive number');
      d.settings[k] = v;
    }
  });
}

// ---------------------------------------------------------------------------
// Plans: lump sums, base overrides, instalments
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

export function addLumpSum(state, { firstPeriod, months, amount, rentPerMonth }) {
  parsePeriod(firstPeriod);
  assertMonths(months);
  assertAmount(amount, 'lump sum');
  if (!(typeof rentPerMonth === 'number' && Number.isFinite(rentPerMonth) && rentPerMonth >= 0)) {
    throw new Error('rent per month must be 0 or more');
  }
  if (rentPerMonth * months >= amount) throw new Error('Rent would use up the whole lump sum');
  for (let k = 0; k < months; k++) {
    const id = shiftPeriod(firstPeriod, k);
    if (lumpFor(state, id)) throw new Error(`A lump sum already covers ${periodLabel(id)}`);
  }
  return update(state, (d) => {
    d.lumpSums.push({ id: nextId(d, 'lump'), firstPeriod, months, amount, rentPerMonth });
  });
}

export function removeLumpSum(state, id) {
  findOrThrow(state.lumpSums, id, 'lump sum');
  return update(state, (d) => {
    d.lumpSums = d.lumpSums.filter((l) => l.id !== id);
  });
}

// Monthly budget excluding rent. A per-period override wins.
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

export function clearBaseOverride(state, periodId) {
  if (!(periodId in (state.baseOverrides ?? {}))) throw new Error(`No base override for ${periodId}`);
  return update(state, (d) => {
    delete d.baseOverrides[periodId];
  });
}

export function addInstalment(state, { name, total, months, firstPeriod }) {
  const n = assertName(name);
  assertAmount(total, 'total');
  assertMonths(months);
  parsePeriod(firstPeriod);
  return update(state, (d) => {
    d.instalments.push({ id: nextId(d, 'inst'), name: n, total, months, firstPeriod });
  });
}

export function removeInstalment(state, id) {
  findOrThrow(state.instalments, id, 'instalment');
  return update(state, (d) => {
    d.instalments = d.instalments.filter((x) => x.id !== id);
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
// Spends (out of the monthly budget)
// ---------------------------------------------------------------------------

export function addSpend(state, { date, amount, note = '' }) {
  parseDate(date);
  assertAmount(amount);
  return update(state, (d) => {
    d.spends.push({ id: nextId(d, 's'), date, amount, note: String(note).trim() });
  });
}

export function editSpend(state, id, patch) {
  const cur = findOrThrow(state.spends, id, 'spend');
  const next = { ...cur, ...patch };
  parseDate(next.date);
  assertAmount(next.amount);
  return update(state, (d) => {
    const s = d.spends.find((x) => x.id === id);
    s.date = next.date;
    s.amount = next.amount;
    s.note = String(next.note ?? '').trim();
  });
}

export function removeSpend(state, id) {
  findOrThrow(state.spends, id, 'spend');
  return update(state, (d) => {
    d.spends = d.spends.filter((s) => s.id !== id);
  });
}

// Spends with start <= date < end, oldest first.
export function spendsBetween(state, start, end) {
  return state.spends.filter((s) => s.date >= start && s.date < end).sort((a, b) => a.date.localeCompare(b.date));
}

export function spendsInPeriod(state, periodId) {
  const { start, end } = periodRange(periodId);
  return spendsBetween(state, start, end);
}

// One entry per day with start <= date < end, for the charts.
export function spendByDay(state, start, end) {
  const totals = {};
  for (const s of spendsBetween(state, start, end)) totals[s.date] = (totals[s.date] ?? 0) + s.amount;
  const days = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push({ date: d, total: totals[d] ?? 0 });
  return days;
}

// ---------------------------------------------------------------------------
// Transfers between accounts
// ---------------------------------------------------------------------------

const FROM_TYPES = new Set(['budget', 'pot', 'bucket', 'in']);
const TO_TYPES = new Set(['budget', 'pot', 'bucket', 'stocks', 'out']);

export const sameAccount = (a, b) => Boolean(a && b) && a.type === b.type
  && a.periodId === b.periodId && a.potId === b.potId && a.bucketId === b.bucketId;

function cleanRef(ref) {
  if (ref.type === 'budget') return { type: 'budget', periodId: ref.periodId };
  if (ref.type === 'pot') return { type: 'pot', potId: ref.potId };
  if (ref.type === 'bucket') return { type: 'bucket', bucketId: ref.bucketId };
  return { type: ref.type };
}

function checkAccount(state, ref, dir) {
  const ok = dir === 'from' ? FROM_TYPES : TO_TYPES;
  if (!ref || !ok.has(ref.type)) throw new Error(`Money cannot move ${dir} "${ref?.type}"`);
  if (ref.type === 'budget') parsePeriod(ref.periodId);
  if (ref.type === 'pot') findOrThrow(state.pots, ref.potId, 'salary');
  if (ref.type === 'bucket') {
    const b = findOrThrow(state.buckets, ref.bucketId, 'category');
    if (b.closed) throw new Error(`Category "${b.name}" was deleted`);
  }
}

export function accountName(state, ref) {
  switch (ref.type) {
    case 'budget': return `Budget ${periodLabel(ref.periodId)}`;
    case 'pot': {
      const p = state.pots.find((x) => x.id === ref.potId);
      return `Salary ${p?.label || ref.potId}`;
    }
    case 'bucket': return state.buckets.find((x) => x.id === ref.bucketId)?.name ?? 'Deleted category';
    case 'stocks': return 'Stocks';
    case 'out': return 'Spent';
    case 'in': return 'New money';
    default: return ref.type;
  }
}

function flowsFor(state, ref) {
  let inn = 0;
  let out = 0;
  for (const t of state.transfers) {
    if (sameAccount(t.to, ref)) inn += t.amount;
    if (sameAccount(t.from, ref)) out += t.amount;
  }
  return { in: inn, out };
}

// Current balance of an account. Null for stocks / out / in, which have no balance.
export function balanceOf(state, ref) {
  if (ref.type === 'budget') return periodSummary(state, ref.periodId).remaining;
  if (ref.type === 'pot') return potLedger(state).pots.find((p) => p.id === ref.potId)?.balance ?? 0;
  if (ref.type === 'bucket') return bucketLedger(state, { all: true }).buckets.find((b) => b.id === ref.bucketId)?.balance ?? 0;
  return null;
}

export function addTransfer(state, { date, from, to, amount, note = '' }) {
  parseDate(date);
  assertAmount(amount);
  checkAccount(state, from, 'from');
  checkAccount(state, to, 'to');
  if (sameAccount(from, to)) throw new Error('From and To are the same account');
  if (from.type === 'in' && (to.type === 'out' || to.type === 'stocks')) {
    throw new Error('New money has to go into an account first');
  }
  if (from.type !== 'in') {
    const bal = balanceOf(state, from);
    if (amount > bal + EPS) throw new Error(`${accountName(state, from)} only has ${money(Math.max(0, bal))}`);
  }
  return update(state, (d) => {
    d.transfers.push({
      id: nextId(d, 't'), date, from: cleanRef(from), to: cleanRef(to), amount, note: String(note).trim(),
    });
  });
}

export function removeTransfer(state, id) {
  findOrThrow(state.transfers, id, 'transfer');
  return update(state, (d) => {
    d.transfers = d.transfers.filter((t) => t.id !== id);
  });
}

// Transfers in or out of one account, oldest first (history with no date comes first).
export function transfersFor(state, ref) {
  return state.transfers
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => sameAccount(t.from, ref) || sameAccount(t.to, ref))
    .sort((a, b) => (a.t.date ?? '').localeCompare(b.t.date ?? '') || a.i - b.i)
    .map(({ t }) => ({ ...t, direction: sameAccount(t.to, ref) ? 'in' : 'out' }));
}

// ---------------------------------------------------------------------------
// Period summary: the main number K watches
// ---------------------------------------------------------------------------
//   available  = base budget minus upfront items
//   opening    = available, or the leftover imported from before the app
//   total      = opening + transfers in - transfers out
//   remaining  = total - spent (below 0 means over budget)

export function periodSummary(state, periodId, today = null) {
  const base = baseBudgetFor(state, periodId);
  const hasBudget = base !== null;
  const fixed = fixedItemsFor(state, periodId);
  const fixedTotal = sum(fixed.map((f) => f.amount));
  const available = hasBudget ? base - fixedTotal : 0;
  const importedLeftover = state.periodOverrides?.[periodId]?.leftover;
  const imported = typeof importedLeftover === 'number';
  const opening = imported ? importedLeftover : available;
  const flows = flowsFor(state, { type: 'budget', periodId });
  const total = opening + flows.in - flows.out;
  const spends = spendsInPeriod(state, periodId);
  const spent = sum(spends.map((s) => s.amount));
  const remaining = total - spent;
  const { start, end } = periodRange(periodId);

  const r = {
    periodId, start, end, hasBudget, imported, base, fixed, fixedTotal, available, opening,
    transfersIn: flows.in, transfersOut: flows.out, total, spends, spent, remaining,
    level: round2(remaining) < 0 ? 'over' : 'ok',
  };
  if (today) {
    parseDate(today);
    const daysTotal = daysBetween(start, end);
    let daysLeft = 0;
    if (today < start) daysLeft = daysTotal;
    else if (today < end) daysLeft = daysBetween(today, end); // today counts as a day left
    r.daysTotal = daysTotal;
    r.daysLeft = daysLeft;
    r.perDayLeft = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
    r.dailyPace = total > 0 ? total / daysTotal : 0; // even spread of the month's money, for the chart line
  }
  return r;
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

// Pay earned 28/9 to 28/10 (period '2026-09') -> 't9-t10', like K's Notes.
export function salaryLabel(earnedPeriod) {
  const { m } = parsePeriod(earnedPeriod);
  return `t${m}-t${m === 12 ? 1 : m + 1}`;
}

// Log the pay that actually landed. earnedPeriod defaults to the period just before the one the
// money arrived in (pay lands around the 30th / 1st for work done up to the 28th).
export function addSalary(state, { label, amount, receivedOn, earnedPeriod }) {
  parseDate(receivedOn);
  assertAmount(amount);
  const earned = earnedPeriod || shiftPeriod(periodIdOf(receivedOn), -1);
  parsePeriod(earned);
  const name = String(label ?? '').trim() || salaryLabel(earned);
  return update(state, (d) => {
    d.pots.push({ id: nextId(d, 'pot'), label: name, amount, receivedOn, earnedPeriod: earned, stockMin: d.settings.stockMin });
  });
}

export function editSalary(state, id, patch) {
  const cur = findOrThrow(state.pots, id, 'salary');
  const next = { ...cur, ...patch };
  next.label = assertName(next.label, 'Label');
  assertAmount(next.amount);
  if (next.receivedOn !== null) parseDate(next.receivedOn);
  if (next.earnedPeriod !== null) parsePeriod(next.earnedPeriod);
  if (!(typeof next.stockMin === 'number' && next.stockMin >= 0)) throw new Error('stock minimum must be 0 or more');
  return update(state, (d) => {
    Object.assign(d.pots.find((p) => p.id === id), {
      label: next.label, amount: next.amount, receivedOn: next.receivedOn, earnedPeriod: next.earnedPeriod, stockMin: next.stockMin,
    });
  });
}

export function removeSalary(state, id) {
  findOrThrow(state.pots, id, 'salary');
  if (transfersFor(state, { type: 'pot', potId: id }).length) {
    throw new Error('This salary has transfers. Delete those first.');
  }
  return update(state, (d) => {
    d.pots = d.pots.filter((p) => p.id !== id);
  });
}

// Balance of every salary month. Each month keeps its stock minimum aside until that much
// has gone to stocks; the rest is free.
export function potLedger(state) {
  const pots = state.pots
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.receivedOn ?? '').localeCompare(b.p.receivedOn ?? '') || a.i - b.i)
    .map(({ p }) => {
      const ref = { type: 'pot', potId: p.id };
      const flows = flowsFor(state, ref);
      const toStocks = sum(state.transfers.filter((t) => sameAccount(t.from, ref) && t.to.type === 'stocks').map((t) => t.amount));
      const balance = p.amount + flows.in - flows.out;
      const reserved = Math.min(Math.max(0, p.stockMin - toStocks), Math.max(0, balance));
      return {
        id: p.id, label: p.label, amount: p.amount, receivedOn: p.receivedOn, earnedPeriod: p.earnedPeriod,
        stockMin: p.stockMin, transfersIn: flows.in, transfersOut: flows.out, toStocks, balance, reserved, free: balance - reserved,
      };
    });
  return {
    pots,
    totals: {
      balance: sum(pots.map((p) => p.balance)),
      reserved: sum(pots.map((p) => p.reserved)),
      free: sum(pots.map((p) => p.free)),
    },
  };
}

// ---------------------------------------------------------------------------
// Other expenses: categories K names himself (Birthday, Flights, ...)
// ---------------------------------------------------------------------------

function assertUniqueBucket(state, name, exceptId = null) {
  const taken = state.buckets.some((b) => !b.closed && b.id !== exceptId && b.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`There is already a category called "${name}"`);
}

export function addBucket(state, { name }) {
  const n = assertName(name);
  assertUniqueBucket(state, n);
  return update(state, (d) => {
    d.buckets.push({ id: nextId(d, 'b'), name: n });
  });
}

export function renameBucket(state, id, name) {
  findOrThrow(state.buckets, id, 'category');
  const n = assertName(name);
  assertUniqueBucket(state, n, id);
  return update(state, (d) => {
    d.buckets.find((b) => b.id === id).name = n;
  });
}

// A category with history is hidden rather than erased, so old transfers still show its name.
export function removeBucket(state, id) {
  findOrThrow(state.buckets, id, 'category');
  const ref = { type: 'bucket', bucketId: id };
  const bal = balanceOf(state, ref);
  if (Math.abs(round2(bal)) > 0) throw new Error(`Move the ${money(bal)} out of this category first`);
  const used = transfersFor(state, ref).length > 0;
  return update(state, (d) => {
    if (used) d.buckets.find((b) => b.id === id).closed = true;
    else d.buckets = d.buckets.filter((b) => b.id !== id);
  });
}

export function bucketLedger(state, { all = false } = {}) {
  const buckets = state.buckets
    .filter((b) => all || !b.closed)
    .map((b) => {
      const ref = { type: 'bucket', bucketId: b.id };
      const flows = flowsFor(state, ref);
      const spent = sum(state.transfers.filter((t) => sameAccount(t.from, ref) && t.to.type === 'out').map((t) => t.amount));
      return { id: b.id, name: b.name, closed: Boolean(b.closed), transfersIn: flows.in, transfersOut: flows.out, spent, balance: flows.in - flows.out };
    });
  return { buckets, totals: { balance: sum(buckets.map((b) => b.balance)) } };
}

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

export function stocksSummary(state) {
  const deposits = state.transfers.filter((t) => t.to.type === 'stocks');
  return {
    sent: sum(deposits.map((t) => t.amount)),
    stillFromSalary: potLedger(state).totals.reserved, // stock minimums not sent yet
    deposits,
  };
}

// ---------------------------------------------------------------------------
// Finished months: what was left, and whether K has dealt with it
// ---------------------------------------------------------------------------

function knownPeriods(state) {
  const ids = new Set([
    ...Object.keys(state.periodOverrides),
    ...Object.keys(state.baseOverrides ?? {}),
    ...state.spends.map((s) => periodIdOf(s.date)),
  ]);
  for (const l of state.lumpSums) {
    for (let k = 0; k < l.months; k++) ids.add(shiftPeriod(l.firstPeriod, k));
  }
  for (const t of state.transfers) {
    if (t.from.type === 'budget') ids.add(t.from.periodId);
    if (t.to.type === 'budget') ids.add(t.to.periodId);
  }
  return [...ids].sort();
}

// Months that have ended, newest first. A month is done when K ticked it, or when nothing is left.
export function monthsStatus(state, today) {
  parseDate(today);
  const rows = [];
  for (const id of knownPeriods(state).reverse()) {
    const p = periodSummary(state, id);
    if (p.end > today) continue; // still running
    if (!p.hasBudget && !p.imported && p.spends.length === 0 && p.transfersIn === 0) continue;
    const ticked = state.monthsDone?.[id] ?? null;
    const empty = round2(p.remaining) === 0;
    rows.push({
      periodId: id, start: p.start, end: p.end, label: periodLabel(id), total: p.total, spent: p.spent,
      remaining: p.remaining, status: ticked || empty ? 'done' : 'open',
      doneOn: ticked?.date ?? null, doneNote: ticked?.note ?? '',
      moves: transfersFor(state, { type: 'budget', periodId: id }),
    });
  }
  return rows;
}

export function markMonthDone(state, periodId, { date, note = '' }) {
  parsePeriod(periodId);
  parseDate(date);
  return update(state, (d) => {
    d.monthsDone = { ...(d.monthsDone ?? {}), [periodId]: { date, note: String(note).trim() } };
  });
}

export function unmarkMonthDone(state, periodId) {
  return update(state, (d) => {
    delete d.monthsDone?.[periodId];
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

export function unmarkRentPaid(state, dueId) {
  return update(state, (d) => {
    delete d.rentPaid[dueId];
  });
}

export const rentAmount = (state, id) => lumpFor(state, id)?.rentPerMonth ?? state.settings.rentPerMonth ?? null;

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
  const nextPid = shiftPeriod(pid, 1);
  const daysUntil = daysBetween(today, end);
  if (!state.rentPaid[nextPid] && daysUntil <= state.settings.rentRemindDays) {
    return {
      status: 'upcoming', periodId: nextPid, dueDate: end,
      daysUntil, amount: rentAmount(state, nextPid),
    };
  }
  return { status: 'none' };
}

// ---------------------------------------------------------------------------
// Export / import (backup, since data lives only in the phone's browser storage)
// ---------------------------------------------------------------------------

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

const REQUIRED_V1 = ['settings', 'lumpSums', 'instalments', 'spends', 'pots', 'stockDeposits', 'periodOverrides', 'rentPaid', 'irregular'];
const REQUIRED_V2 = ['settings', 'lumpSums', 'instalments', 'spends', 'pots', 'buckets', 'transfers', 'periodOverrides', 'rentPaid'];

// Version 1 had automatic salary draws, a stock pool and irregular costs. They become plain transfers.
function migrateV1(old) {
  const s = emptyState();
  s.seq = old.seq ?? 0;
  const { ceilingWarnPct, ...settings } = old.settings ?? {};
  s.settings = { ...s.settings, ...settings };
  for (const k of ['lumpSums', 'instalments', 'spends', 'periodOverrides', 'rentPaid']) s[k] = old[k];
  s.baseOverrides = old.baseOverrides ?? {};
  const t = (date, from, to, amount, note) => s.transfers.push({ id: nextId(s, 't'), date, from, to, amount, note });

  for (const p of old.pots) {
    const { spends = [], ...pot } = p;
    s.pots.push(pot);
    for (const x of spends) t(null, { type: 'pot', potId: p.id }, { type: 'out' }, x.amount, x.note ?? '');
  }
  for (const dep of old.stockDeposits) {
    for (const part of dep.parts) {
      const from = part.type === 'pot' ? { type: 'pot', potId: part.potId } : { type: 'budget', periodId: part.periodId };
      t(dep.date ?? null, from, { type: 'stocks' }, part.amount, '');
    }
  }
  for (const x of old.irregular) {
    const id = nextId(s, 'b');
    s.buckets.push({ id, name: x.name });
    t(x.date ?? null, { type: 'in' }, { type: 'bucket', bucketId: id }, x.amount, '');
    if (x.status === 'paid') t(x.date ?? null, { type: 'bucket', bucketId: id }, { type: 'out' }, x.amount, '');
  }
  return s;
}

export function importState(json) {
  let s;
  try {
    s = JSON.parse(json);
  } catch {
    throw new Error('Backup is not valid JSON');
  }
  if (!s || typeof s !== 'object' || (s.version !== 1 && s.version !== STATE_VERSION)) {
    throw new Error(`Unsupported backup version (expected ${STATE_VERSION})`);
  }
  for (const k of s.version === 1 ? REQUIRED_V1 : REQUIRED_V2) {
    if (!(k in s)) throw new Error(`Backup is missing "${k}"`);
  }
  if (s.version === 1) return migrateV1(s);
  s.baseOverrides ??= {};
  s.monthsDone ??= {};
  s.settings = { ...emptyState().settings, ...s.settings };
  return s;
}

// ---------------------------------------------------------------------------
// One call for the home screen
// ---------------------------------------------------------------------------

export function dashboard(state, today) {
  const months = monthsStatus(state, today);
  return {
    today,
    empty: isEmpty(state),
    period: periodSummary(state, periodIdOf(today), today),
    salary: potLedger(state),
    other: bucketLedger(state),
    stocks: stocksSummary(state),
    openMonths: months.filter((m) => m.status === 'open'),
    rent: rentReminder(state, today),
  };
}
