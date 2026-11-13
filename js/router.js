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
 * The views of createApp() with `label` and `group` as plain strings: both may be functions (so they can call t() after the language is set), evaluated here, once.
 * @template {{ label: string | (() => string), group?: string | (() => string | undefined) }} V
 * @param {V[]} views
 * @returns {(Omit<V, 'label' | 'group'> & { label: string, group?: string })[]}
 */
export function resolveViews(views) {
  return views.map((v) => ({ ...v, label: typeof v.label === 'function' ? v.label() : v.label, group: typeof v.group === 'function' ? v.group() : v.group }));
}
