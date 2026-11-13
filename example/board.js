// tarn · sample board. Template for new boards: copy it, replace the fixture with a real API, adapt the views.
// Use only building blocks from /tarn/js/tarn.js (see AGENTS.md). All texts go through t() (messages.js).
import {
  h, createApp, dataSource, card, section, statTile, tiles, metricRow, list, table, filterBar, matchFilters, matchQuery,
  kv, facts, banner, cols, stack, statusDot, button, iconButton, toolbarRow, empty, error, loading, menu, toast, tabs, log,
  form, confirm, actionRun,
  segmented, usageBar, markdown, lineChart, barChart, sparkline, heatRow, timeline, donut,
  fmtAgo, fmtWhen, fmtBytes, fmtDuration, fmtNum, fmtPct, STATUS_TEXT, STATUS_RANK, t, getLocale, getTimeZone,
} from '../js/tarn.js';
import messages from './messages.js';

/* ---- Data ---- */
// Real boards: point url at your own API; ageOf returns the age of the snapshot from the server.
const src = dataSource({ url: './fixture.json', interval: 60_000, staleAfter: 900, ageOf: (d) => d.ageSec, parse: prepare });

const HOUR = 3600e3, DAY = 24 * HOUR;
/** Raw data → display model: relative times to points in time, next runs, problems. */
function prepare(raw) {
  const now = Date.now();
  const jobs = raw.jobs.map((j) => ({
    ...j,
    schedule: scheduleText(j, now),
    lastAt: j.lastAgoSec == null ? null : now - j.lastAgoSec * 1000,
    nextAt: j.nextInSec != null ? now + j.nextInSec * 1000 : nextRun(j, now),
  }));
  const hosts = raw.hosts.map((x) => ({ ...x, diskRatio: x.disk.used / x.disk.total }));
  const problems = [
    ...jobs.filter((j) => j.status === 'bad' || j.status === 'warn' || j.status === 'unknown').map((j) => ({ kind: 'job', id: j.id, title: j.name, sub: `${j.host} · ${j.error || j.hint || STATUS_TEXT[j.status]}`, status: j.status, at: j.lastAt })),
    ...hosts.filter((x) => x.status !== 'ok').map((x) => ({ kind: 'host', id: x.id, title: x.name, sub: hostIssue(x), status: x.status, at: null })),
  ].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const events = raw.events.map((e) => ({ ...e, t: now - e.agoSec * 1000 }));
  return { jobs, hosts, problems, events, runsPerDay: raw.runsPerDay, now, ageSec: raw.ageSec };
}
function hostIssue(x) {
  if (x.diskRatio >= 0.9) return t('board.hostDisk', { pct: fmtPct(x.diskRatio, 0) });
  if (x.mem >= 0.9) return t('board.hostRam', { pct: fmtPct(x.mem, 0) });
  return x.status === 'warn' ? t('board.hostRestart', { age: fmtAgo(x.uptimeSec) }) : STATUS_TEXT[x.status];
}
/** Schedule label from the structured fields (so it follows the language). */
function scheduleText(j, now) {
  if (j.disabled) return t('board.sched.disabled');
  if (j.everySec) return t('board.sched.every', { interval: fmtDuration(j.everySec) });
  if (j.nextInSec != null) return t('board.sched.once', { when: fmtWhen(now + j.nextInSec * 1000, now) });
  const [hh, mm] = j.at.split(':').map(Number);
  const time = new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(Date.UTC(2026, 0, 1, hh, mm)); // wall-clock time of day
  if (j.weekly) return t('board.sched.weekly', { day: new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(new Date(Date.UTC(2026, 0, 4 + j.weekday, 12))), time });
  return t('board.sched.daily', { time });
}
/** Next run from "at" (HH:MM, daily or weekly) or "everySec" – local time is enough for the demo. */
function nextRun(j, now) {
  if (j.status === 'off') return null;
  if (j.everySec) { const p = j.everySec * 1000, off = (j.offsetMin || 0) * 60e3; return Math.ceil((now - off) / p) * p + off; }
  if (!j.at) return null;
  const [hh, mm] = j.at.split(':').map(Number);
  const d = new Date(now); d.setHours(hh, mm, 0, 0);
  let t = +d; if (t <= now) t += DAY;
  if (j.weekly) while (new Date(t).getDay() !== j.weekday) t += DAY;
  return t;
}
/** Today's runs for the schedule. */
function scheduleRows(jobs, a, b) {
  return jobs.filter((j) => j.status !== 'off' && (j.at || j.everySec)).map((j) => {
    const dur = (j.durSec || 60) * 1000;
    const row = { id: j.id, label: j.name, sub: j.everySec && j.everySec < 900 ? j.schedule : `${j.schedule} · ~${fmtDuration(j.durSec)}`, heavy: !!j.heavy, status: j.status === 'bad' ? 'bad' : null, group: j.kind, items: [] };
    if (j.everySec && j.everySec < 900) row.band = [[a, b]];
    else if (j.everySec) for (let t = a + (j.offsetMin || 0) * 60e3; t < b; t += j.everySec * 1000) row.items.push({ start: t, end: t + dur });
    else { const [hh, mm] = j.at.split(':').map(Number); const t = a + (hh * 60 + mm) * 60e3; if (!j.weekly || new Date(t).getDay() === j.weekday) row.items.push({ start: t, end: t + dur }); }
    return row;
  }).filter((r) => r.items.length || r.band);
}

/* ---- shared building blocks ---- */
const waiting = (ctx, rows = 5) => (ctx.src?.error && !ctx.data ? error({ text: ctx.src.error, onRetry: () => src.reload() }) : loading({ rows }));
const jobRow = (j, ctx, extra = {}) => metricRow({
  key: j.id, title: j.name, sub: `${j.host} · ${j.schedule}`, status: j.status,
  value: j.lastAt ? fmtAgo(j.lastAgoSec) : '–', valueSub: j.durSec ? fmtDuration(j.durSec) : null,
  onClick: () => ctx.app.go('jobs', { open: j.id }), ...extra,
});

/* ---- Overview ---- */
function viewOverview(ctx) {
  if (!ctx.data) return waiting(ctx);
  const { jobs, hosts, problems, now } = ctx.data;
  const nBad = jobs.filter((j) => j.status === 'bad').length, nWarn = jobs.filter((j) => j.status === 'warn').length;
  const used = hosts.reduce((s, x) => s + x.disk.used, 0), total = hosts.reduce((s, x) => s + x.disk.total, 0);
  const fullest = [...hosts].sort((a, b) => b.diskRatio - a.diskRatio)[0];
  const next = jobs.filter((j) => j.nextAt && j.nextAt > now).sort((a, b) => a.nextAt - b.nextAt).slice(0, 5);
  const failed = jobs.filter((j) => j.runs?.includes('bad') && j.status !== 'bad')
    .map((j) => ({ j, n: j.runs.filter((r) => r === 'bad').length })).sort((a, b) => b.n - a.n).slice(0, 4);
  return [
    tiles(
      statTile({ label: t('board.jobs'), value: jobs.length, status: nBad ? 'bad' : nWarn ? 'warn' : 'ok', sub: nBad ? t('board.tile.jobsSub', { errors: t('board.tile.errors', { count: nBad }), warnings: t('board.tile.warnings', { count: nWarn }) }) : t('board.tile.allOk'), onClick: () => ctx.app.go('jobs') }),
      statTile({ label: t('board.hosts'), value: hosts.length, status: hosts.some((x) => x.status === 'bad') ? 'bad' : 'ok', sub: t('board.tile.hostsOk', { n: hosts.filter((x) => x.status === 'ok').length }), onClick: () => ctx.app.go('hosts') }),
      statTile({ label: t('board.tile.storage'), value: fmtBytes(used).split(' ')[0], unit: fmtBytes(used).split(' ')[1], sub: t('board.tile.storageSub', { name: fullest.name, pct: fmtPct(fullest.diskRatio, 0) }), status: fullest.diskRatio >= 0.9 ? 'bad' : fullest.diskRatio >= 0.8 ? 'warn' : 'ok', onClick: () => ctx.app.go('hosts', { open: fullest.id }) }),
      statTile({ label: t('board.tile.runs7'), value: fmtNum(ctx.data.runsPerDay.reduce((s, d) => s + d[0] + d[1] + d[2], 0), 0), sub: sparkline({ values: ctx.data.runsPerDay.map((d) => d[2]), color: 'bad', area: false }), onClick: () => ctx.app.go('verlauf') })),
    cols(
      section(t('board.sec.problems'), { count: problems.length },
        card({ flush: true }, list(problems, (p) => metricRow({
          key: p.id, title: p.title, sub: p.sub, wrapSub: true, status: p.status, value: p.at ? fmtAgo((now - p.at) / 1000) : null,
          onClick: () => ctx.app.open(p.id),   // detail in place: the thing opens here, "Open in Jobs/Hosts" inside it moves on
        }), { empty: t('board.noProblems') }))),
      stack(
        section(t('board.sec.next'), { count: next.length },
          card({ flush: true }, list(next, (j) => jobRow(j, ctx, { onClick: () => ctx.app.open(j.id), value: fmtWhen(j.nextAt), valueSub: t('board.inTime', { time: fmtDuration((j.nextAt - now) / 1000).replace(new RegExp(` \\d+ ${t('unit.s')}$`), '') }) })))),
        section(t('board.sec.failed'), { count: failed.length },
          card({ flush: true }, list(failed, ({ j, n }) => jobRow(j, ctx, { onClick: () => ctx.app.open(j.id), value: `${n}×`, valueSub: t('board.inRuns') }), { empty: t('board.noFailures') }))))),
  ];
}

/* ---- Jobs (table, filter, detail) ---- */
const jobState = { q: '', f: {}, sort: { key: 'status', dir: 'asc' } };
function viewJobs(ctx) {
  if (!ctx.data) return waiting(ctx, 8);
  const { jobs } = ctx.data;
  const filtered = () => jobs.filter((j) => matchQuery(`${j.name} ${j.host} ${j.kind} ${j.schedule}`, jobState.q) && matchFilters(j, jobState.f));
  const count = (k, v) => jobs.filter((j) => j[k] === v).length;
  const tbl = table({
    columns: [
      { key: 'name', label: t('board.col.name'), mobile: 'title' },
      { key: 'host', label: t('board.col.host') },
      { key: 'kind', label: t('board.col.kind'), render: (j) => t(`board.kind.${j.kind}`), mobile: 'hide' },
      { key: 'schedule', label: t('board.col.schedule'), sortable: false, wrap: true },
      { key: 'status', label: t('board.col.status'), get: (j) => STATUS_RANK[j.status], render: (j) => STATUS_TEXT[j.status], mobile: 'hide' },
      { key: 'runs', label: t('board.col.runs'), sortable: false, render: (j) => heatRow({ items: (j.runs || []).slice(-12).map((s) => ({ status: s })), max: 12 }), mobile: 'hide' },
      { key: 'last', label: t('board.col.last'), align: 'right', get: (j) => j.lastAt, render: (j) => (j.lastAt ? fmtAgo(j.lastAgoSec) : '–'), mobile: 'value' },
    ],
    rows: filtered(), status: (j) => j.status, rowKey: (j) => j.id, onRow: (j) => ctx.app.open(j.id), selected: ctx.open,
    sort: jobState.sort, onSort: (s) => { jobState.sort = s; }, empty: t('board.noJobs'),
  });
  const fb = filterBar({
    placeholder: t('board.searchJobs'), value: jobState,
    filters: [
      { key: 'status', label: t('board.col.status'), options: ['bad', 'warn', 'unknown', 'pending', 'ok', 'off'].map((s) => ({ value: s, label: STATUS_TEXT[s], count: count('status', s) })) },
      { key: 'kind', label: t('board.col.kind'), options: [...new Set(jobs.map((j) => j.kind))].sort().map((k) => ({ value: k, label: t(`board.kind.${k}`), count: count('kind', k) })) },
      { key: 'host', label: t('board.col.host'), options: [...new Set(jobs.map((j) => j.host))].sort().map((k) => ({ value: k, label: k, count: count('host', k) })) },
    ],
    count: () => t('board.countOf', { shown: filtered().length, total: jobs.length }),
    onChange: (s) => { jobState.q = s.q; jobState.f = s.f; tbl.update({ rows: filtered() }); fb.refresh(); },
  });
  return [fb, card({ flush: true }, tbl)];
}
function jobDetail(id, ctx) {
  const j = ctx.data?.jobs.find((x) => x.id === id);
  if (!j) return null;
  const evs = ctx.data.events.filter((e) => e.src === j.id);
  const nRuns = j.runs?.length || 0, nBad = j.runs?.filter((r) => r === 'bad').length || 0;
  const more = menu(iconButton('more', { label: t('board.act.moreLabel') }), [
    { label: t('board.act.openLog'), icon: 'external', onClick: () => toast(t('board.act.noFunction')) },
    { label: t('board.act.pause'), icon: 'minus', disabled: j.status === 'off' },
    '-', { label: t('board.act.remove'), icon: 'x', danger: true, onClick: () => toast(t('board.act.demoOnly'), { tone: 'warn' }) },
  ]);
  return {
    title: j.name, sub: `${j.host} · ${j.kind}`,
    body: [
      j.status === 'bad' && banner(j.error || t('board.lastFailed'), { tone: 'bad' }),
      j.hint && banner(j.hint, { tone: j.status === 'unknown' ? 'info' : 'warn' }),
      facts(t('board.d.status'), kv([
        [t('board.d.state'), statusDot(j.status, { label: STATUS_TEXT[j.status] })], [t('board.d.schedule'), j.schedule],
        [t('board.d.last'), j.lastAt && `${fmtWhen(j.lastAt)} (${fmtAgo(j.lastAgoSec)})`], [t('board.d.next'), j.nextAt && fmtWhen(j.nextAt)],
        [t('board.d.duration'), j.durSec != null && `~${fmtDuration(j.durSec)}`], [t('board.d.size'), j.bytes != null && fmtBytes(j.bytes)],
      ])),
      nRuns > 0 && facts(t('board.d.lastRuns', { n: nRuns }), heatRow({ items: j.runs.map((s, i) => ({ status: s, label: t('board.d.runN', { n: i + 1 }) })), max: 30, size: 'lg' }),
        kv([[t('board.d.successRate'), fmtPct((nRuns - nBad) / nRuns)], [t('board.d.failures'), String(nBad), nBad ? 'tn-t-bad' : null]])),
      j.report && facts(t('board.d.report'), markdown(j.report, { compact: true })),
      facts(t('board.d.events'), log(evs, { wrap: true, empty: t('board.d.noEvents') })),
      facts(t('board.d.technical'), kv([[t('board.d.id'), j.id], [t('board.col.host'), j.host]], { mono: true })),
      toolbarRow(button(t('board.act.runNow'), { icon: 'refresh', disabled: j.status === 'off', onClick: () => toast(t('board.act.started', { name: j.name }), { tone: 'ok' }) }), more),
    ],
  };
}

/* ---- Hosts ---- */
function viewHosts(ctx) {
  if (!ctx.data) return waiting(ctx);
  const { hosts } = ctx.data;
  return [
    card({ flush: true }, list([...hosts].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]), (x) => metricRow({
      key: x.id, title: x.name, sub: x.role, status: x.status,
      value: `${fmtPct(x.diskRatio, 0)}`, valueSub: `CPU ${fmtNum(x.cpu.at(-1), 0)} %`, onClick: () => ctx.app.open(x.id),
    }))),
    section(t('board.storage'), {}, card({}, stack(hosts.map((x) => usageBar({ used: x.disk.used, total: x.disk.total, label: x.name }))))),
  ];
}
function hostDetail(id, ctx) {
  const x = ctx.data?.hosts.find((y) => y.id === id);
  if (!x) return null;
  const now = ctx.data.now, xs = x.cpu.map((_, i) => now - (x.cpu.length - 1 - i) * HOUR);
  const jobs = ctx.data.jobs.filter((j) => j.host === x.id);
  return {
    title: x.name, sub: x.role,
    body: [
      x.status !== 'ok' && banner(hostIssue(x), { tone: x.status }),
      facts(t('board.d.load'), cols({ min: 120 },
        donut({ value: x.mem, max: 1, size: 56, thickness: 7, color: x.mem >= 0.9 ? 'bad' : x.mem >= 0.8 ? 'warn' : 'blue', sub: 'RAM' }),
        usageBar({ used: x.disk.used, total: x.disk.total, label: t('board.d.disk') }))),
      facts(t('board.d.cpu48'), lineChart({ x: xs, series: [{ label: 'CPU', values: x.cpu, color: 'blue' }], height: 130, area: true, yMax: 100, yFormat: (v) => `${fmtNum(v, 0)} %` })),
      facts(t('board.d.facts'), kv([[t('board.d.uptime'), fmtDuration(x.uptimeSec)], ['Jobs', String(jobs.length)]])),
      jobs.length > 0 && facts('Jobs', list(jobs, (j) => jobRow(j, ctx))),
    ],
  };
}

/* ---- Deploy (form → confirm → running action; fixture only, nothing is deployed) ---- */
const deploy = { form: null, run: null, box: null, steps: null, rec: null, seeded: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadSteps = async () => (deploy.steps ||= await (await fetch('./deploy-steps.json', { cache: 'no-store' })).json());
/** What the API would answer for a run: status, progress and the log so far, derived from the elapsed time. */
function simulate(rec, data) {
  const fail = data.failures[rec.host];
  const end = fail ? fail.at : data.durationSec;
  const el = (Date.now() - rec.startedAt) / 1000;
  const fill = (x) => x.replace('{host}', rec.host).replace('{version}', rec.version);
  const lines = [...data.steps, ...(fail ? [fail] : [])].filter((x) => x.at <= Math.min(el, end))
    .map((x) => ({ t: rec.startedAt + x.at * 1000, level: x.level, text: fill(rec.dry && x.dryText ? x.dryText : x.text) }));
  if (rec.cancelled) return { status: 'cancelled', startedAt: rec.startedAt, endedAt: rec.cancelled, log: lines };
  const done = el >= end;
  return {
    status: done ? (fail ? 'bad' : 'ok') : 'running', startedAt: rec.startedAt, endedAt: done ? rec.startedAt + end * 1000 : undefined,
    progress: done ? 1 : el / end, log: lines, message: done && fail ? fail.message : undefined,
  };
}
function showRun(rec) {
  deploy.rec = rec;
  deploy.run?.stop();
  deploy.run = actionRun({
    title: t('board.dep.runTitle', { version: rec.version, host: rec.host }), intervalMs: 1000,
    source: async () => simulate(rec, await loadSteps()),
    onCancel: async () => { rec.cancelled = Date.now(); },
    onDone: (r) => toast(r.status === 'ok' ? t('board.dep.finished') : r.status === 'bad' ? t('board.dep.failed') : t('board.dep.cancelled'), { tone: r.status === 'ok' ? 'ok' : r.status === 'bad' ? 'bad' : 'info' }),
  });
  deploy.box.replaceChildren(deploy.run);
}
function viewDeploy(ctx) {
  if (!ctx.data) return waiting(ctx);
  if (!deploy.form) {
    deploy.box = h('div', null, empty({ title: t('board.dep.noRun'), text: t('board.dep.noRunText'), icon: 'rocket', compact: true }));
    deploy.form = form({
      fields: [
        { name: 'host', type: 'combobox', label: t('board.dep.host'), required: true, search: true, placeholder: t('board.dep.hostPlaceholder'), options: ctx.data.hosts.map((x) => ({ value: x.id, label: x.name, hint: x.role })) },
        { name: 'version', label: t('board.dep.version'), help: t('board.dep.versionHelp'), required: true, rules: { pattern: /^\d+\.\d+\.\d+$/ }, placeholder: '2.4.1', mono: true },
        { name: 'dry', type: 'checkbox', label: t('board.dep.dry'), help: t('board.dep.dryHelp'), value: true },
      ],
      submitLabel: t('board.dep.start'),
      onSubmit: async (v) => {
        const ok = await confirm({
          title: t('board.dep.confirmTitle', { version: v.version, host: v.host }), text: v.dry ? t('board.dep.confirmDry') : t('board.dep.confirmLive'),
          danger: !v.dry, typeToConfirm: v.dry ? undefined : v.host, confirmLabel: t('board.dep.start'),
        });
        if (!ok) return;
        await sleep(400);                                   // the request
        showRun({ host: v.host, version: v.version, dry: v.dry, startedAt: Date.now(), cancelled: 0 });
        toast(t('board.dep.started'), { tone: 'ok' });
      },
    });
  }
  const seed = ctx.params.run;                              // deep link #/deploy?run=ok|bad|running (screenshots, checks)
  if (seed && !deploy.seeded) {
    deploy.seeded = true;
    const ago = { ok: 20_000, bad: 20_000, running: 3_500 }[seed];
    if (ago) showRun({ host: seed === 'bad' ? 'app-2' : 'app-1', version: '2.4.1', dry: false, startedAt: Date.now() - ago, cancelled: 0 });
  }
  return [
    section(t('board.dep.new'), {}, card({}, deploy.form)),
    section(t('board.dep.run'), {}, card({}, deploy.box)),
  ];
}

/* ---- History (charts) ---- */
const histState = { range: '24h' };
function viewHistory(ctx) {
  if (!ctx.data) return waiting(ctx);
  const { jobs, hosts, runsPerDay, now } = ctx.data;
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const a = +day0, b = a + DAY;
  const days = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: getTimeZone() }).format(now - (6 - i) * DAY).replace('.', ''));
  const n = histState.range === '24h' ? 24 : 48;
  const xs = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * HOUR);
  const cpu = () => lineChart({ x: xs, series: hosts.filter((x) => ['nas-a', 'media-1', 'app-2'].includes(x.id)).map((x, i) => ({ label: x.name, values: x.cpu.slice(-n), color: ['blue', 'orange', 'purple'][i] })), yMax: 100, height: 180, yFormat: (v) => `${fmtNum(v, 0)} %` });
  const chartHost = h('div', null, cpu());
  return [
    card({ title: t('board.h.cpuLoad'), actions: segmented({ small: true, label: t('board.h.range'), options: [{ value: '24h', label: t('board.h.range24') }, { value: '48h', label: t('board.h.range48') }], value: histState.range, onChange: (v) => { histState.range = v; ctx.app.refresh(); } }) }, chartHost),
    cols(
      card({ title: t('board.h.runsPerDay'), sub: t('board.h.days7') }, barChart({ labels: days, stacked: true, height: 170, yFormat: (v) => fmtNum(v, 0), series: [
        { label: t('board.h.success'), values: runsPerDay.map((d) => d[0]), color: 'ok' }, { label: t('board.h.warning'), values: runsPerDay.map((d) => d[1]), color: 'warn' }, { label: t('board.h.error'), values: runsPerDay.map((d) => d[2]), color: 'bad' }] })),
      card({ title: t('board.h.storageHost') }, barChart({ horizontal: true, labels: hosts.map((x) => x.name), yFormat: fmtBytes, series: [{ label: t('board.h.used'), values: hosts.map((x) => x.disk.used), color: 'blue' }] }))),
    section(t('board.h.todaySchedule'), {}, timeline({
      start: a, end: b, now, rows: scheduleRows(jobs, a, b),
      groups: [...new Set(jobs.map((j) => j.kind))].map((k) => ({ id: k, label: t(`board.kind.${k}`) })),
      windows: [{ start: a + 2 * HOUR, end: a + 6 * HOUR, label: t('board.h.window') }],
      onRow: (r) => ctx.app.open(r.id), onItem: (r) => ctx.app.open(r.id),
    })),
  ];
}

/* ---- App ---- */
// Board icon in the header: the same file as the favicon (favicon.svg, made with tools/brand.mjs). `boards` turns the title into a
// switcher (invented entries; real boards: one shared JSON file, e.g. boards: '/boards.json'). Without `boards` (or with a single
// entry) the title stays static. `messages` holds the texts per language; `locale: 'de'` would force one language.
const boardList = () => [
  { id: 'sample', name: t('board.title'), href: './', icon: './favicon.svg', category: 'examples' },
  { id: 'maintenance', name: t('board.sw.maintenance'), href: 'https://example.com/maintenance/', icon: { icon: 'server', color: 'blue' }, category: 'operations' },
  { id: 'network', name: t('board.sw.network'), href: 'https://example.com/network/', icon: { icon: 'chart', color: 'green' }, category: 'operations' },
  { id: 'backups', name: t('board.sw.backups'), href: 'https://example.com/backups/', icon: { icon: 'box', color: 'orange' }, category: 'operations' },
  { id: 'media', name: t('board.sw.media'), href: 'https://example.com/media/', category: 'home' },
  { id: 'wiki', name: t('board.sw.wiki'), href: 'https://example.com/wiki/' },
];
const app = createApp({
  title: () => t('board.title'),
  messages,
  locales: ['en', 'de', 'es', 'fr'],
  icon: './favicon.svg',
  boardId: 'sample',
  boards: boardList,
  categories: () => [{ id: 'examples', label: t('board.cat.examples') }, { id: 'operations', label: t('board.cat.operations') }, { id: 'home', label: t('board.cat.home') }],
  source: src,
  views: [
    // the problem list shows jobs and hosts that other views own: their detail opens here (detailOf), the link inside the detail moves to the owner
    { id: 'overview', label: () => t('board.overview'), icon: 'home', render: viewOverview, detail: (id, ctx) => ctx.app.detailOf('jobs', id, { link: true }) || ctx.app.detailOf('hosts', id, { link: true }) },
    { id: 'jobs', label: () => t('board.jobs'), icon: 'list', render: viewJobs, detail: jobDetail, count: (ctx) => ({ n: ctx.data?.jobs.filter((j) => j.status === 'bad').length || null, tone: 'bad' }) },
    { id: 'hosts', label: () => t('board.hosts'), icon: 'server', render: viewHosts, detail: hostDetail, count: (ctx) => ({ n: ctx.data?.hosts.filter((x) => x.status === 'bad').length || null, tone: 'bad' }) },
    { id: 'history', label: () => t('board.history'), icon: 'chart', render: viewHistory, detail: (id, ctx) => ctx.app.detailOf('jobs', id, { link: true }) },
    { id: 'deploy', label: () => t('board.deploy'), icon: 'rocket', render: viewDeploy },
  ],
});
src.start();
window.tnApp = app;
