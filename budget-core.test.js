// Public tests. Made-up numbers only (the repo is public). Real-figure tests live in *.local.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './budget-core.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not close to ${b}`);

// A made-up setup: 6,000 for 3 months starting 28/1/2030, rent 1,500, one instalment of 30 x 4.
function sample() {
  let s = B.emptyState();
  s = B.addLumpSum(s, { firstPeriod: '2030-01', months: 3, amount: 6000, rentPerMonth: 1500 });
  s = B.addInstalment(s, { name: 'Gym', total: 120, months: 4, firstPeriod: '2029-12' });
  s = B.addSalary(s, { amount: 1200, receivedOn: '2030-01-30' }); // earned 28/12 to 28/1
  s = B.addBucket(s, { name: 'Holiday' });
  s = B.addTransfer(s, { date: '2030-01-28', from: { type: 'in' }, to: { type: 'bucket', bucketId: s.buckets[0].id }, amount: 800 });
  return s;
}
const potRef = (s) => ({ type: 'pot', potId: s.pots[0].id });
const bucketRef = (s) => ({ type: 'bucket', bucketId: s.buckets[0].id });
const budget = (periodId) => ({ type: 'budget', periodId });

// ---- Dates and periods -----------------------------------------------------

test('28th-to-28th periods', () => {
  assert.equal(B.periodIdOf('2030-02-02'), '2030-01');
  assert.equal(B.periodIdOf('2030-01-28'), '2030-01');
  assert.equal(B.periodIdOf('2030-02-27'), '2030-01');
  assert.equal(B.periodIdOf('2030-02-28'), '2030-02');
  assert.equal(B.periodIdOf('2030-01-05'), '2029-12');
  assert.deepEqual(B.periodRange('2030-12'), { start: '2030-12-28', end: '2031-01-28' });
  assert.equal(B.shiftPeriod('2030-11', 2), '2031-01');
  assert.equal(B.shiftPeriod('2030-01', -1), '2029-12');
  assert.equal(B.periodLabel('2030-09'), '28/9 to 28/10');
});

test('date helpers', () => {
  assert.equal(B.daysBetween('2030-01-28', '2030-02-02'), 5);
  assert.equal(B.addDays('2030-10-31', 1), '2030-11-01');
  assert.equal(B.todayISO(new Date(2030, 9, 2)), '2030-10-02');
  assert.equal(B.dm('2030-10-02'), '2/10');
  assert.throws(() => B.periodIdOf('2030-13-01'), /Invalid date/);
  assert.throws(() => B.periodIdOf('2/10/2030'), /Invalid date/);
});

test('weeks run Monday to Sunday', () => {
  assert.equal(B.dayOfWeek('2030-01-07'), 1); // a Monday
  assert.deepEqual(B.weekRange('2030-01-10'), { start: '2030-01-07', end: '2030-01-14' });
  assert.deepEqual(B.weekRange('2030-01-13'), { start: '2030-01-07', end: '2030-01-14' }); // Sunday
  assert.deepEqual(B.weekRange('2030-01-07'), { start: '2030-01-07', end: '2030-01-14' });
});

// ---- Plans -----------------------------------------------------------------

test('base budget = (lump sum - rent x months) / months, and overrides win', () => {
  let s = sample();
  close(B.baseBudgetFor(s, '2030-01'), 500);
  close(B.baseBudgetFor(s, '2030-03'), 500);
  assert.equal(B.baseBudgetFor(s, '2030-04'), null);
  s = B.setBaseOverride(s, '2030-02', 650);
  assert.equal(B.baseBudgetFor(s, '2030-02'), 650);
  s = B.clearBaseOverride(s, '2030-02');
  close(B.baseBudgetFor(s, '2030-02'), 500);
  assert.throws(() => B.setBaseOverride(s, '2030-02', -1), /base budget/);
  assert.throws(() => B.setBaseOverride(s, 'March', 100), /Invalid period/);
});

test('lump sums cannot overlap and can be removed', () => {
  const s = sample();
  assert.throws(() => B.addLumpSum(s, { firstPeriod: '2030-03', months: 3, amount: 6000, rentPerMonth: 1500 }), /already covers 28\/3/);
  assert.throws(() => B.addLumpSum(s, { firstPeriod: '2030-04', months: 3, amount: 3000, rentPerMonth: 1000 }), /use up/);
  assert.throws(() => B.addLumpSum(s, { firstPeriod: '2030-04', months: 0, amount: 3000, rentPerMonth: 0 }), /months/);
  const s2 = B.removeLumpSum(s, s.lumpSums[0].id);
  assert.equal(B.baseBudgetFor(s2, '2030-01'), null);
});

test('instalments come off the top while active, then drop off', () => {
  let s = sample();
  assert.deepEqual(B.fixedItemsFor(s, '2030-01').map((i) => [i.name, i.amount, i.number, i.of]), [['Gym', 30, 2, 4]]);
  assert.equal(B.fixedItemsFor(s, '2030-04').length, 0);
  close(B.periodSummary(s, '2030-01').available, 470);
  close(B.periodSummary(s, '2030-03').available, 470);
  s = B.removeInstalment(s, s.instalments[0].id);
  close(B.periodSummary(s, '2030-01').available, 500);
});

// ---- Spends ----------------------------------------------------------------

test('spends reduce what is left; per day left uses the days remaining', () => {
  let s = sample();
  s = B.addSpend(s, { date: '2030-01-29', amount: 80 });
  s = B.addSpend(s, { date: '2030-02-01', amount: 50, note: ' dinner ' });
  const p = B.periodSummary(s, '2030-01', '2030-02-02');
  close(p.spent, 130);
  close(p.remaining, 340);
  assert.equal(p.daysTotal, 31);
  assert.equal(p.daysLeft, 26); // 2/2 up to 28/2, today included
  close(p.perDayLeft, 340 / 26);
  close(p.dailyPace, 470 / 31);
  assert.equal(s.spends[1].note, 'dinner');
  // a spend on the 28th belongs to the next period
  s = B.addSpend(s, { date: '2030-02-28', amount: 10 });
  close(B.periodSummary(s, '2030-01').spent, 130);
  close(B.periodSummary(s, '2030-02').spent, 10);
});

test('going over the budget shows as negative; nothing is taken from salary by itself', () => {
  let s = sample();
  s = B.addSpend(s, { date: '2030-02-01', amount: 500 });
  const p = B.periodSummary(s, '2030-01');
  close(p.remaining, -30);
  assert.equal(p.level, 'over');
  close(B.potLedger(s).totals.balance, 1200);
});

test('editing and removing a spend', () => {
  let s = B.addSpend(sample(), { date: '2030-02-01', amount: 20 });
  const id = s.spends[0].id;
  s = B.editSpend(s, id, { amount: 25.5, note: 'lunch' });
  assert.deepEqual([s.spends[0].amount, s.spends[0].note, s.spends[0].date], [25.5, 'lunch', '2030-02-01']);
  s = B.editSpend(s, id, { date: '2030-02-28' });
  close(B.periodSummary(s, '2030-01').spent, 0);
  assert.throws(() => B.editSpend(s, id, { amount: 0 }), /amount/);
  s = B.removeSpend(s, id);
  assert.equal(s.spends.length, 0);
  assert.throws(() => B.removeSpend(s, id), /No spend/);
});

test('previous notes: newest first, each once, blank notes skipped', () => {
  let s = sample();
  s = B.addSpend(s, { date: '2030-02-01', amount: 20, note: 'Groceries' });
  s = B.addSpend(s, { date: '2030-02-02', amount: 15, note: 'Lunch' });
  s = B.addSpend(s, { date: '2030-02-03', amount: 30, note: 'groceries ' }); // same note, different case
  s = B.addSpend(s, { date: '2030-02-04', amount: 5 });
  s = B.addTransfer(s, { date: '2030-02-05', from: potRef(s), to: budget('2030-01'), amount: 10, note: 'Top up' });
  assert.deepEqual(B.recentNotes(s), ['Top up', 'groceries', 'Lunch']);
  assert.deepEqual(B.recentNotes(s, 2), ['Top up', 'groceries']);
  assert.deepEqual(B.recentNotes(B.emptyState()), []);
});

test('spend totals per day for the chart', () => {
  let s = sample();
  s = B.addSpend(s, { date: '2030-02-04', amount: 10 });
  s = B.addSpend(s, { date: '2030-02-04', amount: 5 });
  s = B.addSpend(s, { date: '2030-02-06', amount: 7 });
  const week = B.spendByDay(s, '2030-02-04', '2030-02-11');
  assert.equal(week.length, 7);
  assert.deepEqual(week.slice(0, 3).map((d) => d.total), [15, 0, 7]);
});

test('state updates do not mutate the old state', () => {
  const s0 = sample();
  const s1 = B.addSpend(s0, { date: '2030-02-02', amount: 5 });
  assert.equal(s0.spends.length, 0);
  assert.equal(s1.spends.length, 1);
});

test('input validation', () => {
  const s = sample();
  assert.throws(() => B.addSpend(s, { date: '2030-02-02', amount: -5 }), /amount/);
  assert.throws(() => B.addSpend(s, { date: '2030-02-02', amount: '20' }), /amount/);
  assert.throws(() => B.addSpend(s, { date: '2030-02-30', amount: 5 }), /Invalid date/);
});

// ---- Salary ----------------------------------------------------------------

test('salary label and earned month are filled in from the pay date, and can be edited', () => {
  let s = sample();
  const pot = s.pots[0];
  assert.equal(pot.earnedPeriod, '2029-12');
  assert.equal(pot.label, 't12-t1');
  assert.equal(pot.stockMin, 500);
  s = B.editSalary(s, pot.id, { label: 'Dec pay', amount: 1250 });
  assert.equal(s.pots[0].label, 'Dec pay');
  close(B.potLedger(s).totals.balance, 1250);
  assert.throws(() => B.editSalary(s, pot.id, { label: ' ' }), /Label/);
  assert.equal(B.salaryLabel('2030-09'), 't9-t10');
});

test('each salary keeps its stock minimum aside until that much has gone to stocks', () => {
  let s = sample();
  let pot = B.potLedger(s).pots[0];
  close(pot.reserved, 500);
  close(pot.free, 700);
  s = B.addTransfer(s, { date: '2030-02-01', from: potRef(s), to: { type: 'stocks' }, amount: 300 });
  pot = B.potLedger(s).pots[0];
  close(pot.balance, 900);
  close(pot.reserved, 200);
  close(pot.free, 700);
  // stock minimum is a setting, snapshotted per salary
  s = B.updateSettings(s, { stockMin: 700 });
  s = B.addSalary(s, { amount: 1000, receivedOn: '2030-03-01' });
  assert.equal(s.pots.at(-1).stockMin, 700);
  close(B.potLedger(s).pots[0].reserved, 200);
  assert.throws(() => B.updateSettings(s, { stockMin: -1 }), /stockMin/);
  assert.throws(() => B.updateSettings(s, { ceilingWarnPct: 0.7 }), /Unknown setting/);
});

test('a salary with transfers cannot be deleted', () => {
  let s = sample();
  s = B.addTransfer(s, { date: '2030-02-01', from: potRef(s), to: budget('2030-01'), amount: 50 });
  assert.throws(() => B.removeSalary(s, s.pots[0].id), /transfers/);
  s = B.removeTransfer(s, s.transfers.at(-1).id);
  s = B.removeSalary(s, s.pots[0].id);
  assert.equal(s.pots.length, 0);
});

// ---- Transfers -------------------------------------------------------------

test('salary to budget tops up the month', () => {
  let s = B.addSpend(sample(), { date: '2030-02-01', amount: 500 });
  s = B.addTransfer(s, { date: '2030-02-02', from: potRef(s), to: budget('2030-01'), amount: 50, note: 'cover' });
  const p = B.periodSummary(s, '2030-01');
  close(p.transfersIn, 50);
  close(p.total, 520);
  close(p.remaining, 20);
  assert.equal(p.level, 'ok');
  close(B.potLedger(s).pots[0].balance, 1150);
  const moves = B.transfersFor(s, budget('2030-01'));
  assert.deepEqual(moves.map((m) => [m.direction, m.amount, m.note]), [['in', 50, 'cover']]);
});

test('a category: add money, spend from it, move what is left', () => {
  let s = sample();
  s = B.addTransfer(s, { date: '2030-03-01', from: bucketRef(s), to: { type: 'out' }, amount: 720, note: 'Tickets' });
  let b = B.bucketLedger(s).buckets[0];
  close(b.spent, 720);
  close(b.balance, 80);
  s = B.addTransfer(s, { date: '2030-03-01', from: bucketRef(s), to: budget('2030-02'), amount: 80 });
  b = B.bucketLedger(s).buckets[0];
  close(b.balance, 0);
  close(B.periodSummary(s, '2030-02').remaining, 550);
});

test('transfers cannot take more than an account has', () => {
  const s = sample();
  assert.throws(() => B.addTransfer(s, { date: '2030-02-01', from: bucketRef(s), to: { type: 'out' }, amount: 800.01 }), /only has \$800\.00/);
  assert.throws(() => B.addTransfer(s, { date: '2030-02-01', from: potRef(s), to: { type: 'stocks' }, amount: 1201 }), /only has/);
  assert.throws(() => B.addTransfer(s, { date: '2030-02-01', from: budget('2030-01'), to: { type: 'stocks' }, amount: 471 }), /only has \$470\.00/);
});

test('transfer rules', () => {
  const s = sample();
  const go = (from, to) => () => B.addTransfer(s, { date: '2030-02-01', from, to, amount: 5 });
  assert.throws(go(potRef(s), potRef(s)), /same account/);
  assert.throws(go({ type: 'in' }, { type: 'stocks' }), /into an account first/);
  assert.throws(go({ type: 'stocks' }, potRef(s)), /cannot move from "stocks"/);
  assert.throws(go(potRef(s), { type: 'in' }), /cannot move to "in"/);
  assert.throws(go({ type: 'pot', potId: 'ghost' }, { type: 'out' }), /No salary/);
  assert.equal(B.accountName(s, budget('2030-01')), 'Budget 28/1 to 28/2');
  assert.equal(B.accountName(s, potRef(s)), 'Salary t12-t1');
  assert.equal(B.accountName(s, bucketRef(s)), 'Holiday');
});

test('categories: unique names, rename, delete only when empty', () => {
  let s = sample();
  assert.throws(() => B.addBucket(s, { name: 'holiday' }), /already/);
  assert.throws(() => B.addBucket(s, { name: '  ' }), /empty/);
  s = B.renameBucket(s, s.buckets[0].id, 'Trip');
  assert.equal(B.bucketLedger(s).buckets[0].name, 'Trip');
  assert.throws(() => B.removeBucket(s, s.buckets[0].id), /Move the \$800\.00/);
  s = B.addTransfer(s, { date: '2030-02-01', from: bucketRef(s), to: { type: 'out' }, amount: 800 });
  s = B.removeBucket(s, s.buckets[0].id);
  assert.equal(B.bucketLedger(s).buckets.length, 0); // hidden, history keeps its name
  assert.equal(B.accountName(s, { type: 'bucket', bucketId: s.buckets[0].id }), 'Trip');
  s = B.addBucket(s, { name: 'Trip' }); // the name is free again
  const fresh = s.buckets.at(-1).id;
  s = B.removeBucket(s, fresh);
  assert.equal(s.buckets.some((b) => b.id === fresh), false); // never used, so really deleted
});

// ---- Finished months -------------------------------------------------------

test('a finished month stays open with its leftover until it is moved or ticked', () => {
  let s = B.addSpend(sample(), { date: '2030-02-01', amount: 400 });
  assert.equal(B.monthsStatus(s, '2030-02-27').length, 0); // still running
  let m = B.monthsStatus(s, '2030-02-28');
  assert.deepEqual(m.map((r) => [r.periodId, r.status]), [['2030-01', 'open']]);
  close(m[0].remaining, 70);
  // move it to stocks: done
  s = B.addTransfer(s, { date: '2030-03-01', from: budget('2030-01'), to: { type: 'stocks' }, amount: 70, note: 'to stocks' });
  m = B.monthsStatus(s, '2030-03-01');
  assert.equal(m.find((r) => r.periodId === '2030-01').status, 'done');
  close(B.stocksSummary(s).sent, 70);
});

test('a month can be ticked done by hand, with a note, and unticked', () => {
  let s = B.addSpend(sample(), { date: '2030-02-01', amount: 400 });
  s = B.markMonthDone(s, '2030-01', { date: '2030-03-01', note: 'kept it' });
  let row = B.monthsStatus(s, '2030-03-01').find((r) => r.periodId === '2030-01');
  assert.deepEqual([row.status, row.doneNote], ['done', 'kept it']);
  s = B.unmarkMonthDone(s, '2030-01');
  row = B.monthsStatus(s, '2030-03-01').find((r) => r.periodId === '2030-01');
  assert.equal(row.status, 'open');
});

test('imported history: a month from before the app with its leftover', () => {
  let s = sample();
  s.periodOverrides['2029-11'] = { leftover: 90 };
  const row = B.monthsStatus(s, '2030-02-02').find((r) => r.periodId === '2029-11');
  assert.equal(row.status, 'open');
  close(row.remaining, 90);
  s = B.addTransfer(s, { date: '2030-02-02', from: budget('2029-11'), to: bucketRef(s), amount: 90 });
  close(B.bucketLedger(s).buckets[0].balance, 890);
});

// ---- Rent ------------------------------------------------------------------

test('rent reminder: overdue, quiet, two days before, due today', () => {
  let s = B.updateSettings(B.emptyState(), { rentPerMonth: 1400 });
  const r0 = B.rentReminder(s, '2030-02-02');
  assert.deepEqual([r0.status, r0.daysLate, r0.amount], ['overdue', 5, 1400]);
  s = B.markRentPaid(s, '2030-01', '2030-01-28');
  assert.equal(B.rentReminder(s, '2030-02-02').status, 'none');
  assert.equal(B.rentReminder(s, '2030-02-25').status, 'none');
  const r1 = B.rentReminder(s, '2030-02-26');
  assert.deepEqual([r1.status, r1.daysUntil, r1.dueDate], ['upcoming', 2, '2030-02-28']);
  assert.equal(B.rentReminder(s, '2030-02-28').status, 'due-today');
  s = B.markRentPaid(s, '2030-02', '2030-02-26');
  assert.equal(B.rentReminder(s, '2030-02-27').status, 'none');
  s = B.unmarkRentPaid(s, '2030-02');
  assert.equal(B.rentReminder(s, '2030-02-27').status, 'upcoming');
  assert.equal(B.rentAmount(sample(), '2030-02'), 1500); // the lump sum's rent wins
});

// ---- Backup ----------------------------------------------------------------

test('export and import round-trip', () => {
  const s = B.addSpend(sample(), { date: '2030-02-02', amount: 25, note: 'lunch' });
  assert.deepEqual(B.importState(B.exportState(s)), s);
});

test('import rejects bad backups', () => {
  assert.throws(() => B.importState('not json'), /not valid JSON/);
  assert.throws(() => B.importState('{"version":99}'), /Unsupported/);
  const broken = JSON.parse(B.exportState(B.emptyState()));
  delete broken.transfers;
  assert.throws(() => B.importState(JSON.stringify(broken)), /missing "transfers"/);
});

test('version 1 backups are upgraded: pot spends, deposits and irregular costs become transfers', () => {
  const v1 = {
    version: 1, seq: 3,
    settings: { stockMin: 500, rentRemindDays: 2, ceilingWarnPct: 0.9, rentPerMonth: 1400 },
    lumpSums: [], baseOverrides: { '2030-01': 600 }, instalments: [],
    spends: [{ id: 's1', date: '2030-02-01', amount: 100, note: '' }],
    pots: [{ id: 'p1', label: 'jan', amount: 1000, receivedOn: null, earnedPeriod: null, stockMin: 500, spends: [{ amount: 40, note: 'gift' }] }],
    stockDeposits: [{ id: 'd1', date: '2030-03-01', parts: [{ type: 'pot', potId: 'p1', amount: 500 }, { type: 'leftover', periodId: '2030-01', amount: 500 }] }],
    periodOverrides: {}, rentPaid: {},
    irregular: [{ id: 'i1', name: 'Flights', amount: 700, date: null, status: 'planned' }],
  };
  const s = B.importState(JSON.stringify(v1));
  assert.equal(s.version, 2);
  assert.equal('ceilingWarnPct' in s.settings, false);
  assert.equal('spends' in s.pots[0], false);
  const pot = B.potLedger(s).pots[0];
  close(pot.balance, 460); // 1000 - 40 - 500 to stocks
  close(pot.reserved, 0);
  close(B.periodSummary(s, '2030-01').remaining, 0); // 600 - 100 spent - 500 to stocks
  close(B.bucketLedger(s).buckets[0].balance, 700);
  assert.equal(B.bucketLedger(s).buckets[0].name, 'Flights');
});

// ---- Home ------------------------------------------------------------------

test('dashboard puts it all together', () => {
  assert.equal(B.dashboard(B.emptyState(), '2030-02-02').empty, true);
  const d = B.dashboard(sample(), '2030-02-02');
  assert.equal(d.empty, false);
  assert.equal(d.period.periodId, '2030-01');
  close(d.period.remaining, 470);
  close(d.salary.totals.balance, 1200);
  close(d.other.totals.balance, 800);
  close(d.stocks.stillFromSalary, 500);
});

test('rounding only happens at display time', () => {
  assert.equal(B.round2(-0.0001), 0);
  assert.equal(B.money(-0.0001), '$0.00');
  assert.equal(B.money(-12.345), '-$12.35');
  assert.equal(B.money(1.005), '$1.01');
  assert.equal(B.money(878.3333333333334), '$878.33');
});
