// dashkit · gallery part 2: controls (primitives), feedback and overlays, charts, light/dark side by side, shell demos.
import {
  h, icon, card, section, button, iconButton, statTile, tiles, metricRow, list, kv, facts, statusDot, badge, empty, banner,
  segmented, tabs, log, toast, progress, usageBar, tooltip, menu, dataCard, boardSwitcher, boardGrid, boardIcon, normalizeBoards,
  lineChart, barChart, sparkline, donut, heatRow, timeline, openSheet, fmtBytes, fmtNum, fmtWhen, fmtTime, fmtDuration, fmtDate, fmtAgo, fmtPct,
  STATUS_TEXT, favicon, t, getLocale, getTimeZone, KIT_LOCALES, LOCALE_NAMES,
} from '../js/dashkit.js';

const code = (txt) => h('pre', { class: 'g-code' }, txt.trim());
const demo = (title, usage, ...stage) => card({ title }, h('div', { class: 'g-demo' }, stage, usage && code(usage)));
const state = (label, el) => h('div', { class: 'g-state' }, el, h('span', { class: 'g-state-l' }, label));
const stage = (...k) => h('div', { class: 'g-stage' }, k);

/* deterministic pseudo-random values so screenshots stay comparable */
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const HOUR = 3600e3;
const nowH = () => Math.floor(Date.now() / HOUR) * HOUR;
export function demoSeries(n = 48, seed = 7) {
  const r = rng(seed), t0 = nowH() - (n - 1) * HOUR;
  const x = Array.from({ length: n }, (_, i) => t0 + i * HOUR);
  let a = 30, b = 12;
  const cpu = x.map((_, i) => (a = Math.max(2, Math.min(95, a + (r() - 0.5) * 14 + (i % 24 > 1 && i % 24 < 4 ? 18 : 0)))));
  const io = x.map(() => (b = Math.max(0, Math.min(60, b + (r() - 0.5) * 10))));
  return { x, cpu, io };
}

/* ---- Board switcher data: invented entries, only example.com addresses ---- */
const DEMO_BOARDS = [
  { id: 'maintenance', name: 'Maintenance', href: 'https://example.com/maintenance/', icon: { icon: 'server', color: 'blue' }, category: 'operations' },
  { id: 'network', name: 'Network and access', href: 'https://example.com/network/', icon: { icon: 'chart', color: 'green' }, category: 'operations' },
  { id: 'backups', name: 'Backups', href: 'https://example.com/backups/', icon: { icon: 'box', color: 'orange' }, category: 'operations' },
  { id: 'media', name: 'Media library', href: 'https://example.com/media/', icon: { icon: 'list', color: 'purple' }, category: 'home' },
  { id: 'power', name: 'Power', href: 'https://example.com/power/', category: 'home' },
  { id: 'wiki', name: 'Wiki', href: 'https://example.com/wiki/' },
  { id: 'long', name: 'Occupational safety regulation', href: 'https://example.com/long/' },
];
const DEMO_CATEGORIES = [{ id: 'operations', label: 'Operations' }, { id: 'home', label: 'Home' }];
const flat = DEMO_BOARDS.map(({ category, ...x }) => x);

/* ================= Primitives: controls ================= */
export function viewControls() {
  const out = h('span', { class: 'g-state-l' }, 'Selection: 24h');
  const seg = segmented({ options: [{ value: '24h', label: '24 h' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }], value: '24h', label: 'Time range', onChange: (v) => { out.textContent = `Selection: ${v}`; } });
  const runsFor = (n, seed, failEvery = 0) => runs(n, seed, failEvery);
  const logEntries = null; // log() lives in the feedback view
  void logEntries;
  return [
    h('p', { class: 'g-intro' }, 'Primitives are small, self-contained controls. All keyboard operable, touch targets at least 40 px, animation only via transform/opacity.'),
    h('div', { class: 'g-grid2' },
      demo('segmented()', `segmented({ options: [{ value: '24h', label: '24 h' }, …], value, label: 'Time range',\n  onChange: (v) => … })   // arrow keys switch; el.setValue(v)`,
        h('div', { class: 'g-stage-col' }, state('normal', seg), out,
          state('small', segmented({ small: true, options: [{ value: 'a', label: 'All' }, { value: 'f', label: 'Errors' }, { value: 'w', label: 'Warnings' }], value: 'f' })),
          state('with icons', segmented({ options: [{ value: 'l', icon: 'list', title: 'List' }, { value: 'g', icon: 'grid', title: 'Tiles' }], value: 'l', label: 'Layout' })))),
      demo('tooltip() and hint', `iconButton('info', { label: 'Info', hint: 'Longer explanation' })   // icon-only buttons have the hint built in; tooltip(el, text) for others\n// mouse: hover 350 ms · keyboard: focus · touch: long press, stays after release\n// truncated text (.dk-ellipsis) shows its full text automatically; fully visible text gets no hint`,
        stage(state('icon button', iconButton('info', { label: 'Info', hint: 'Runs daily at 04:15, takes about 30 s' })),
          state('tooltip() on any element', tooltip(h('button', { class: 'dk-iconbtn', type: 'button', 'aria-label': 'More' }, icon('more')), 'Any element with a hint')),
          state('truncated', h('span', { class: 'dk-ellipsis g-clip' }, 'offsite-sync-archive-nas-b-daily-04-15')),
          state('fully visible (no hint)', h('span', { class: 'dk-ellipsis g-clip' }, 'Short'))))),
    demo('tabs()', `tabs({ tabs: [{ id: 'runs', label: 'Runs', count: 7, render: () => … }, …], value, onChange })`,
      tabs({ tabs: [
        { id: 'runs', label: 'Runs', count: 7, render: () => heatRow({ items: runsFor(30, 3), size: 'lg' }) },
        { id: 'log', label: 'Log', count: 6, render: () => log(demoLog(), { max: 4 }) },
        { id: 'errors', label: 'Errors', count: 3, tone: 'bad', render: () => list(demoLog().filter((e) => e.level === 'bad'), (e) => metricRow({ title: e.text, status: 'bad' })) },
        { id: 'empty', label: 'Empty', count: 0, render: () => empty({ title: 'No notes', compact: true }) },
      ] })),
    demo('progress()', `progress({ value: 0.42, label: 'Upload', showValue: true })\nprogress({ value: null })   // indeterminate · tone: 'ok' | 'warn' | 'bad'`,
      h('div', { class: 'g-stage-col' }, progress({ value: 0.42, label: 'Offsite upload', showValue: true }), progress({ value: 0.93, tone: 'bad', label: 'Error rate', showValue: true }),
        progress({ value: null, label: 'Indexing …' }), progress({ value: 0, label: 'Empty', showValue: true }))),
  ];
}

function demoLog() {
  const now = Date.now();
  return [
    { t: now - 60e3, level: 'info', src: 'offsite-sync', text: 'Start rsync to nas-b:/archive (3 targets)' },
    { t: now - 55e3, level: 'debug', src: 'offsite-sync', text: 'sending incremental file list' },
    { t: now - 40e3, level: 'warn', src: 'offsite-sync', text: 'Connection slow: 1.2 MB/s (threshold 5 MB/s)' },
    { t: now - 31e3, level: 'bad', src: 'offsite-sync', text: 'rsync: connection unexpectedly closed (0 bytes received so far) [Receiver] – rsync error: error in rsync protocol data stream (code 12) at io.c(232)' },
    { t: now - 30e3, level: 'info', src: 'scheduler', text: 'Next attempt in 15 min' },
    { t: now - 3 * HOUR, level: 'ok', src: 'photo-backup', text: 'finished in 21 min, 45 GB' },
  ];
}

/* ================= Components: feedback, menus, data cards, logs ================= */
export function viewFeedback() {
  const menuBtn = menu(iconButton('more', { label: 'Actions' }), [
    { label: 'Run now', icon: 'refresh', onClick: () => toast('Run started', { tone: 'ok' }) },
    { label: 'Open log', icon: 'external', hint: 'L', onClick: () => toast('Log opened') },
    { label: 'Errors only', checked: true, onClick: () => {} },
    { label: 'Disabled', icon: 'x', disabled: true },
    '-',
    { label: 'Remove job', icon: 'x', danger: true, onClick: () => toast('Removal cancelled', { tone: 'warn', action: { label: 'Undo', onClick: () => {} } }) },
  ]);
  const menuBtn2 = menu(button('Sort', { iconAfter: 'chevron-down' }), [{ label: 'Name', checked: true }, { label: 'Status', checked: false }, { label: 'Last run', checked: false }], { align: 'start' });
  return [
    h('p', { class: 'g-intro' }, 'Menus, toasts and data cards sit above open sheets (overlay layer); logs and usage bars show live state.'),
    h('div', { class: 'g-grid2' },
      demo('menu()', `menu(iconButton('more', { label: 'Actions' }), [\n  { label: 'Run now', icon: 'refresh', onClick },\n  { label: 'Errors only', checked: true, onClick }, '-',\n  { label: 'Remove', danger: true, onClick }])`,
        stage(state('icon button', menuBtn), state('button, left aligned', menuBtn2))),
      demo('toast()', `toast('Saved', { tone: 'ok' })\ntoast('Removed', { tone: 'warn', action: { label: 'Undo', onClick } })   // max. 3, 4 s`,
        stage(button('ok', { onClick: () => toast('Run started', { tone: 'ok' }) }),
          button('error', { onClick: () => toast('Restart failed: timeout after 30 s', { tone: 'bad' }) }),
          button('with action', { onClick: () => toast('Job removed', { tone: 'warn', action: { label: 'Undo', onClick: () => toast('Restored', { tone: 'ok' }) } }) }))),
      demo('dataCard()', `dataCard(element, () => [h('div', { class: 'dk-tip-head' }, 'Title'), …], { onItem })\n// For elements whose content is only visible on hover (heatRow, timeline, usageBar bring it along).\n// Mouse: instantly, gone on leave · touch: tap shows, drag scrubs, tap elsewhere closes · onItem: click or second tap`,
        stage(state('own element', dataCard(h('button', { class: 'dk-btn dk-btn-ghost', type: 'button' }, 'Card'), () => [h('div', { class: 'dk-tip-head' }, 'Example'), h('div', null, 'Content only while hovering')])),
          state('with action', dataCard(h('button', { class: 'dk-btn dk-btn-default', type: 'button' }, 'Action'), () => [h('div', { class: 'dk-tip-head' }, 'Second tap'), h('div', null, 'triggers the action')], { onItem: () => toast('Action triggered', { tone: 'ok' }) })))),
      demo('usageBar()', `usageBar({ used, total, label: '/srv', warnAt: .8, badAt: .9 })   // tone from thresholds\nusageBar({ used, total, label, segments: [{ label, value, color }] })`,
        h('div', { class: 'g-stage-col' },
          usageBar({ used: 412e9, total: 1e12, label: 'nas-a /srv' }),
          usageBar({ used: 852e9, total: 1e12, label: 'nas-b /archive', sub: 'grows about 4 GB/day, full in ~37 days' }),
          usageBar({ used: 236e9, total: 250e9, label: 'app-2 / (system, Docker, logs with a very long name)' }),
          usageBar({ used: 610e9, total: 1e12, label: 'Breakdown', segments: [{ label: 'Photos', value: 320e9 }, { label: 'Documents', value: 90e9 }, { label: 'Media', value: 200e9 }] })))),
    demo('log()', `log([{ t, level: 'bad' | 'warn' | 'info' | 'ok' | 'debug', src, text }], { max: 200, wrap: false })\n// newest first, monospace, long lines truncated (wrap: true wraps them)`,
      h('div', { class: 'g-grid2' }, state('truncated', log(demoLog())), state('wrapping', log(demoLog().slice(2, 4), { wrap: true })), state('empty', log([], { empty: 'No runs yet' })))),
  ];
}

/* ================= Shell: board switcher, identity, language ================= */
export function viewShell(ctx) {
  const sw = (label, opts) => { const b = button(label, { icon: 'grid', iconAfter: 'chevron-down' }); boardSwitcher(b, opts); return b; };
  return [
    h('p', { class: 'g-intro' }, 'The shell is createApp() with its data source, the board icon and switcher, language menu and install button. A board gets its look from the tokens, its behaviour from the shell.'),
    demo('boardSwitcher() and boardGrid()', `createApp({ title: 'Maintenance', icon: { icon: 'server', color: 'blue' }, boardId: 'maintenance',
  boards: [{ id, name, href, icon?, category? }, …] | '/boards.json', categories: [{ id, label }] })
boardSwitcher(button, { boards, categories, boardId })   // or on your own button
// tile = real link (middle click / Ctrl-click: new tab); ≥ 700 px popover under the title, below a bottom sheet
// no icon: letter tile in a fixed colour from the name · unknown category → "Other"`,
      h('div', { class: 'g-stack' },
        h('div', { class: 'g-stage' },
          state('flat list', sw('Boards', { boards: flat, boardId: 'network' })),
          state('with categories', sw('Boards by category', { boards: DEMO_BOARDS, categories: DEMO_CATEGORIES, boardId: 'media' })),
          state('list not loadable', (() => { const b = button('Failure case', { icon: 'alert' }); boardSwitcher(b, { boards: './does-not-exist.json' }); return b; })())),
        h('div', { class: 'g-stage' },
          state('boardIcon({ icon, color })', boardIcon({ icon: 'server', color: 'purple' }, 'Maintenance', 44)),
          state('file (favicon.svg)', boardIcon('./favicon.svg', 'Gallery', 44)),
          state('no icon: letter', boardIcon(null, 'Wiki', 44)), state('other colour', boardIcon(null, 'Power', 44)),
          state('24 px (header)', boardIcon({ icon: 'chart', color: 'green' }, 'Network', 24))),
        h('div', { class: 'g-grid2' },
          state('flat grid', card({}, boardGrid(normalizeBoards(flat), { current: 'network' }))),
          state('grid with categories', card({}, boardGrid(normalizeBoards(DEMO_BOARDS, DEMO_CATEGORIES), { current: 'media' })))))),
    demo('Board identity: favicon() and language', `// Every board has its own favicon (SVG) and a descriptive title ("View · Board").
// With a file: <link rel="icon" type="image/svg+xml" href="favicon.svg">  (made by tools/brand.mjs; template: example/favicon.svg)
// Without a file:  favicon({ icon: 'server', color: 'purple' })   // or createApp({ icon: { icon, color } })
// Language: createApp({ locale?, locales?, messages? }); the language menu appears when more than one language is offered`,
      stage(
        state('Kit logo (icons/logo.svg)', h('img', { src: '../icons/logo.svg', width: 32, height: 32, alt: 'dashkit logo' })),
        state('Sample board', h('img', { src: '../example/favicon.svg', width: 32, height: 32, alt: 'Sample board icon' })),
        ['grid:blue', 'server:purple', 'chart:green', 'box:orange'].map((x) => { const [ic, co] = x.split(':'); return state(`favicon(${ic}, ${co})`, button('Try as tab icon', { small: true, onClick: () => favicon({ icon: ic, color: co }) })); }))),
    demo('Language and formats', `// ${KIT_LOCALES.map((l) => LOCALE_NAMES[l]).join(' · ')}   (active: ${getLocale()}, time zone ${getTimeZone()})\n// fmt*() use Intl with the active locale and time zone; kit texts come from js/locales/*.js via t(key, vars)`,
      h('div', { class: 'g-narrow' }, kv([
        ['Number', fmtNum(12345.678)], ['Percent', fmtPct(0.857)], ['Bytes', fmtBytes(48318382080)], ['Duration', fmtDuration(2950)],
        ['Age', fmtAgo(11100)], ['Time of day', fmtTime(Date.now())], ['Date', fmtDate(Date.now())], ['Yesterday 22:10', fmtWhen(Date.now() - 86400e3)],
        ['Status', Object.values(STATUS_TEXT).join(' · ')],
      ]))),
    demo('dataSource()', `const src = dataSource({ url: '/api/snapshot', interval: 60_000, staleAfter: 900,\n  ageOf: (d) => d.ageSec })   // age from the server, else from the fetch\ncreateApp({ title, views, source: src }); src.start();\n// the toolbar shows "Updated … ago" (red once stale), a reload button, banners on error/stale data`,
      h('div', { class: 'g-narrow' }, (() => {
        const s = ctx?.src || {};
        return kv([['URL', './fixture.json'], ['State', s.loading ? 'loading …' : s.error ? `Error: ${s.error}` : 'ok'], ['Fetched', s.fetchedAt ? fmtWhen(s.fetchedAt) : '–'], ['Age', fmtAgo(s.age)], ['Stale after', fmtDuration(s.staleAfter)]]);
      })())),
  ];
}

/* Detail for a row ("tap a row = detail"): here as a sheet with the individual runs. */
function runDetail(r) {
  return openSheet({ title: r.label || 'Run', sub: STATUS_TEXT[r.status] || r.status,
    body: [facts('Run', kv([['Time', r.t != null && fmtWhen(r.t)], ['Status', statusDot(r.status, { label: STATUS_TEXT[r.status] })]])),
      facts('Technical', kv([['Run', r.label]], { mono: true }))] });
}
function scheduleDetail(row, item) {
  const items = (row.items || []).slice(0, 12);
  return openSheet({ title: row.label, sub: row.sub,
    body: [facts('Schedule', kv([['Group', row.group], ['Cadence', row.band ? 'every 5 min' : `${items.length} run${items.length === 1 ? '' : 's'} today`], ['Selected', item && `${fmtWhen(item.start)}${item.end ? `–${fmtTime(item.end)}` : ''}`]])),
      items.length ? facts('Individual runs', h('div', { class: 'g-detail-list' }, list(items, (it) => metricRow({ title: `${fmtWhen(it.start)}${it.end ? `–${fmtTime(it.end)}` : ''}`, sub: it.end ? fmtDuration((it.end - it.start) / 1000) : null, status: row.status || 'ok', selected: item === it })))) : null] });
}

export function runs(n, seed, failEvery = 0) {
  const r = rng(seed), t0 = Date.now() - n * 6 * HOUR;
  return Array.from({ length: n }, (_, i) => ({ t: t0 + i * 6 * HOUR, status: failEvery && i % failEvery === failEvery - 1 ? 'bad' : r() < 0.1 ? 'bad' : r() < 0.12 ? 'warn' : 'ok', label: `Run ${i + 1}` }));
}

/* ================= Components: charts ================= */
export function demoSchedule() {
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const d = +day0, at = (hh, mm = 0) => d + (hh * 60 + mm) * 60e3;
  const rows = [
    { id: 'photo-backup', label: 'Photo backup', sub: '~21 min', group: 'backup', heavy: true, items: [{ start: at(2, 30), end: at(2, 51) }] },
    { id: 'doc-backup', label: 'Document backup', sub: '~9 min', group: 'backup', heavy: true, items: [{ start: at(3), end: at(3, 9) }] },
    { id: 'offsite', label: 'Offsite archive sync', sub: '~45 min', group: 'backup', heavy: true, status: 'bad', items: [{ start: at(4, 15), end: at(5, 0) }] },
    { id: 'db-dump', label: 'Wiki database dump', sub: '~2 min', group: 'backup', items: [{ start: at(1), end: at(1, 2) }] },
    { id: 'media-scan', label: 'Media library scan', sub: 'every 2 h, ~25 min', group: 'maintenance', heavy: true, items: Array.from({ length: 12 }, (_, i) => ({ start: at(i * 2, 40), end: at(i * 2, 65) })) },
    { id: 'thumbs', label: 'Thumbnail generation', sub: 'every 5 min', group: 'maintenance', band: [[at(0), at(24)]] },
    { id: 'logs', label: 'Log cleanup', sub: '< 1 min', group: 'maintenance', items: [{ start: at(0, 10), end: at(0, 11) }] },
    { id: 'certs', label: 'Certificate renewal with a long name', sub: 'Sun 05:00', group: 'maintenance', items: [{ start: at(5), end: at(5, 3) }] },
  ];
  return {
    start: d, end: d + 24 * HOUR, now: Date.now(), rows,
    groups: [{ id: 'backup', label: 'Backups' }, { id: 'maintenance', label: 'Maintenance' }],
    windows: [{ start: at(2), end: at(6), label: 'Maintenance window 02–06', tone: 'info' }],
  };
}

export function viewCharts() {
  const { x, cpu, io } = demoSeries(48, 11);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sch = demoSchedule();
  return [
    h('p', { class: 'g-intro' }, 'SVG without libraries, width follows the container (ResizeObserver). Tabular numbers, quiet axes. Scrub lines: move the mouse or swipe sideways. Colours only as token names (blue, green, …, ok/warn/bad).'),
    demo('lineChart()', `lineChart({ x: times, series: [{ label: 'CPU', values, color: 'blue' }, { label: 'I/O', values: io, color: 'orange' }],\n  height: 180, yFormat: (v) => fmtNum(v, 0) + ' %' })   // scrubbing with tooltip`,
      lineChart({ x, series: [{ label: 'CPU nas-a', values: cpu, color: 'blue' }, { label: 'I/O wait', values: io, color: 'orange' }], yFormat: (v) => `${fmtNum(v, 0)} %`, label: 'CPU and I/O over the last 48 hours' })),
    h('div', { class: 'g-grid2' },
      demo('Stacked area', `lineChart({ x, series, stacked: true, yFormat: fmtBytes })`,
        lineChart({ x: x.slice(-24), stacked: true, height: 150, series: [{ label: 'Photos', values: cpu.slice(-24).map((v) => v * 1e9), color: 'blue' }, { label: 'Documents', values: io.slice(-24).map((v) => v * 6e8), color: 'purple' }], yFormat: fmtBytes })),
      demo('Gaps and empty', `values with null break the line · without data: empty text`,
        h('div', { class: 'g-stage-col' }, lineChart({ x: x.slice(0, 24), area: true, height: 110, series: [{ label: 'Response time', values: cpu.slice(0, 24).map((v, i) => (i > 8 && i < 13 ? null : v * 4)), color: 'green' }], yFormat: (v) => `${fmtNum(v, 0)} ms` }),
          lineChart({ x: [], series: [], height: 70, empty: 'No measurements yet' })))),
    h('div', { class: 'g-grid2' },
      demo('barChart() vertical, stacked', `barChart({ labels: ['Mon', …], series: [{ label: 'ok', values, color: 'ok' }, { label: 'Error', values, color: 'bad' }],\n  stacked: true, onBar: (i) => … })`,
        barChart({ labels: days, stacked: true, height: 160, series: [{ label: 'successful', values: [14, 15, 12, 16, 15, 9, 8], color: 'ok' }, { label: 'warning', values: [1, 0, 2, 0, 1, 0, 0], color: 'warn' }, { label: 'error', values: [0, 1, 3, 0, 0, 0, 1], color: 'bad' }], yFormat: (v) => fmtNum(v, 0), onBar: (i) => openSheet({ title: days[i], sub: 'Runs on this day', body: facts('Result', kv([['Successful', fmtNum([14, 15, 12, 16, 15, 9, 8][i], 0)], ['Warning', fmtNum([1, 0, 2, 0, 1, 0, 0][i], 0)], ['Error', fmtNum([0, 1, 3, 0, 0, 0, 1][i], 0), [0, 1, 3, 0, 0, 0, 1][i] ? 'dk-t-bad' : null]])) }) })),
      demo('barChart() horizontal', `barChart({ horizontal: true, labels: hosts, series: [{ values: bytes }], yFormat: fmtBytes })`,
        barChart({ horizontal: true, labels: ['nas-a', 'nas-b', 'media-1', 'app-2', 'a-really-long-hostname-example', 'edge-1'], series: [{ label: 'Used', values: [412e9, 852e9, 1.2e12, 236e9, 54e9, 8e9], color: 'blue' }], yFormat: fmtBytes })),
      demo('barChart() grouped', `barChart({ labels, series: [a, b] })   // side by side without stacked`,
        barChart({ labels: days, height: 140, series: [{ label: 'last week', values: [3, 4, 2, 6, 5, 1, 2], color: 'graphite' }, { label: 'this week', values: [4, 3, 5, 5, 7, 2, 0], color: 'blue' }] }))),
    section('Small charts', {}, h('div', { class: 'g-grid2' },
      demo('sparkline()', `sparkline({ values, color: 'green' })   // fills the container · width: 80 for a fixed width`,
        tiles(statTile({ label: 'CPU nas-a', value: fmtNum(cpu.at(-1), 0), unit: '%', sub: sparkline({ values: cpu.slice(-24), color: 'blue' }) }),
          statTile({ label: 'Errors 7 d', value: '5', status: 'bad', sub: sparkline({ values: [0, 1, 3, 0, 0, 0, 1], color: 'bad', area: false }) })),
        stage(state('fixed width 80', sparkline({ values: io.slice(-20), width: 80, color: 'orange' })), state('too little data', sparkline({ values: [3], width: 80 })))),
      demo('donut()', `donut({ segments: [{ label: 'ok', value: 9, status: 'ok' }, …], center: '12', sub: 'Jobs' })\ndonut({ value: 0.82, max: 1, color: 'warn', size: 56 })   // fill ring`,
        stage(donut({ segments: [{ label: 'OK', value: 9, status: 'ok' }, { label: 'Warning', value: 1, status: 'warn' }, { label: 'Error', value: 1, status: 'bad' }, { label: 'Off', value: 1, status: 'unknown' }], sub: 'Jobs' }),
          state('fill level', donut({ value: 0.82, max: 1, color: 'warn', size: 56, thickness: 7 })), state('small', donut({ value: 0.31, max: 1, color: 'blue', size: 40, thickness: 5 })), state('empty', donut({ segments: [], center: '0', size: 56 })))),
      demo('heatRow()', `heatRow({ items: [{ t, status, label }], max: 30, onItem: (r) => … })   // newest on the right`,
        h('div', { class: 'g-stage-col' }, state('30 runs, tappable', heatRow({ items: runs(30, 5), onItem: runDetail })),
          state('few runs', heatRow({ items: runs(6, 9, 3) })), state('large', heatRow({ items: runs(20, 2), size: 'lg', max: 20 })))))),
    demo('timeline()', `timeline({ start, end, now, rows: [{ id, label, sub, group, heavy, items: [{ start, end }], band: [[s, e]] }],\n  groups, windows: [{ start, end, label }], conflicts: 'auto', onRow, onItem })\n// overlapping heavy runs are marked red; band = cadence under 15 min`,
      timeline({ ...sch, onRow: (r) => scheduleDetail(r), onItem: (r, it) => scheduleDetail(r, it) })),
  ];
}

/* ================= Tokens: light and dark side by side ================= */
export function viewThemes() {
  const sample = () => [
    tiles(statTile({ label: 'Jobs', value: '12', sub: '1 error', status: 'bad' }), statTile({ label: 'Storage', value: '1.9', unit: 'TB', sub: sparkline({ values: [3, 4, 4, 5, 6, 6, 7], color: 'blue' }) })),
    card({ title: 'Problems', sub: '2 current', flush: true }, list([
      { title: 'Offsite archive sync', sub: 'nas-b · rsync exit 12', value: '3 h ago', status: 'bad' },
      { title: 'Media library scan', sub: 'media-1 · takes longer than usual', value: '40 min ago', status: 'warn' },
    ], (r) => metricRow({ ...r, onClick: () => {} }))),
    card({}, h('div', { class: 'g-stage' }, button('Reload', { icon: 'refresh' }), button('Save', { variant: 'primary' }), segmented({ small: true, options: [{ value: 1, label: 'Day' }, { value: 2, label: 'Week' }], value: 1 }), badge('3', { tone: 'bad' }), statusDot('ok', { label: 'running' })),
      usageBar({ used: 852e9, total: 1e12, label: 'nas-b /archive' })),
    banner('Data is stale: updated 2 h ago', { tone: 'bad' }),
  ];
  return [
    h('p', { class: 'g-intro' }, 'The same building blocks in the light and the dark scheme side by side (color-scheme per container, tokens via light-dark()).'),
    h('div', { class: 'g-grid2' },
      h('div', { class: 'g-scheme g-scheme-dark' }, h('div', { class: 'dk-section-title' }, 'Dark'), sample()),
      h('div', { class: 'g-scheme g-scheme-light' }, h('div', { class: 'dk-section-title' }, 'Light'), sample())),
  ];
}
