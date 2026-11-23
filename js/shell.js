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
import { banner, empty, toolbarRow } from './components.js';
import { openSheet, lockScroll, setBackHook } from './sheet.js';
import { parseHash, buildHash, resolveViews, viewParamsDiffer, viewParams } from './router.js';
import { stackFor, withLayer, withoutLayer, backStep, plan } from './levels.js';
import { fmtAgo, fmtFull, fmtDuration } from './format.js';
import { favicon } from './favicon.js';
import { getDensity, setDensity, watchDensity } from './density.js';
import { menu, toast } from './widgets.js';
import { showOverlay, removeOverlay, placeOverlay } from './overlay.js';
import { t, setLocale, setTimeZone, addMessages, resolveLocale, KIT_LOCALES, LOCALE_NAMES } from './i18n.js';
import { boardSwitcher, boardIcon } from './boards.js';
import { normalizeBoards } from './boards-data.js';
import { notifications, openInstallHint } from './notifications.js';
import { detectPlatform, manualInstall, browserEnv } from './notifications-data.js';
import { findRange, RANGE_PRESETS } from './prom-data.js';
import { combineSources } from './data.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./primitives.js').Status} Status */
/** @typedef {import('./data.js').DataSource} DataSource */
/** @typedef {import('./data.js').DataState} DataState */
/** @typedef {import('./prom-data.js').TimeRange} TimeRange */
/** @typedef {import('./boards-data.js').BoardList} BoardList */
/** @typedef {import('./boards-data.js').BoardCategory} BoardCategory */
/** @typedef {{ icon?: string, color?: string }} IconSpecObject Board icon drawn by favicon(): a Lucide name and a colour token name. */
/** @typedef {{ title: string, sub?: string, body?: Child }} DetailContent What detail() returns for the inspector, panel or bottom sheet. */
/** @typedef {{ n: number | string | null | undefined, tone?: Status }} CountSpec Nav counter with a colour. */
/** @typedef {{ app: App, view: string | undefined, params: Record<string, string>, open: string | null, src: DataState | null, data: any }} ViewContext Argument of render(), detail() and count(). */
/** @typedef {{ key: string, label: string, params?: Record<string, string>, icon?: string, count?: number | string | CountSpec | null, active?: boolean }} NavEntry One navigation entry of a view with `entries` (e.g. one per order): links to the view with `params`; active when the view is shown and every param matches, or when `active` says so. */
/** @typedef {{ label?: string | (() => string), collapsible?: boolean, collapsed?: boolean }} NavGroupDef A navigation group (`createApp({ navGroups: { id: … } })`, views refer to it with `group: id`): heading text, and whether a tap on the heading folds the group (the choice is kept per browser). */
/** @typedef {{ id: string, label: string | (() => string), group?: string | (() => string), icon?: string, hidden?: boolean, count?: number | string | CountSpec | null | ((ctx: ViewContext) => number | string | CountSpec | null | undefined), render: (ctx: ViewContext) => Child, detail?: (id: string, ctx: ViewContext) => DetailContent | null | undefined, source?: DataSource, freshness?: 'view' | 'app', entries?: (ctx: ViewContext) => NavEntry[] | null | undefined, title?: (ctx: ViewContext) => string | null | undefined, info?: (ctx: ViewContext) => (() => void) | null | undefined }} ViewDef One view of the app (a navigation entry). `source`: queries only this view needs – started when the view is shown, stopped when it is left, merged with the app's source (ctx.data, banners, source list). `freshness`: whose age the toolbar text shows – the view's own source (default when it has one) or the app's. `entries`: the view appears in the navigation as these entries (one per thing it shows, e.g. per order) instead of one entry. `title`: toolbar title from the data (default: label). `info`: returns what a tap on the ⓘ next to the toolbar title does (e.g. open a sheet with details); null hides the button. */
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
 *   fallbackLocale?: string,   // language for browsers none of whose languages is offered (default 'en'); the language menu stays
 *   locales?: string[],
 *   messages?: Record<string, Record<string, any>>,
 *   timeZone?: string,
 *   toolbarExtra?: Child,
 *   densitySwitch?: boolean,   // button next to the theme switch: compact ↔ comfortable (stored; for galleries and boards that offer both)
 *   notifications?: import('./notifications-data.js').NotificationsOptions,   // adds the entry "Notifications" (web push, browser half) to the sidebar; README "Notifications"
 *   back?: 'levels' | 'history',   // 'levels' (default): Back closes the topmost layer, then goes to the default view, then leaves; 'history': every view change is a history entry (before 0.6.0)
 *   ranges?: TimeRange[],   // presets of the time range control (default 1 h, 6 h, 24 h, 7 d, 30 d); a preset with `label` shows that text
 *   range?: string,   // id of the range at start (default: the first preset); the control only shows while a source follows the range
 *   exitHint?: boolean,   // installed app (display-mode standalone, minimal-ui, fullscreen) with back 'levels': Back on the default view first shows "Press back again to close" (default true)
 *   navGroups?: Record<string, NavGroupDef>,   // navigation groups by id (views: `group: id`): label, collapsible (0.11.0)
 * }} AppConfig Options of createApp(). title, boards, categories and view labels may be functions (evaluated after the locale is set).
 */
/** @typedef {{ el: HTMLElement, readonly view: string | null, readonly openId: string | null, go: (view: string, o?: { open?: string, params?: Record<string, string> }) => void, open: (id: string) => void, closeDetail: () => void, refresh: () => void, setCount: (id: string, n: number | string | null, tone?: Status) => void, readonly isDesktop: boolean, detailOf: (view: string, id: string, o?: { link?: boolean }) => DetailContent | null, readonly range: TimeRange, setRange: (id: string) => void }} App Returned by createApp(). */

const DESKTOP = window.matchMedia('(min-width: 1000px)');
/** Installed app: after the exit hint a second Back within this many ms leaves (the hint shows as long). */
const EXIT_MS = 2500;

/* “Install as app”: only visible when the browser offers beforeinstallprompt; gone after installation and in
   standalone mode. The event often fires before createApp(), so it is captured here at module load. */
const STANDALONE = window.matchMedia('(display-mode: standalone)');
/* Installed app in any display mode without browser UI: Back on the default view would close it, so the shell shows the exit hint first. */
const APP_MODE = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)');
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
 *   views: [{ id, label (string or function), group? (nav heading, string or function), icon, count?, render(ctx) → Node, detail?(id, ctx) → { title, sub, body } | null }],
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
  const loc = resolveLocale({ locale: cfg0.locale || queryLang, locales: offered, stored, languages: navigator.languages, fallback: cfg0.fallbackLocale });
  setLocale(loc.locale);
  if (cfg0.timeZone) setTimeZone(cfg0.timeZone);
  /* title, boards, categories, view labels and view groups may be functions (so they can call t() after the locale is set) */
  /** @template T @param {T | (() => T)} x @returns {T} */
  const val = (x) => (typeof x === 'function' ? /** @type {() => T} */ (x)() : x);
  const cfg = { ...cfg0, title: val(cfg0.title), boards: val(cfg0.boards), categories: val(cfg0.categories), views: resolveViews(cfg0.views) };

  const views = new Map(cfg.views.map((v) => [v.id, v]));
  const defaultView = cfg.defaultView || cfg.views[0].id;
  const useInspector = cfg.inspector !== false;
  const levels = cfg.back !== 'history';
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
  /* ⓘ next to the title (view.info): opens what the view says, e.g. a sheet with the details of the thing the view shows */
  let infoAction = /** @type {(() => void) | null} */ (null);
  const infoBtn = iconButton('info', { label: t('shell.viewInfo'), onClick: () => infoAction?.(), className: 'tn-toolbar-info' });
  infoBtn.hidden = true;
  /* the freshness text opens the source list (every source of the view: name, age, interval, note) with a reload button; on the phone that
     is the way to reload, the toolbar's reload button is hidden there */
  const fresh = h('button', { class: 'tn-fresh', type: 'button', onclick: () => (pop ? closePop(false) : openPop()), hidden: !cfg.source, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  const reloadBtn = iconButton('refresh', { label: t('common.reload'), onClick: () => doReload(), className: 'tn-hide-phone' });
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
  const rangeSlot = h('div', { class: 'tn-range', hidden: true });
  const toolbar = h('header', { class: 'tn-toolbar' }, sbBtn, viewTitle, infoBtn, h('div', { class: 'tn-toolbar-spacer' }), cfg.toolbarExtra || null, rangeSlot, fresh, reloadBtn, langBtn, densityBtn, themeBtn, settingsBtn);
  const banners = h('div', { class: 'tn-banners' });
  const content = h('main', { class: 'tn-content', id: 'tn-content', tabindex: '-1' });
  const inspTitle = h('h2', { class: 'tn-sheet-title' });
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
  /* Groups (navGroups): a collapsible group folds on a tap on its heading; the choice is kept per browser (localStorage tn-nav-<id>). */
  /** @param {string} g @returns {NavGroupDef | null} */
  const groupDef = (g) => (cfg.navGroups && Object.hasOwn(cfg.navGroups, g) ? cfg.navGroups[g] : null);
  /** @param {string} g */
  function groupFolded(g) {
    const def = groupDef(g);
    if (!def?.collapsible) return false;
    /** @type {string | null} */
    let stored = null;
    try { stored = localStorage.getItem(`tn-nav-${g}`); } catch {}
    return stored ? stored === 'closed' : !!def.collapsed;
  }
  /** @param {string} g */
  function toggleGroup(g) {
    const folded = !groupFolded(g);
    try { localStorage.setItem(`tn-nav-${g}`, folded ? 'closed' : 'open'); } catch {}
    renderNav();
    /** @type {HTMLElement | null} */ (navEl.querySelector(`[data-group="${CSS.escape(g)}"]`))?.focus({ preventScroll: true });
  }
  /** @param {string} g */
  function groupHead(g) {
    const def = groupDef(g);
    const label = def?.label != null ? val(def.label) : g;
    if (!def?.collapsible) return h('div', { class: 'tn-nav-group', role: 'presentation' }, label);
    const folded = groupFolded(g);
    return h('button', { class: 'tn-nav-group tn-nav-group-btn', type: 'button', 'data-group': g, 'aria-expanded': String(!folded), onclick: () => toggleGroup(g) },
      h('span', { class: 'tn-ellipsis' }, label), icon('chevron-down', { size: 14 }));
  }
  /** @param {any} c */
  const countBadge = (c) => { const n = c && typeof c === 'object' ? c : { n: c }; return n.n != null && n.n !== '' ? badge(String(n.n), { tone: n.tone || 'neutral', count: true }) : null; };
  /** @param {ViewDef & { label: string }} v @param {NavEntry} [e] */
  function navLink(v, e) {
    const params = e?.params || {};
    const active = e ? (e.active ?? (v.id === cur.view && Object.entries(params).every(([k, x]) => String(cur.params[k] ?? '') === String(x ?? '')))) : v.id === cur.view;
    const c = e ? e.count : (counts.get(v.id) ?? (typeof v.count === 'function' ? v.count(ctx(v)) : v.count));
    const ic = e ? e.icon : v.icon;
    return h('a', { class: cls('tn-nav-item', active && 'is-active'), href: buildHash(v.id, params), 'aria-current': active ? 'page' : null, 'data-entry': e ? e.key : null },
      ic && icon(ic), h('span', { class: 'tn-ellipsis' }, e ? e.label : v.label), countBadge(c));
  }
  function renderNav() {
    /** @type {string | null | undefined} */
    let lastGroup = null;
    mount(navEl, cfg.views.filter((v) => !v.hidden).flatMap((v) => {
      const head = v.group && v.group !== lastGroup ? groupHead(v.group) : null; // optional heading (view.group)
      lastGroup = v.group ?? lastGroup;
      if (lastGroup && groupFolded(lastGroup)) return [head];
      const links = v.entries ? (v.entries(/** @type {ViewContext} */ (ctx(v))) || []).map((e) => navLink(v, e)) : [navLink(v)];
      return [head, ...links];
    }));
  }
  /* Phone/tablet drawer: a tap on any entry closes it, also on the view already shown (its hash does not change, so onRoute() does not run). */
  navEl.addEventListener('click', (e) => {
    if (!DESKTOP.matches && appEl.dataset.drawer === 'open' && /** @type {Element} */ (e.target).closest?.('a.tn-nav-item')) setDrawer(false);
  });
  let drawerLocked = false;
  /** @type {(() => void) | null} */
  let drawerRelease = null;
  /** @param {boolean} open */
  function setDrawer(open) {
    appEl.dataset.drawer = open ? 'open' : '';
    scrim.classList.toggle('is-on', open);
    if (open !== drawerLocked) { drawerLocked = open; lockScroll(open); }
    /* back 'levels': the open drawer is a layer, Back closes it */
    if (open && !drawerRelease && levels) drawerRelease = addLayer(() => setDrawer(false));
    else if (!open && drawerRelease) { const r = drawerRelease; drawerRelease = null; r(); }
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
    renderPop();
    if (!activeSrc) { content.removeAttribute('aria-busy'); return; }
    const s = (mainSource() || activeSrc).state;
    fresh.classList.toggle('is-stale', !!(s.stale && (s.data || s.error)));
    fresh.classList.toggle('is-loading', !!s.loading || reloading);
    /* a range change keeps the old range's data until the new one arrives: the view keeps its layout, the charts show they are refreshing */
    if (activeSrc.state.refreshing) content.setAttribute('aria-busy', 'true'); else content.removeAttribute('aria-busy');
    fresh.textContent = !s.data ? (s.error ? t('shell.noData') : t('shell.loadingShort')) : t(s.stale ? 'shell.updatedStale' : 'shell.updated', { age: fmtAgo(s.age) });
    fresh.setAttribute('aria-label', s.fetchedAt ? t('shell.freshAriaAt', { text: fresh.textContent, time: fmtFull(s.fetchedAt) }) : t('shell.freshAria', { text: fresh.textContent }));
  }
  function renderBanners() {
    const s = srcState, items = [];
    if (s?.error && s.data) items.push(banner(t('shell.updateFailed', { error: s.error }), { tone: 'warn' }));
    if (s?.data && s.stale) items.push(banner(s.staleParts?.length ? t('shell.dataStaleParts', { parts: s.staleParts.join(', '), age: fmtAgo(s.age) }) : t('shell.dataStale', { age: fmtAgo(s.age) }), { tone: 'bad' }));
    mount(banners, items);
  }

  /* ---- Source list: the popover of the freshness text, and the reload ---- */
  /** The source whose age the freshness text shows: the view's own (unless the view says `freshness: 'app'`), otherwise the app's. */
  function mainSource() {
    const v = cur.view ? views.get(cur.view) : undefined;
    if (v?.source && (v.freshness !== 'app' || !cfg.source)) return v.source;
    return cfg.source || null;
  }
  /** Every source of the current view, combineSources split into their parts. @returns {[string, DataSource][]} */
  function sourceList() {
    const v = cur.view ? views.get(cur.view) : undefined;
    /** @type {[string, DataSource][]} */
    const out = [];
    /** @param {string} name @param {DataSource | null | undefined} src */
    const add = (name, src) => { if (!src) return; if (src.parts) for (const [n, p] of src.parts) add(n, p); else out.push([src.label || name, src]); };
    add(t('shell.sourceApp'), cfg.source); add(t('shell.sourceView'), v?.source);
    return out;
  }
  let reloading = false;
  /** @type {WeakMap<DataSource, 'newer' | 'same' | 'error'>} outcome of the last reload per source */
  const lastReload = new WeakMap();
  const MIN_SPIN = 600;   // the reload stays visible this long even when the answer takes 20 ms
  /** Reload every source of the view; the button turns while it runs, then the text shows the new age, and a reload that brought nothing
      newer says so (the source list says why). */
  async function doReload() {
    if (!activeSrc || reloading) return;
    reloading = true; syncReload();
    const before = new Map(sourceList().map(([, src]) => [src, src.state]));
    try { await Promise.all([activeSrc.reload(), new Promise((r) => setTimeout(r, MIN_SPIN))]); } catch { /* the error is in the state */ }
    for (const [src, b] of before) {
      const a = src.state;
      lastReload.set(src, a.error && a.error !== b.error ? 'error' : a.age != null && (b.age == null || a.age < b.age - 1) ? 'newer' : 'same');
    }
    reloading = false;
    if (activeSrc) srcState = activeSrc.state;
    syncReload(); renderFresh(); renderBanners();
    const main = mainSource();
    const leaves = sourceList().filter(([, src]) => src === main || main?.parts?.some(([, p]) => p === src));
    if (leaves.length && leaves.every(([, src]) => lastReload.get(src) === 'same') && !pop) toast(t('shell.reloadSame'), { action: { label: t('shell.sources'), onClick: openPop } });
  }
  function syncReload() {
    for (const b of [reloadBtn, popReload]) { b.classList.toggle('is-busy', reloading); b.setAttribute('aria-busy', String(reloading)); b.querySelector('svg')?.classList.toggle('tn-spin', reloading); }
    fresh.classList.toggle('is-loading', reloading || !!activeSrc?.state.loading);
  }
  /** @type {HTMLElement | null} */
  let pop = null;
  const popRows = h('div', { class: 'tn-pop-rows' });
  const popReload = button(t('common.reload'), { variant: 'ghost', icon: 'refresh', className: 'tn-pop-reload', onClick: () => doReload() });
  /** @param {[string, DataSource]} e */
  function sourceRow([name, src]) {
    const st = src.state, last = lastReload.get(src);
    const age = st.data == null ? (st.error ? t('shell.noData') : t('shell.loadingShort')) : t('shell.updated', { age: fmtAgo(st.age) });
    const every = src.interval ? t('shell.sourceEvery', { interval: fmtDuration(src.interval / 1000) }) : null;
    return h('div', { class: cls('tn-pop-src', st.stale && (st.data || st.error) && 'is-stale') },
      h('div', { class: 'tn-pop-head' }, h('span', { class: 'tn-pop-name tn-ellipsis' }, name), st.stale && (st.data || st.error) ? badge(t('shell.sourceStale'), { tone: 'bad' }) : null),
      h('div', { class: 'tn-pop-line' }, every ? `${age} · ${every}` : age),
      st.error ? h('div', { class: 'tn-pop-line is-error' }, st.error) : null,
      last === 'same' ? h('div', { class: 'tn-pop-line' }, t('shell.reloadSameSource')) : null,
      src.note ? h('div', { class: 'tn-pop-note' }, src.note) : null);
  }
  function renderPop() { if (pop) mount(popRows, sourceList().map(sourceRow)); }
  /** @param {Event} e */
  const popOutside = (e) => { if (pop && !pop.contains(/** @type {Node} */ (e.target)) && !fresh.contains(/** @type {Node} */ (e.target))) closePop(false); };
  /** @param {KeyboardEvent} e */
  const popEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); } };
  let popW = 0;
  const popResize = () => { if (Math.abs(document.documentElement.clientWidth - popW) >= 1) closePop(false); };
  function openPop() {
    if (pop || !activeSrc) return;
    pop = h('div', { class: 'tn-pop', role: 'dialog', 'aria-label': t('shell.sources') }, h('div', { class: 'tn-pop-title' }, t('shell.sources')), popRows, popReload);
    renderPop();
    showOverlay(pop);
    placeOverlay(pop, fresh.getBoundingClientRect(), { align: 'end' });
    fresh.setAttribute('aria-expanded', 'true');
    popW = document.documentElement.clientWidth;
    document.addEventListener('pointerdown', popOutside, true);
    document.addEventListener('keydown', popEsc, true);
    window.addEventListener('resize', popResize);
    popReload.focus({ preventScroll: true });
  }
  /** @param {boolean} refocus */
  function closePop(refocus) {
    if (!pop) return;
    removeOverlay(pop); pop = null; fresh.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', popOutside, true);
    document.removeEventListener('keydown', popEsc, true);
    window.removeEventListener('resize', popResize);
    if (refocus && fresh.isConnected) fresh.focus();
  }

  /* ---- Time range: one per app, kept as the view parameter `range` (a change replaces the history entry). Sources that follow it
     (promSource with a range query, combineSources over one) get it through setRange(), which aborts requests in flight and keeps the
     data of the old range (marked `refreshing`) until the new one arrives; the control only shows while such a source is active. ---- */
  const ranges = cfg.ranges?.length ? cfg.ranges : RANGE_PRESETS;
  let range = findRange(cfg.range, ranges);
  let rangeSync = false;
  /** @param {TimeRange} r @param {boolean} [long] */
  function rangeText(r, long) {
    if (r.label) return r.label;
    if (!long) return fmtDuration(r.seconds);
    const s = r.seconds;
    const [count, unit] = s % 86400 === 0 ? [s / 86400, 'Days'] : s % 3600 === 0 ? [s / 3600, 'Hours'] : [Math.max(1, Math.round(s / 60)), 'Minutes'];
    return t(`shell.range${unit}`, { count });
  }
  /* ---- Sources: the app's, and a view's own (`views[].source`), started while the view is shown and merged with the app's ---- */
  /** @type {DataSource | null} */
  let activeSrc = null;
  /** @type {DataSource | null} */
  let viewRunning = null;
  /** @type {(() => void) | null} */
  let unsubSrc = null;
  /** @type {Map<string, DataSource>} */
  const merged = new Map();
  /** The source the current view shows. @returns {DataSource | null} */
  function activeSource() {
    const v = cur.view ? views.get(cur.view) : undefined;
    if (!v?.source) return cfg.source || null;
    if (!cfg.source) return v.source;
    if (!merged.has(v.id)) merged.set(v.id, combineSources({ app: cfg.source, view: v.source }, { flat: true }));
    return /** @type {DataSource} */ (merged.get(v.id));
  }
  /** @param {DataState} s */
  function onSource(s) {
    const had = srcState; srcState = s;
    renderFresh(); renderBanners();
    if (rangeSync) return;   // inside a route: the view renders right after
    /* new data, or an error that appeared, changed or went away: a view whose own source failed completely (its part of ctx.data stays null, the
       merged data and the app's fetchedAt do not change) shows its error with "retry" at once, not its loading state until the next app fetch */
    /* also when a load ends in the error it already had: a view opened again while its source still fails drew its loading state for that
       load, and nothing else changes when the same error comes back */
    if (s.fetchedAt !== had?.fetchedAt || s.data !== had?.data || s.error !== had?.error || (!s.data && !s.loading) || (had?.loading && !s.loading && s.error)) api.refresh();
  }
  /** Follow the current view: subscribe to its source, stop the source of the view that was left. Range first, then start (one request). */
  function routeSource() {
    const src = activeSource();
    const own = (cur.view && views.get(cur.view)?.source) || null;
    if (viewRunning && viewRunning !== own) { viewRunning.stop(); viewRunning = null; }
    if (src !== activeSrc) {
      unsubSrc?.(); unsubSrc = null; activeSrc = src;
      fresh.hidden = reloadBtn.hidden = !src;
      rangeSync = true;
      try { unsubSrc = src ? src.subscribe(onSource) : null; } finally { rangeSync = false; }
      srcState = src?.state || null;
      renderFresh(); renderBanners();
    }
    const changed = syncRange();
    if (own && viewRunning !== own) { viewRunning = own; own.start(); srcState = activeSrc?.state || null; }
    return changed;
  }
  /** Hand the range to the active source and show the control (or hide it). Called on every route before the view renders; true when the
      source dropped its data for a new range. @returns {boolean} */
  function syncRange() {
    range = cur.params.range ? findRange(cur.params.range, ranges, range.id) : range;
    const src = activeSource();
    let changed = false;
    rangeSlot.hidden = !src?.ranged;
    if (src?.ranged && src.setRange) {
      const before = src.range?.id;
      rangeSync = true;
      try { src.setRange(range); } finally { rangeSync = false; }
      changed = before !== src.range?.id;
      if (changed) { srcState = src.state; renderFresh(); renderBanners(); }
    }
    if (rangeSlot.hidden) { rangeSlot.replaceChildren(); return changed; }
    if (rangeSlot.dataset.range === range.id && rangeSlot.firstChild) return changed;
    rangeSlot.dataset.range = range.id;
    /* a selector, not status: the long form the menu items use where there is room (≥ 600 px), the short one on the phone; menu() adds the chevron */
    const btn = button(rangeText(range, true), { variant: 'ghost', icon: 'clock', className: 'tn-range-btn' });
    btn.querySelector('span')?.replaceWith(h('span', { class: 'tn-range-long' }, rangeText(range, true)), h('span', { class: 'tn-range-short' }, rangeText(range)));
    btn.setAttribute('aria-label', t('shell.rangeAria', { range: rangeText(range, true) }));
    mount(rangeSlot, menu(btn, ranges.map((r) => ({ label: rangeText(r, true), checked: r.id === range.id, onClick: () => api.setRange(r.id) })), { label: t('shell.range') }));
    return changed;
  }

  /* ---- Views ---- */
  /** @param {{ id: string } | undefined} [v] */
  function ctx(v = views.get(/** @type {string} */ (cur.view))) {
    // params without `open` (the detail is ctx.open): a view that copies them into app.go() does not carry a detail along
    return { app: api, view: v?.id, params: viewParams(cur.params), open: cur.open, src: srcState, data: srcState?.data ?? null };
  }
  /* A redraw of the same view (new data: refresh()) rebuilds every control; the field the user is typing in keeps focus and caret
     (matched by position, tag, type and label; its text is the board's state, as filterBar({ value }) keeps it). */
  function captureField() {
    const a = document.activeElement;
    if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) || !content.contains(a)) return null;
    const label = a.getAttribute('aria-label') || ('placeholder' in a ? a.placeholder : '') || '';
    const field = a instanceof HTMLSelectElement ? null : a;
    return { index: [...content.querySelectorAll('input, textarea, select')].indexOf(a), tag: a.tagName, type: a.type, label, start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null };
  }
  /** @param {ReturnType<typeof captureField>} k */
  function restoreField(k) {
    if (!k || k.index < 0) return;
    const el = content.querySelectorAll('input, textarea, select')[k.index];
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || el.tagName !== k.tag || el.type !== k.type) return;
    if ((el.getAttribute('aria-label') || ('placeholder' in el ? el.placeholder : '') || '') !== k.label) return;
    el.focus({ preventScroll: true });
    if (k.start != null && !(el instanceof HTMLSelectElement)) { try { el.setSelectionRange(k.start, k.end); } catch { /* a type without a caret (checkbox) */ } }
  }
  /** @param {{ keepField?: boolean }} [o] */
  function renderView({ keepField = false } = {}) {
    const v = /** @type {NonNullable<ReturnType<typeof views.get>>} */ (views.get(/** @type {string} */ (cur.view)));
    const vc = /** @type {ViewContext} */ (ctx(v));
    const title = (v.title && v.title(vc)) || v.label;
    viewTitle.textContent = title;
    document.title = cfg.title ? `${title} · ${cfg.title}` : title;
    infoAction = v.info ? v.info(vc) || null : null;
    infoBtn.hidden = !infoAction;
    infoBtn.setAttribute('aria-label', t('shell.viewInfoAbout', { title }));
    const field = keepField ? captureField() : null;
    const a = document.activeElement, row = keepField && a instanceof HTMLElement && content.contains(a) ? a.dataset.key ?? null : null;   // a focused row (metricRow, table row)
    mount(content, v.render(/** @type {ViewContext} */ (ctx(v))));
    restoreField(field);
    if (row != null) [.../** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll('[data-key]'))].find((el) => el.dataset.key === row)?.focus({ preventScroll: true });
    markSelected();
    renderNav();
  }
  /** The row whose detail is open: aria-current on it and on no other (inspector and sheet alike, it is the state, not the look), the highlight
   * (is-selected) only beside an inspector. Kept here because opening or closing a detail draws nothing anew (a row drawn with `selected`
   * kept its aria-current from the drawing before). */
  function markSelected() {
    for (const el of content.querySelectorAll('[data-key].is-selected')) el.classList.remove('is-selected');
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll('[data-key][aria-current]'))) if (!cur.open || el.dataset.key !== cur.open) el.removeAttribute('aria-current');
    if (!cur.open) return;
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll('[data-key]'))) {
      if (el.dataset.key !== cur.open) continue;
      el.setAttribute('aria-current', 'true');
      if (inspectorMode()) el.classList.add('is-selected');
    }
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
      else sheet = openSheet({ title: d.title, sub: d.sub, body: d.body, kind: 'detail', back: false, onClose: () => { sheet = null; if (!closing) closeDetail(); } });
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
    if (levels) { const { open: _o, ...rest } = cur.params; navigate({ view: /** @type {string} */ (cur.view), params: rest }); return; }
    if (pushedOpen) { pushedOpen = false; history.back(); }
    else { history.replaceState(history.state, '', buildHash(cur.view, { ...cur.params, open: null })); onRoute(); }
  }

  /* ---- Router ---- */
  /* back 'history' (before 0.6.0): every hash change is a history entry, the router follows hashchange. */
  function onRoute() {
    const { view, params } = parseHash(location.hash, defaultView);
    if (!views.has(view)) { history.replaceState(null, '', buildHash(defaultView)); return onRoute(); }
    applyRoute({ view, params });
  }
  /** Show a route (view, detail); the URL is the caller's business. @param {import('./levels.js').Route} route */
  function applyRoute({ view, params }) {
    const open = params.open || null;
    const viewChanged = view !== cur.view;
    const paramsChanged = !viewChanged && viewParamsDiffer(cur.params, params);   // filter, tab, sort, range of the same view: redraw it
    cur.params = params;
    if (viewChanged) cur.view = view;
    const rangeChanged = routeSource();
    if (viewChanged) {
      cur.open = null; hideDetail(); closePop(false);
      renderView();
      if (!DESKTOP.matches) setDrawer(false);
      window.scrollTo(0, 0);
    }
    const openChanged = open !== cur.open || viewChanged;
    if (openChanged) {
      cur.open = open;
      if (!open) pushedOpen = false;
      open ? showDetail(open) : hideDetail();
    }
    /* same view, other parameters (or a range the source took): one redraw like refresh(): focus, caret, scroll and the open detail stay;
       opening or closing a detail alone draws nothing */
    if (!viewChanged && (paramsChanged || rangeChanged)) {
      renderView({ keepField: true });
      if (cur.open && !openChanged) showDetail(cur.open, { keepScroll: true });
    }
  }
  /* back 'levels' (default): the history holds what Back should walk through – base entry (default view), the other view, one entry per open
     layer (detail, sheet, dialog, drawer); js/levels.js computes it. `model` is that stack, `phys` the browser's position in our entries (stamped
     into history.state), `guard` the extra entry below the base in an installed app that catches Back for the exit hint. History operations
     are batched per task (a layer that closes and one that opens in the same tap replace each other) and wait for a running traversal. */
  /** @type {import('./levels.js').Entry[]} */
  let model = [];
  let phys = 0, expected = 0, queued = false, touched = false, layerSeq = 0, exitUntil = 0;
  const layerClose = new Map();
  const guard = () => (levels && cfg.exitHint !== false && APP_MODE.matches && Date.now() >= exitUntil ? 1 : 0);
  const state = () => ({ tnp: phys, tns: model.filter((e) => e.layer == null) });
  /** @param {import('./levels.js').Route} route */
  function navigate(route) {
    if (!views.has(route.view)) route = { view: defaultView, params: {} };
    const dropped = model.filter((e) => e.layer != null);   // a route change closes sheets, dialogs and the drawer
    model = stackFor(route, defaultView, model[0]);
    for (const e of dropped) closeLayer(e.layer);
    applyRoute(route);
    schedule();
  }
  /** @param {number | undefined} id */
  function closeLayer(id) { const f = layerClose.get(id); layerClose.delete(id); f?.(); }
  /** A sheet, dialog or the drawer opened: one entry on top; returns its release. @param {() => void} close @returns {() => void} */
  function addLayer(close) {
    const id = ++layerSeq;
    layerClose.set(id, close);
    model = withLayer(model, id); schedule();
    return () => { if (!layerClose.has(id)) return; layerClose.delete(id); model = withoutLayer(model, id); schedule(); };
  }
  function schedule() { if (!queued) { queued = true; queueMicrotask(sync); } }
  function sync() {
    queued = false;
    if (expected) return;   // a traversal is running: popstate syncs again
    /* entries are only added once the user has touched the page: Chrome's back button skips entries a page adds before any user activation */
    const ua = /** @type {any} */ (navigator).userActivation;
    const p = plan({ phys, stack: model, guard: guard(), canPush: ua ? ua.hasBeenActive : touched });
    const top = model[model.length - 1].hash;
    if (p.go) { expected++; phys += p.go; history.go(p.go); return; }
    for (let i = 0; i < p.push; i++) { phys++; history.pushState(state(), '', top); }
    if (p.push) return;
    history.replaceState(state(), '', top);
  }
  function onPop() {
    const st = history.state, want = () => model.length - 1 + guard();
    const ours = typeof st?.tnp === 'number';
    if (expected && ours) { expected--; phys = st.tnp; if (!expected) sync(); return; }   // our own history.go()
    if (!ours || st.tnp > phys) {
      /* an entry the browser added (typed URL, location.hash, a link we did not catch) or Forward: folded into the model without a traversal (a
         history.go() here races with the next fragment navigation); entries below it that the model does not need stay as they are */
      phys = ours ? st.tnp : location.hash === model[model.length - 1]?.hash ? phys : phys + 1;   // the same URL again replaces the entry, it adds none
      navigate(parseHash(location.hash, defaultView));
      phys = Math.min(phys, want());
      return;
    }
    const step = backStep(model, Math.max(1, phys - st.tnp));   // the same position again: an entry folded in above, one step back as well
    model = step.stack;
    for (const e of step.closed) if (e.layer != null) closeLayer(e.layer);
    applyRoute(parseHash(model[model.length - 1].hash, defaultView));
    phys = Math.min(st.tnp, want());
    if (step.exit && guard()) {   // installed app, Back on the default view: the hint; a second Back within EXIT_MS leaves, after that the guard is back
      exitUntil = Date.now() + EXIT_MS;
      toast(t('shell.backAgain'), { duration: EXIT_MS });
      setTimeout(schedule, EXIT_MS);
    } else if (step.exit) { history.back(); return; }   // Back on the default view leaves the page, also from an entry folded in above the base
    sync();
  }
  if (levels) {
    setBackHook(addLayer);
    window.addEventListener('popstate', onPop);
    /* the first touch or key adds the entries a deep link (or the installed app's guard) is missing; navigator.userActivation where it exists */
    const act = (/** @type {Event} */ e) => { if (e.isTrusted) touched = true; };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown']) window.addEventListener(ev, act, { capture: true });
    for (const ev of ['click', 'keyup']) window.addEventListener(ev, schedule);
    /* links to #/view (navigation, content) go through the model instead of adding an entry */
    document.addEventListener('click', (e) => {
      const a = /** @type {Element} */ (e.target).closest?.('a[href^="#/"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.getAttribute('target')) return;
      e.preventDefault();
      navigate(parseHash(a.getAttribute('href'), defaultView));
    });
  } else window.addEventListener('hashchange', onRoute);
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
      // a detail opens only through `open`; an `open` inside params (a copy of an older route) is dropped
      if (params) params = viewParams(params);
      // back 'levels': the history follows the levels (js/levels.js); same view with other params replaces
      if (levels) { if (!open && view === cur.view && !params) return; navigate({ view, params: { ...params, ...(open ? { open } : {}) } }); return; }
      // back 'history': one history entry per call; with open, “Back” only closes the detail and does not stay in the new view
      if (open) { location.hash = buildHash(view, { ...params, open }); pushedOpen = view === cur.view; }
      else if (view !== cur.view) location.hash = buildHash(view, params);
      else if (params) { history.replaceState(history.state, '', buildHash(view, params)); onRoute(); }   // same view, other params: replace
    },
    open(id) {
      if (levels) { navigate({ view: /** @type {string} */ (cur.view), params: { ...cur.params, open: id } }); return; }
      location.hash = buildHash(cur.view, { ...cur.params, open: id }); pushedOpen = true;
    },
    closeDetail,
    /** Redraw the view (and open detail), e.g. after new data. */
    refresh() { if (!cur.view) return; renderView({ keepField: true }); if (cur.open) showDetail(cur.open, { keepScroll: true }); },
    setCount(id, n, tone) { counts.set(id, n == null ? null : { n, tone }); renderNav(); },
    /** The detail another view defines, for a view that shows things it does not own: `detail: (id, ctx) => ctx.app.detailOf('jobs', id, { link: true })`. link: add "Open in <view>" (the only way to move to the other view). */
    detailOf(viewId, id, { link = false } = {}) {
      const v = views.get(viewId);
      const d = v?.detail?.(id, /** @type {ViewContext} */ (ctx(v)));
      if (!v || !d) return null;
      return link ? { ...d, body: [d.body, toolbarRow(button(t('shell.openInView', { view: v.label }), { variant: 'ghost', iconAfter: 'chevron-right', onClick: () => api.go(viewId, { open: id }) }))] } : d;
    },
    get isDesktop() { return DESKTOP.matches; },
    get range() { return range; },
    setRange(id) {
      const r = findRange(id, ranges, range.id);
      if (!cur.view || (r.id === range.id && cur.params.range === r.id)) return;
      const params = { ...cur.params, range: r.id };
      if (levels) { navigate({ view: cur.view, params }); return; }
      history.replaceState(history.state, '', buildHash(cur.view, params)); onRoute();
    },
  };

  if (cfg.icon && typeof cfg.icon === 'object') favicon(cfg.icon); else if (cfg.favicon) favicon(cfg.favicon);
  (cfg.root || document.body).append(appEl);
  syncTheme(); syncDensity(); syncSidebarA11y();
  /* The buttons name the theme and density in effect, also when something else changes them (setDensity() in a board, data-density set by a page). */
  watchDensity(syncDensity);
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (levels) {
    /* reload: the stack and position stamped into history.state come back (open sheets do not); a fresh load (deep link, notification) starts
       with the one entry the browser has – the missing lower entries follow with the first touch (all at once; docs/shell.md "Back") */
    const st = history.state;
    if (typeof st?.tnp === 'number' && Array.isArray(st.tns) && st.tns.length) { phys = st.tnp; model = st.tns; }
    navigate(parseHash(location.hash, defaultView));
  } else onRoute();
  if (cfg.source || cfg.views.some((v) => v.source)) setInterval(() => { if (!activeSrc) return; srcState = activeSrc.state; renderFresh(); renderBanners(); }, 15_000);
  return api;
}
