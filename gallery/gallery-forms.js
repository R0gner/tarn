// dashkit · gallery: forms and actions (form.js, actionrun.js): form(), confirm(), actionRun() in all states.
import { h, card, section, button, form, confirm, actionRun, openSheet, toast } from '../js/dashkit.js';
import { HOSTS } from './gallery-inputs.js';

const code = (txt) => h('pre', { class: 'g-code' }, txt.trim());
const demo = (title, usage, ...stage) => card({ title }, h('div', { class: 'g-demo' }, stage, usage && code(usage)));
const col = (...k) => h('div', { class: 'g-stage-col' }, k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = [
  { t: Date.UTC(2026, 10, 9, 8, 57, 1), level: 'info', text: 'Connecting to delta …' },
  { t: Date.UTC(2026, 10, 9, 8, 57, 2), level: 'info', text: 'Pulling image registry.example.com/app:2.4.1' },
  { t: Date.UTC(2026, 10, 9, 8, 57, 9), level: 'ok', text: 'Image pulled (212 MB)' },
  { t: Date.UTC(2026, 10, 9, 8, 57, 10), level: 'warn', text: 'Container app-1 still has open connections' },
  { t: Date.UTC(2026, 10, 9, 8, 57, 14), level: 'info', text: 'Restarting app-1' },
];
const run = (o) => () => Promise.resolve({ startedAt: Date.now() - 125e3, log: LOG, ...o });

/** Deploy form of the gallery and the sample board: host, version, strategy, dry run. onSubmit simulates a request. */
export function deployForm({ onSubmit, onCancel } = {}) {
  return form({
    fields: [
      { name: 'host', label: 'Target host', type: 'combobox', options: HOSTS, required: true },
      { name: 'version', label: 'Version', help: 'For example 2.4.1', required: true, rules: { pattern: /^\d+\.\d+\.\d+$/ }, placeholder: '2.4.1', mono: true },
      { name: 'strategy', label: 'Strategy', type: 'select', options: [{ value: 'rolling', label: 'Rolling' }, { value: 'blue-green', label: 'Blue/green' }], value: 'rolling' },
      { name: 'dry', type: 'checkbox', label: 'Dry run', help: 'Simulate the deployment, change nothing.', value: true },
    ],
    submitLabel: 'Start deployment', onCancel, onSubmit,
  });
}

export function viewForms() {
  const result = h('span', { class: 'g-state-l' }, 'Result: –');
  const f = deployForm({
    onSubmit: async (v) => {
      await sleep(900);
      if (v.version === '0.0.0') return { errors: { version: 'Version 0.0.0 does not exist.' } };
      if (v.host === 'falcon') return { error: 'Host falcon is not reachable.' };
      result.textContent = `Result: started on ${v.host}, ${v.version}${v.dry ? ' (dry run)' : ''}`;
      toast('Deployment started', { tone: 'ok' });
    },
  });
  // a simulated run that is started on click (deterministic static states below)
  const live = h('div', null);
  let n = 0;
  const start = () => {
    n = 0;
    live.replaceChildren(actionRun({
      title: 'Deploy app 2.4.1 → delta', intervalMs: 700,
      source: async () => {
        n++;
        const lines = LOG.slice(0, Math.min(LOG.length, n)).map((e, i) => ({ ...e, t: Date.now() - (LOG.length - i) * 1000 }));
        return { status: n >= 7 ? 'ok' : 'running', startedAt: Date.now() - n * 700, endedAt: n >= 7 ? Date.now() : undefined, progress: Math.min(1, n / 6), log: lines };
      },
      onCancel: async () => { n = 99; },
      onDone: () => toast('Deployment finished', { tone: 'ok' }),
    }));
  };
  return [
    h('p', { class: 'g-intro' }, 'Forms collect values with validation and a clear submit state; confirm() guards dangerous actions; actionRun() shows a running action with live log. Every action gives feedback (toast or actionRun), every dangerous one asks first.'),
    h('div', { class: 'g-grid2' },
      demo('form()', `form({ fields: [{ name, type, label, help?, required?, rules?, …input options }], onSubmit: async (values) => {\n  …  // return { errors: { name: 'text' } } or { error: 'text' } to report a failure\n}, submitLabel, onCancel })\n// validates first (errors on the fields, focus on the first one), then “Running …” and a second submit is ignored\n// try: empty fields · version 0.0.0 (field error) · host falcon (form error)`,
        col(f, result)),
      demo('confirm()', `if (await confirm({ title: 'Delete job?', text, danger: true, confirmLabel: 'Delete' })) …\nawait confirm({ title, text, danger: true, typeToConfirm: 'delta' })   // confirm stays off until the name is typed`,
        col(
          button('Delete job …', { variant: 'danger', onClick: async () => { const ok = await confirm({ title: 'Delete job offsite-sync?', text: 'The schedule and its history are removed. This cannot be undone.', danger: true, confirmLabel: 'Delete' }); toast(ok ? 'Deleted (demo)' : 'Cancelled', { tone: ok ? 'ok' : 'info' }); } }),
          button('Restart host …', { onClick: async () => { const ok = await confirm({ title: 'Restart delta?', text: 'Running jobs on this host are interrupted.', danger: true, typeToConfirm: 'delta', confirmLabel: 'Restart' }); toast(ok ? 'Restarting (demo)' : 'Cancelled', { tone: ok ? 'ok' : 'info' }); } }),
          button('Confirm (not dangerous)', { onClick: async () => { const ok = await confirm({ title: 'Start the full scan?', text: 'It takes about ten minutes.' }); toast(ok ? 'Started (demo)' : 'Cancelled', { tone: ok ? 'ok' : 'info' }); } })))),
    section('actionRun()', {}, h('div', { class: 'g-stack' },
      h('div', { class: 'g-grid2' },
        demo('Running, progress known', `actionRun({ source: async () => ({ status, startedAt, progress: 0.4, log }) | '/api/run/42', intervalMs: 2000, onCancel, onDone })`,
          actionRun({ title: 'Deploy app 2.4.1 → delta', source: run({ status: 'running', progress: 0.4 }), intervalMs: 600000, onCancel: async () => {} })),
        demo('Running, progress unknown', `// progress: null → indeterminate bar`,
          actionRun({ title: 'Index rebuild', source: run({ status: 'running', progress: null, log: LOG.slice(0, 2) }), intervalMs: 600000 }))),
      h('div', { class: 'g-grid2' },
        demo('Done', null, actionRun({ title: 'Deploy app 2.4.1 → delta', source: run({ status: 'ok', endedAt: Date.now() - 5e3, log: [...LOG, { t: Date.UTC(2026, 10, 9, 8, 57, 20), level: 'ok', text: 'Health check passed' }] }) })),
        demo('Failed', null, actionRun({ title: 'Deploy app 2.4.2 → delta', source: run({ status: 'bad', endedAt: Date.now() - 5e3, message: 'Health check failed after 60 s; rolled back.', log: [...LOG.slice(0, 3), { t: Date.UTC(2026, 10, 9, 8, 57, 30), level: 'bad', text: 'Health check failed: HTTP 503' }] }) }))),
      h('div', { class: 'g-grid2' },
        demo('Cancelled', null, actionRun({ title: 'Media scan', source: run({ status: 'cancelled', endedAt: Date.now() - 5e3, log: LOG.slice(0, 2) }) })),
        demo('Waiting and empty log', null, actionRun({ title: 'Nightly backup', source: run({ status: 'pending', startedAt: undefined, log: [] }), intervalMs: 600000 }))),
      demo('Live (simulated)', `// a board passes its own function or a URL; polling stops when the status is final or the element leaves the page`,
        col(h('div', null, button('Start demo run', { variant: 'primary', onClick: start })), live)),
      demo('In a sheet', `openSheet({ title, body: form(...), footer: f.buttons() })   // the buttons are linked to the form (submit by Enter works)`,
        h('div', null, button('Open sheet with the deploy form', { onClick: () => {
          const sf = deployForm({ onSubmit: async () => { await sleep(600); sheet.close('api'); toast('Deployment started', { tone: 'ok' }); } });
          const sheet = openSheet({ title: 'Deploy', sub: 'app', body: sf, footer: sf.buttons() });
        } }))))),
  ];
}
