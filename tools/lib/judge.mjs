// tarn · visual judge, the part without a browser: questions, request, cost, cache, ledger, verdicts. Used by tools/judge.mjs; tested without network.
//
// One API call per picture asks one yes/no question (Noul) per fault type. The verdicts are cached by sha256(PNG bytes) + question-set version, so an
// unchanged picture is never paid for twice. Nothing here reads the API key except `ask()`, which sends it as a header and never prints or stores it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Bump when a question, its wording or the way a picture is prepared changes: old verdicts no longer match. */
export const QUESTION_SET_VERSION = 'qs2';
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-latest';
/** List price (https://docs.typesafe.ai/models.md, Jev 1.14): USD per million input tokens; output tokens are free. */
export const PRICE_PER_MTOK = 0.042;
/** The API refuses pictures smaller than 280 px on a side and never resizes; the longer side is kept at 1568 px by the capture. */
export const IMAGE_LIMITS = { min: 280, max: 1568 };

const SHOT = 'a screenshot of a web user interface (a design-system gallery, a sample dashboard or a small website), shown in `page`';
/** One question per fault type. `true`/`false` are the Noul criteria; the wording is part of the version above. */
export const QUESTIONS = {
  overflow: {
    instructions: `Looking at ${SHOT}: does any element stick out beyond the edge of the card, panel or screen that contains it, or is the right edge of the content cut off by the screen?`,
    criteria: { true: 'Content visibly extends past the border of its container or past the screen edge, or is cut off at the screen edge.', false: 'Everything stays inside its container and inside the screen. Rounded cards, lists that scroll inside their own box and text that ends in an ellipsis are normal.' },
  },
  overlap: {
    instructions: `Looking at ${SHOT}: do two elements overlap so that one covers part of another (text over text, a card over a card, a control over a label)?`,
    criteria: { true: 'One element visibly covers or collides with another element.', false: 'Elements sit next to each other with their own space. Badges, icons or text inside their own button or card are not an overlap.' },
  },
  clipped: {
    instructions: `Looking at ${SHOT}: is any text cut off in a way that looks unintended, such as a line ending abruptly at the edge of its box without an ellipsis, a word chopped in the middle, or a heading shortened to a few letters?`,
    criteria: { true: 'Text is cut at a box edge with no ellipsis, or a single word is broken letter by letter across lines.', false: 'All text is complete, or is shortened with an ellipsis (…), or wraps at word boundaries.' },
  },
  misaligned: {
    instructions: `Looking at ${SHOT}: are items that should line up visibly out of line, such as one button higher or lower than its neighbours in a row, or a grid of tiles with an empty cell or ragged last row?`,
    criteria: { true: 'Siblings in a row or grid do not line up, or a tile grid leaves an obvious gap or uneven last row.', false: 'Rows and grids look even and regular.' },
  },
  malformed: {
    instructions: `Looking at ${SHOT}: does any control or component look broken, such as a toggle whose knob sits outside its track, a segmented control whose labels are squeezed or cut off, or a button whose label is cut or touches its edge?`,
    criteria: { true: 'A control has the wrong shape or proportions: parts outside their frame, squeezed or cut labels.', false: 'All controls look complete and well proportioned.' },
  },
};
export const FAULT_TYPES = Object.keys(QUESTIONS);

/** Score at or above which a picture is marked for a fault type. Chosen from the calibration in README "Visual judge"; per type, not one number. */
export const THRESHOLDS = { overflow: 0.85, overlap: 0.5, clipped: 0.65, misaligned: 0.65, malformed: 0.65 };

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const cacheKey = (png) => `${QUESTION_SET_VERSION}:${sha256(png)}`;

/** Width and height of a PNG from its header (no decoder needed). */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
/** null when the picture is acceptable to the API, else the reason. */
export function sizeProblem(buf) {
  const { w, h } = pngSize(buf);
  const { min, max } = IMAGE_LIMITS;
  if (w < min || h < min) return `${w}×${h} px: a side is below ${min} px (the API refuses it)`;
  if (w > max || h > max) return `${w}×${h} px: a side is above ${max} px (too many tokens)`;
  return null;
}

export const costUsd = (tokens) => (tokens * PRICE_PER_MTOK) / 1e6;

/** The request for one picture. `uuid` names the asset (a fresh one per image, so the reference cannot collide with text). */
export function buildRequest(png, uuid = crypto.randomUUID()) {
  return {
    headers: { 'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true' },
    body: {
      model: MODEL,
      state: { page: uuid },
      assets: { [uuid]: { type: 'image', format: 'png', data_base64: png.toString('base64') } },
      questions: Object.fromEntries(Object.entries(QUESTIONS).map(([id, q]) => [id, { type: 'noul', instructions: q.instructions, criteria: q.criteria }])),
    },
  };
}

/** Scores from a response; a missing or non-numeric answer is an error, not a silent 0. → { scores, tokens, model } */
export function parseResponse(res) {
  const scores = {};
  for (const id of FAULT_TYPES) {
    const v = res?.answers?.[id]?.noul;
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) throw new Error(`answer for "${id}" missing or not a probability`);
    scores[id] = Math.round(v * 1000) / 1000;
  }
  const tokens = res?.usage?.input_tokens;
  if (!Number.isInteger(tokens) || tokens < 0) throw new Error('response without usage.input_tokens (cost unknown)');
  return { scores, tokens, model: String(res.model || MODEL) };
}

/** The real call. The key comes from the environment and goes into one header; errors carry the status and the allow-listed error type only. */
export async function ask(png, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const key = env.TYPESAFEAI_API_KEY;
  if (!key) throw new Error('TYPESAFEAI_API_KEY is not set');
  const { headers, body } = buildRequest(png);
  const r = await fetchImpl(ENDPOINT, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = (await r.text()).slice(0, 8192);
  let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) throw Object.assign(new Error(`API ${r.status}${j?.detail?.error_type ? ` ${String(j.detail.error_type).slice(0, 40)}` : ''}`), { status: r.status });
  return parseResponse(j);
}

/** A recorded answer instead of the network: { scores?, tokens? } or a function (png) → result. For tests and for developing without the key. */
export const mockAsk = (rec) => async (png) => (typeof rec === 'function' ? rec(png) : { scores: { ...Object.fromEntries(FAULT_TYPES.map((t) => [t, 0.05])), ...rec.scores }, tokens: rec.tokens ?? 1000, model: 'mock' });

/* ---- Cache and ledger ---- */
export const defaultCacheDir = (env = process.env) => path.join(env.XDG_CACHE_HOME || path.join(env.HOME || '.', '.cache'), 'tarn');
/** `--cache` names the verdict file; the ledger lies next to it. */
export const cachePaths = (cacheFile) => ({ cache: cacheFile, ledger: path.join(path.dirname(cacheFile), 'judge-ledger.jsonl') });

export function loadCache(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && j.verdicts ? j : { verdicts: {} }; } catch { return { verdicts: {} }; }
}
export function saveCache(file, cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file);
}
export function appendLedger(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}
/** Sum of everything ever spent through this ledger (USD, reported tokens × price). */
export function ledgerTotal(file) {
  let usd = 0, calls = 0;
  try { for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l) { const e = JSON.parse(l); if (e.ok) { usd += e.usd; calls++; } } } catch { /* no ledger yet */ }
  return { usd, calls };
}

/** Marked fault types of a score set, strongest first: [{ type, score }]. */
export const markedTypes = (scores, thresholds = THRESHOLDS) => FAULT_TYPES.filter((t) => scores[t] >= thresholds[t]).map((t) => ({ type: t, score: scores[t] })).sort((a, b) => b.score - a.score);

/**
 * Judge pictures: { file, png (Buffer), label }[] → { results, stats }.
 * results[i] = { label, file, sha, scores, marked, source: 'cache' | 'api' | 'skipped' | 'error', note? }
 * stats = { pictures, unique, calls, saved, skipped, errors, tokens, usd, stoppedBy? }
 * A run never goes beyond `maxUsd`: before each call it estimates the cost from the tokens measured so far in this run (the cached tokens of an earlier call
 * of the same question set before that; with no figure yet, the largest allowed picture), and stops asking when the estimate would pass the limit.
 * `maxTotalUsd` is the same for the whole ledger.
 */
export async function judgePictures(pictures, { cacheFile, ask: askFn = ask, maxUsd = 0.10, maxTotalUsd = Infinity, thresholds = THRESHOLDS, now = () => new Date().toISOString(), noCall = false } = {}) {
  const paths = cachePaths(cacheFile);
  const cache = loadCache(paths.cache);
  const stats = { pictures: pictures.length, unique: 0, calls: 0, saved: 0, skipped: 0, errors: 0, tokens: 0, usd: 0 };
  const results = [];
  const seen = new Map();   // sha → verdict of this run (the same bytes twice in one run: one call)
  const total0 = ledgerTotal(paths.ledger).usd;
  const seenTokens = Object.values(cache.verdicts).map((v) => v.tokens).filter(Boolean);
  let perPicture = seenTokens.length ? Math.max(...seenTokens.slice(-20)) : null;
  for (const p of pictures) {
    const sha = sha256(p.png), key = cacheKey(p.png);
    const base = { label: p.label, file: p.file, sha };
    const bad = sizeProblem(p.png);
    if (bad) { stats.errors++; results.push({ ...base, scores: null, marked: [], source: 'error', note: bad }); continue; }
    let v = cache.verdicts[key] || seen.get(key);
    if (v) { stats.saved++; results.push({ ...base, scores: v.scores, marked: markedTypes(v.scores, thresholds), source: 'cache' }); continue; }
    stats.unique++;
    const estimate = costUsd(perPicture ?? 8000);
    if (noCall) { stats.skipped++; results.push({ ...base, scores: null, marked: [], source: 'skipped', note: 'dry run' }); continue; }
    if (stats.usd + estimate > maxUsd || total0 + stats.usd + estimate > maxTotalUsd) {
      stats.skipped++; stats.stoppedBy ||= stats.usd + estimate > maxUsd ? `--max-usd ${maxUsd}` : `total ${maxTotalUsd} USD`;
      results.push({ ...base, scores: null, marked: [], source: 'skipped', note: 'budget' });
      continue;
    }
    try {
      const r = await askFn(p.png);
      const usd = costUsd(r.tokens);
      stats.calls++; stats.tokens += r.tokens; stats.usd += usd; perPicture = Math.max(perPicture ?? 0, r.tokens);
      v = { scores: r.scores, tokens: r.tokens, model: r.model, at: now() };
      cache.verdicts[key] = v; seen.set(key, v);
      saveCache(paths.cache, cache);
      appendLedger(paths.ledger, { at: v.at, qs: QUESTION_SET_VERSION, sha: sha.slice(0, 16), model: r.model, tokens: r.tokens, usd, ok: true });
      results.push({ ...base, scores: v.scores, marked: markedTypes(v.scores, thresholds), source: 'api' });
    } catch (e) {
      stats.errors++;
      appendLedger(paths.ledger, { at: now(), qs: QUESTION_SET_VERSION, sha: sha.slice(0, 16), ok: false, usd: 0, error: String(e.message).slice(0, 80) });
      results.push({ ...base, scores: null, marked: [], source: 'error', note: String(e.message).slice(0, 80) });
      if (e.status === 401 || e.status === 403 || e.status === 429) { stats.stoppedBy ||= `API ${e.status}`; break; }
    }
  }
  stats.saved_usd = stats.saved ? costUsd(perPicture ?? 0) * stats.saved : 0;
  stats.total_usd = total0 + stats.usd;
  return { results, stats };
}

/** At most 10 lines for the terminal: totals, the marked pictures (strongest first), where the report is. */
export function summaryLines({ results, stats }, reportFile) {
  const marked = results.filter((r) => r.marked.length).sort((a, b) => b.marked[0].score - a.marked[0].score);
  const lines = [`judge: ${stats.pictures} pictures · ${stats.calls} API calls · ${stats.saved} saved by the cache · cost of this run $${stats.usd.toFixed(5)} (cache saved ≈ $${stats.saved_usd.toFixed(5)}; ledger total $${stats.total_usd.toFixed(5)})`];
  if (stats.skipped) lines.push(`judge: ${stats.skipped} picture(s) not judged${stats.stoppedBy ? ` – stopped by ${stats.stoppedBy}` : ' (dry run)'}`);
  if (stats.errors) lines.push(`judge: ${stats.errors} picture(s) with an error (see the report)`);
  const room = 10 - lines.length - 2;
  lines.push(marked.length ? `judge: ${marked.length} picture(s) marked for a look (not a verdict, never a gate):` : 'judge: no picture marked');
  for (const r of marked.slice(0, room)) lines.push(`  ${r.marked.map((m) => `${m.type} ${m.score.toFixed(2)}`).join(', ')} · ${r.label}`);
  if (marked.length > room) lines[lines.length - 1] = `  … ${marked.length - room + 1} more in the report`;
  lines.push(`judge: report ${reportFile}`);
  return lines.slice(0, 10);
}
