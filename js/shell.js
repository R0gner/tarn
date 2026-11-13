// @ts-check
// tarn · App shell: sidebar + toolbar + content + inspector, hash router, detail logic, theme.
//   ≥ 1000 px  fixed sidebar (collapsible, remembered), detail in the inspector on the right (non-modal)
//   700–999    sidebar as overlay (burger), detail as a panel from the right over the list (modal, scrim; Back, Esc,
//              swipe right close it)
//   < 700      burger → sidebar overlay, detail as bottom sheet (swipe down, background locked)
// Detail state lives in the hash (#/view?open=id): the Back button closes the detail.
import './locales/shell.js';   // shell texts
import { h, cls, mount } from './dom.js';
import { icon } from './icons.js';
import { iconButton, button, badge } from './primitives.js';
import { segmented } from './controls.js';
import { field, select } from './inputs.js';
import { banner, empty } from './components.js';
import { openSheet, lockScroll } from './sheet.js';
import { parseHash, buildHash } from './router.js';
import { fmtAgo, fmtFull } from './format.js';
import { favicon } from './favicon.js';
import { getDensity, setDensity } from './density.js';
import { menu } from './widgets.js';
import { t, setLocale, setTimeZone, addMessages, resolveLocale, KIT_LOCALES, LOCALE_NAMES } from './i18n.js';
import { boardSwitcher, boardIcon } from './boards.js';
import { normalizeBoards } from './boards-data.js';
import { notifications, openInstallHint } from './notifications.js';
import { detectPlatform, manualInstall, browserEnv } from './notifications-data.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./primitives.js').Status} Status */
/** @typedef {import('./data.js').DataSource} DataSource */
/** @typedef {import('./data.js').DataState} DataState */
/** @typedef {import('./boards-data.js').BoardList} BoardList */
/** @typedef {import('./boards-data.js').BoardCategory} BoardCategory */
/** @typedef {{ icon?: string, color?: string }} IconSpecObject Board icon drawn by favicon(): a Lucide name and a colour token name. */
/** @typedef {{ title: string, sub?: string, body?: Child }} DetailContent What detail() returns for the inspector, panel or bottom sheet. */
/** @typedef {{ n: number | string | null | undefined, tone?: Status }} CountSpec Nav counter with a colour. */
/** @typedef {{ app: App, view: string | undefined, params: Record<string, string>, open: string | null, src: DataState | null, data: any }} ViewContext Argument of render(), detail() and count(). */
/** @typedef {{ id: string, label: string | (() => string), group?: string, icon?: string, hidden?: boolean, count?: number | string | CountSpec | null | ((ctx: ViewContext) => number | string | CountSpec | null | undefined), render: (ctx: ViewContext) => Child, detail?: (id: string, ctx: ViewContext) => DetailContent | null | undefined }} ViewDef One view of the app (a navigation entry). */
/**
 * @typedef {{
 *   views: ViewDef[],
 *   defaultView?: string,
 *   title?: string | (() => string),
 *   root?: HTMLElement,
 *   inspector?: boolean,
 *   source?: DataSource,
 *   icon?: string | IconSpecObject,
 *   favicon?: IconSpecObject,
 *   boards?: BoardList | string | (() => BoardList | string),
 *   categories?: BoardCategory[] | (() => BoardCategory[]),
 *   boardId?: string,
 *   locale?: string,
 *   locales?: string[],
 *   messages?: Record<string, Record<string, any>>,
 *   timeZone?: string,
 *   toolbarExtra?: Child,
 *   densitySwitch?: boolean,   // button next to the theme switch: compact ↔ comfortable (stored; for galleries and boards that offer both)
 *   notifications?: import('./notifications-data.js').NotificationsOptions,   // adds the entry "Notifications" (web push, browser half) to the sidebar; README "Notifications"
 * }} AppConfig Options of createApp(). title, boards, categories and view labels may be functions (evaluated after the locale is set).
 */
/** @typedef {{ el: HTMLElement, readonly view: string | null, readonly openId: string | null, go: (view: string, o?: { open?: string, params?: Record<string, string> }) => void, open: (id: string) => void, closeDetail: () => void, refresh: () => void, setCount: (id: string, n: number | string | null, tone?: Status) => void, readonly isDesktop: boolean }} App Returned by createApp(). */

const DESKTOP = window.matchMedia('(min-width: 1000px)');

/* “Install as app”: only visible when the browser offers beforeinstallprompt; gone after installation and in
   standalone mode. The event often fires before createApp(), so it is captured here at module load. */
const STANDALONE = window.matchMedia('(display-mode: standalone)');
const isStandalone = () => STANDALONE.matches || /** @type {any} */ (navigator).standalone === true; // iOS Safari only knows navigator.standalone
/** @type {(Event & { prompt: () => Promise<void>, userChoice: Promise<unknown> }) | null} */
let installEvent = null;
const installWatchers = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = /** @type {NonNullable<typeof installEvent>} */ (e); installWatchers.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { installEvent = null; installWatchers.forEach((f) => f()); });
STANDALONE.addEventListener('change', () => installWatchers.forEach((f) => f()));

/**
 * createApp({
 *   title (string or function), root = document.body, inspector = true, source?: dataSource,
 *   icon?: URL | { icon, color }  board icon left of the title in the sidebar (same as the favicon; an object
 *       also sets the page icon via favicon(); a URL shows the file, the <link rel="icon"> stays in the HTML),
 *   boards?: [{ id, name, href, icon?, category? }] | { boards, categories } | URL of a same-origin JSON file,
 *   categories?: [{ id, label }], boardId?: id of the current board  → title becomes the board switcher (only with ≥ 2 entries),
 *   favicon?: { icon, color }  (page icon only, if there is no icon object),
 *   views: [{ id, label (string or function), group? (nav heading), icon, count?, render(ctx) → Node, detail?(id, ctx) → { title, sub, body } | null }],
 *   defaultView = views[0].id,
 * })
 * ctx = { app, view, params, open, data, src (state of the dataSource) }
 * API: app.go(view, { open }), app.open(id), app.closeDetail(), app.refresh(), app.setCount(id, n, tone)
 * @param {AppConfig} cfg0
 * @returns {App}
 */
export function createApp(cfg0) {
  /* ---- Language and time zone (before anything is built) ---- */
  addMessages(cfg0.messages);
  const offered = cfg0.locales || (cfg0.messages ? [...new Set(['en', ...Object.keys(cfg0.messages)])] : KIT_LOCALES);
  /** @type {string | null} */
  let stored = null;
  try { stored = localStorage.getItem('tn-locale'); } catch {}
  const queryLang = new URLSearchParams(location.search).get('lang'); // test/preview aid: ?lang=de
  const loc = resolveLocale({ locale: cfg0.locale || queryLang, locales: offered, stored, languages: navigator.languages });
  setLocale(loc.locale);
  if (cfg0.timeZone) setTimeZone(cfg0.timeZone);
  /* title, boards, categories and view labels may be functions (so they can call t() after the locale is set) */
  /** @template T @param {T | (() => T)} x @returns {T} */
  const val = (x) => (typeof x === 'function' ? /** @type {() => T} */ (x)() : x);
  const cfg = { ...cfg0, title: val(cfg0.title), boards: val(cfg0.boards), categories: val(cfg0.categories), views: cfg0.views.map((v) => ({ ...v, label: val(v.label) })) };

  const views = new Map(cfg.views.map((v) => [v.id, v]));
  const defaultView = cfg.defaultView || cfg.views[0].id;
  const useInspector = cfg.inspector !== false;
  const counts = new Map();
  /** @type {{ view: string | null, params: Record<string, string>, open: string | null }} */
  const cur = { view: null, params: {}, open: null };
  /** @type {DataState | null} */
  let srcState = cfg.source?.state || null;
  /** @type {import('./sheet.js').Sheet | null} */
  let sheet = null;
  let pushedOpen = false, closing = false;

  /* ---- Scaffold ---- */
  const navEl = h('nav', { class: 'tn-nav', 'aria-label': t('shell.views') });
  /* Sidebar head: board icon + title; with ≥ 2 boards (or a board list via URL) it becomes the switcher. */
  function brand() {
    const ic = cfg.icon ? boardIcon(cfg.icon, cfg.title || '', 24, { letter: false }) : null;
    const title = h('span', { class: 'tn-ellipsis' }, cfg.title || '');
    const norm = cfg.boards && typeof cfg.boards !== 'string' ? normalizeBoards(cfg.boards, cfg.categories) : null;
    if (norm?.problems.length) console.warn(`tarn boards: ${norm.problems.join('; ')}`);
    const many = typeof cfg.boards === 'string' || (norm && norm.boards.length > 1);
    if (!many) return h('div', { class: 'tn-brand' }, ic, title);
    const btn = h('button', { class: 'tn-brand tn-brand-btn', type: 'button', 'aria-label': t('shell.switchBoard', { board: cfg.title || 'Board' }) }, ic, title, icon('chevron-down', { size: 14 }));
    boardSwitcher(btn, { boards: /** @type {BoardList | string} */ (cfg.boards), categories: cfg.categories, boardId: cfg.boardId });
    return btn;
  }
  /* Where the browser has no install prompt (iPhone, iPad, Safari on the Mac) the entry stays and shows how to add the page by hand. */
  const manual = () => manualInstall(detectPlatform({ ...browserEnv(), standalone: isStandalone() }));
  const installBtn = button(t('shell.install'), { variant: 'ghost', icon: 'download', className: 'tn-install', onClick: async () => {
    const ev = installEvent;
    if (!ev) { const how = manual(); if (how) openInstallHint(how); return; }
    installEvent = null; syncInstall();               // the event can only be used once
    try { await ev.prompt(); await ev.userChoice; } catch {}
  } });
  const syncInstall = () => { installBtn.hidden = isStandalone() || (!installEvent && !manual()); };
  const notif = cfg.notifications ? notifications(cfg.notifications) : null;
  const notifBtn = notif ? button(t('notif.title'), { variant: 'ghost', icon: 'bell', className: 'tn-notif-entry', onClick: () => { notif.open(); setDrawer(false); } }) : null;
  installWatchers.add(syncInstall); syncInstall();
  const sidebar = h('aside', { class: 'tn-sidebar', id: 'tn-sidebar' },
    h('div', { class: 'tn-sidebar-head' }, brand()), navEl,
    h('div', { class: 'tn-sidebar-foot' }, notifBtn, installBtn));
  const scrim = h('div', { class: 'tn-scrim', 'aria-hidden': 'true', onclick: () => setDrawer(false) });
  const sbBtn = iconButton('sidebar', { label: t('shell.toggleSidebar'), onClick: toggleSidebar, className: 'tn-sb-toggle' });
  const viewTitle = h('h1', { class: 'tn-toolbar-title tn-ellipsis' });
  const fresh = h('button', { class: 'tn-fresh', type: 'button', onclick: () => cfg.source?.reload(), hidden: !cfg.source });
  const reloadBtn = iconButton('refresh', { label: t('common.reload'), onClick: () => cfg.source?.reload(), className: 'tn-hide-phone' });   // phone: the freshness text is a reload button too
  reloadBtn.hidden = !cfg.source;
  const themeBtn = iconButton('contrast', { label: t('shell.theme'), onClick: cycleTheme, className: 'tn-hide-phone' });
  const densityBtn = cfg.densitySwitch ? iconButton('list', { label: t('shell.density'), onClick: cycleDensity, className: 'tn-hide-phone' }) : null;
  /* Language menu: only with more than one offered language and no forced locale; the choice is stored and applied by reloading. */
  const langBtn = offered.length > 1 && !cfg0.locale ? menu(iconButton('languages', { label: t('shell.language'), className: 'tn-hide-phone' }), [
    { label: t('shell.languageAuto'), checked: !stored || stored === 'auto', onClick: () => chooseLocale('auto') },
    ...offered.map((l) => ({ label: LOCALE_NAMES[l] || l, checked: stored === l, onClick: () => chooseLocale(l) })),
  ]) : null;
  /** @param {string} l */
  function chooseLocale(l) { try { localStorage.setItem('tn-locale', l); } catch {} const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href; if (u.href === location.href) location.reload(); }
  /* Phone (< 600 px): theme, density and language leave the toolbar for ONE settings entry; otherwise the view title is cut off. */
  const settingsBtn = iconButton('settings', { label: t('shell.settings'), onClick: openSettings, className: 'tn-settings-btn' });
  const toolbar = h('header', { class: 'tn-toolbar' }, sbBtn, viewTitle, h('div', { class: 'tn-toolbar-spacer' }), cfg.toolbarExtra || null, fresh, reloadBtn, langBtn, densityBtn, themeBtn, settingsBtn);
  const banners = h('div', { class: 'tn-banners' });
  const content = h('main', { class: 'tn-content', id: 'tn-content', tabindex: '-1' });
  const inspTitle = h('h2', { class: 'tn-sheet-title tn-ellipsis' });
  const inspSub = h('div', { class: 'tn-sheet-sub' });
  const inspBody = h('div', { class: 'tn-inspector-body' });
  const inspector = h('aside', { class: 'tn-inspector', 'aria-label': t('shell.details'), hidden: true },
    h('header', { class: 'tn-sheet-head' }, h('div', { class: 'tn-sheet-heading' }, inspTitle, inspSub),
      iconButton('x', { label: t('shell.detailsClose'), onClick: () => closeDetail() })), inspBody);
  const appEl = h('div', { class: 'tn-app' }, sidebar, scrim, h('div', { class: 'tn-main' }, toolbar, banners, content), inspector);

  let sbCollapsed = false;
  try { sbCollapsed = localStorage.getItem('tn-sb') === 'closed'; } catch {}
  appEl.dataset.sb = sbCollapsed ? 'closed' : 'open';

  /* ---- Sidebar ---- */
  function renderNav() {
    /** @type {string | null | undefined} */
    let lastGroup = null;
    mount(navEl, cfg.views.filter((v) => !v.hidden).flatMap((v) => {
      const c = counts.get(v.id) ?? (typeof v.count === 'function' ? v.count(ctx(v)) : v.count);
      const n = c && typeof c === 'object' ? c : { n: c };
      const head = v.group && v.group !== lastGroup ? h('div', { class: 'tn-nav-group', role: 'presentation' }, v.group) : null; // optional heading (view.group)
      lastGroup = v.group ?? lastGroup;
      return [head, h('a', { class: cls('tn-nav-item', v.id === cur.view && 'is-active'), href: buildHash(v.id), 'aria-current': v.id === cur.view ? 'page' : null },
        v.icon && icon(v.icon), h('span', { class: 'tn-ellipsis' }, v.label),
        n.n != null && n.n !== '' && badge(String(n.n), { tone: n.tone || 'neutral', count: true }))];
    }));
  }
  let drawerLocked = false;
  /** @param {boolean} open */
  function setDrawer(open) {
    appEl.dataset.drawer = open ? 'open' : '';
    scrim.classList.toggle('is-on', open);
    if (open !== drawerLocked) { drawerLocked = open; lockScroll(open); }
    syncSidebarA11y();
    if (open) /** @type {HTMLElement | null} */ (navEl.querySelector('.is-active, a'))?.focus({ preventScroll: true });
  }
  function toggleSidebar() {
    if (DESKTOP.matches) {
      sbCollapsed = !sbCollapsed;
      appEl.dataset.sb = sbCollapsed ? 'closed' : 'open';
      try { localStorage.setItem('tn-sb', sbCollapsed ? 'closed' : 'open'); } catch {}
      syncSidebarA11y();
    } else setDrawer(appEl.dataset.drawer !== 'open');
  }
  function syncSidebarA11y() {
    const visible = DESKTOP.matches ? !sbCollapsed : appEl.dataset.drawer === 'open';
    sidebar.toggleAttribute('inert', !visible);
    sbBtn.setAttribute('aria-expanded', String(visible));
    sbBtn.replaceChildren(icon(DESKTOP.matches ? 'sidebar' : 'menu'));
  }
  /* Overlay sidebar: swiping left closes it (follows the finger, transform/opacity only). */
  (() => {
    /** @type {{ x0: number, y0: number, x: number, drag: boolean, w: number } | null} */
    let g = null;
    sidebar.addEventListener('touchstart', (e) => {
      if (DESKTOP.matches || appEl.dataset.drawer !== 'open' || e.touches.length !== 1) return;
      const t = e.touches[0]; g = { x0: t.clientX, y0: t.clientY, x: t.clientX, drag: false, w: sidebar.offsetWidth };
    }, { passive: true });
    sidebar.addEventListener('touchmove', (e) => {
      if (!g) return;
      const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (!g.drag) {
        if (dx < -8 && Math.abs(dx) > Math.abs(dy)) { g.drag = true; appEl.classList.add('is-drawer-drag'); }
        else if (Math.abs(dy) > 8) { g = null; return; } else return;
      }
      e.preventDefault();
      g.x = t.clientX;
      const off = Math.min(0, dx);
      sidebar.style.transform = `translateX(${off}px)`;
      scrim.style.setProperty('--tn-drawer-p', String(Math.max(0, 1 + off / g.w)));
    }, { passive: false });
    const end = () => {
      if (!g) return;
      const drag = g.drag, dx = g.x - g.x0, w = g.w; g = null;
      if (!drag) return;
      appEl.classList.remove('is-drawer-drag');
      sidebar.style.transform = ''; scrim.style.removeProperty('--tn-drawer-p');
      if (dx < -w * 0.3) setDrawer(false);
    };
    sidebar.addEventListener('touchend', end);
    sidebar.addEventListener('touchcancel', end);
  })();
  DESKTOP.addEventListener('change', () => { setDrawer(false); syncSidebarA11y(); if (cur.open) showDetail(cur.open); });

  /* ---- Theme: System → Light → Dark → System ---- */
  function themeNow() { return document.documentElement.dataset.theme || 'system'; }
  function cycleTheme() { setTheme(/** @type {string} */ ({ system: 'light', light: 'dark', dark: 'system' }[themeNow()])); }
  /** @param {string} next 'system' | 'light' | 'dark' */
  function setTheme(next) {
    if (next === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
    try { next === 'system' ? localStorage.removeItem('tn-theme') : localStorage.setItem('tn-theme', next); } catch {}
    syncTheme();
  }
  function syncTheme() {
    const mode = themeNow();
    const label = t({ system: 'shell.themeSystem', light: 'shell.themeLight', dark: 'shell.themeDark' }[mode]);
    themeBtn.dataset.tip = label; themeBtn.setAttribute('aria-label', t('shell.themeSwitch', { label }));
    themeBtn.replaceChildren(icon({ system: 'contrast', light: 'sun', dark: 'moon' }[mode]));
  }

  /* ---- Density: Compact ↔ Comfortable (only with createApp({ densitySwitch: true })) ---- */
  function cycleDensity() { chooseDensity(getDensity() === 'compact' ? 'comfortable' : 'compact'); }
  /** @param {'compact' | 'comfortable'} d */
  function chooseDensity(d) { setDensity(d, { persist: true }); syncDensity(); }
  function syncDensity() {
    if (!densityBtn) return;
    const mode = getDensity();
    const label = t(mode === 'comfortable' ? 'shell.densityComfortable' : 'shell.densityCompact');
    densityBtn.dataset.tip = label; densityBtn.setAttribute('aria-label', t('shell.densitySwitch', { label }));
    densityBtn.replaceChildren(icon(mode === 'comfortable' ? 'grid' : 'list'));
  }

  /* ---- Settings sheet (phone): theme, density, language in one place ---- */
  function openSettings() {
    const rows = [
      field({ label: t('shell.theme') }, segmented({ label: t('shell.theme'), value: themeNow(), onChange: setTheme, options: [
        { value: 'system', label: t('shell.optSystem') }, { value: 'light', label: t('shell.optLight') }, { value: 'dark', label: t('shell.optDark') }] })),
    ];
    if (densityBtn) rows.push(field({ label: t('shell.density') }, segmented({ label: t('shell.density'), value: getDensity(), onChange: (v) => chooseDensity(v), options: [
      { value: 'compact', label: t('shell.optCompact') }, { value: 'comfortable', label: t('shell.optComfortable') }] })));
    if (langBtn) rows.push(field({ label: t('shell.language') }, select({ label: t('shell.language'), value: stored && offered.includes(stored) ? stored : 'auto', onChange: (v) => chooseLocale(String(v)),
      options: [{ value: 'auto', label: t('shell.languageAuto') }, ...offered.map((l) => ({ value: l, label: LOCALE_NAMES[l] || l }))] })));
    openSheet({ title: t('shell.settings'), body: rows });
  }

  /* ---- Data status ---- */
  function renderFresh() {
    if (!cfg.source) return;
    const s = cfg.source.state;
    fresh.classList.toggle('is-stale', !!(s.stale && (s.data || s.error)));
    fresh.classList.toggle('is-loading', !!s.loading);
    fresh.textContent = !s.data ? (s.error ? t('shell.noData') : t('shell.loadingShort')) : t(s.stale ? 'shell.updatedStale' : 'shell.updated', { age: fmtAgo(s.age) });
    fresh.setAttribute('aria-label', s.fetchedAt ? t('shell.freshAriaAt', { text: fresh.textContent, time: fmtFull(s.fetchedAt) }) : t('shell.freshAria', { text: fresh.textContent }));
  }
  function renderBanners() {
    const s = srcState, items = [];
    if (s?.error && s.data) items.push(banner(t('shell.updateFailed', { error: s.error }), { tone: 'warn' }));
    if (s?.data && s.stale) items.push(banner(t('shell.dataStale', { age: fmtAgo(s.age) }), { tone: 'bad' }));
    mount(banners, items);
  }

  /* ---- Views ---- */
  /** @param {{ id: string } | undefined} [v] */
  function ctx(v = views.get(/** @type {string} */ (cur.view))) {
    return { app: api, view: v?.id, params: cur.params, open: cur.open, src: srcState, data: srcState?.data ?? null };
  }
  function renderView() {
    const v = /** @type {NonNullable<ReturnType<typeof views.get>>} */ (views.get(/** @type {string} */ (cur.view)));
    viewTitle.textContent = v.label;
    document.title = cfg.title ? `${v.label} · ${cfg.title}` : v.label;
    mount(content, v.render(/** @type {ViewContext} */ (ctx(v))));
    markSelected();
    renderNav();
  }
  function markSelected() {
    for (const el of content.querySelectorAll('[data-key].is-selected')) el.classList.remove('is-selected');
    if (!cur.open || !inspectorMode()) return;
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll('[data-key]'))) if (el.dataset.key === cur.open) el.classList.add('is-selected');
  }

  /* ---- Detail ---- */
  const inspectorMode = () => useInspector && DESKTOP.matches;
  /** @param {string} id @returns {DetailContent} */
  function detailContent(id) {
    const v = /** @type {NonNullable<ReturnType<typeof views.get>>} */ (views.get(/** @type {string} */ (cur.view)));
    const d = v.detail?.(id, /** @type {ViewContext} */ (ctx(v)));
    return d || { title: t('shell.notFound'), body: empty({ title: t('shell.itemNotFound'), text: t('shell.itemNotFoundText', { id }) }) };
  }
  function showDetail(id, { keepScroll = false } = {}) {
    const d = detailContent(id);
    if (inspectorMode()) {
      if (sheet) { closing = true; sheet.close('api'); closing = false; sheet = null; }
      inspTitle.textContent = d.title || '';
      inspSub.textContent = d.sub || ''; inspSub.hidden = !d.sub;
      const keep = keepScroll ? inspBody.scrollTop : 0;
      mount(inspBody, d.body); inspBody.scrollTop = keep;
      inspector.hidden = false; appEl.dataset.inspector = 'open';
    } else {
      hideInspector();
      if (sheet) sheet.update({ title: d.title, sub: d.sub, body: d.body, keepScroll });
      else sheet = openSheet({ title: d.title, sub: d.sub, body: d.body, kind: 'detail', onClose: () => { sheet = null; if (!closing) closeDetail(); } });
    }
    markSelected();
  }
  function hideInspector() { inspector.hidden = true; appEl.dataset.inspector = ''; }
  function hideDetail() {
    hideInspector();
    if (sheet) { closing = true; sheet.close('api'); closing = false; sheet = null; }
    markSelected();
  }
  function closeDetail() {
    if (!cur.open) { hideDetail(); return; }
    if (pushedOpen) { pushedOpen = false; history.back(); }
    else { history.replaceState(history.state, '', buildHash(cur.view, { ...cur.params, open: null })); onRoute(); }
  }

  /* ---- Router ---- */
  function onRoute() {
    const { view, params } = parseHash(location.hash, defaultView);
    if (!views.has(view)) { history.replaceState(null, '', buildHash(defaultView)); return onRoute(); }
    const open = params.open || null;
    const viewChanged = view !== cur.view;
    cur.params = params;
    if (viewChanged) {
      cur.view = view; cur.open = null; hideDetail();
      renderView();
      if (!DESKTOP.matches) setDrawer(false);
      window.scrollTo(0, 0);
    }
    if (open !== cur.open || viewChanged) {
      cur.open = open;
      if (!open) pushedOpen = false;
      open ? showDetail(open) : hideDetail();
    }
  }
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog:modal')) return; // Esc closes only the topmost layer: an open sheet first
    if (appEl.dataset.drawer === 'open') setDrawer(false);
    else if (cur.open && inspectorMode()) closeDetail();
  });

  /** @type {App} */
  const api = {
    el: appEl,
    get view() { return cur.view; },
    get openId() { return cur.open; },
    go(view, { open, params } = {}) {
      // one history entry per call; with open, “Back” only closes the detail and does not stay in the new view
      if (open) { location.hash = buildHash(view, { ...params, open }); pushedOpen = view === cur.view; }
      else if (view !== cur.view) location.hash = buildHash(view, params);
    },
    open(id) { location.hash = buildHash(cur.view, { ...cur.params, open: id }); pushedOpen = true; },
    closeDetail,
    /** Redraw the view (and open detail), e.g. after new data. */
    refresh() { if (!cur.view) return; renderView(); if (cur.open) showDetail(cur.open, { keepScroll: true }); },
    setCount(id, n, tone) { counts.set(id, n == null ? null : { n, tone }); renderNav(); },
    get isDesktop() { return DESKTOP.matches; },
  };

  if (cfg.icon && typeof cfg.icon === 'object') favicon(cfg.icon); else if (cfg.favicon) favicon(cfg.favicon);
  (cfg.root || document.body).append(appEl);
  syncTheme(); syncDensity(); syncSidebarA11y();
  onRoute();
  if (cfg.source) {
    cfg.source.subscribe((s) => {
      const hadData = srcState?.fetchedAt; srcState = s;
      renderFresh(); renderBanners();
      if (s.fetchedAt !== hadData || (!s.data && !s.loading)) api.refresh();
    });
    const source = cfg.source;
    setInterval(() => { srcState = source.state; renderFresh(); renderBanners(); }, 15_000);
  }
  return api;
}
