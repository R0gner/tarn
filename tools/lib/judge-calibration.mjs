// tarn · calibration of the visual judge on a labelled set: the known faults of the selftest (verify/mutants.mjs) against the same states unmutated.
import { FAULT_TYPES, markedTypes } from './judge.mjs';

/**
 * Which fault types a mutant shows to the eye (the judge has one question per type); null = the fault is not a picture (behaviour, identity, a token that
 * changes sizes by a few pixels). Mutants of the overlay check and every mutant not listed are not part of the picture set.
 */
export const MUTANT_LABELS = {
  'tile-overlap': ['overlap'],
  'row-title-no-ellipsis': ['clipped'],
  'button-misaligned': ['misaligned'],
  'banner-path-overflow': ['overflow'],
  'timeline-scrolls-sideways': ['overflow'],
  'word-broken-by-letter': ['clipped'],
  'comfortable-target-shrunk': ['malformed'],
  'comfortable-hit-token-lowered': ['malformed'],
  'toggle-thumb-leaves-track': ['malformed', 'overlap'],
  'tiles-ragged': ['misaligned'],
  'row-sub-wrap-ellipsis': ['clipped'],
  'toolbar-crowded': ['clipped'],
  'segmented-squeezed': ['overflow', 'malformed', 'clipped'],
};

/** A scroll target per mutant so that the fault is inside the picture (the capture is the first screen of a view, the fault may sit below it). */
export const MUTANT_SCROLL = {
  'toggle-thumb-leaves-track': { inputs: '.tn-toggle-track' },
  'banner-path-overflow': { states: '.tn-banner' },
  'button-misaligned': { table: '.tn-toolrow' },
  'timeline-scrolls-sideways': { charts: '.tn-tl-grid' },
  'word-broken-by-letter': { rows: '.g-narrow-s' },
  'row-sub-wrap-ellipsis': { rows: '.tn-row-sub-wrap' },
};

/**
 * rows: [{ id: 'clean' | mutant id, page, view, size, theme, sha, scores }] (one per picture).
 * A mutated picture with the same bytes as its unmutated state shows nothing (the fault is outside the picture): counted as `invisible`, not as a miss.
 * → { clean: n, faults: n, invisible: n, perType: { type: { cleanMarked, faults, hit, hitAny } }, perMutant: { id: { pictures, invisible, hit, hitAny } } }
 */
export function evaluateCalibration(rows, thresholds) {
  const key = (r) => `${r.page}|${r.view}|${r.size}|${r.theme}|${r.scrolled ? 1 : 0}`;
  const cleanRows = [...new Map(rows.filter((r) => r.id === 'clean' && r.scores).map((r) => [key(r), r])).values()];   // one per state
  const cleanSha = new Map(cleanRows.map((r) => [key(r), r.sha]));
  const out = { clean: cleanRows.length, faults: 0, invisible: 0, perType: {}, perMutant: {}, cleanMarkedAny: cleanRows.filter((r) => markedTypes(r.scores, thresholds).length).length };
  for (const t of FAULT_TYPES) out.perType[t] = { cleanMarked: cleanRows.filter((r) => r.scores[t] >= thresholds[t]).length, faults: 0, hit: 0, hitAny: 0 };
  for (const r of rows.filter((x) => x.id !== 'clean' && x.scores)) {
    const labels = MUTANT_LABELS[r.id];
    if (!labels) continue;
    const m = (out.perMutant[r.id] ||= { pictures: 0, invisible: 0, hit: 0, hitAny: 0 });
    if (cleanSha.get(key(r)) === r.sha) { m.invisible++; out.invisible++; continue; }
    m.pictures++; out.faults++;
    const marked = markedTypes(r.scores, thresholds).map((x) => x.type);
    const hit = labels.some((l) => marked.includes(l));
    if (hit) m.hit++;
    if (marked.length) m.hitAny++;
    for (const l of labels.slice(0, 1)) {          // the first label is the main type of the fault
      const pt = out.perType[l]; pt.faults++; if (marked.includes(l)) pt.hit++; if (marked.length) pt.hitAny++;
    }
  }
  return out;
}

/** Lowest threshold (steps of 0.05, between `lo` and 0.95) at which at most `maxFalse` of the clean pictures are marked for the type. */
export function chooseThreshold(cleanScores, { maxFalse = 0, lo = 0.3 } = {}) {
  for (let t = lo; t <= 0.95 + 1e-9; t += 0.05) {
    const v = Math.round(t * 100) / 100;
    if (cleanScores.filter((s) => s >= v).length <= maxFalse) return v;
  }
  return 0.95;
}
