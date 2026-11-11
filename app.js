// app.js
// Glue between the screens and budget-core.js. All maths lives in budget-core.js; this file only
// keeps the state, saves it, draws the screens and handles taps.
// Data is kept in this browser's localStorage. Use Export backup to keep a copy.

import * as B from './budget-core.js';
import { renderHome, renderInsights, renderAccounts, renderSettings, ring } from './views.js';
import { renderSheet, amountHTML, FLOWS, flowStart, flowPreview, flowReady, pickText } from './sheets.js';
import { esc, fmt, icon, parseRefKey } from './ui.js';
import { countUp, stagger, setCount, initScrub, bindRuler, reduced } from './motion.js';

const KEY = 'budget-state-v1'; // storage key from the first version; the data inside carries its own version
const THEME_KEY = 'budget-theme-v2'; // 'light' | 'dark' | 'system', a per-phone display choice (not budget data). Starts light.
const APP_VERSION = '0.2.17';

const $view = document.getElementById('view');
const $tabs = document.getElementById('tabs');
const $sheets = document.getElementById('sheets');
const $toast = document.getElementById('toast');

let state = null;
const ui = {
  tab: 'home',
  theme: loadTheme(),
  homeAll: false, // Home shows every transaction of the month instead of the latest few
  insights: { mode: 'month', periodId: null, weekOf: null },
  sheets: [], // stack of open sheets, top = last
};

// ---- Storage --------------------------------------------------------------------

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}

// System follows the phone; Light and Dark override it (also for the status bar colour).
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const forced = { light: '#f2f2f2', dark: '#111110' }[theme];
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.dataset.original ??= m.content;
    m.content = forced ?? m.dataset.original;
  }
}

function load() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, B.exportState(state)); } catch { /* storage blocked: Export backup still works */ }
}

// ---- Dialog (the app's own pop-up, instead of the phone's plain one) -----------------

const $dialog = document.getElementById('dialog');
let closeDialog = null;

// Asks a question and resolves true (OK) or false (Cancel, or a tap outside).
// danger: the OK button is red, for deleting things. cancel: null shows only one button.
function ask(message, { ok = 'OK', cancel = 'Cancel', danger = false, detail = '' } = {}) {
  closeDialog?.(false);
  return new Promise((resolve) => {
    $dialog.innerHTML = `<div class="dialog-backdrop" data-dialog="no"></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(message)}">
        <p class="dialog-title">${esc(message)}</p>
        ${detail ? `<p class="sub dialog-detail">${esc(detail)}</p>` : ''}
        <div class="dialog-actions">
          ${cancel === null ? '' : `<button class="btn soft" data-dialog="no">${esc(cancel)}</button>`}
          <button class="btn ${danger ? 'btn-danger' : ''}" data-dialog="yes">${esc(ok)}</button>
        </div>
      </div>`;
    $dialog.className = 'open';
    closeDialog = (answer) => {
      closeDialog = null;
      $dialog.className = 'leaving';
      setTimeout(() => { if (!closeDialog) { $dialog.className = ''; $dialog.innerHTML = ''; } }, 200);
      resolve(answer);
    };
  });
}
const notice = (message) => ask(message, { ok: 'OK', cancel: null });

$dialog.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dialog]');
  if (b) closeDialog?.(b.dataset.dialog === 'yes');
});

// Runs a core change. Shows the error and returns false if the core refuses it.
function apply(fn) {
  try {
    state = fn(state);
  } catch (e) {
    notice(e.message);
    return false;
  }
  save();
  return true;
}

// Typed amounts: accepts "12.5" and "12,5".
function num(v) {
  const t = String(v ?? '').trim();
  return Number(t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.'));
}

async function init() {
  applyTheme(ui.theme);
  const raw = load();
  if (raw) {
    try { state = B.importState(raw); } catch { state = null; }
  }
  if (!state) {
    // seed.local.js holds the personal starting data and is never published. Without it we start empty.
    try { state = (await import('./seed.local.js')).seedState(); } catch { state = B.emptyState(); }
  }
  save(); // also stores version 1 data in the new format
  render();
  animateView(); // first open: cards rise in and the numbers count up
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

// ---- Drawing --------------------------------------------------------------------

const TABS = [
  ['home', 'Home', icon.homeFill],
  ['insights', 'Insights', icon.chartFill],
  null, // the + button
  ['accounts', 'Accounts', icon.walletFill],
  ['settings', 'Settings', icon.gearFill],
];

function renderTabs() {
  let inner = $tabs.querySelector('.inner');
  if (!inner) {
    $tabs.innerHTML = `<div class="inner"><span class="tab-thumb" aria-hidden="true"></span>${TABS.map((t) => (t
      ? `<button class="tab" data-act="tab" data-tab="${t[0]}" aria-label="${t[1]}">${t[2](20)}${ring()}</button>`
      : `<button class="tab add" data-act="add" aria-label="Add a spend">${icon.plus(20)}</button>`)).join('')}</div>`;
    inner = $tabs.querySelector('.inner');
  }
  inner.style.setProperty('--a', TABS.findIndex((t) => t && t[0] === ui.tab));
  for (const b of inner.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

function render() {
  const today = B.todayISO();
  $view.classList.remove('enter'); // entrance animations only run when animateView() asks
  if (ui.tab === 'home') $view.innerHTML = renderHome(state, today, ui);
  else if (ui.tab === 'insights') $view.innerHTML = renderInsights(state, today, ui);
  else if (ui.tab === 'accounts') $view.innerHTML = renderAccounts(state, today);
  else $view.innerHTML = renderSettings(state, today, installStatus(), ui);

  stagger($view);
  renderTabs();
  renderSheets();
  countUp($view, false);
}

// Full-screen sheets cover everything; the others slide up from the bottom over a dimmed backdrop.
const FULL_SHEETS = new Set(['entry', 'note', 'flow', 'page-budget', 'page-salary', 'page-other', 'page-stocks']);

// Draws the whole stack, so a detail sheet opened from a page shows on top of that page.
function renderSheets() {
  const today = B.todayISO();
  const parts = [];
  for (let i = 0; i < ui.sheets.length; i++) {
    const sh = ui.sheets[i];
    const html = renderSheet(sh, state, today);
    if (html === null) { // the thing the sheet showed was deleted
      ui.sheets.splice(i, 1);
      i -= 1;
      continue;
    }
    const full = FULL_SHEETS.has(sh.type);
    const z = 30 + i * 2;
    const kind = sh.type.startsWith('page-') ? 'page' : sh.type === 'note' ? 'note' : '';
    const enter = sh.fresh === 'fade' ? 'fade-in' : sh.fresh ? 'enter' : '';
    parts.push(`${full ? '' : `<div class="backdrop ${sh.fresh ? 'enter' : ''}" style="z-index:${z}" data-act="close-sheet"></div>`}
      <div class="sheet ${full ? 'full' : ''} ${kind} ${enter}" style="z-index:${z + 1}" role="dialog" aria-modal="true">${full ? '' : '<div class="grabber"></div>'}${html}</div>`);
    sh.fresh = false;
  }
  $sheets.innerHTML = parts.join('');
  for (const el of $sheets.querySelectorAll('.sheet')) countUp(el, el.matches('.enter, .fade-in'));
  bindFlow();
  document.body.classList.toggle('locked', ui.sheets.length > 0);
  // Like an iPhone push: the screen underneath slides a little to the left while a page is open.
  $view.classList.toggle('behind', ui.sheets.some((s) => s.type.startsWith('page-')));
}

// animate: true slides in, 'fade' fades in (used where sliding would make iOS scroll), false is instant.
function openSheet(sh, { animate = true } = {}) {
  ui.sheets.push({ ...sh, fresh: animate });
  renderSheets();
}

// The Note screen sits on top of the keypad screen and hands the chosen text back to it
// (the note, or the salary name).
function finishNote(text) {
  const field = topSheet()?.field ?? 'note';
  const entry = ui.sheets.at(-2);
  if (entry?.type === 'entry') entry[field] = String(text ?? '').trim();
  closeSheet();
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let finishClosing = null; // completes a close whose animation is still playing

// Plays the top sheet's exit animation (slide down, or slide right for a page), then removes it.
// `after` runs once it is gone, e.g. to redraw the screen and show a message.
function closeSheet(after) {
  finishClosing?.(); // a quick second tap finishes the first close at once, so no tap is lost
  const sheets = $sheets.querySelectorAll('.sheet');
  const el = sheets[sheets.length - 1];
  const top = topSheet();
  const finish = () => {
    ui.sheets.pop();
    renderSheets();
    after?.();
  };
  if (!el || !top || reducedMotion()) { finish(); return; }
  el.classList.remove('enter', 'fade-in');
  el.classList.add('leaving');
  const backdrop = el.previousElementSibling;
  if (backdrop?.classList.contains('backdrop')) backdrop.classList.add('leaving');
  if (top.type.startsWith('page-') && !ui.sheets.slice(0, -1).some((s) => s.type.startsWith('page-'))) {
    $view.classList.remove('behind'); // slide the screen underneath back while the page leaves
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    finishClosing = null;
    finish();
  };
  finishClosing = once;
  el.addEventListener('animationend', (e) => { if (e.target === el) once(); });
  setTimeout(once, 450); // in case the animation event never fires
}

// Cards rise in one after another and their numbers count up (opening a tab, switching week/month).
function animateView() {
  if (reducedMotion()) return;
  $view.classList.remove('enter');
  void $view.offsetWidth; // restart the animations
  $view.classList.add('enter');
  countUp($view, true);
}

// ---- Insights cursor --------------------------------------------------------------
// Dragging on either chart moves one cursor through both: the day's spend and the running total update live.
function setCursor(i) {
  ui.insights.cursor = i;
  const spend = $view.querySelector('[data-chart]');
  const line = $view.querySelector('[data-line]');
  if (spend) {
    spend.style.setProperty('--c', i);
    const bars = [...spend.querySelectorAll('.bar')];
    bars.forEach((b, k) => b.classList.toggle('on', k === i));
    const labels = [...spend.querySelectorAll('.axis span')];
    const shownHere = labels[i]?.classList.contains('show');
    labels.forEach((l, k) => {
      l.classList.toggle('on', k === i);
      l.classList.toggle('near', k !== i && !shownHere && Math.abs(k - i) <= 2);
    });
    const b = bars[i];
    if (b) {
      spend.querySelector('.card-label span').textContent = `Spent · ${b.dataset.l}`;
      setCount(spend.querySelector('[data-scrub-value] .cnt'), Number(b.dataset.v));
    }
  }
  if (line) {
    line.style.setProperty('--c', i);
    const v = line.querySelectorAll('.cum-data i')[i];
    const b = spend?.querySelectorAll('.bar')[i];
    if (b) line.querySelector('.card-label span').textContent = `Running total · ${b.dataset.l}`;
    if (v) setCount(line.querySelector('[data-cum-value] .cnt'), Number(v.dataset.v));
  }
}
initScrub(setCursor);

// ---- Step screens with the ruler ---------------------------------------------------
function flowStep(sh) { return FLOWS[sh.flow].steps[sh.step]; }

// Shows a new value everywhere on the step screen without redrawing it (the ruler keeps scrolling).
function showFlowValue(sh, v) {
  const st = flowStep(sh);
  sh.vals[st.field] = v;
  const el = $sheets.querySelector('.sheet:last-child');
  if (!el) return;
  const text = el.querySelector('[data-pick-text]');
  if (text) text.textContent = pickText(st, v);
  const r = el.querySelector('[data-ruler]');
  if (r) { r.setAttribute('aria-valuenow', v); r.setAttribute('aria-valuetext', pickText(st, v)); }
  const pv = el.querySelector('[data-pick-preview]');
  if (pv) pv.textContent = flowPreview(sh, st);
  const next = el.querySelector('[data-act="flow-next"]');
  if (next) next.disabled = !flowReady(sh, st);
}

let placeRuler = null;
function bindFlow() {
  placeRuler = null;
  const sh = topSheet();
  if (sh?.type !== 'flow') return;
  const el = $sheets.querySelector('.sheet:last-child [data-ruler]');
  if (!el) return;
  const st = flowStep(sh);
  // The sheet is already in the page, so the ruler can be placed at the current value straight away.
  placeRuler = bindRuler(el, Number(sh.vals[st.field]) || 0, (v) => {
    const input = $sheets.querySelector('[data-pick-input]');
    if (input && document.activeElement !== input) input.value = v || '';
    showFlowValue(sh, v);
  });
}

async function flowNext() {
  const sh = topSheet();
  const def = FLOWS[sh.flow];
  const st = flowStep(sh);
  if (!flowReady(sh, st)) return;
  if (sh.step < def.steps.length - 1) {
    sh.step += 1;
    sh.manual = false;
    sh.fresh = 'fade';
    renderSheets();
    return;
  }
  const v = sh.vals;
  const before = state;
  const ok = {
    stockMin: () => apply((s) => B.updateSettings(s, { stockMin: v.stockMin })) && 'Stock minimum saved',
    rent: () => apply((s) => B.updateSettings(s, { rentPerMonth: v.rentPerMonth })) && 'Rent settings saved',
    override: () => apply((s) => B.setBaseOverride(s, v.periodId, v.amount)) && 'Month budget saved',
    lump: () => apply((s) => B.addLumpSum(s, { firstPeriod: v.firstPeriod, months: v.months, amount: v.amount, rentPerMonth: v.rentPerMonth })) && 'Lump sum added',
  }[sh.flow]();
  if (ok) closeSheet(() => { render(); toast(ok, before); });
}
const topSheet = () => ui.sheets.at(-1);

let undoState = null;
let toastTimer = null;
const TOAST_MS = 4000; // the usual length for a message with an Undo button

function hideToast() {
  clearTimeout(toastTimer);
  $toast.classList.remove('show');
}
function toast(text, before = null) {
  undoState = before;
  $toast.innerHTML = `<span>${esc(text)}</span>${before ? '<button data-act="undo">Undo</button>' : ''}`;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

// ---- Keypad entry ---------------------------------------------------------------

function defaultFrom(today) {
  const pots = B.potLedger(state).pots;
  const pot = pots.find((p) => p.free > 0.004) ?? pots.find((p) => p.balance > 0.004);
  if (pot) return { type: 'pot', potId: pot.id };
  const bucket = B.bucketLedger(state).buckets.find((b) => b.balance > 0.004);
  if (bucket) return { type: 'bucket', bucketId: bucket.id };
  return { type: 'budget', periodId: B.periodIdOf(today) };
}

function newEntry(mode, preset = {}) {
  const today = B.todayISO();
  const sh = {
    type: 'entry', mode, buf: '', date: today, note: '', label: '',
    earned: B.shiftPeriod(B.periodIdOf(today), -1), from: null, to: null,
  };
  if (mode === 'transfer') {
    // Sending to stocks: start from the oldest salary that still owes its stock minimum.
    const owing = preset.to?.type === 'stocks' && !preset.from && B.potLedger(state).pots.find((p) => p.reserved > 0.004);
    if (owing) {
      preset = { ...preset, from: { type: 'pot', potId: owing.id }, buf: preset.buf ?? String(B.round2(owing.reserved)) };
    }
    sh.from = preset.from ?? defaultFrom(today);
    sh.to = preset.to ?? { type: 'budget', periodId: B.periodIdOf(today) };
    if (B.sameAccount(sh.from, sh.to)) sh.to = { type: 'stocks' };
  }
  return { ...sh, ...Object.fromEntries(Object.entries(preset).filter(([k]) => k !== 'from' && k !== 'to')) };
}

function pressKey(k) {
  const sh = topSheet();
  if (sh?.type !== 'entry') return;
  let b = sh.buf;
  if (k === 'clear') b = '';
  else if (k === 'back') b = b.slice(0, -1);
  else if (k === '.') { if (!b.includes('.')) b = `${b || '0'}.`; }
  else {
    const [int, dec] = b.split('.');
    if (dec !== undefined) { if (dec.length < 2) b += k; }
    else if (b === '0') b = k;
    else if ((int ?? '').length < 7) b += k;
  }
  sh.buf = b;
  const el = $sheets.querySelector('[data-amount]');
  if (el) el.innerHTML = amountHTML(b);
}

async function saveEntry() {
  const sh = topSheet();
  const amount = Number(sh.buf);
  if (!(amount > 0)) {
    const el = $sheets.querySelector('.amount-line');
    el?.classList.remove('shake');
    void el?.offsetWidth;
    el?.classList.add('shake');
    return;
  }
  const before = state;
  let msg;
  if (sh.mode === 'spend') {
    if (!apply((s) => B.addSpend(s, { date: sh.date, amount, note: sh.note }))) return;
    const p = B.periodSummary(state, B.periodIdOf(sh.date));
    msg = `Spend logged. ${fmt(p.remaining)} left`;
  } else if (sh.mode === 'edit') {
    if (!apply((s) => B.editSpend(s, sh.editId, { date: sh.date, amount, note: sh.note }))) return;
    msg = 'Spend updated';
  } else if (sh.mode === 'salary') {
    if (!apply((s) => B.addSalary(s, { label: sh.label, amount, receivedOn: sh.date, earnedPeriod: sh.earned }))) return;
    msg = `Salary ${state.pots.at(-1).label} logged`;
  } else {
    if (sh.from.type === 'pot' && sh.to.type !== 'stocks') {
      const pot = B.potLedger(state).pots.find((p) => p.id === sh.from.potId);
      if (pot && amount > pot.free + 1e-9 && !(await ask('Use money kept for stocks?', {
        detail: `This takes ${fmt(amount - Math.max(0, pot.free))} from the money set aside for stocks in ${pot.label}.`,
        ok: 'Use it',
      }))) return;
    }
    if (!apply((s) => B.addTransfer(s, { date: sh.date, from: sh.from, to: sh.to, amount, note: sh.note }))) return;
    msg = `Moved ${fmt(amount)} to ${B.accountName(state, sh.to)}`;
  }
  closeSheet(() => {
    render();
    toast(msg, before);
  });
}

// ---- Events ---------------------------------------------------------------------

let tabTimer = null;
function goTab(tab) {
  const changed = tab !== ui.tab;
  ui.tab = tab;
  ui.sheets = [];
  if (!changed || reducedMotion()) {
    render();
    window.scrollTo(0, 0);
    if (changed) animateView();
    return;
  }
  renderTabs(); // the white thumb starts sliding now
  renderSheets();
  const btn = $tabs.querySelector(`[data-tab="${tab}"]`);
  btn?.classList.add('loading');
  $view.classList.add('leaving');
  clearTimeout(tabTimer);
  tabTimer = setTimeout(() => {
    btn?.classList.remove('loading');
    $view.classList.remove('leaving');
    render();
    window.scrollTo(0, 0);
    animateView();
  }, 200);
}

// Segmented controls: the tapped segment shows the dotted ring, the thumb slides, then the content changes.
let segTimer = null;
function segSwitch(el, then) {
  const segEl = el.closest('.seg');
  if (!segEl || reducedMotion()) { then(); return; }
  segEl.style.setProperty('--sel', el.dataset.segI);
  for (const b of segEl.querySelectorAll('button')) b.classList.toggle('on', b === el);
  el.classList.add('loading');
  clearTimeout(segTimer);
  segTimer = setTimeout(then, 300);
}

// Asks first (red Delete button by default), then runs the change. Resolves true if it happened.
async function confirmApply(question, fn, msg, { ok = 'Delete', detail = '' } = {}) {
  if (!(await ask(question, { ok, detail, danger: true }))) return false;
  const before = state;
  if (!apply(fn)) return false;
  render();
  if (msg) toast(msg, before);
  return true;
}

// Safari's own pinch events: cancel them so the app never zooms (backs up touch-action in styles.css).
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#toast')) hideToast(); // moving on hides the last message early
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  finishClosing?.(); // a screen still sliding away must not catch this tap
  const today = B.todayISO();
  const ds = el.dataset;
  const top = topSheet();
  switch (ds.act) {
    case 'tab':
    case 'goto':
      goTab(ds.tab);
      break;
    case 'add':
      openSheet(newEntry('spend'));
      break;
    case 'alerts': {
      if (B.dashboard(state, today).rent.status === 'none') { toast('No alerts right now'); break; }
      if (ui.tab !== 'home') { ui.tab = 'home'; ui.sheets = []; render(); }
      document.getElementById('alerts')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      break;
    }
    case 'open-flow':
      openSheet(flowStart(ds.flow, state, today));
      break;
    case 'flow-next':
      flowNext();
      break;
    case 'flow-back':
      top.step -= 1;
      top.manual = false;
      top.fresh = 'fade';
      renderSheets();
      break;
    case 'flow-pick':
      top.vals[flowStep(top).field] = ds.v;
      renderSheets();
      break;
    case 'flow-manual': {
      top.manual = true;
      const input = $sheets.querySelector('[data-pick-input]');
      if (input) { input.hidden = false; input.focus({ preventScroll: true }); input.select?.(); }
      break;
    }
    case 'theme':
      ui.theme = ds.theme;
      try { localStorage.setItem(THEME_KEY, ui.theme); } catch { /* still applies until the app is closed */ }
      applyTheme(ui.theme);
      render();
      break;
    case 'toggle-recent':
      ui.homeAll = !ui.homeAll;
      render();
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'entry-mode': {
      const next = newEntry(ds.mode);
      Object.assign(top, next, { buf: top.buf, note: top.note, fresh: false });
      renderSheets();
      break;
    }
    case 'key':
      pressKey(ds.key);
      break;
    case 'open-note':
    case 'open-name': {
      // Fade in, not slide in: focusing a box that is still below the screen makes iOS scroll down to it.
      const sheet = ds.act === 'open-name'
        ? { type: 'note', field: 'label', note: top.label, suggest: B.salaryLabel(top.earned) }
        : { type: 'note', field: 'note', note: top.note };
      openSheet(sheet, { animate: 'fade' });
      const input = document.getElementById('note-input');
      input?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        const el = input?.closest('.sheet');
        if (el) el.scrollTop = 0;
      });
      break;
    }
    case 'pick-note':
      finishNote(ds.note);
      break;
    case 'note-done':
      finishNote(document.getElementById('note-input')?.value);
      break;
    case 'save-entry':
      saveEntry();
      break;
    case 'edit-spend': {
      const s = state.spends.find((x) => x.id === ds.id);
      if (s) openSheet(newEntry('edit', { editId: s.id, buf: String(B.round2(s.amount)), date: s.date, note: s.note }));
      break;
    }
    case 'delete-spend':
      confirmApply('Delete this spend?', (s) => B.removeSpend(s, top.editId), 'Spend deleted')
        .then((done) => done && closeSheet());
      break;
    case 'rent-paid': {
      const before = state;
      if (apply((s) => B.markRentPaid(s, ds.period, today))) { render(); toast('Rent marked as paid', before); }
      break;
    }
    case 'rent-toggle': {
      const before = state;
      const paid = state.rentPaid[ds.period];
      if (apply((s) => (paid ? B.unmarkRentPaid(s, ds.period) : B.markRentPaid(s, ds.period, today)))) {
        render();
        toast(paid ? 'Rent marked as not paid' : 'Rent marked as paid', before);
      }
      break;
    }
    case 'insights-mode':
      if (ds.mode === ui.insights.mode) break;
      segSwitch(el, () => {
        ui.insights = { mode: ds.mode, periodId: null, weekOf: null, cursor: null };
        render();
        animateView();
      });
      break;
    case 'insights-step': {
      const step = Number(ds.step);
      if (ui.insights.mode === 'month') ui.insights.periodId = B.shiftPeriod(ui.insights.periodId ?? B.periodIdOf(today), step);
      else ui.insights.weekOf = B.addDays(ui.insights.weekOf ?? B.weekRange(today).start, 7 * step);
      ui.insights.cursor = null;
      render();
      animateView();
      break;
    }
    case 'open-page':
      openSheet({ type: `page-${ds.page}` });
      break;
    case 'open-pot':
      openSheet({ type: 'pot', id: ds.id });
      break;
    case 'open-bucket':
      openSheet({ type: 'bucket', id: ds.id });
      break;
    case 'open-month':
      openSheet({ type: 'month', periodId: ds.period });
      break;
    case 'open-transfer':
      openSheet({ type: 'transfer', id: ds.id });
      break;
    case 'transfer': {
      const preset = {};
      if (ds.from) preset.from = parseRefKey(ds.from);
      if (ds.to) preset.to = parseRefKey(ds.to);
      if (ds.amount) preset.buf = String(ds.amount);
      openSheet(newEntry('transfer', preset));
      break;
    }
    case 'log-salary':
      openSheet(newEntry('salary'));
      break;
    case 'new-bucket':
      openSheet({ type: 'bucket-form' });
      break;
    case 'rename-bucket':
      openSheet({ type: 'bucket-form', id: ds.id });
      break;
    case 'delete-bucket':
      confirmApply('Delete this category?', (s) => B.removeBucket(s, ds.id), 'Category deleted');
      break;
    case 'edit-pot':
      openSheet({ type: 'edit-pot', id: ds.id });
      break;
    case 'delete-pot':
      confirmApply('Delete this salary?', (s) => B.removeSalary(s, ds.id), 'Salary deleted').then((done) => {
        if (!done) return;
        ui.sheets = ui.sheets.filter((x) => x.id !== ds.id);
        renderSheets();
      });
      break;
    case 'delete-transfer':
      confirmApply('Delete this transfer?', (s) => B.removeTransfer(s, ds.id), 'Transfer deleted', {
        detail: 'The money goes back where it came from.',
      }).then((done) => done && closeSheet());
      break;
    case 'mark-done':
      openSheet({ type: 'done', periodId: top.periodId });
      break;
    case 'unmark-done': {
      const before = state;
      if (apply((s) => B.unmarkMonthDone(s, top.periodId))) { render(); toast('Marked as not done', before); }
      break;
    }
    case 'del-lump':
      confirmApply('Delete this lump sum?', (s) => B.removeLumpSum(s, ds.id), 'Lump sum deleted');
      break;
    case 'del-inst':
      confirmApply('Delete this instalment?', (s) => B.removeInstalment(s, ds.id), 'Instalment deleted');
      break;
    case 'del-override':
      confirmApply('Remove this month\'s fixed budget?', (s) => B.clearBaseOverride(s, ds.period), 'Removed', { ok: 'Remove' });
      break;
    case 'undo':
      if (undoState) {
        state = undoState;
        undoState = null;
        save();
        render();
      }
      $toast.classList.remove('show');
      break;
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

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const get = (k) => String(fd.get(k) ?? '').trim();
  const before = state;
  const today = B.todayISO();
  const done = (msg, close = false) => {
    const show = () => {
      render();
      toast(msg, before);
    };
    if (close) closeSheet(show);
    else show();
  };
  switch (f.dataset.form) {
    case 'stockMin':
      if (apply((s) => B.updateSettings(s, { stockMin: num(get('stockMin')) }))) done('Stock minimum saved');
      break;
    case 'rent':
      if (apply((s) => B.updateSettings(s, {
        rentPerMonth: get('rentPerMonth') ? num(get('rentPerMonth')) : null,
        rentRemindDays: Number(get('rentRemindDays')),
      }))) done('Rent settings saved');
      break;
    case 'lump':
      if (apply((s) => B.addLumpSum(s, {
        firstPeriod: get('firstPeriod'), months: Number(get('months')), amount: num(get('amount')), rentPerMonth: num(get('rentPerMonth')),
      }))) done('Lump sum added');
      break;
    case 'override':
      if (apply((s) => B.setBaseOverride(s, get('periodId'), num(get('amount'))))) done('Month budget saved');
      break;
    case 'edit-pot':
      if (apply((s) => B.editSalary(s, f.dataset.id, {
        label: get('label'), amount: num(get('amount')), receivedOn: get('receivedOn') || null,
        earnedPeriod: get('earnedPeriod') || null, stockMin: num(get('stockMin')),
      }))) done('Salary saved', true);
      break;
    case 'bucket':
      if (f.dataset.id) {
        if (apply((s) => B.renameBucket(s, f.dataset.id, get('name')))) done('Category renamed', true);
      } else {
        const amount = get('amount') ? num(get('amount')) : 0;
        if (apply((s) => {
          let n = B.addBucket(s, { name: get('name') });
          if (amount) n = B.addTransfer(n, { date: today, from: { type: 'in' }, to: { type: 'bucket', bucketId: n.buckets.at(-1).id }, amount });
          return n;
        })) done('Category created', true);
      }
      break;
    case 'mark-done': {
      const periodId = topSheet().periodId;
      if (apply((s) => B.markMonthDone(s, periodId, { date: today, note: get('note') }))) done('Marked as done', true);
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches?.('[data-pick-input]')) {
    const sh = topSheet();
    const st = flowStep(sh);
    let v = num(e.target.value);
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (st.kind === 'count') v = Math.max(st.min ?? 0, Math.min(st.max, Math.round(v)));
    showFlowValue(sh, v);
    placeRuler?.(v);
    return;
  }
  const field = e.target.dataset?.field;
  const sh = topSheet();
  if (sh?.type === 'entry' && (field === 'note' || field === 'label')) sh[field] = e.target.value;
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset?.act === 'rent-remind') {
    const before = state;
    if (apply((s) => B.updateSettings(s, { rentRemindDays: Number(t.value) }))) { render(); toast('Rent settings saved', before); }
    return;
  }
  if (t.dataset?.act === 'import') {
    const file = t.files[0];
    if (!file) return;
    const text = await file.text();
    t.value = '';
    if (await ask('Replace everything with this backup?', {
      detail: 'What is in the app now will be replaced by the backup.', ok: 'Replace', danger: true,
    })) {
      const before = state;
      if (apply(() => B.importState(text))) {
        ui.sheets = [];
        render();
        toast('Backup imported', before);
      }
    }
    return;
  }
  const field = t.dataset?.field;
  const sh = topSheet();
  if (sh?.type !== 'entry' || !field || field === 'note' || field === 'label') return;
  if (field === 'date') {
    if (!t.value) return; // iOS "Clear" in the date picker
    sh.date = t.value;
    // Pay is for the month before the one it lands in; this also updates the suggested name.
    if (sh.mode === 'salary') sh.earned = B.shiftPeriod(B.periodIdOf(t.value), -1);
  } else if (field === 'from' || field === 'to') {
    sh[field] = parseRefKey(t.value);
  }
  renderSheets();
});

// Keyboard on a computer: digits, dot, backspace, Enter, Escape.
// Holding the keypad's delete key for half a second clears the whole amount.
let holdTimer = null;
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-key="back"]')) return;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => pressKey('clear'), 500);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(type, () => clearTimeout(holdTimer));
}

document.addEventListener('keydown', (e) => {
  if (closeDialog) {
    if (e.key === 'Escape') closeDialog(false);
    else if (e.key === 'Enter') { e.preventDefault(); closeDialog(true); }
    return;
  }
  finishClosing?.();
  const sh = topSheet();
  if (!sh) return;
  if (e.key === 'Escape') { closeSheet(); return; }
  if (sh.type === 'note') {
    if (e.key === 'Enter') { e.preventDefault(); finishNote(e.target.value); }
    return;
  }
  if (sh.type === 'flow') {
    if (e.key === 'Enter' && !e.target.matches?.('button')) { e.preventDefault(); flowNext(); }
    return;
  }
  if (sh.type !== 'entry') return;
  if (e.target.matches?.('input, select')) {
    if (e.key === 'Enter' && e.target.classList.contains('chip-input')) e.target.blur();
    return;
  }
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  else if (e.key === '.' || e.key === ',') pressKey('.');
  else if (e.key === 'Backspace') pressKey('back');
  else if (e.key === 'Enter') saveEntry();
  else return;
  e.preventDefault();
});

// Opening the app on a new day: redraw so "today" is right.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) render();
});

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol === 'https:') {
  // Only on https (the real hosted site). Skipped on plain http so local edits are never cached.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (state) render(); });
}

init();
