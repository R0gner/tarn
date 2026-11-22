// tarn · mutants for verify --selftest (positive control).
// Each mutant injects a known fault (CSS or script, or a patch of a kit source file: patch: [{ file, from, to }]) and must produce a new finding of the expected rule.
// Checked only on the named views, dark.
export const MUTANTS = [
  {
    id: 'tile-overlap',
    page: 'gallery', views: ['cards'], sizes: ['phone', 'desktop'], expect: ['overlap'],
    css: '.tn-tiles > :nth-child(2) { margin-left: -60px; }',
  },
  {
    id: 'row-title-no-ellipsis',
    page: 'gallery', views: ['rows'], sizes: ['phone', 'desktop'], expect: ['clip'],
    css: '.tn-row-title { text-overflow: clip; }',
  },
  {
    id: 'button-misaligned',
    page: 'gallery', views: ['table'], sizes: ['phone', 'desktop'], expect: ['align'],
    css: '.tn-toolrow > .tn-btn:nth-child(2) { position: relative; top: 3px; }',
  },
  {
    // earlier banner fault: a long path without a break opportunity sets the minimum width, the column grows beyond the card
    id: 'banner-path-overflow',
    page: 'gallery', views: ['states'], sizes: ['phone', 'phone-s'], expect: ['overflow', 'page'],
    css: '.tn-banner-text { overflow-wrap: normal; } .g-demo, .g-stage-col { grid-template-columns: none; }',
  },
  {
    // earlier overlay fault: the menu hangs on the body instead of in the sheet and is not in the top layer → under the sheet, inert
    id: 'overlay-below-sheet',
    check: 'overlay', scenarios: ['sheet-menu'], sizes: ['phone', 'desktop'], expect: ['overlay-missing', 'overlay-top', 'overlay-inert'],
    js: `(() => { const orig = Element.prototype.append;
      Element.prototype.append = function (...a) { return orig.apply(a[0]?.classList?.contains('tn-menu') && this.matches('dialog') ? document.body : this, a); };
      HTMLElement.prototype.showPopover = function () {}; return true; })()`,
  },
  {
    // address bar fault: the menu closes on every resize, even when only the height changes
    id: 'menu-closes-on-height-change',
    check: 'overlay', scenarios: ['menu-height'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { window.addEventListener('resize', () => document.querySelectorAll('.tn-menu').forEach((m) => m.remove())); return true; })()`,
  },
  {
    // tooltip fault on touch: disappears immediately on release
    id: 'tooltip-gone-on-release',
    check: 'overlay', scenarios: ['tooltip-stays'], sizes: ['phone'], expect: ['overlay-behaviour'],
    js: `(() => { document.addEventListener('pointerup', () => document.querySelectorAll('.tn-tooltip').forEach((t) => { t.hidden = true; }), true); return true; })()`,
  },
  {
    // timeline too wide for the container: scrolls sideways (opt-in scrolling accidentally active)
    id: 'timeline-scrolls-sideways',
    page: 'gallery', views: ['charts'], sizes: ['phone', 'desktop'], expect: ['scroll-x'],
    css: '.tn-tl-grid { min-width: 900px; }',
  },
  {
    // identity: board without a favicon and with a meaningless title
    id: 'board-without-favicon-and-title',
    page: 'board', views: ['overview'], sizes: ['phone'], expect: ['identity'],
    js: `(() => { document.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove()); Object.defineProperty(document, 'title', { get: () => 'Board', set() {}, configurable: true }); return true; })()`,
  },
  {
    // “Install as app” stays visible in standalone mode too
    id: 'install-button-always-visible',
    check: 'overlay', scenarios: ['install'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { const fix = () => { const b = document.querySelector('.tn-install'); if (b && b.hidden) b.hidden = false; };
      new MutationObserver(fix).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); return true; })()`,
  },
  {
    // board switcher without a mark for the current board (aria-current is removed)
    id: 'switcher-without-current',
    check: 'overlay', scenarios: ['board-switcher'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { new MutationObserver(() => document.querySelectorAll('.tn-board[aria-current]').forEach((a) => a.removeAttribute('aria-current')))
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] }); return true; })()`,
  },
  {
    // a word is chopped letter by letter: narrow banner with a long German compound
    id: 'word-broken-by-letter',
    page: 'gallery', views: ['rows'], sizes: ['phone', 'desktop'], expect: ['wordbreak'],
    css: '.g-narrow-s .tn-banner { width: 96px; }',
  },
  {
    // missing translation: a German key is gone from the catalog and the board asks for it (the "i18n" rule must report it)
    id: 'missing-translation',
    page: 'board-de', views: ['overview'], sizes: ['phone'], expect: ['i18n'],
    js: `(async () => { const m = await import(new URL('../js/i18n.js', location.href).href); delete m.KIT_CATALOGS.de['shell.language']; m.t('shell.language'); return true; })()`,
  },
  {
    // after choosing a pill the control is replaced (as if the sheet were re-rendered): the focus is lost, the keyboard user starts again
    id: 'focus-lost-on-choice',
    check: 'overlay', scenarios: ['filter-sheet'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/filterbar.js', from: "onclick: () => toggle(def, o.value) },", to: "onclick: (e) => { toggle(def, o.value); const b = e.currentTarget; b.replaceWith(b.cloneNode(true)); } }," }],
  },
  {
    // comfortable density: one kind of icon button shrinks below 48 px (e.g. a local override of the size)
    id: 'comfortable-target-shrunk',
    page: 'gallery-comfortable', views: ['buttons'], sizes: ['phone', 'desktop'], expect: ['touch48'],
    css: '.tn-iconbtn { width: 40px; height: 40px; }',
  },
  {
    // comfortable density: the token itself is lowered (every control that follows --tn-hit gets small)
    id: 'comfortable-hit-token-lowered',
    page: 'gallery-comfortable', views: ['buttons', 'inputs'], sizes: ['phone', 'desktop'], expect: ['touch48'],
    css: ':root[data-density="comfortable"] { --tn-hit: 40px; --tn-input-h: 40px; --tn-btn-sm-h: 30px; }',
  },
  {
    // earlier toggle fault: the checked thumb travels a fixed 24 px and leaves its track (phone: 8 px outside, touching the label)
    id: 'toggle-thumb-leaves-track',
    page: 'gallery', views: ['inputs'], sizes: ['phone', 'desktop'], expect: ['contained'],
    css: '.tn-tick-input:checked + .tn-toggle-track > .tn-toggle-thumb { transform: translateX(24px); }',
  },
  {
    // the old overview: a problem row moves to the owning view instead of opening the detail where the user is
    id: 'row-leaves-view',
    check: 'overlay', scenarios: ['detail-in-place'], sizes: ['desktop'], expect: ['overlay-behaviour', 'overlay-missing'],
    patch: [{ file: 'example/board.js', from: "onClick: () => ctx.app.open(p.id),", to: "onClick: () => ctx.app.go(p.kind === 'job' ? 'jobs' : 'hosts', { open: p.id })," }],
  },
  {
    // the old x axis: a tick every 90 px whatever the labels, the label anchored by a fixed 20 px margin – with wider labels they touch and leave the chart
    id: 'axis-labels-crowd',
    page: 'gallery', views: ['charts', 'datasources'], sizes: ['phone', 'desktop'], expect: ['axis'],
    patch: [{ file: 'js/charts/scale.js', from: 'gap = 10, minSpacing = 72 }', to: 'gap = -40, minSpacing = 20 }' }],
  },
  {
    // a range change keeps the data of the old range until the new answer arrives: the chart shows 1 h of data under "7 d"
    id: 'range-keeps-old-data',
    check: 'overlay', scenarios: ['range-change'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/data.js', from: 'p.st.data = null; p.st.error = null;', to: 'p.st.error = null;' }],
  },
  {
    // the shell no longer keeps the focused field across a redraw (the old behaviour: the filter bar is rebuilt, the focus is gone)
    id: 'redraw-loses-focus',
    check: 'overlay', scenarios: ['filter-refresh'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "refresh() { if (!cur.view) return; renderView({ keepField: true });", to: "refresh() { if (!cur.view) return; renderView();" }],
  },
  {
    // the 0.7.0 redraw: a focused row lost the focus when new data arrived
    id: 'redraw-loses-row',
    check: 'overlay', scenarios: ['row-refresh'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "if (row != null) [", to: "if (row == null && row != null) [" }],
  },
  {
    // the 0.7.0 menu: a disabled item carried the disabled attribute and was left out of the arrow keys
    id: 'menu-disabled-hidden',
    check: 'overlay', scenarios: ['menu-disabled'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/widgets.js', from: "'aria-disabled': it.disabled ? 'true' : null,", to: "disabled: !!it.disabled," }],
  },
  {
    // the 0.7.0 faults: a click beside a type-to-confirm dialog cancelled it; Enter during an input method composition confirmed or chose
    id: 'confirm-typed-outside',
    check: 'overlay', scenarios: ['confirm-typed'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/confirm.js', from: "if (e.target === d && !typed) done(false);", to: "if (e.target === d) done(false);" }],
  },
  {
    id: 'ime-enter',
    check: 'overlay', scenarios: ['confirm-typed', 'combobox-ime'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/inputs-data.js', from: "export const imeComposing = (e) => !!e.isComposing || e.keyCode === 229;", to: "export const imeComposing = (e) => false;" }],
  },
  {
    // the 0.7.0 fault: overlays clamped against documentElement.clientWidth, which still counts the scrollbar gutter html reserves while the page
    // does not scroll; a hint at the right edge reached into the gutter and was cut
    id: 'overlay-gutter',
    check: 'overlay', scenarios: ['edge-scrollbar'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/overlay.js', from: "return w > 0 ? Math.min(d.clientWidth, Math.floor(w)) : d.clientWidth;", to: "return d.clientWidth;" }],
  },
  {
    // the 0.7.0 fault: a parameter change on the same view (a switch that calls app.go(view, { params })) changes the hash but draws nothing
    id: 'param-no-redraw',
    check: 'overlay', scenarios: ['param-redraw'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "if (!viewChanged && (paramsChanged || rangeChanged)) {", to: "if (!viewChanged && rangeChanged) {" }],
  },
  {
    // the 0.9.1 table: only the "Show more" button loads more rows
    id: 'table-no-auto-more',
    check: 'overlay', scenarios: ['table-load-more'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/table.js', from: '    drawMore();\n    watchMore();\n', to: '    drawMore();\n' }],
  },
  {
    // the 0.9.1 detail head: the title in one line ending in "…"
    id: 'detail-title-ellipsis',
    check: 'overlay', scenarios: ['detail-long-title'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "const inspTitle = h('h2', { class: 'tn-sheet-title' });", to: "const inspTitle = h('h2', { class: 'tn-sheet-title tn-ellipsis' });" },
      { file: 'js/sheet.js', from: "const titleEl = h('h2', { class: 'tn-sheet-title' });", to: "const titleEl = h('h2', { class: 'tn-sheet-title tn-ellipsis' });" }],
  },
  {
    // the 0.9.0 fault: ctx.params holds the open detail and go() takes it from params; a switch built from them reopens a detail that was
    // closed meanwhile (both guards off – each alone already keeps the detail closed)
    id: 'stale-open-in-params',
    check: 'overlay', scenarios: ['param-stale-open'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: 'params: viewParams(cur.params), open: cur.open', to: 'params: cur.params, open: cur.open' },
      { file: 'js/shell.js', from: '      if (params) params = viewParams(params);\n', to: '' }],
  },
  {
    // go() that takes `open` from params as well
    id: 'go-open-from-params',
    check: 'overlay', scenarios: ['param-stale-open'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: '      if (params) params = viewParams(params);\n', to: '' }],
  },
  {
    // the opposite: every route of the same view redraws it, also opening or closing a detail and the same parameters again
    id: 'param-redraw-always',
    check: 'overlay', scenarios: ['param-redraw'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "const paramsChanged = !viewChanged && viewParamsDiffer(cur.params, params);", to: "const paramsChanged = !viewChanged;" }],
  },
  {
    // the old tile grid: every tile one cell, so five tiles leave an empty cell in the last row
    id: 'tiles-ragged',
    page: 'gallery', views: ['cards'], sizes: ['phone', 'desktop'], expect: ['tiles-ragged'],
    css: '.tn-tiles[data-fit] > * { grid-column: span 1 !important; }',
  },
  {
    // a problem row's reason ends in "…" although the row asked to wrap it
    id: 'row-sub-wrap-ellipsis',
    page: 'gallery', views: ['rows'], sizes: ['phone-s'], expect: ['wrap-sub'],
    css: '.tn-row-sub-wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  },
  {
    // the browser prompt for the permission appears when the sheet opens, not after a tap on the button (browsers punish that, Safari refuses it)
    id: 'notifications-ask-on-open',
    check: 'overlay', scenarios: ['notifications'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/notifications-data.js', from: "if (!sub) return set({ kind: env.permission() === 'denied' ? 'blocked' : 'off', message: null });", to: "if (!sub) { env.requestPermission(); return set({ kind: env.permission() === 'denied' ? 'blocked' : 'off', message: null }); }" }],
  },
  {
    // the install entry is absent where the browser has no install prompt (iPhone, Safari): no way to find out how to install
    id: 'install-hint-absent',
    check: 'overlay', scenarios: ['install-hint'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour', 'overlay-missing'],
    patch: [{ file: 'js/shell.js', from: "installBtn.hidden = isStandalone() || (!installEvent && !manual());", to: "installBtn.hidden = isStandalone() || !installEvent;" }],
  },
  {
    // the old phone toolbar: theme, density and language as three separate buttons next to the reload button and the freshness text
    // (no single settings entry): the view title of the gallery is cut to “Foundati…” on a 390 px phone
    id: 'toolbar-crowded',
    page: 'gallery', views: ['foundations', 'themes'], sizes: ['phone'], expect: ['toolbar-title'],
    css: '.tn-hide-phone { display: inline-grid !important; } .tn-toolbar .tn-settings-btn { display: none !important; }',
  },
  {
    // earlier starter fault: the language switch shrinks in a full header row and scrolls sideways (comfortable phone: “Deutsch” cut off)
    id: 'segmented-squeezed',
    page: 'starter-comfortable', views: ['page'], sizes: ['phone-s'], expect: ['scroll-x'],
    css: '.st-header { flex-wrap: nowrap; } .st-header > .tn-seg { flex: 0 1 auto; min-width: 0; }',
  },
  {
    // a second submit while the first one runs is not ignored: the action is sent twice
    id: 'double-submit',
    check: 'overlay', scenarios: ['form-submit'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/form.js', from: "if (pending) return;", to: "" }],
  },
  {
    // the old history: every view change adds an entry, so Back walks through everything the user visited instead of going to the default view
    id: 'view-change-pushes',
    check: 'overlay', scenarios: ['back-views'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: 'model = stackFor(route, defaultView, model[0]);', to: 'model = [...model.filter((e) => e.layer == null), ...stackFor(route, defaultView, model[0]).slice(-1)];' }],
  },
  {
    // a deep link that adds its lower entries at load, before any user activation: Chrome's back button skips them, so Back leaves the board
    id: 'deeplink-seeds-untouched',
    check: 'overlay', scenarios: ['back-deeplink'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: 'canPush: ua ? ua.hasBeenActive : touched', to: 'canPush: true' }],
  },
  {
    // a sheet that takes no history entry: Back passes it by and changes the view underneath, the sheet stays open
    id: 'sheet-ignores-back',
    check: 'overlay', scenarios: ['back-sheet'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/sheet.js', from: "const release = opts.back === false ? null : backLayer(() => close('back'));", to: 'const release = null;' }],
  },
  {
    // an image viewer that takes no history entry: Back passes it by and closes the detail underneath (in an installed app: the app)
    id: 'viewer-ignores-back',
    check: 'overlay', scenarios: ['back-viewer'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: "const release = opts.back === false ? null : backLayer(() => close('back'));", to: 'const release = null;' }],
  },
  {
    // the 0.8.2 head: counter and close button straight on the picture (light grey, no background), unreadable on a light image
    id: 'viewer-controls-no-veil',
    check: 'overlay', scenarios: ['image-viewer'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'css/components.css', from: 'border-radius: var(--tn-pill-h); background: var(--tn-bg-sunken); color: var(--tn-text);', to: 'border-radius: var(--tn-pill-h); color: var(--tn-text-2);' }],
  },
  {
    // the 0.8.3 controls: a half-transparent black veil, a slightly different black over the viewer's grey margin
    id: 'viewer-controls-dark-veil',
    check: 'overlay', scenarios: ['image-viewer'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'css/components.css', from: '  background: var(--tn-bg-sunken); color: var(--tn-text);\n}', to: '  background: var(--tn-media-veil); color: var(--tn-text-on-media);\n}' }],
  },
  {
    // the 0.8.4 paging buttons: a full 44 px circle right at the screen edge
    id: 'viewer-nav-at-edge',
    check: 'overlay', scenarios: ['image-viewer'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'css/components.css', from: 'padding: calc((var(--tn-viewer-btn) - var(--tn-sz-36)) / 2); background-clip: content-box;', to: '' }],
  },
  {
    // a viewer whose arrow keys wrap round from the last image to the first
    id: 'viewer-wraps',
    check: 'overlay', scenarios: ['image-viewer'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: 'const to = stepIndex(cur, m, dir);', to: 'const to = (cur + dir + m) % m;' }],
  },
  {
    // a zoomed image that does not pan: every drag goes to the carousel, so it pages before the image's edge is reached
    id: 'viewer-pages-before-edge',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: 'lim: on.limits(zoom.s) });', to: 'lim: { x: 0, y: 0 } });' }],
  },
  {
    // the 0.8.0 fault: the neighbours are not loaded ahead, so a drag pulls in an empty (black) slide
    id: 'viewer-no-neighbours',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: 'for (const k of neighbours(cur, m)) load(k);', to: '' }],
  },
  {
    // a single tap that acts at once: the first half of a double tap beside the image closes the viewer
    id: 'viewer-doubletap-closes',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: 'tapTimer = setTimeout(() => { tapTimer = null; lastTap = null; on.tap(target); }, DOUBLE_TAP_MS);', to: 'on.tap(target);' }],
  },
  {
    // the 0.8.1 behaviour: a zoomed image stops where the finger lifts, however fast the drag was (no glide)
    id: 'viewer-no-fling',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: "if (ok && done.mode === 'pan') fling(e.timeStamp);", to: '' }],
  },
  {
    // a glide that ignores reduced motion
    id: 'viewer-fling-ignores-reduced-motion',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: "if (tokenMs('--tn-t-close') <= 0) return;", to: '' }],
  },
  {
    // a glide that a new finger does not stop
    id: 'viewer-fling-not-held',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images.js', from: 'held = raf !== 0;   // a new finger holds a gliding image where it is; that press is no tap (it must not close the viewer)\n    stopFling();', to: 'held = raf !== 0;' }],
  },
  {
    // double taps that wrap from 3.5× to 2× instead of going back to 1×
    id: 'viewer-zoom-no-reset',
    check: 'overlay', scenarios: ['image-zoom'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/images-data.js', from: 'return steps[0];\n}', to: 'return steps[1];\n}' }],
  },
  {
    // content that leaves sideways moves to the browser (no touch-action pan-y): it takes the touch as a pan and cancels it, no swipe switches.
    // (A swipe that ignores sideways scrollers is no mutant here: Chromium hands such a touch to the scroller and cancels the pointer anyway; the
    // check in js/swipe.js covers browsers that do not, the scenario checks the behaviour.)
    id: 'swipe-no-touch-action',
    check: 'overlay', scenarios: ['segmented-swipe'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'css/core.css', from: '.tn-segpane-swipe { touch-action: pan-y pinch-zoom; overflow-x: clip; }', to: '.tn-segpane-swipe { overflow-x: clip; }' }],
  },
  {
    // parts that wrap round: a swipe to the right on the first part shows the last one instead of a rubber band
    id: 'swipe-wraps',
    check: 'overlay', scenarios: ['segmented-swipe'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/swipe-data.js', from: 'return to < 0 || to >= n ? index : to;', to: 'return (to + n) % n;' }],
  },
  {
    // a swipe that moves the content with the finger although the user asked for reduced motion
    id: 'swipe-ignores-reduced-motion',
    check: 'overlay', scenarios: ['segmented-swipe'], sizes: ['phone'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/swipe.js', from: "const still = () => tokenMs('--tn-t-close') <= 0;", to: 'const still = () => false;' }],
  },
  {
    // earlier timeline fault: overflow-x auto alone makes overflow-y auto; the bars' hit area sticks out a few px below the grid, so a vertical
    // swipe on the timeline scrolled the timeline by about a millimetre and the page did not move
    id: 'timeline-scrolls-vertically',
    page: 'gallery', views: ['charts'], sizes: ['phone'], expect: ['scroll-y'],
    css: '.tn-tl-scroll { overflow-y: visible !important; } .tn-tl-grid { overflow-y: visible !important; }',
  },
  {
    // the half fix: overflow-y hidden on the scroller, but the bars' hit area still sticks out below the grid (scrollHeight 5–10 px above
    // clientHeight at phone size); focus or scrollIntoView on a bar in the last row moves the box vertically
    id: 'timeline-hidden-overflow',
    page: 'gallery', views: ['charts'], sizes: ['phone'], expect: ['scroll-y'],
    css: '.tn-tl-grid { overflow-y: visible !important; }',
  },
  {
    // the same fault, driven by a real finger: the vertical swipe on the old timeline moves the timeline and not the page
    id: 'timeline-catches-pan',
    check: 'overlay', scenarios: ['timeline-pan'], sizes: ['phone'], expect: ['overlay-behaviour'],
    css: '.tn-tl-scroll { overflow-y: visible !important; } .tn-tl-grid { overflow-y: visible !important; }',
  },
  {
    // earlier chrome fault: a long press on the board title or the view title selects it (the text was selectable like content)
    id: 'title-selectable',
    page: 'board', views: ['overview'], sizes: ['phone', 'desktop'], expect: ['select-chrome'],
    css: '.tn-toolbar, .tn-sidebar-head, .tn-toolbar-title, .tn-brand { user-select: text !important; -webkit-user-select: text !important; }',
  },
  {
    // the other side of the same rule: a too wide rule takes content along, table cells can no longer be selected and copied
    id: 'cells-unselectable',
    page: 'gallery', views: ['table'], sizes: ['phone', 'desktop'], expect: ['select-chrome'],
    css: '.tn-table td { user-select: none; -webkit-user-select: none; }',
  },
  {
    // earlier drawer fault: a tap on the entry of the view already shown changes nothing, the drawer stays open
    id: 'drawer-stays-on-current',
    check: 'overlay', scenarios: ['drawer-current'], sizes: ['phone'], expect: ['overlay-behaviour'],
    // (both ways the shell closes it: the drawer listener and, with back 'levels', a route change that closes the open layers)
    patch: [{ file: 'js/shell.js', from: "if (!DESKTOP.matches && appEl.dataset.drawer === 'open' && ", to: "if (false && " },
      { file: 'js/shell.js', from: 'const dropped = model.filter((e) => e.layer != null);', to: 'const dropped = [];' }],
  },
  {
    // earlier log fault: the log box kept the swipe to itself, so a sheet (or the page) did not scroll while the finger was on the log – also when the log had nothing to scroll
    id: 'log-traps-scroll',
    page: 'gallery', views: ['feedback'], sizes: ['phone', 'desktop'], expect: ['scroll-trap'],
    css: '.tn-log { overscroll-behavior: contain; }',
  },
  {
    // the explanation hangs on the body instead of in the sheet and is not lifted into the top layer → under the sheet, inert
    id: 'info-below-sheet',
    check: 'overlay', scenarios: ['sheet-info'], sizes: ['phone', 'desktop'], expect: ['overlay-missing', 'overlay-top', 'overlay-inert', 'overlay-behaviour'],
    patch: [{ file: 'js/components.js', from: "    showOverlay(el);\n    placeOverlay(el, btn.getBoundingClientRect());", to: "    document.body.append(el);\n    placeOverlay(el, btn.getBoundingClientRect());" }],
  },
  {
    // an explanation under a list on the overview (docs/dashboard-guidelines.md rule 2): always-visible running text beyond the section limit
    id: 'prose-on-view',
    page: 'board', views: ['overview'], sizes: ['phone', 'desktop'], expect: ['prose'],
    patch: [{ file: 'example/board.js', from: "section(t('board.sec.problems'), { count: problems.length },", to: "section(t('board.sec.problems'), { count: problems.length, footer: 'This list shows every job and host that is red or yellow right now, worst first. Tap a row to see why.' }," }],
  },
  {
    // a disclaimer banner that is on the view whatever the data says (rule 3)
    id: 'disclaimer-banner',
    page: 'board', views: ['overview'], sizes: ['phone', 'desktop'], expect: ['banner-info'],
    patch: [{ file: 'example/board.js', from: "  return [\n    tiles(", to: "  return [\n    banner('Note: the values on this page are estimates and may be incomplete.', { tone: 'info' }),\n    tiles(" }],
  },
  {
    // an info text far over INFO_MAX: a manual instead of a key (rule 5)
    id: 'info-too-long',
    page: 'gallery', views: ['cards'], sizes: ['phone', 'desktop'], expect: ['info-length'],
    patch: [{ file: 'gallery/gallery.js', from: "info: 'Bars are runs today. A red edge marks an overlap with a heavy run.' }", to: "info: 'Bars are runs today. A red edge marks an overlap with a heavy run. '.repeat(6) }" }],
  },
];
