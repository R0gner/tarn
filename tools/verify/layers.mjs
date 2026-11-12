// tarn · positive control of the lint rule `layers` (core never imports shell) for verify --selftest.
// Runs on a temp copy of css/ and js/ with a planted core → shell import; the repository is not touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintLayers } from '../lint.mjs';

const PLANTS = [
  ['js/dom.js', "\nimport './shell.js';\n", 'static import'],
  ['js/format.js', "\nexport { card } from './components.js';\n", 'export … from'],
  ['js/primitives.js', "\nconst late = () => import('./table.js');\n", 'dynamic import()'],
];

export function layersMutant(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-layers-mutant-'));
  try {
    fs.cpSync(path.join(root, 'js'), path.join(tmp, 'js'), { recursive: true });
    const clean = [];
    lintLayers((f) => clean.push(f), tmp);
    const missed = [];
    for (const [file, add, label] of PLANTS) {
      const f = path.join(tmp, file), before = fs.readFileSync(f, 'utf8');
      fs.writeFileSync(f, before + add);
      const hit = [];
      lintLayers((x) => hit.push(x), tmp);
      if (!hit.some((x) => x.file === file)) missed.push(label);
      fs.writeFileSync(f, before);
    }
    const ok = !clean.length && !missed.length;
    return { ok, line: `selftest: layers mutants (core imports shell) ${missed.length ? `MISSED ${missed.join(', ')}` : 'detected'}${clean.length ? ` · clean copy NOT clean (${clean.length})` : ''}` };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
