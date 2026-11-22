// @ts-check
// tarn · Hash router, pure functions (no DOM). Format: #/view?open=id&more=values

/**
 * '#/automations?open=ct%3Aweb&q=x' → { view: 'automations', params: { open: 'ct:web', q: 'x' } }
 * @param {string | null | undefined} hash
 * @param {string} [fallback]
 * @returns {{ view: string, params: Record<string, string> }}
 */
export function parseHash(hash, fallback = '') {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0, qi);
  const params = Object.fromEntries(new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1)));
  let view = '';
  try { view = decodeURIComponent(path.replace(/\/+$/, '')); } catch { view = path; }
  return { view: view || fallback, params };
}

/**
 * ('automations', { open: 'ct:web' }) → '#/automations?open=ct%3Aweb'; empty values are dropped.
 * @param {string | null | undefined} view
 * @param {Record<string, string | number | boolean | null | undefined>} [params]
 * @returns {string}
 */
export function buildHash(view, params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const q = sp.toString();
  return `#/${encodeURIComponent(view || '')}${q ? `?${q}` : ''}`;
}

/**
 * The parameters of a view without the detail on top (`open`): what ctx.params holds and what app.go() takes as `params`. A view that copies
 * ctx.params into a link (`go(view, { params: { ...ctx.params, tab } })`) must never carry the detail along – a view drawn while a detail was
 * open would otherwise reopen it on the next switch (0.9.1, Markt-Scout: swipe to the next tab after closing a detail reopened it).
 * @param {Record<string, string> | null | undefined} params
 * @returns {Record<string, string>}
 */
export function viewParams(params) {
  const { open: _open, ...rest } = params || {};
  return rest;
}

/**
 * Do two parameter sets of the same view show different content? Every parameter counts except `open` (the detail on top) and empty values
 * (buildHash drops them, so they never reach the URL). The shell redraws the view when this is true.
 * @param {Record<string, string | undefined> | null | undefined} a
 * @param {Record<string, string | undefined> | null | undefined} b
 * @returns {boolean}
 */
export function viewParamsDiffer(a, b) {
  /** @param {Record<string, string | undefined> | null | undefined} p @returns {[string, string][]} */
  const norm = (p) => Object.entries(p || {}).filter(([k, v]) => k !== 'open' && v != null && v !== '').map(([k, v]) => [k, String(v)]);
  const x = norm(a), y = new Map(norm(b));
  return x.length !== y.size || x.some(([k, v]) => y.get(k) !== v);
}

/**
 * The views of createApp() with `label` and `group` as plain strings: both may be functions (so they can call t() after the language is set), evaluated here, once.
 * @template {{ label: string | (() => string), group?: string | (() => string | undefined) }} V
 * @param {V[]} views
 * @returns {(Omit<V, 'label' | 'group'> & { label: string, group?: string })[]}
 */
export function resolveViews(views) {
  return views.map((v) => ({ ...v, label: typeof v.label === 'function' ? v.label() : v.label, group: typeof v.group === 'function' ? v.group() : v.group }));
}
