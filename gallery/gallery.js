// tarn · gallery: every building block in all its states, grouped by level (tokens, primitives, components, shell); the navigation
// groups say which part a view shows: "Core · …" (works without the shell) or "Shell · …" (boards only), see docs/getting-started.md "Core and shell".
// Doubles as a self-test of the app shell. The gallery text is English; kit texts follow the language (en, de).
import {
  h, icon, ICON_NAMES, createApp, dataSource, statusDot, badge, button, iconButton, toast, card, section, statTile,
  metricRow, mediaRow, list, table, filterBar, matchFilters, kv, facts, banner, empty, error, loading, tiles, toolbarRow,
  cols, stack, openSheet, imageStrip, openImageViewer, normalizeImages, markdown, INFO_MAX, infoButton, fmtBytes, fmtDuration, fmtAgo, fmtNum, fmtPct, fmtWhen, matchQuery, STATUS_TEXT,
} from '../js/tarn.js';
import { viewControls, viewFeedback, viewShell, viewCharts, viewThemes } from './gallery2.js';
import { viewInputs } from './gallery-inputs.js';
import { viewForms, viewActions } from './gallery-forms.js';
import { REPORT, SECURITY_CASES } from './markdown-sample.js';
import { mockPush } from './mock-push.js';
import { viewDataSources, dataSourcesSource, dataSourcesReady } from './gallery-data.js';

/* ---- helpers ---- */
const code = (txt) => h('pre', { class: 'g-code' }, txt.trim());
const demo = (title, usage, ...stage) => card({ title }, h('div', { class: 'g-demo' }, stage, usage && code(usage)));
const state = (label, el) => h('div', { class: 'g-state' }, el, h('span', { class: 'g-state-l' }, label));
const stage = (...k) => h('div', { class: 'g-stage' }, k);
const noop = () => {};
/** The longest info text the guide allows: plain sentences cut at INFO_MAX characters. */
const INFO_TEXT_MAX = (() => {
  const base = 'Jobs that failed at least once in their last 30 runs and are OK now. The figure is the number of failed runs. A job leaves the list after 30 runs without a failure. Tap a row to see the runs and the reports. The list is sorted by the number of failures, most first, and holds at most ten jobs.';
  return base.slice(0, INFO_MAX - 1).replace(/\s+\S*$/, '') + '.';
})();

const src = dataSource({ url: './fixture.json', interval: 60_000, staleAfter: 900 });
const jobsOf = (ctx) => ctx.data?.jobs || [];
const now = () => Date.now();
const lastAt = (j) => (j.lastAgoSec == null ? null : now() - j.lastAgoSec * 1000);

/* ================= Tokens: foundations ================= */
function viewBasics() {
  const sw = (name, v) => h('div', { class: 'g-swatch' }, h('div', { class: 'g-swatch-c', style: { '--g-c': `var(${v})` } }), h('span', null, name), h('code', null, v));
  return [
    h('p', { class: 'g-intro' }, 'Quiet, dark-grey desktop look in a dense ops-console style: small type, hairlines instead of shadows, status dots, small radii. Switch between system, light and dark at the top right. All values live in css/tokens.css; boards use only these variables.'),
    section('Status', {}, card({}, h('div', { class: 'g-swatches' },
      ['ok', 'warn', 'bad', 'unknown', 'pending', 'info'].map((k) => sw(`${k} · ${STATUS_TEXT[k]}`, `--tn-${k}`))))),
    section('Status as text and primary button', {}, card({}, h('div', { class: 'g-swatches' },
      [['ok-text', '--tn-ok-text'], ['warn-text', '--tn-warn-text'], ['bad-text', '--tn-bad-text'], ['info-text', '--tn-info-text'], ['primary', '--tn-primary']].map(([n, v]) => sw(n, v))))),
    section('Accents', {}, card({}, h('div', { class: 'g-swatches' },
      ['blue', 'purple', 'pink', 'orange', 'green', 'graphite'].map((k) => sw(k, `--tn-${k}`))))),
    section('Surfaces and text', {}, card({}, h('div', { class: 'g-swatches' },
      [['Background', '--tn-bg'], ['Card', '--tn-card'], ['Zebra', '--tn-card-2'], ['Popover', '--tn-popover'], ['Hairline', '--tn-border'], ['Text', '--tn-text'], ['Text 2', '--tn-text-2'], ['Text 3', '--tn-text-3']].map(([n, v]) => sw(n, v))))),
    section('Typography', {}, card({}, h('div', { class: 'g-type' },
      h('div', null, h('small', null, 'stat 20/600'), h('span', { class: 'tn-stat-value tn-num' }, fmtNum(12345.6, 1))),
      h('div', null, h('small', null, 'lg 15/600'), h('span', { class: 'tn-sheet-title' }, 'Title in the detail')),
      h('div', null, h('small', null, 'body 13/400'), h('span', null, 'Running text and rows, formatted for the language: ', fmtBytes(48318382080), ' · ', fmtDuration(2950))),
      h('div', null, h('small', null, 'title 13/600'), h('strong', null, 'Card title')),
      h('div', null, h('small', null, 'label 12/500'), h('span', { class: 'tn-stat-label' }, 'Label, subtitle')),
      h('div', null, h('small', null, 'section 11.5/600'), h('span', { class: 'tn-section-title' }, 'Section')),
      h('div', null, h('small', null, 'mono 12/500'), h('span', { class: 'tn-mono' }, 'rsync exit 12 · 02:30:00'))))),
    section('Icons', { count: ICON_NAMES.length }, card({}, h('div', { class: 'g-icons' }, ICON_NAMES.map((n) => h('div', { class: 'g-icon' }, icon(n), n))))),
  ];
}

/* ================= Primitives: buttons and status ================= */
function viewButtons() {
  const variants = ['default', 'primary', 'ghost', 'danger'];
  return [
    demo('button()', `button('Save', { variant: 'primary', icon: 'check', onClick })\nvariant: default | primary | ghost | danger · small · disabled`,
      variants.map((v) => stage(
        state(v, button(v === 'danger' ? 'Delete' : 'Reload', { variant: v, icon: v === 'danger' ? null : 'refresh', onClick: noop })),
        state('hover', button('Hover', { variant: v, className: 'is-hover' })),
        state('pressed', button('Pressed', { variant: v, className: 'is-pressed' })),
        state('disabled', button('Disabled', { variant: v, disabled: true })),
        state('small', button('Small', { variant: v, small: true })),
      ))),
    demo('iconButton()', `iconButton('refresh', { label: 'Reload', onClick })  // label is required\niconButton('sidebar', { label: 'Sidebar', pressed: true })`,
      stage(
        state('normal', iconButton('refresh', { label: 'Reload' })),
        state('hover', iconButton('more', { label: 'More', className: 'is-hover' })),
        state('pressed', iconButton('filter', { label: 'Filter', className: 'is-pressed' })),
        state('aria-pressed', iconButton('sidebar', { label: 'Sidebar', pressed: true })),
        state('disabled', iconButton('x', { label: 'Close', disabled: true })))),
    demo('statusDot()', `statusDot('bad')                       // dot only, aria-label = status text\nstatusDot('ok', { label: 'running' })   // dot plus text`,
      stage(Object.keys(STATUS_TEXT).map((k) => state(k, statusDot(k, { label: STATUS_TEXT[k] }))))),
    demo('badge()', `badge('3 errors', { tone: 'bad' })\nbadge('94', { count: true })   // counter in the sidebar`,
      stage(
        ['neutral', 'ok', 'warn', 'bad', 'info', 'pending'].map((tone) => state(tone, badge(tone === 'neutral' ? 'Backup' : STATUS_TEXT[tone], { tone }))),
        state('counter', badge('94', { count: true })),
        state('counter bad', badge('3', { count: true, tone: 'bad' })))),
  ];
}

/* ================= Components: cards and tiles ================= */
function viewCards(ctx) {
  const jobs = jobsOf(ctx);
  const bad = jobs.filter((j) => j.status === 'bad').length, warn = jobs.filter((j) => j.status === 'warn').length;
  const box = (txt) => card({}, h('span', { class: 'tn-muted' }, txt));
  return [
    demo('statTile()', `statTile({ label: 'Jobs', value: 12, sub: '1 error', status: 'bad', onClick: () => app.go('table') })\ntiles(tile, tile, …)   // grid, two columns on phones`,
      tiles(
        statTile({ label: 'Jobs', value: jobs.length, sub: `${bad} ${bad === 1 ? 'error' : 'errors'} · ${warn} ${warn === 1 ? 'warning' : 'warnings'}`, status: bad ? 'bad' : 'ok', onClick: () => ctx.app.go('table') }),
        statTile({ label: 'Storage used', value: fmtNum(7.3, 1), unit: 'TB', sub: `of 12 TB · ${fmtPct(0.61, 0)}`, status: 'ok' }),
        statTile({ label: 'Media scan', value: fmtDuration(2950), sub: 'above threshold', status: 'warn', onClick: () => ctx.app.go('table', { open: 'media-scan' }) }),
        statTile({ label: 'Next run', value: '09:00', sub: 'Update check', status: 'pending' }),
        statTile({ label: 'A very long label of a tile that gets truncated', value: fmtNum(123456789.12), sub: 'equally long subtitle with overflow', status: 'unknown' }),
        statTile({ label: 'Hover', value: 42, sub: 'state forced', onClick: noop, className: 'is-hover' }),
      ),
      loading({ tiles: 3 })),
    demo('card() and section()', `section('Problems', { count: 2, actions: button(…) },\n  card({ title: 'Backups', sub: 'nas-a, nas-b', actions: iconButton(…), flush: true }, content))`,
      h('div', { class: 'g-grid2' },
        section('Problems', { count: 2, actions: button('All', { variant: 'ghost', small: true, iconAfter: 'chevron-right' }) },
          card({ flush: true }, list(jobs.filter((j) => ['bad', 'warn'].includes(j.status)), (j) => jobRow(j, ctx)))),
        card({ title: 'Card title', sub: 'Subtitle with context', actions: [iconButton('refresh', { label: 'Reload' }), iconButton('more', { label: 'More' })] },
          h('p', { class: 'tn-muted' }, 'The card is the only container with a hairline. No shadow, radius 6 px.')))),
    demo('An explanation behind the "i": card({ info }), section(…, { info })', `card({ title: 'Schedule today', info: t('board.info.schedule') }, timeline(…))   // closed by default; a few plain sentences, at most INFO_MAX (${INFO_MAX}) characters
section('Recently failed', { count: 3, info: t('board.info.failed') }, card(…))           // only for a display that needs a key; never a disclaimer`,
      h('div', { class: 'g-grid2' },
        state('short text', card({ title: 'Schedule today', info: 'Bars are runs today. A red edge marks an overlap with a heavy run.' }, h('p', { class: 'tn-muted' }, 'Content of the card.'))),
        state(`longest allowed text (${INFO_MAX.toFixed(0)} characters)`, section('Recently failed', { count: 2, info: INFO_TEXT_MAX },
          card({ flush: true }, list(jobs.slice(0, 2), (j) => jobRow(j, ctx))))),
        state('infoButton() on its own', toolbarRow(h('span', null, 'Retention'), infoButton('Days a backup is kept before it is pruned.'))),
        state('inside a sheet', stage(button('Open sheet with an explanation', { onClick: () => openSheet({ title: 'Run history', body: [card({ title: 'Last 30 runs', info: 'Each square is one run, oldest on the left. Red failed, grey did not run.' }, h('p', { class: 'tn-muted' }, 'Content of the card.'))] }) }))))),
    demo('tiles() with any number of tiles', `tiles(a, b, c, d, e)               // wide: 5 in a row · medium: 3 + 2 · phone: 2 + 2 + 1 – every row ends at the same edge
tiles({ className: 'my-tiles' }, …)   // an own class next to tn-tiles`,
      h('div', { class: 'g-stack' }, [3, 5, 7].map((n) => state(`${n} tiles`, tiles({ className: 'g-tiles-demo' }, ...Array.from({ length: n }, (_, i) => statTile({ label: `Tile ${i + 1}`, value: String(10 * (i + 1)), sub: i % 3 === 0 ? 'with a sub line' : null, status: i === 1 ? 'warn' : 'ok' }))))))),
    demo('Quiet footer line: card({ footer }), section(…, { footer })', `card({ flush: true, footer: '+13 frequent runs hidden' }, list(rows, render))      // under the content, inside the card
card({ footer: [t('jobs.hidden', { n: 13 }), ' ', button('Show', { variant: 'ghost', small: true })] }, …)   // a link or button inside is fine
section('Problems', { count: 2, footer: 'Only problems of the last 24 hours' }, card(…))            // under a section without a card`,
      h('div', { class: 'g-grid2' },
        state('flush list card', card({ flush: true, footer: '+13 frequent runs hidden' }, list(jobs.slice(0, 2), (j) => jobRow(j, ctx)))),
        state('long text wraps', card({ flush: true, footer: '+13 frequent runs hidden: they succeeded every time in the last 24 hours and are summarised in the overview instead' }, list(jobs.slice(0, 1), (j) => jobRow(j, ctx)))),
        state('with a button', card({ footer: ['3 of 16 hosts are not shown. ', button('Show all', { variant: 'ghost', small: true })] }, h('p', { class: 'tn-muted' }, 'Content of the card.'))),
        state('section footer', section('Problems', { count: 1, footer: 'Only problems of the last 24 hours' }, card({ flush: true }, list(jobs.slice(0, 1), (j) => jobRow(j, ctx))))))),
    demo('cols() and stack()', `cols(a, b)                    // columns, side by side from 340 px content width, else stacked\ncols({ min: 280 }, a, b, c)   // smaller minimum width per column\nstack(a, b)                   // vertical stack with the standard gap`,
      cols(stack(box('stack: first'), box('stack: second')), box('cols: second column'), cols({ min: 160 }, box('small 1'), box('small 2')))),
  ];
}

/* ================= Components: rows, lists, facts ================= */
function jobRow(j, ctx, extra = {}) {
  return metricRow({
    key: j.id, title: j.name, sub: `${j.host} · ${j.schedule}`, status: j.status,
    value: j.lastAgoSec == null ? '–' : fmtAgo(j.lastAgoSec), valueSub: j.durationSec != null ? fmtDuration(j.durationSec) : null,
    onClick: () => ctx.app.open(j.id), ...extra,
  });
}
function viewRows(ctx) {
  const jobs = jobsOf(ctx);
  return [
    demo('metricRow() in list()', `list(items, (j) => metricRow({ title, sub, value, valueSub, status, key: j.id,\n  onClick: () => app.open(j.id) }), { zebra: true })   // whole row tappable, chevron on the right`,
      card({ flush: true }, list(jobs.slice(0, 6), (j) => jobRow(j, ctx), { zebra: true }))),
    demo('States', null, card({ flush: true }, h('div', { class: 'tn-list' },
      metricRow({ title: 'Normal', sub: 'Subtitle', value: '12', status: 'ok', onClick: noop }),
      metricRow({ title: 'Hover (forced)', sub: 'Overlay', value: '3', status: 'warn', onClick: noop, className: 'is-hover' }),
      metricRow({ title: 'Pressed (forced)', sub: 'stronger overlay', value: '4', status: 'ok', onClick: noop, className: 'is-pressed' }),
      metricRow({ title: 'Selected (detail open)', sub: 'Desktop: inspector', value: '1', status: 'bad', onClick: noop, selected: true }),
      metricRow({ title: 'No action, no chevron', sub: 'display only', value: fmtBytes(1536), status: 'unknown' }),
      metricRow({ title: 'A very long title that has to be truncated in a narrow column instead of wrapping', sub: 'a-very-long-hostname.example.internal · cron 15 3 * * 1-5', value: fmtNum(123456789, 0), valueSub: fmtDuration(200000), status: 'pending', onClick: noop }),
      metricRow({ title: 'rsync-offsite', sub: 'Monospace title', mono: true, value: '0 B', status: 'off', onClick: noop })))),
    demo('metricRow({ wrapTitle })', `metricRow({ title: longName, sub, value, wrapTitle: true })   // the title takes up to two lines, then "…" (full text as hint)`,
      card({ flush: true }, h('div', { class: 'tn-list' },
        metricRow({ title: 'Offsite archive sync of the photo library to the second NAS in the garage, weekly full run', sub: 'nas-b · weekly', value: '3 h', status: 'ok', onClick: noop, wrapTitle: true }),
        metricRow({ title: 'Short title', sub: 'one line stays one line', value: '12', status: 'ok', onClick: noop, wrapTitle: true })))),
    demo('mediaRow()', `mediaRow({ media: img, title, lines: [valueLine, [badge(…), text]], onClick, key })   // picture left, the title over the full width
// (up to 3 lines, titleLines), the board's lines below; the whole row is the button – no chevron, no status dot (say the state with a badge)`,
      card({ flush: true }, h('div', { class: 'tn-list' },
        mediaRow({ key: 'm1', media: h('img', { src: './img/photo-1.svg', alt: '' }), onClick: noop,
          title: 'Offsite archive appliance, 4 bays, 2 × 8 TB already inside, barely used, with the original box and both keys for the front door',
          lines: [[h('strong', null, '€420'), ' · + €1.99 shipping · €26/TB'], [badge('Good', { tone: 'ok' }), badge('Price cut', { tone: 'info' }), 'posted 2 days ago']] }),
        mediaRow({ key: 'm2', media: h('img', { src: './img/photo-2.svg', alt: '' }), onClick: noop, selected: true,
          title: 'Short title', lines: [[h('strong', null, '€60'), ' · pickup · 45 km'], [badge('Reserved', { tone: 'warn' })]] }),
        mediaRow({ key: 'm3', media: icon('camera'), onClick: noop, title: 'Without a picture: a calm placeholder', lines: ['no badges, one line'] })))),
    demo('metricRow({ wrapSub })', `metricRow({ title: 'Offsite archive sync', sub: reason, status: 'bad', wrapSub: true })   // the sub line wraps instead of ending in "…"`,
      h('div', { class: 'g-grid2' },
        state('default: one line, "…"', card({ flush: true }, list([0], () => metricRow({ title: 'Offsite archive sync', sub: 'Exit 23 after 41 min: 3 files could not be transferred (permission denied on /srv/archive/2026/11)', status: 'bad', value: '2 h' })))),
        state('wrapSub: readable in full', card({ flush: true }, list([0], () => metricRow({ title: 'Offsite archive sync', sub: 'Exit 23 after 41 min: 3 files could not be transferred (permission denied on /srv/archive/2026/11)', status: 'bad', value: '2 h', wrapSub: true })))))),
    demo('list() empty', `list([], render, { empty: 'No problems' })`, card({ flush: true }, list([], noop, { empty: 'No problems' }))),
    demo('kv() and facts()', `facts('Run', kv([['Host', 'nas-a'], ['Duration', '21 min'], ['Error', text, 'tn-t-bad']]))  // empty values are dropped`,
      h('div', { class: 'g-narrow' }, facts('Run', kv([['Host', 'nas-b'], ['Schedule', 'daily 04:15'], ['Last run', fmtWhen(now() - 11100e3)], ['Duration', fmtDuration(31)], ['Empty', null], ['Error', 'rsync: connection unexpectedly closed', 'tn-t-bad']])))),
    demo('Long words', `// No building block breaks a word letter by letter: names/titles use an ellipsis plus hint, running text wraps at word boundaries.
// verify (rule wordbreak) checks letter-only words of 10+ characters; paths, IDs and URLs may break anywhere.`,
      h('div', { class: 'g-narrow-s' }, stack(
        banner('The collector reports: Medienbibliothek does not respond.', { tone: 'warn' }),
        card({ flush: true }, list([{ title: 'Occupational safety regulation', sub: 'Donaudampfschifffahrtsgesellschaft', value: 'Betriebssicherheitsverordnung', status: 'warn' }], (r) => metricRow({ ...r, onClick: noop }))),
        tiles(statTile({ label: 'Datenschutzbeauftragtenbestellung', value: '3' }), statTile({ label: 'Short', value: '4' })),
        facts('Values', kv([['Administration', 'Medienbibliotheksverwaltung'], ['Path', '/srv/stack/compose/services/media-library/config/filters/exclude.list']])),
        empty({ title: 'No entries', text: 'There were no Geschwindigkeitsbegrenzungsüberschreitungen in the period.', compact: true })))),
  ];
}

/* ================= Components: table, filter, detail ================= */
const tableState = { q: '', f: {}, sort: { key: 'status', dir: 'asc' } };
const RANK = { bad: 0, warn: 1, pending: 2, unknown: 3, ok: 4, off: 5 };
function jobColumns() {
  return [
    { key: 'name', label: 'Name', mobile: 'title' },
    { key: 'host', label: 'Host', mono: true },
    { key: 'kind', label: 'Type' },
    { key: 'schedule', label: 'Schedule', sortable: false, wrap: true },
    { key: 'status', label: 'Status', get: (j) => RANK[j.status], render: (j) => STATUS_TEXT[j.status], mobile: 'hide' },
    { key: 'last', label: 'Last run', align: 'right', get: (j) => (j.lastAgoSec == null ? null : -j.lastAgoSec), render: (j) => (j.lastAgoSec == null ? '–' : fmtAgo(j.lastAgoSec)), mobile: 'value' },
    { key: 'bytes', label: 'Size', align: 'right', get: (j) => j.bytes, render: (j) => fmtBytes(j.bytes) },
  ];
}
// host services (invented): a thing with a state, measurements and a watch toggle – the list mode with mobile: 'metric' and 'action'
const SERVICES = [
  { id: 'svc-1', name: 'tv-layout-heal-watch', status: 'ok', cpu: 0.214, mem: 7.12 * 2 ** 30, restarts: 0, watched: true },
  { id: 'svc-2', name: 'homelab-board-updater', status: 'bad', state: 'failed', cpu: null, mem: 312 * 2 ** 20, restarts: 14, watched: true },
  { id: 'svc-3', name: 'victoria-metrics', status: 'ok', cpu: 0.038, mem: 1.4 * 2 ** 30, restarts: 0, watched: false },
  { id: 'svc-4', name: 'backup-offsite-rclone-nightly', status: 'off', state: 'stopped', cpu: null, mem: null, restarts: 2, watched: false },
  { id: 'svc-5', name: 'caddy', status: 'ok', cpu: 0.006, mem: 48 * 2 ** 20, restarts: 1, watched: false },
];
export function serviceColumns(onWatch) {
  return [
    { key: 'name', label: 'Service', mono: true },
    { key: 'state', label: 'State', get: (r) => r.state ?? null, render: (r) => (r.state ? badge(r.state === 'failed' ? 'failed' : 'stopped', { tone: r.status }) : null) },
    { key: 'cpu', label: 'CPU', align: 'right', mobile: 'metric', render: (r) => (r.cpu == null ? '–' : fmtPct(r.cpu, 1)) },
    { key: 'mem', label: 'Memory', short: 'RAM', align: 'right', mobile: 'metric', render: (r) => (r.mem == null ? '–' : fmtBytes(r.mem)) },
    { key: 'restarts', label: 'Restarts', short: 'Restarts', align: 'right', mobile: 'metric', render: (r) => fmtNum(r.restarts) },
    { key: 'watched', label: 'Watch', sortable: false, mobile: 'action', get: (r) => (r.watched ? 1 : 0),
      render: (r) => iconButton('eye-off', { label: `Watch ${r.name}`, iconPressed: 'eye', pressed: r.watched, onToggle: (on) => { r.watched = on; onWatch?.(r); } }) },
  ];
}

function viewTable(ctx) {
  if (!ctx.data) return ctx.src?.error ? error({ text: ctx.src.error, onRetry: () => src.reload() }) : loading({ rows: 6 });
  // ?rows=1000 repeats the jobs (tempo case: apply a filter to many rows)
  const many = Math.min(5000, Number(ctx.params?.rows) || 0);
  const base = jobsOf(ctx);
  const jobs = many ? Array.from({ length: many }, (_, i) => ({ ...base[i % base.length], id: `${base[i % base.length].id}-${i}`, name: `${base[i % base.length].name} ${i + 1}` })) : base;
  const rowValue = (j, k) => ({ failing: j.fails7 > 0, duration: j.durationSec == null ? null : j.durationSec / 60, last: lastAt(j) })[k] ?? j[k];
  const filtered = () => jobs.filter((j) => matchQuery(`${j.name} ${j.host} ${j.kind}`, tableState.q) && matchFilters(j, tableState.f, rowValue));
  const count = (k, v) => jobs.filter((j) => j[k] === v).length;
  const tbl = table({
    columns: jobColumns(), rows: filtered(), status: (j) => j.status, rowKey: (j) => j.id, onRow: (j) => ctx.app.open(j.id),
    sort: tableState.sort, onSort: (s) => { tableState.sort = s; }, selected: ctx.open, empty: 'No matches', caption: 'Jobs',
  });
  const fb = filterBar({
    placeholder: 'Search jobs …', value: tableState,
    filters: [
      { key: 'status', label: 'Status', options: ['bad', 'warn', 'pending', 'unknown', 'ok', 'off'].map((k) => ({ value: k, label: STATUS_TEXT[k], count: count('status', k) })) },
      { key: 'kind', label: 'Type', options: [...new Set(jobs.map((j) => j.kind))].map((k) => ({ value: k, label: k, count: count('kind', k) })) },
      { key: 'host', label: 'Host', pills: 6, options: [...new Set(jobs.map((j) => j.host))].sort().map((k) => ({ value: k, label: k, count: count('host', k) })) },
      { key: 'failing', label: 'Failed in 7 days', type: 'bool' },
      { key: 'duration', label: 'Duration', type: 'range', unit: 'min', min: 0 },
      { key: 'last', label: 'Last run', type: 'time', presets: ['1h', '24h', '7d'] },
    ],
    count: () => `${filtered().length} of ${jobs.length}`,
    onChange: (s) => { tableState.q = s.q; tableState.f = s.f; tbl.update({ rows: filtered() }); fb.refresh(); },
  });
  return [
    h('p', { class: 'g-intro' }, 'table() with filterBar(): sortable columns, sticky header, tap a row for the detail (desktop in the inspector on the right, tablet as a panel from the right, phone as a bottom sheet; Back closes). Below 600 px container width (or when the columns do not fit) the table becomes a two-line list – shown bottom right in a narrow container.'),
    fb,
    card({ flush: true }, tbl),
    code(`table({ columns: [{ key, label, get?, render?, align: 'right', mono?, mobile: 'title'|'value'|'sub'|'hide' }],
  rows, status: (r) => r.status, rowKey: (r) => r.id, onRow: (r) => app.open(r.id), sort: { key, dir } })
filterBar({ placeholder, onChange, count: (state) => '5 of 12', filters: [
  { key: 'status', label: 'Status', options: [{ value, label, count }] },            // type 'options' (default): pills, from 9 values a combobox
  { key: 'failing', label: 'Failed', type: 'bool' },                                 // All · Yes · No
  { key: 'duration', label: 'Duration', type: 'range', unit: 'min' },               // from/to → chip 'Duration ≥ 10 min'
  { key: 'last', label: 'Last run', type: 'time', presets: ['1h', '24h', '7d'] },   // presets + own period
] })
rows.filter((row) => matchFilters(row, state.f, (row, key) => row[key], { now }))   // every type
// Detail: view.detail(id, ctx) → { title, sub, body } – the shell decides inspector/panel/sheet`),
    section('Things with measurements', { className: 'g-services' }, card({ flush: true }, table({
      columns: serviceColumns((r) => toast(r.watched ? `Watching ${r.name}` : `Not watching ${r.name}`)), rows: SERVICES, status: (r) => r.status, rowKey: (r) => r.id,
      onRow: (r) => toast(r.name), sort: { key: 'cpu', dir: 'desc' }, caption: 'Host services',
    }))),
    code(`// a thing with measurements: title over the full width, the measurements labelled in a fixed order, a toggle that does not open the row
table({ columns: [
  { key: 'name', label: 'Service' },
  { key: 'state', label: 'State', get: (r) => r.failed ? 'failed' : null },         // state text only when it is not the normal one
  { key: 'cpu', label: 'CPU', align: 'right', mobile: 'metric', render: (r) => fmtPct(r.cpu, 1) },
  { key: 'mem', label: 'Memory', short: 'RAM', align: 'right', mobile: 'metric', render: (r) => fmtBytes(r.mem) },
  { key: 'watched', label: 'Watch', sortable: false, mobile: 'action',
    render: (r) => iconButton('eye-off', { label: t('…'), iconPressed: 'eye', pressed: r.watched, onToggle: (on) => save(r, on) }) },
], rows, status: (r) => r.status, onRow: (r) => app.open(r.id) })`),
    h('div', { class: 'g-grid2' },
      section('Empty', {}, card({ flush: true }, table({ columns: jobColumns(), rows: [], empty: 'No jobs in this selection' }))),
      section('Narrow container (list mode)', {}, h('div', { class: 'g-narrow' }, card({ flush: true }, table({ columns: jobColumns(), rows: jobs.slice(0, 4), status: (j) => j.status, onRow: (j) => ctx.app.open(j.id), rowKey: (j) => j.id }))))),
  ];
}
function jobDetail(id, ctx) {
  const j = jobsOf(ctx).find((x) => x.id === id);
  if (!j) return null;
  return {
    title: j.name, sub: `${j.host} · ${j.kind}`,
    body: [
      j.status === 'bad' && banner(j.error || 'Last run failed', { tone: 'bad' }),
      j.hint && banner(j.hint, { tone: j.status === 'unknown' ? 'info' : 'warn' }),
      facts('Status', kv([['State', statusDot(j.status, { label: STATUS_TEXT[j.status] })], ['Schedule', j.schedule], ['Last run', lastAt(j) && `${fmtWhen(lastAt(j))} (${fmtAgo(j.lastAgoSec)})`], ['Duration', j.durationSec != null && fmtDuration(j.durationSec)]])),
      facts('Result', kv([['Size', j.bytes != null && fmtBytes(j.bytes)], ['Runs, 7 days', fmtNum(j.runs7, 0)], ['Errors, 7 days', j.fails7 ? fmtNum(j.fails7, 0) : '0', j.fails7 ? 'tn-t-bad' : null], ['Success rate', j.runs7 ? fmtPct((j.runs7 - j.fails7) / j.runs7) : null]])),
      facts('Technical', kv([['ID', j.id], ['Host', j.host]], { mono: true })),
      toolbarRow(button('Run now', { icon: 'refresh', onClick: () => {} }), button('Open log', { variant: 'ghost', iconAfter: 'external' })),
    ],
  };
}

/* ================= Components: markdown ================= */
function viewMarkdown() {
  return [
    h('p', { class: 'g-intro' }, 'markdown(text, opts) for agent reports, e.g. in the detail. Own parser, no library; the text becomes DOM nodes, raw HTML appears as text. Links only http(s), mailto and relative (external ones with rel="noopener noreferrer"), images off by default.'),
    demo('markdown()', `markdown(report)                        // full variant\nmarkdown(report, { compact: true })     // denser, for sheets and the inspector\nmarkdown(text, { images: true })        // images only for relative paths`,
      card({}, markdown(REPORT))),
    demo('compact (detail width)', `facts('Run report', markdown(job.report, { compact: true }))`,
      h('div', { class: 'g-narrow' }, card({}, markdown(REPORT, { compact: true })))),
    demo('Security', `markdown('<script>alert(1)</script>')   // text, never HTML\nmarkdown('[x](javascript:alert(1))')   // link becomes text`,
      h('div', { class: 'g-grid2' }, SECURITY_CASES.map(([label, txt]) => state(label, card({}, markdown(txt)))))),
  ];
}

/* ================= Components: states, sheets, images ================= */
const PHOTOS = [
  { src: './img/photo-1.svg', alt: 'Front view' }, { src: './img/photo-2.svg', alt: 'Side view' }, { src: './img/photo-3.svg', alt: 'Panorama' },
  './img/photo-4.svg', './img/photo-5.svg', { src: './img/photo-6.svg', alt: 'Label with a long description that a screen reader reads in full' },
];
function viewStates() {
  return [
    h('div', { class: 'g-grid2' },
      demo('empty()', `empty({ title: 'No problems', text: 'All jobs ran without errors recently.', icon: 'check' })`,
        card({}, empty({ title: 'No problems', text: 'All jobs ran without errors recently.', icon: 'check' }))),
      demo('error()', `error({ title: 'Loading failed', text: e.message, onRetry: () => src.reload() })`,
        card({}, error({ text: 'HTTP 502 · /api/snapshot', onRetry: noop }))),
      demo('loading()', `loading({ rows: 4 })   // skeleton, pulses via opacity only\nloading({ tiles: 4 })`,
        card({ flush: true }, loading({ rows: 4 }))),
      demo('banner()', `banner('Data is stale: updated 2 h ago', { tone: 'bad' })   // the shell shows data-age banners itself`,
        h('div', { class: 'g-stage-col' },
          banner('Data is stale: updated 2 h ago. The collector is probably not running.', { tone: 'bad' }),
          banner('Update failed, showing the last data.', { tone: 'warn' }),
          banner('New data format, display may be incomplete.', { tone: 'info' }),
          banner('A very long notice with an-unbreakable-path/opt/stack/compose/services/something/backup.yml that has to wrap.', { tone: 'warn' })))),
    demo('imageStrip() and openImageViewer()', `imageStrip(item.images.map((p) => ({ src: '/api/img/' + p, alt })))   // [] or null draws nothing (returns null)
openImageViewer(images, { index: 2, onClose: (reason, index) => … })   // carousel swipe, arrow keys; pinch, double tap 1×/2×/3.5×; x, Esc, tap beside, swipe down, Back close`,
      h('div', { class: 'g-stage-col' },
        state('several images: scrolls sideways, tap opens the viewer', imageStrip(PHOTOS)),
        state('one image', imageStrip(PHOTOS.slice(0, 1))),
        state('a thumbnail that does not load', imageStrip([PHOTOS[1], 'data:image/png;base64,AA=='])),
        state(`empty list: nothing (${normalizeImages([]).length} images)`, imageStrip([])),
        state('viewer opened directly', stage(button('Open image 3 of 6', { onClick: () => openImageViewer(PHOTOS, { index: 2 }) }))))),
    demo('openSheet() directly', `openSheet({ title, sub, body, footer: [button(…)], onClose })   // for non-detail dialogs (e.g. filter)`,
      stage(button('Open sheet', { onClick: () => { const sh = openSheet({ title: 'Example sheet', sub: 'Phone: swipe down closes; wider: panel from the right', body: [kv([['Width', '< 700 px bottom sheet'], ['otherwise', 'panel from the right']]), loading({ rows: 8 })], footer: [button('Close', { variant: 'primary', onClick: () => sh.close() })] }); } }))),
  ];
}

/* ================= App ================= */
const app = createApp({
  title: 'Tarn Gallery',
  densitySwitch: true,
  notifications: { api: './mock-push', env: mockPush('off', { delay: 80 }).env },   // mocked browser APIs and a mock backend: the sidebar entry works without a server
  icon: './favicon.svg',
  locales: ['en', 'de'],
  source: src,
  views: [
    { id: 'foundations', group: 'Core · Tokens', label: 'Foundations', icon: 'grid', render: viewBasics },
    { id: 'themes', label: 'Light and dark', icon: 'contrast', render: viewThemes },
    { id: 'buttons', group: 'Core · Primitives', label: 'Buttons and status', icon: 'check', render: viewButtons },
    { id: 'controls', label: 'Controls', icon: 'more', render: viewControls },
    { id: 'inputs', label: 'Inputs', icon: 'edit', render: viewInputs },
    { id: 'forms', label: 'Forms', icon: 'rocket', render: viewForms },
    { id: 'cards', group: 'Shell · Components', label: 'Cards and tiles', icon: 'box', render: viewCards, detail: jobDetail },
    { id: 'rows', label: 'Rows and facts', icon: 'list', render: viewRows, detail: jobDetail },
    { id: 'table', label: 'Table and filter', icon: 'server', render: viewTable, detail: jobDetail, count: tableCount },
    { id: 'actions', label: 'Confirm and actions', icon: 'check', render: viewActions },
    { id: 'feedback', label: 'Menus and feedback', icon: 'info', render: viewFeedback },
    { id: 'charts', label: 'Charts', icon: 'chart', render: viewCharts },
    { id: 'markdown', label: 'Markdown', icon: 'list', render: viewMarkdown },
    { id: 'states', label: 'States and sheets', icon: 'alert', render: viewStates },
    { id: 'datasources', label: 'Data sources', icon: 'database', render: viewDataSources, source: dataSourcesSource },
    { id: 'shell', group: 'Shell · App frame', label: 'Shell and boards', icon: 'sidebar', render: viewShell },
  ],
});
/* The sidebar counter comes from the data, not from whether the view was already drawn (that would depend on the order). */
function tableCount(ctx) {
  const jobs = jobsOf(ctx);
  if (!jobs.length) return null;
  const bad = jobs.filter((j) => j.status === 'bad').length;
  return { n: bad || jobs.length, tone: bad ? 'bad' : null };
}
src.start();
dataSourcesReady.then(() => app.refresh());
window.tnApp = app; // for scripts/console
