// tarn · verify rules: exceptions and known faults (one JSON file with reasons), classification and grouping of findings.
// Shared by the kit run (tools/verify.mjs) and the board run (tools/verify/board.mjs).
import fs from 'node:fs';

/** Read an exceptions file: { known, exceptions }, each entry with `match` (field → RegExp against the finding) and a reason. A missing file is empty. */
export function loadRules(file, { optional = false } = {}) {
  if (optional && !fs.existsSync(file)) return { known: [], exceptions: [] };
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const compile = (e) => ({ ...e, test: (f) => Object.entries(e.match).every(([k, v]) => new RegExp(v).test(String(f[k] ?? ''))) });
  return { known: (j.known || []).map(compile), exceptions: (j.exceptions || []).map(compile) };
}

/** Marks findings as excepted / known; returns those that are not excepted. touch48 (comfortable density) has no exceptions and no known faults. */
export function classify(findings, rules) {
  for (const f of findings) {
    if (f.rule === 'touch48') continue;
    const ex = rules.exceptions.find((e) => e.test(f));
    if (ex) { f.excepted = ex.id; continue; }
    const kn = rules.known.find((e) => e.test(f));
    if (kn) f.known = kn.id;
  }
  return findings.filter((f) => !f.excepted);
}

export const groupKey = (f) => `${f.check}|${f.rule}|${f.page}|${f.sel}`;

export function groups(findings) {
  const m = new Map();
  for (const f of findings) {
    const k = groupKey(f);
    if (!m.has(k)) m.set(k, { ...f, n: 0, sizes: new Set(), views: new Set() });
    const g = m.get(k); g.n++; g.sizes.add(f.size); g.views.add(f.view);
  }
  return [...m.values()];
}

/** One report line per finding group (≤ 220 characters). */
export function groupLine(g) {
  const where = [...g.views].slice(0, 2).join(',') + (g.views.size > 2 ? ',…' : '');
  return `${g.known ? 'KNOWN' : 'FINDING'} ${g.rule} ${g.page}/${where} [${[...g.sizes].join(',')}] ${g.sel} – ${g.text}${g.known ? ` (${g.known})` : ''}`.slice(0, 220);
}
