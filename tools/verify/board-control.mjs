// tarn · positive control of the board run: a copy of example/ set up OUTSIDE the repo as a foreign board (its own folder, tarn-board.json,
// a vendored kit copy in vendor/tarn served as /tarn/, a small static server with the strict CSP) must be green; the same copy with
// injected faults must be red. Run by `verify --selftest`, so the ability to check a board outside the kit cannot rot silently.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../lib/static-server.mjs';
import { runBoard } from './board.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Foreign board in `dir` (empty folder): the files of example/ with /tarn/ paths, vendor copy, tarn-board.json. Returns the board file. */
export function makeForeignBoard(dir) {
  const ex = path.join(ROOT, 'example');
  for (const f of fs.readdirSync(ex)) {
    let buf = fs.readFileSync(path.join(ex, f));
    if (/\.(html|js)$/.test(f)) buf = Buffer.from(buf.toString('utf8').replace(/(\.\.\/)(css|js|fonts|icons)\//g, '/tarn/$2/'));
    fs.writeFileSync(path.join(dir, f), buf);
  }
  const v = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'vendor.mjs'), '--to', path.join(dir, 'vendor', 'tarn')], { encoding: 'utf8' });
  if (v.status !== 0) throw new Error(`vendor copy failed: ${(v.stdout + v.stderr).trim().split('\n')[0]}`);
  // the exceptions of the sample (timeline bars on touch, …) travel with the copy: a board keeps its own justified exceptions next to its code
  fs.mkdirSync(path.join(dir, 'verify'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools', 'verify', 'exceptions.json'), path.join(dir, 'verify', 'exceptions.json'));
  const file = path.join(dir, 'tarn-board.json');
  fs.writeFileSync(file, JSON.stringify({
    name: 'Foreign sample',
    pages: [{ id: 'main', path: '/?lang=en', details: ['jobs?open=offsite-sync'], sizes: ['phone', 'desktop'], themes: ['dark'] }],
    lint: { dirs: ['.'], skip: ['vendor', 'verify'], messages: ['messages.js'] },
  }, null, 2));
  return file;
}

/** Faults in the copy: a hard-coded colour and a card wider than the page (lint + geometry), innerHTML in an own script (lint), a changed vendor file (vendor). */
export function injectFaults(dir) {
  fs.writeFileSync(path.join(dir, 'fault.css'), '.tn-card { width: 3000px; border-color: #ff00ff; }\n');
  fs.writeFileSync(path.join(dir, 'fault.js'), "export const paint = (el, x) => { el.innerHTML = x; };\n");
  const idx = path.join(dir, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('</head>', '  <link rel="stylesheet" href="fault.css">\n</head>'));
  fs.appendFileSync(path.join(dir, 'vendor', 'tarn', 'css', 'core.css'), '\n/* local edit */\n');
}

/**
 * → { ok, line, detail } . opts: { chrome, ci, attach }. The test server uses TN_BOARD_PORT when set (else a free port).
 * Green run: baseline snapshots are written first (--update, which must not say GREEN), then a normal run must be green and must have measured something.
 */
export async function boardControl({ chrome, ci, attach } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-foreign-board-'));
  let server = null;
  try {
    const file = makeForeignBoard(dir);
    server = await startServer({ root: dir, port: Number(process.env.TN_BOARD_PORT) || 0, mounts: { '/tarn/': path.join(dir, 'vendor', 'tarn') } });
    const common = { board: file, base: server.url, chrome, ci, attach, shots: false };
    const base = await runBoard({ ...common, update: true });
    if (base.code !== 0) return { ok: false, line: 'selftest: board outside the kit: baseline snapshots could not be written', detail: base.lines.slice(0, 3).join(' | ') };
    // --update writes the baseline and checks nothing else: its last line must not read as a verdict
    if (base.lines.some((l) => /GREEN/.test(l)) || !base.lines.some((l) => /baseline written/.test(l))) return { ok: false, line: 'selftest: board outside the kit: --update reads like a verdict (expected "baseline written", no GREEN)', detail: base.lines.slice(-2).join(' | ') };
    const green = await runBoard({ ...common });
    const st = green.report?.stats || {};
    const measured = (st.geometryStates || 0) >= 4 && (st.overlayScenarios || 0) >= 4 && (st.snapshotStates || 0) >= 4;
    const kit = green.report?.kit;
    const greenOk = green.code === 0 && measured && kit === fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    // tools/shoot.mjs against the running server without --attach: Node fetches, CDP fulfils (no network access of the own Chrome needed)
    const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-shoot-'));
    // asynchronous: the server of this process must keep answering while shoot runs
    const sh = await new Promise((resolve) => {
      const c = spawn(process.execPath, [path.join(ROOT, 'tools', 'shoot.mjs'), '--out', shotDir, '--sizes', 'phone', '--themes', 'dark', ...(chrome ? ['--chrome', chrome] : []), `${server.url}/`], { env: { ...process.env, ...(ci ? { TN_NO_SANDBOX: '1' } : {}) } });
      let stdout = '', stderr = '';
      c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
      const t = setTimeout(() => c.kill('SIGKILL'), 90000);
      c.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
    });
    const shootOk = sh.status === 0 && fs.readdirSync(shotDir).some((f) => f.endsWith('.png')) && /fetched by Node/.test(sh.stdout);
    const shootDetail = shootOk ? '' : `shoot: exit ${sh.status} ${(sh.stdout + sh.stderr).trim().split('\n').slice(-6).join(' | ')}`;
    fs.rmSync(shotDir, { recursive: true, force: true });
    injectFaults(dir);
    const red = await runBoard({ ...common, only: ['lint', 'vendor', 'geometry'], views: ['overview'] });
    const checks = new Set((red.report?.findings || []).map((f) => f.check));
    const rules = new Set((red.report?.findings || []).map((f) => f.rule));
    const redOk = red.code === 1 && ['lint', 'vendor', 'geometry'].every((c) => checks.has(c)) && rules.has('html') && rules.has('color');
    const ok = greenOk && redOk && shootOk;
    return {
      ok,
      line: `selftest: board outside the kit: foreign copy ${greenOk ? 'green' : 'NOT GREEN'} (kit ${kit || '?'}, ${st.geometryStates || 0} states, ${st.overlayScenarios || 0} scenarios, ${st.snapshotStates || 0} snapshots), injected faults ${redOk ? 'red' : 'NOT RED'} (${[...checks].join(', ') || 'none'}), shoot through Node ${shootOk ? 'ok' : 'FAILED'}`,
      detail: ok ? '' : `${shootDetail} · green: ${green.lines.slice(0, 3).join(' | ')} · red: ${red.lines.slice(0, 3).join(' | ')}`,
    };
  } finally {
    await server?.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
