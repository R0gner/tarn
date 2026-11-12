// @ts-check
// dashkit · Filter bar: search + “Filter” button (sheet with one group per filter) + removable chips.
// Filters by data type (the type decides the control in the sheet and the chip text):
//   options  few values as pills, from `pills` (default 8) values a combobox with search
//   bool     segment “All · Yes · No”
//   range    from/to number fields with a unit
//   time     presets (1 h … 30 d) plus an own period (dates)
import { h, nextId } from './dom.js';
import { icon } from './icons.js';
import { button } from './components.js';
import { segmented } from './controls.js';
import { openSheet } from './sheet.js';
import { numberField, combobox, dateRange } from './inputs.js';
import { t } from './i18n.js';
import { kindOf, chipsOf, withoutChip, matchFilters, cleanValue } from './filters-data.js';

/** @typedef {import('./filters-data.js').FilterState} FilterState */
/** @typedef {{ value: any, label: string, count?: number }} FilterOption */
/** @typedef {{ key: string, label?: string, type?: 'options' | 'bool' | 'range' | 'time', options?: FilterOption[], single?: boolean, pills?: number, labels?: { yes?: string, no?: string }, unit?: string, min?: number, max?: number, step?: number, format?: (n: number) => string, presets?: string[], custom?: boolean }} FilterDef One filter; the type decides the control in the sheet and the chip text. */
/** @typedef {{ filters: FilterDef[], placeholder?: string, value?: Partial<FilterState>, onChange?: (state: FilterState) => void, count?: (state: FilterState) => string | null | undefined }} FilterBarOptions */
/** @typedef {HTMLElement & { state: FilterState, set: (s: Partial<FilterState>) => void, refresh: () => void }} FilterBarElement */

export { matchFilters };

const PILLS_MAX = 8;

/**
 * filterBar({
 *   placeholder?, filters: [{ key, label, type?: 'options' | 'bool' | 'range' | 'time', … }],
 *     options:  { options: [{ value, label, count? }], single?, pills? = 8 }
 *     bool:     { labels?: { yes, no } }
 *     range:    { unit?, min?, max?, step?, format?(n) }
 *     time:     { presets?: ['1h', '24h', '7d'] (default), custom?: true }
 *   value?: { q: '', f: { key: value } }, onChange(state), count?: (state) → result-count text
 * }) → element with .state and .set(state), .refresh()
 * State values: options string[] · bool true|false · range { min?, max? } · time { preset } | { from?, to? } (days 'YYYY-MM-DD').
 * Without `type` a filter is `options` (existing calls stay valid). Rows are matched with matchFilters(row, state.f, get, { now }).
 * @param {FilterBarOptions} opts
 * @returns {FilterBarElement}
 */
export function filterBar(opts) {
  const defs = (opts.filters || []).map((d) => ({ type: 'options', ...d }));
  /** @type {FilterState} */
  const state = { q: opts.value?.q || '', f: structuredClone(opts.value?.f || {}) };
  const input = h('input', {
    class: 'dk-input', type: 'search', placeholder: opts.placeholder || t('filter.search'), value: state.q,
    'aria-label': opts.placeholder || t('filter.searchAria'), enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false',
    oninput: () => { state.q = input.value; emit(); },
  });
  const countEl = h('span', { class: 'dk-filter-n dk-num' });
  const filterBtn = h('button', { class: 'dk-btn dk-btn-default', type: 'button', onclick: openFilter, 'aria-haspopup': 'dialog' },
    icon('filter'), h('span', null, t('filter.title')), countEl);
  const chips = h('div', { class: 'dk-chips', 'aria-label': t('filter.active') });
  const info = h('div', { class: 'dk-filter-info' });
  const el = h('div', { class: 'dk-filterbar' },
    h('div', { class: 'dk-filter-row' }, h('label', { class: 'dk-search' }, icon('search'), input), defs.length ? filterBtn : null),
    h('div', { class: 'dk-filter-row2' }, chips, info));
  /** @type {import('./sheet.js').Sheet | null} */
  let sheet = null;
  /** @type {Array<() => void>} */
  let syncers = [];

  const setValue = (key, v) => { const c = cleanValue(v); if (c === undefined) delete state.f[key]; else state.f[key] = c; };
  function toggle(def, v) {
    const cur = state.f[def.key] || [];
    setValue(def.key, cur.includes(v) ? cur.filter((x) => x !== v) : def.single ? [v] : [...cur, v]);
    emit();
  }
  function renderChips() {
    const a = chipsOf(defs, state.f);
    countEl.textContent = a.length ? String(a.length) : '';
    countEl.hidden = !a.length;
    filterBtn.classList.toggle('is-active', a.length > 0);
    chips.replaceChildren(...a.map((c) => h('button', {
      class: 'dk-chip', type: 'button', 'aria-label': t('filter.remove', { group: c.group, label: c.text }),
      onclick: () => { state.f = withoutChip(state.f, c); emit(); },
    }, h('span', { class: 'dk-chip-group' }, `${c.group}${c.sep}`), h('span', null, c.text), icon('x', { size: 12 }))));
    if (a.length > 1) chips.append(h('button', { class: 'dk-chip dk-chip-clear', type: 'button', onclick: () => { state.f = {}; emit(); } }, t('filter.clearAll')));
    const txt = opts.count?.(state);
    info.textContent = txt || '';
    /** @type {HTMLElement} */ (el.querySelector('.dk-filter-row2')).hidden = !a.length && !txt;
  }

  /* ---- sheet: one group per filter; the controls are created once and only synchronised afterwards (no re-render while typing) ---- */
  function groupOf(def) {
    const sync = [];
    let body;
    if (def.type === 'bool') body = boolControl(def, sync);
    else if (def.type === 'range') body = rangeControl(def, sync);
    else if (def.type === 'time') body = timeControl(def, sync);
    else body = (def.options || []).length > (def.pills ?? PILLS_MAX) ? comboControl(def, sync) : pillsControl(def, sync);
    const clear = h('button', { class: 'dk-fgroup-clear', type: 'button', hidden: true, onclick: () => { delete state.f[def.key]; emit(); } }, t('filter.clear'));
    const titleId = nextId('fgroup');
    const el = h('div', { class: 'dk-fgroup', role: 'group', 'aria-labelledby': titleId },
      h('div', { class: 'dk-fgroup-head' }, h('div', { class: 'dk-fgroup-title', id: titleId }, def.label || def.key), clear), body);
    const run = () => { clear.hidden = !kindOf(state.f[def.key]); sync.forEach((f) => f()); };
    return { el, run };
  }
  function pillsControl(def, sync) {
    const pills = (def.options || []).map((o) => {
      const p = h('button', { class: 'dk-pill', type: 'button', disabled: o.disabled || null, onclick: () => toggle(def, o.value) },
        icon('check', { size: 12 }), h('span', null, o.label), o.count != null && h('span', { class: 'dk-pill-n dk-num' }, o.count));
      sync.push(() => { const on = (state.f[def.key] || []).includes(o.value); p.setAttribute('aria-pressed', String(on)); p.classList.toggle('is-on', on); });
      return p;
    });
    return h('div', { class: 'dk-pills' }, pills);
  }
  function comboControl(def, sync) {
    const options = (def.options || []).map((o) => ({ value: o.value, label: o.label, hint: o.count != null ? String(o.count) : o.hint, disabled: o.disabled }));
    const c = combobox({
      options, multiple: !def.single, value: def.single ? (state.f[def.key] || [])[0] ?? null : state.f[def.key] || [], placeholder: t('filter.any'), label: def.label || def.key,
      onChange: (v) => { setValue(def.key, def.single ? (v == null ? [] : [v]) : v); emit(); },
    });
    sync.push(() => c.setValue(def.single ? (state.f[def.key] || [])[0] ?? null : state.f[def.key] || []));
    return c;
  }
  function boolControl(def, sync) {
    const labels = { all: t('filter.all'), yes: def.labels?.yes ?? t('filter.yes'), no: def.labels?.no ?? t('filter.no') };
    const seg = segmented({
      options: [{ value: 'all', label: labels.all }, { value: 'yes', label: labels.yes }, { value: 'no', label: labels.no }], value: 'all', label: def.label || def.key,
      onChange: (v) => { if (v === 'all') delete state.f[def.key]; else state.f[def.key] = v === 'yes'; emit(); },
    });
    sync.push(() => seg.setValue(typeof state.f[def.key] === 'boolean' ? (state.f[def.key] ? 'yes' : 'no') : 'all'));
    return h('div', { class: 'dk-fgroup-seg' }, seg);
  }
  function rangeControl(def, sync) {
    const common = { unit: def.unit, min: def.min, max: def.max, step: def.step ?? 1 };
    const lo = numberField({ ...common, label: `${def.label || def.key}: ${t('filter.min')}`, placeholder: t('filter.min'), onChange: apply });
    const hi = numberField({ ...common, label: `${def.label || def.key}: ${t('filter.max')}`, placeholder: t('filter.max'), onChange: apply });
    const err = h('div', { class: 'dk-field-error', 'aria-live': 'polite', hidden: true });
    const fail = (text, ...boxes) => {
      [lo, hi].forEach((b) => b.setInvalid(boxes.includes(b)));
      err.replaceChildren(...(text ? [icon('alert', { size: 12 }), h('span', null, text)] : [])); err.hidden = !text;
    };
    function apply() {
      const a = lo.getValue(), b = hi.getValue();
      if (Number.isNaN(a) || Number.isNaN(b)) return fail(t('validate.number'), Number.isNaN(a) ? lo : hi);
      if (a != null && b != null && a > b) return fail(t('filter.rangeOrder'), lo, hi);
      fail(null);
      setValue(def.key, { min: a ?? undefined, max: b ?? undefined });
      emit();
    }
    sync.push(() => {
      const v = state.f[def.key];
      if (kindOf(v) === 'range') { lo.setValue(v.min ?? null); hi.setValue(v.max ?? null); fail(null); }
      else if (err.hidden) { lo.setValue(null); hi.setValue(null); }   // keep what is being typed while an error is shown
    });
    return h('div', { class: 'dk-fgroup-range' }, h('div', { class: 'dk-fgroup-pair' }, lo, hi), err);
  }
  function timeControl(def, sync) {
    const presets = def.presets || ['1h', '24h', '7d'];
    let custom = false;
    const pills = presets.map((id) => h('button', { class: 'dk-pill', type: 'button', onclick: () => { custom = false; if (state.f[def.key]?.preset === id) delete state.f[def.key]; else state.f[def.key] = { preset: id }; emit(); } }, t(`filter.time.pill.${id}`)));
    const customPill = def.custom === false ? null : h('button', { class: 'dk-pill', type: 'button', onclick: () => { custom = !custom; if (!custom && state.f[def.key]?.from) delete state.f[def.key]; emit(); } }, t('filter.time.custom'));
    const range = dateRange({ presets: [], onChange: ({ from, to }) => { setValue(def.key, { from: from || undefined, to: to || undefined }); emit(); } });
    const rangeBox = h('div', { class: 'dk-fgroup-custom', hidden: true }, range);
    sync.push(() => {
      const v = state.f[def.key];
      const isCustom = custom || !!(v && !v.preset);
      pills.forEach((p, i) => { const on = v?.preset === presets[i]; p.setAttribute('aria-pressed', String(on)); p.classList.toggle('is-on', on); });
      if (customPill) { customPill.setAttribute('aria-pressed', String(isCustom)); customPill.classList.toggle('is-on', isCustom); }
      rangeBox.hidden = !isCustom || !customPill;
      range.setValue({ from: v && !v.preset ? v.from : null, to: v && !v.preset ? v.to : null });
    });
    return h('div', { class: 'dk-fgroup-time' }, h('div', { class: 'dk-pills' }, pills, customPill), rangeBox);
  }

  function openFilter() {
    const groups = defs.map(groupOf);
    syncers = groups.map((g) => g.run);
    syncers.forEach((f) => f());
    sheet = openSheet({
      title: t('filter.title'), kind: 'filter', body: h('div', { class: 'dk-fgroups' }, groups.map((g) => g.el)),
      footer: [button(t('common.reset'), { variant: 'ghost', onClick: () => { state.f = {}; emit(); } }), button(t('common.done'), { variant: 'primary', onClick: () => sheet?.close('api') })],
      onClose: () => { sheet = null; syncers = []; },
    });
  }
  function emit() {
    renderChips();
    syncers.forEach((f) => f());
    opts.onChange?.(structuredClone(state));
  }
  const bar = Object.assign(el, {
    state,
    /** @param {Partial<FilterState>} s */
    set(s) { state.q = s.q || ''; state.f = structuredClone(s.f || {}); input.value = state.q; emit(); },
    refresh: renderChips,
  });
  renderChips();
  return bar;
}
