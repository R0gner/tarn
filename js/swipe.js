// @ts-check
// tarn · swipe between parts: a sideways touch drag on the content of a segmented control with panes (segmented({ pane, swipe: true })).
// The neighbour slides in from the side the finger pulls towards (it follows the finger and settles on release, like the image carousel), the
// marker of the active option glides along. Vertical scrolling has priority (axis decided after AXIS_SLOP, steep = scroll; the area allows only
// pan-y to the browser, so a vertical move stays a native scroll); a touch that starts in something that scrolls sideways by itself (a table, an
// image strip, a row of chips) or in a field belongs to it. At the first and the last part a rubber band, no wrap. Touch only (mouse and keyboard
// keep clicks and arrow keys). With reduced motion nothing follows the finger and nothing slides: a swipe switches at once on release.
// Where: on the content and in the empty room of the view below it, down to the lower edge of the screen (the shell's `.tn-main` takes those
// touches for the one swipe area of the view; css/core.css gives it touch-action pan-y while such an area is in it, by :has). The neighbour being pulled in never
// makes the page taller: it is cut at the lower edge of what is visible.
// Pure parts: js/swipe-data.js.
import { tokenMs } from './dom.js';
import { swipeAxis, paneOffset, paneRelease, paneProgress, scrollsSideways } from './swipe-data.js';

/**
 * @typedef {object} PaneSwipeHooks
 * @property {() => { index: number, n: number }} at the part shown and the number of parts
 * @property {(i: number) => HTMLElement} render a slide with the content of part i (drawn when the finger pulls it in)
 * @property {(from: number, to: number, p: number, animate: boolean) => void} marker the marker between option `from` and `to` at progress p
 * @property {(i: number, slide: HTMLElement | null) => void} commit switch to part i (slide: its drawn content, null with reduced motion)
 * @property {() => void} rest the marker back to the plain look (no gesture)
 */

/** Whether a touch on `target` belongs to something inside `area` that takes sideways gestures itself. @param {EventTarget | null} target @param {HTMLElement} area */
function ownsSideways(target, area) {
  for (let el = target instanceof Element ? target : null; el && el !== area; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-tn-noswipe]')) return true;
    const s = getComputedStyle(el);
    if (scrollsSideways({ overflowX: s.overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })) return true;
  }
  return false;
}

/** The empty room of a view: touches on `.tn-main` itself or on a wrapper that holds the swipe area (not on other content), below the area's top. */
/** @type {Map<HTMLElement, Set<{ area: HTMLElement, down: (e: PointerEvent) => void }>>} */
const zones = new Map();
/** @param {HTMLElement} zone */
function prune(zone) {
  const set = zones.get(zone);
  if (!set) return;
  for (const x of [...set]) if (!x.area.isConnected || !zone.contains(x.area)) set.delete(x);
  if (set.size) return;
  zones.delete(zone);
  zone.removeEventListener('pointerdown', zoneDown);
}
/** @param {PointerEvent} e */
function zoneDown(e) {
  const zone = /** @type {HTMLElement} */ (e.currentTarget);
  prune(zone);
  const set = zones.get(zone);
  if (!set || set.size !== 1) return;   // two swipe areas in one view: the empty room belongs to neither
  const [x] = set;
  const t = e.target instanceof Element ? e.target : null;
  if (!t || x.area.contains(t)) return;   // on the content: the area's own listener has it
  if (t !== zone && !t.contains(x.area)) return;   // other content of the view (a banner, a card below): not the empty room
  if (e.clientY < x.area.getBoundingClientRect().top) return;   // above the content (the control, the toolbar of the view)
  x.down(e);
}

/**
 * Attach the gesture. `area` takes the touches, `track` moves (it holds the current content in the flow and the neighbour slide beside it).
 * @param {HTMLElement} area
 * @param {HTMLElement} track
 * @param {PaneSwipeHooks} on
 * @returns {{ stop: () => void }}
 */
export function paneSwipe(area, track, on) {
  /** @type {{ id: number, x0: number, y0: number, t0: number, dx: number, axis: 'x' | 'y' | null, width: number, dir: number, slide: HTMLElement | null, still: boolean } | null} */
  let g = null;
  let busy = false;   // a slide is settling: no new gesture until it is done
  const still = () => tokenMs('--tn-t-close') <= 0;   // reduced motion (the durations are 0 then)

  /** the track shifted by x px (or a % string), optionally settling with the closing duration */
  const shift = (/** @type {string} */ x, animate = false) => {
    track.classList.toggle('is-settling', animate);
    track.style.transform = x === '0' ? '' : `translate3d(${x}, 0, 0)`;
  };
  const clear = () => {
    g?.slide?.remove();
    area.classList.remove('is-swiping');
    track.classList.remove('is-settling');
    track.style.transform = '';
  };
  /** the neighbour slide for direction dir (+1 = next, from the right; -1 = previous, from the left), drawn once per direction */
  const neighbour = (/** @type {number} */ dir) => {
    if (!g || g.dir === dir) return;
    g.slide?.remove();
    g.slide = null;
    g.dir = dir;
    const { index, n } = on.at();
    const i = index + dir;
    if (!dir || i < 0 || i >= n) return;
    const sl = on.render(i);
    sl.classList.add('tn-segpane-next');
    sl.style.left = `${dir * 100}%`;
    // the page is scrolled past the top of the content: the neighbour starts where the visible part of the content starts
    const top = area.getBoundingClientRect().top;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    if (top < pad) sl.style.top = `${Math.round(pad - top)}px`;
    // never taller than what is visible below its top (or the current part, if that is taller): the page does not grow while it is pulled in
    const doc = document.scrollingElement || document.documentElement;
    const before = doc.scrollHeight;
    const tr = track.getBoundingClientRect();
    const slideTop = tr.top + (parseFloat(sl.style.top) || 0);
    let cap = Math.max(tr.height - (parseFloat(sl.style.top) || 0), window.innerHeight - slideTop);
    sl.style.maxHeight = `${Math.max(0, Math.floor(cap))}px`;
    track.append(sl);
    const grew = doc.scrollHeight - before;   // padding or content below the track still counts: take that off once
    if (grew > 0) { cap -= grew; sl.style.maxHeight = `${Math.max(0, Math.floor(cap))}px`; }
    g.slide = sl;
  };

  const listen = (/** @type {boolean} */ on2) => {
    const f = on2 ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
    f('pointermove', move, true); f('pointerup', up, true); f('pointercancel', up, true);
  };
  const down = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || g || busy) return;
    if (on.at().n < 2 || ownsSideways(e.target, area)) return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, axis: null, width: area.clientWidth, dir: 0, slide: null, still: still() };
    listen(true);   // the moves of this touch, wherever they land (it may start in the empty room, outside the area)
  };
  const move = (/** @type {PointerEvent} */ e) => {
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x0;
    if (!g.axis) {
      g.axis = swipeAxis(g.dx, e.clientY - g.y0);
      if (!g.axis) return;
      if (g.axis === 'y') { g = null; listen(false); return; }   // the page scrolls; this touch is no swipe
      try { area.setPointerCapture(g.id); } catch { /* the pointer is already gone */ }
      if (!g.still) area.classList.add('is-swiping');
    }
    if (g.still) return;
    const { index, n } = on.at();
    const off = paneOffset(g.dx, index, n, g.width);
    neighbour(off < 0 ? 1 : off > 0 ? -1 : 0);
    shift(`${off}px`);
    on.marker(index, g.slide ? index + g.dir : index, g.slide ? paneProgress(off, g.width) : 0, false);
  };
  const up = (/** @type {PointerEvent} */ e) => {
    if (!g || e.pointerId !== g.id) return;
    const done = g;
    g = null;
    listen(false);
    if (done.axis !== 'x') return;
    if (!area.isConnected) { done.slide?.remove(); return; }   // the view was drawn anew meanwhile: nothing of the gesture stays
    const { index, n } = on.at();
    const to = e.type === 'pointerup' ? paneRelease({ dx: done.dx, dt: e.timeStamp - done.t0, width: done.width, index, n }) : index;
    if (done.still) { if (to !== index) on.commit(to, null); return; }
    const ms = tokenMs('--tn-t-close');
    const dir = to - index;
    if (dir && done.dir !== dir) { g = done; neighbour(dir); g = null; }   // a fast flick the other way than the last pull
    busy = true;
    shift(dir ? `${-dir * 100}%` : '0', true);
    on.marker(index, dir ? to : index, dir ? 1 : 0, true);
    setTimeout(() => {
      busy = false;
      const slide = done.slide;
      if (dir && slide) {
        slide.remove();
        track.classList.remove('is-settling');
        track.style.transform = '';
        area.classList.remove('is-swiping');
        slide.classList.remove('tn-segpane-next');
        slide.style.left = ''; slide.style.top = ''; slide.style.maxHeight = '';
        // the content starts above the visible area: show the new part from its start, the control with it (before the switch: a board may
        // draw the view anew in onChange)
        const top = area.getBoundingClientRect().top;
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        if (top < pad && area.parentElement) area.parentElement.scrollIntoView({ block: 'start', behavior: 'instant' });
        on.commit(to, slide);
      } else {
        g = done; clear(); g = null;
        on.rest();
      }
    }, ms + 30);
  };
  area.addEventListener('pointerdown', down);
  const entry = { area, down };
  // the empty room below: registered once the area is in the document (segmented() builds it before the view is mounted)
  let tries = 0;
  const join = () => {
    const zone = /** @type {HTMLElement | null} */ (area.closest('.tn-main'));
    if (!zone) { if (!area.isConnected && ++tries < 30) requestAnimationFrame(join); return; }   // not mounted yet: a few frames later
    if (!zones.has(zone)) { zones.set(zone, new Set()); zone.addEventListener('pointerdown', zoneDown); }
    zones.get(zone)?.add(entry);
    prune(zone);
  };
  requestAnimationFrame(join);
  return { stop: () => { g = null; listen(false); clear(); } };
}
