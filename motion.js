// motion.js
// The "Solora" motion: numbers that count up, cards that rise in one after another,
// charts you can drag along, and the ruler picker. No maths about money here, only movement.
// Everything is skipped when the phone asks for reduced motion.

import { formatCount } from './ui.js';

export const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const easeOut = (t) => 1 - (1 - t) ** 3; // close to cubic-bezier(.22, 1, .36, 1)

// Last value shown for each counting number (keyed by data-k), so a redraw only animates what changed.
const shown = new Map();

function tween(el, from, to, f, ms, delay = 0) {
  const t0 = performance.now() + delay;
  el.innerHTML = formatCount(from, f);
  const step = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, Math.max(0, (now - t0) / ms));
    el.innerHTML = formatCount(from + (to - from) * easeOut(t), f);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// After a redraw. entering: count every number up from 0, card by card down the screen.
// Otherwise only numbers whose value changed count from the old value to the new one.
export function countUp(root, entering) {
  const cards = [...root.querySelectorAll('.card')];
  for (const el of root.querySelectorAll('.cnt')) {
    const k = el.dataset.k;
    const v = Number(el.dataset.v);
    const prev = shown.get(k);
    shown.set(k, v);
    if (reduced()) continue;
    if (entering) {
      const idx = Math.max(0, cards.indexOf(el.closest('.card')));
      tween(el, 0, v, el.dataset.f, 900, Math.min(idx, 6) * 120);
    } else if (prev !== undefined && Math.abs(prev - v) > 0.004) {
      tween(el, prev, v, el.dataset.f, 900);
    }
  }
}

// Live change while dragging: a quick tween from what is on screen to the new value.
export function setCount(el, v, ms = 150) {
  if (!el) return;
  const from = Number(el.dataset.v);
  el.dataset.v = v;
  shown.set(el.dataset.k, v);
  if (reduced() || from === v) el.innerHTML = formatCount(v, el.dataset.f);
  else tween(el, from, v, el.dataset.f, ms);
}

// Numbers each top-level block so CSS can stagger the entrance.
export function stagger(root) {
  [...root.children].forEach((c, i) => c.style.setProperty('--i', i));
}

// ---- Chart scrubbing ----------------------------------------------------------------
// Press and drag sideways on a chart: the cursor snaps from day to day. Vertical drags scroll the page
// (the chart has touch-action: pan-y and we only take over after 6px of sideways movement).

export function initScrub(onIndex) {
  let drag = null;
  const indexAt = (area, clientX) => {
    const card = area.closest('[data-chart], [data-line]');
    const n = Number(getComputedStyle(card).getPropertyValue('--n')) || 1;
    const r = area.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return card.hasAttribute('data-line') ? Math.round(x * (n - 1)) : Math.min(n - 1, Math.floor(x * n));
  };
  document.addEventListener('pointerdown', (e) => {
    const area = e.target.closest('.scrub');
    if (!area) return;
    drag = { area, id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        drag.active = true;
        try { drag.area.setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
      } else if (Math.abs(dy) > 6) {
        drag = null; // a page scroll
        return;
      } else return;
    }
    onIndex(indexAt(drag.area, e.clientX));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active && e.type === 'pointerup') onIndex(indexAt(drag.area, e.clientX)); // a tap jumps there
    drag = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

// ---- Ruler picker -------------------------------------------------------------------
// A strip of ticks scrolls under a fixed needle (native momentum and snap). The value is read from scrollLeft.

export function bindRuler(el, value, onValue) {
  const min = Number(el.dataset.min);
  const step = Number(el.dataset.step);
  const tick = Number(el.dataset.tick);
  const count = el.querySelectorAll('.ruler-track i').length - 1;
  let lock = 0;
  const place = (v) => {
    lock = performance.now() + 200; // our own scroll must not round a typed value
    el.scrollLeft = Math.round((Math.max(min, v) - min) / step) * tick;
  };
  place(value);
  let lastI = -1;
  el.addEventListener('scroll', () => {
    if (performance.now() < lock) return;
    const i = Math.max(0, Math.min(count, Math.round(el.scrollLeft / tick)));
    if (i === lastI) return; // only when a new tick reaches the needle
    lastI = i;
    onValue(Math.round((min + i * step) * 100) / 100);
  }, { passive: true });
  el.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!k) return;
    e.preventDefault();
    el.scrollBy({ left: k * tick });
  });
  return place;
}
