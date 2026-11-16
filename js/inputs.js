// @ts-check
// tarn · input primitives: textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange and the field() shell
// (label, help text, error text).
//
// Common contract of all controls (the root element returned):
//   el.focusEl            the focusable element (input, select, button)
//   el.getValue()         current value: string | number | null | boolean | string[] | { from, to }
//   el.setValue(v)        set programmatically (fires no onChange)
//   el.setInvalid(bool)   error state (aria-invalid + red border)
//   el.setDisabled(bool)
//   el.rules              (numberField) validation rules that field() picks up
// The root dispatches the normal bubbling `input` and `change` events, so form() and field() listen to every control alike.
// Native <input> where the phone keyboard or picker is better (number, date); an own popover only for the combobox
// (it lives in the overlay layer and therefore also works inside a sheet).
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { t, getTimeZone } from './i18n.js';
import { showOverlay, removeOverlay, placeOverlay } from './overlay.js';
import { hideTooltip } from './controls.js';
import { parseNumber, roundTo, validateValue, validationText, filterOptions, rangeFromPreset, presetOf, imeComposing } from './inputs-data.js';

/**
 * @typedef {HTMLElement & {
 *   focusEl: HTMLElement,
 *   getValue: () => any,
 *   setValue: (v: any) => void,
 *   setInvalid: (on?: boolean) => void,
 *   setDisabled: (on?: boolean) => void,
 *   rules?: ValidationRules,
 * }} Control Root element of every input primitive (the common contract described above).
 */
/** @typedef {{ required?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: RegExp, number?: boolean, validate?: (value: any) => string | null | undefined | false }} ValidationRules Rules for field() / validateValue(). */
/** @typedef {{ className?: string, name?: string, label?: string, disabled?: boolean, invalid?: boolean }} ControlBase Options shared by all controls (`label` is the aria-label of the control). */
/** @typedef {ControlBase & { value?: string | null, type?: 'text' | 'search' | 'url' | 'email' | 'password' | 'tel', rows?: number, placeholder?: string, maxlength?: number, autocomplete?: string, inputmode?: string, mono?: boolean, prefix?: string, suffix?: string, onInput?: (value: string) => void, onChange?: (value: string) => void }} TextFieldOptions */
/** @typedef {ControlBase & { value?: number | string | null, unit?: string, min?: number, max?: number, step?: number, placeholder?: string, onInput?: (value: number | null) => void, onChange?: (value: number | null) => void }} NumberFieldOptions The callbacks get NaN for text that is not a number. */
/** @typedef {{ value: any, label: string, disabled?: boolean, hint?: string }} Option One choice of select() and combobox(). */
/** @typedef {ControlBase & { options?: Option[], value?: any, placeholder?: string, onChange?: (value: any) => void }} SelectOptions */
/** @typedef {{ checked?: boolean, indeterminate?: boolean, label?: string, help?: string, disabled?: boolean, name?: string, onChange?: (checked: boolean) => void, className?: string }} TickOptions checkbox() and toggle(). */
/** @typedef {ControlBase & { value?: string | null, min?: string, max?: string, time?: boolean, onChange?: (value: string | null) => void }} DateFieldOptions */
/** @typedef {{ from: string | null, to: string | null }} DayRange Calendar days 'YYYY-MM-DD' (or null for open). */
/** @typedef {{ from?: string | null, to?: string | null, presets?: string[], min?: string, max?: string, onChange?: (range: DayRange) => void, now?: () => number, className?: string }} DateRangeOptions */
/** @typedef {ControlBase & { options?: Option[], value?: any, multiple?: boolean, placeholder?: string, searchPlaceholder?: string, search?: boolean, onChange?: (value: any) => void }} ComboboxOptions */
/** @typedef {{ label?: string, help?: string, error?: string | null, required?: boolean, rules?: ValidationRules, className?: string }} FieldOptions */
/** @typedef {HTMLElement & { focusEl: HTMLElement, input: HTMLElement, setError: (text?: string | null) => void, setHelp: (text?: string | null) => void, validate: () => boolean, getValue: () => any, setValue: (v: any) => void }} FieldElement */

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Add the common contract to a root element.
 * @param {HTMLElement} root
 * @param {HTMLElement & { disabled?: boolean }} control
 * @param {{ get: () => any, set: (v: any) => void }} io
 * @returns {asserts root is Control}
 */
function wire(root, control, { get, set }) {
  const c = /** @type {Control} */ (root);
  c.focusEl = control;
  c.getValue = get;
  c.setValue = set;
  c.setInvalid = (on) => {
    root.classList.toggle('is-invalid', !!on);
    if (on) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
  };
  c.setDisabled = (on) => { control.disabled = !!on; root.classList.toggle('is-disabled', !!on); };
}
/** @param {EventTarget} el @param {string} type */
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

/* ============================== field() ============================== */
/**
 * Shell around a control: label, help text, error text, validation.
 * field({ label, help?, error?, required?, rules? }, control) → element with .focusEl, .getValue(), .setValue(), .setError(text|null), .validate() → boolean
 * Validation (rules: { required, min, max, minLength, maxLength, pattern, number, validate }) runs when the value is committed
 * (change) and re-runs on every input while an error is shown. A control's own rules (numberField min/max) are included.
 * The label is bound to the control (clicking it focuses the control); help and error through aria-describedby.
 * @param {FieldOptions | undefined} o
 * @param {HTMLElement & Partial<Control>} control
 * @returns {FieldElement}
 */
export function field({ label, help, error, required, rules, className } = {}, control) {
  const id = nextId('field');
  const ctl = control.focusEl || control;
  if (!ctl.id) ctl.id = `${id}-c`;
  const all = () => ({ ...(control.rules || {}), ...(rules || {}), required: !!(required || rules?.required) });
  const labelEl = label ? h('label', { class: 'tn-field-label', for: ctl.id }, h('span', null, label), required && h('span', { class: 'tn-field-req', 'aria-hidden': 'true' }, '*')) : null;
  const helpEl = h('div', { class: 'tn-field-help', id: `${id}-h` });
  const errEl = h('div', { class: 'tn-field-error', id: `${id}-e`, 'aria-live': 'polite' });
  const el = h('div', { class: cls('tn-field', className) }, labelEl, control, helpEl, errEl);
  const describe = () => {
    const ids = [!helpEl.hidden && helpEl.id, !errEl.hidden && errEl.id].filter(Boolean).join(' ');
    if (ids) ctl.setAttribute('aria-describedby', ids); else ctl.removeAttribute('aria-describedby');
  };
  /** @param {string | null} [text] */
  function setHelp(text) { helpEl.textContent = text || ''; helpEl.hidden = !text; describe(); }
  /** @param {string | null} [text] */
  function setError(text) {
    errEl.replaceChildren(...(text ? [icon('alert', { size: 12 }), h('span', null, text)] : []));
    errEl.hidden = !text;
    control.setInvalid?.(!!text);
    describe();
  }
  const validate = () => {
    const msg = validationText(validateValue(control.getValue?.(), all()));
    setError(msg);
    return !msg;
  };
  if (required) ctl.setAttribute('aria-required', 'true');
  control.addEventListener('change', validate);
  control.addEventListener('input', () => { if (!errEl.hidden) validate(); });
  setHelp(help); setError(error);
  return Object.assign(el, { focusEl: ctl, input: control, setError, setHelp, validate, getValue: () => control.getValue?.(), setValue: (v) => control.setValue?.(v) });
}

/* ============================== text, number ============================== */
/**
 * Text input. textField({ value, type: 'text'|'search'|'url'|'email'|'password'|'tel', rows?: n (multi-line), placeholder, name, label (aria),
 *   disabled, invalid, maxlength, autocomplete, inputmode, mono, prefix?, suffix?, onInput(value), onChange(value) })
 * prefix/suffix: short text in the box (unit, “https://”).
 * @param {TextFieldOptions} [o]
 * @returns {Control}
 */
export function textField({ value = '', type = 'text', rows, placeholder, name, label, disabled, invalid, maxlength, autocomplete = 'off', inputmode, mono, prefix, suffix, onInput, onChange, className } = {}) {
  const attrs = {
    class: cls('tn-input-el', mono && 'tn-mono'), name, placeholder, maxlength, autocomplete, inputmode, 'aria-label': label || null, spellcheck: 'false',
    oninput: () => onInput?.(input.value), onchange: () => onChange?.(input.value),
  };
  const input = rows ? h('textarea', { ...attrs, rows }) : h('input', { ...attrs, type });
  input.value = value ?? '';
  const root = h('div', { class: cls('tn-inputbox', rows && 'is-multiline', className) },
    prefix && h('span', { class: 'tn-input-affix' }, prefix), input, suffix && h('span', { class: 'tn-input-affix' }, suffix));
  wire(root, input, { get: () => input.value, set: (v) => { input.value = v ?? ''; } });
  root.setDisabled(!!disabled);
  root.setInvalid(!!invalid);
  return root;
}

/**
 * Number input (native, numeric keyboard on the phone). numberField({ value, unit?, min?, max?, step = 1, placeholder, label, disabled, invalid, onInput(n), onChange(n) })
 * getValue() → number | null (empty) | NaN (not a number). min/max are validated by field() (rules) – the browser does not stop typing.
 * @param {NumberFieldOptions} [o]
 * @returns {Control}
 */
export function numberField({ value, unit, min, max, step = 1, placeholder, name, label, disabled, invalid, onInput, onChange, className } = {}) {
  const val = () => (input.validity.badInput ? NaN : parseNumber(input.value));
  const input = h('input', {
    class: 'tn-input-el tn-num', type: 'number', inputmode: 'decimal', name, placeholder, min, max, step, 'aria-label': label || null, autocomplete: 'off',
    oninput: () => onInput?.(val()), onchange: () => onChange?.(val()),
  });
  if (value != null) input.value = String(value);
  const root = h('div', { class: cls('tn-inputbox', className) }, input, unit && h('span', { class: 'tn-input-affix' }, unit));
  wire(root, input, { get: val, set: (v) => { input.value = v == null ? '' : String(roundTo(Number(v), step)); } });
  root.rules = { number: true, min, max };
  root.setDisabled(!!disabled);
  root.setInvalid(!!invalid);
  return root;
}

/* ============================== select ============================== */
/**
 * Native selection for a few options (≤ ~8; more → combobox). select({ options: [{ value, label, disabled? }], value, placeholder?, label, disabled, invalid, onChange(value) })
 * With `placeholder` the first entry is an empty choice (getValue() → null).
 * @param {SelectOptions} [o]
 * @returns {Control}
 */
export function select({ options = [], value, placeholder, name, label, disabled, invalid, onChange, className } = {}) {
  const sel = h('select', { class: 'tn-select-el', name, 'aria-label': label || null, onchange: () => { onChange?.(get()); } },
    placeholder != null && h('option', { value: '' }, placeholder),
    options.map((o, i) => h('option', { value: String(i), disabled: o.disabled || null }, o.label)));
  const idx = (v) => options.findIndex((o) => o.value === v);
  const get = () => (sel.value === '' ? null : options[Number(sel.value)]?.value ?? null);
  const set = (v) => { const i = idx(v); sel.value = i < 0 ? '' : String(i); };
  set(value);
  const root = h('div', { class: cls('tn-inputbox tn-selectbox', className) }, sel, icon('chevron-down'));
  wire(root, sel, { get, set });
  root.setDisabled(!!disabled);
  root.setInvalid(!!invalid);
  return root;
}

/* ============================== checkbox, toggle ============================== */
/**
 * @param {'check' | 'toggle'} kind
 * @param {TickOptions} o
 * @returns {Control}
 */
function tick(kind, { checked, indeterminate, label, help, disabled, name, onChange, className }) {
  const input = h('input', { class: 'tn-tick-input', type: 'checkbox', role: kind === 'toggle' ? 'switch' : null, name, onchange: () => { input.indeterminate = false; root.classList.remove('is-mixed'); onChange?.(input.checked); } });
  input.checked = !!checked;
  const mark = kind === 'toggle' ? h('span', { class: 'tn-toggle-track', 'aria-hidden': 'true' }, h('span', { class: 'tn-toggle-thumb' }))
    : h('span', { class: 'tn-check-box', 'aria-hidden': 'true' }, icon('check', { size: 12 }), icon('minus', { size: 12 }));
  const root = h('label', { class: cls('tn-tick', `tn-${kind}`, className) }, input, mark,
    h('span', { class: 'tn-tick-text' }, h('span', { class: 'tn-tick-label' }, label), help && h('span', { class: 'tn-tick-help' }, help)));
  if (indeterminate) { input.indeterminate = true; root.classList.add('is-mixed'); }
  wire(root, input, { get: () => input.checked, set: (v) => { input.checked = !!v; input.indeterminate = false; root.classList.remove('is-mixed'); } });
  root.setDisabled(!!disabled);
  return root;
}
/**
 * Checkbox with its own label. checkbox({ checked, indeterminate?, label, help?, disabled, onChange(checked) }) → getValue() boolean
 * @param {TickOptions} [o]
 */
export const checkbox = (o = {}) => tick('check', o);
/**
 * Switch (on/off takes effect at once, e.g. a setting). toggle({ checked, label, help?, disabled, onChange(checked) }) → getValue() boolean
 * @param {TickOptions} [o]
 */
export const toggle = (o = {}) => tick('toggle', o);

/* ============================== date ============================== */
/**
 * Date (native picker). dateField({ value: 'YYYY-MM-DD', min, max, time?: true (date and time, value 'YYYY-MM-DDTHH:MM'), label, disabled, invalid, onChange(value) })
 * getValue() → string | null. The value is a calendar day without a time zone; dateRange() and the time filter convert with dayStart().
 * @param {DateFieldOptions} [o]
 * @returns {Control}
 */
export function dateField({ value, min, max, time, name, label, disabled, invalid, onChange, className } = {}) {
  const input = h('input', { class: 'tn-input-el tn-num', type: time ? 'datetime-local' : 'date', name, min, max, 'aria-label': label || null, onchange: () => onChange?.(input.value || null) });
  input.value = value || '';
  const root = h('div', { class: cls('tn-inputbox tn-datebox', className) }, input);
  wire(root, input, { get: () => input.value || null, set: (v) => { input.value = v || ''; } });
  root.setDisabled(!!disabled);
  root.setInvalid(!!invalid);
  return root;
}

/**
 * Date range with presets. dateRange({ from, to, presets = ['today', '7d', '30d', 'month'], min, max, onChange({ from, to }), now? })
 * Two native date fields, below them the presets as pills (the one that matches the range is on). “From” after “to” shows an error and does not fire onChange.
 * getValue() → { from, to } (strings or null).
 * @param {DateRangeOptions} [o]
 * @returns {Control}
 */
export function dateRange({ from = null, to = null, presets = ['today', '7d', '30d', 'month'], min, max, onChange, now = Date.now, className } = {}) {
  /** @type {DayRange} */
  let cur = { from, to };
  const inv = () => !!(cur.from && cur.to && cur.from > cur.to);
  const a = dateField({ value: from, min, max, label: t('range.from'), onChange: (v) => commit({ from: v, to: cur.to }) });
  const b = dateField({ value: to, min, max, label: t('range.to'), onChange: (v) => commit({ from: cur.from, to: v }) });
  const err = h('div', { class: 'tn-field-error', 'aria-live': 'polite', hidden: true });
  const pills = presets.map((id) => h('button', { class: 'tn-pill', type: 'button', 'aria-pressed': 'false', 'data-preset': id, onclick: () => { const r = rangeFromPreset(id, now(), getTimeZone()); if (!r) return; a.setValue(r.from); b.setValue(r.to); commit(r); } }, t(`range.${id}`)));
  const root = h('div', { class: cls('tn-daterange', className), role: 'group' },
    h('div', { class: 'tn-daterange-row' },
      h('label', { class: 'tn-daterange-col' }, h('span', { class: 'tn-field-label' }, t('range.from')), a),
      h('label', { class: 'tn-daterange-col' }, h('span', { class: 'tn-field-label' }, t('range.to')), b)),
    presets.length > 0 && h('div', { class: 'tn-pills' }, pills), err);
  function sync() {
    const bad = inv();
    a.setInvalid(bad); b.setInvalid(bad);
    err.replaceChildren(...(bad ? [icon('alert', { size: 12 }), h('span', null, t('range.invalid'))] : []));
    err.hidden = !bad;
    const on = bad ? null : presetOf(cur, now(), getTimeZone(), presets);
    pills.forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.preset === on)));
    pills.forEach((p) => p.classList.toggle('is-on', p.dataset.preset === on));
  }
  /** @param {{ from?: string | null, to?: string | null }} next */
  function commit(next) { cur = { from: next.from || null, to: next.to || null }; sync(); if (!inv()) { onChange?.({ ...cur }); fire(root, 'change'); } }
  sync();
  wire(root, a.focusEl, { get: () => ({ ...cur }), set: (v) => { cur = { from: v?.from || null, to: v?.to || null }; a.setValue(cur.from); b.setValue(cur.to); sync(); } });
  return root;
}

/* ============================== combobox ============================== */
const MAX_RENDER = 100;    // rendered options at most (a note shows how many more match)
/**
 * Selection from many options with search, single or multiple choice.
 * combobox({ options: [{ value, label, hint?, disabled? }], value (single) | value: [] (multiple: true), multiple, placeholder, searchPlaceholder, search (default: from 7 options),
 *   label (aria), disabled, invalid, onChange(value) })
 * The button shows the choice; click/Enter/Space/ArrowDown opens the popover (visible in the first frame, in the overlay layer, so also over a sheet), focus in the search field
 * (on touch devices not, so that the keyboard does not cover the list). ArrowUp/Down select, Enter chooses, Esc closes the popover first, Tab closes. Single: choosing closes. Multiple: stays open,
 * checkmarks. getValue() → value | null (single) · array (multiple).
 * @param {ComboboxOptions} [o]
 * @returns {Control & { open: () => void, close: () => void }}
 */
export function combobox({ options = [], value, multiple, placeholder, searchPlaceholder, search, name, label, disabled, invalid, onChange, className } = {}) {
  const pid = nextId('combo');
  /** @type {any} */
  let sel = multiple ? new Set(Array.isArray(value) ? value : value != null ? [value] : []) : (value ?? null);
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? String(v);
  const face = h('span', { class: 'tn-combo-face tn-ellipsis' });
  const btn = h('button', {
    class: 'tn-combo-btn', type: 'button', name, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': pid, 'aria-label': label || null,
    onclick: () => (pop ? close(true) : open()),
    onkeydown: (e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !pop) { e.preventDefault(); open(); } },
  }, face, icon('chevron-down'));
  const root = h('div', { class: cls('tn-inputbox tn-combobox', className) }, btn);
  const has = () => (multiple ? sel.size > 0 : sel != null);
  function paint() {
    let text;
    if (!has()) text = placeholder ?? t('input.select');
    else if (!multiple) text = labelOf(sel);
    else text = sel.size <= 2 ? [...sel].map(labelOf).join(', ') : t('input.selected', { count: sel.size });
    face.textContent = text;
    face.classList.toggle('is-placeholder', !has());
  }
  const get = () => (multiple ? options.filter((o) => sel.has(o.value)).map((o) => o.value) : sel);
  wire(root, btn, { get, set: (v) => { sel = multiple ? new Set(v || []) : (v ?? null); paint(); if (pop) renderList(); } });
  root.setDisabled(!!disabled);
  root.setInvalid(!!invalid);
  paint();

  /** @type {HTMLElement | null} */ let pop = null;
  /** @type {HTMLElement | null} */ let list = null;
  /** @type {HTMLInputElement | null} */ let input = null;
  /** @type {Option[]} */ let shown = [];
  let active = -1, width0 = 0, q = '';
  const withSearch = search ?? options.length > 6;
  function renderList() {
    if (!list) return;
    shown = filterOptions(options, q);
    const more = Math.max(0, shown.length - MAX_RENDER);
    const rows = shown.slice(0, MAX_RENDER);
    list.replaceChildren(...rows.map((o, i) => {
      const on = multiple ? sel.has(o.value) : sel === o.value;
      return h('div', {
        class: cls('tn-combo-opt', on && 'is-on', o.disabled && 'is-disabled'), role: 'option', id: `${pid}-o${i}`, 'aria-selected': String(on), 'aria-disabled': o.disabled ? 'true' : null,
        onclick: () => choose(i), onpointermove: () => setActive(i, false),
      }, h('span', { class: 'tn-combo-tick', 'aria-hidden': 'true' }, on && icon('check', { size: 14 })),
      h('span', { class: 'tn-combo-opt-label tn-ellipsis' }, o.label), o.hint && h('span', { class: 'tn-combo-opt-hint tn-ellipsis' }, o.hint));
    }));
    if (!shown.length) list.append(h('div', { class: 'tn-combo-empty' }, t('input.noMatches')));
    if (more) list.append(h('div', { class: 'tn-combo-more' }, t('input.moreResults', { count: more })));
    active = shown.length ? Math.max(0, Math.min(active, rows.length - 1)) : -1;
    if (active < 0 && rows.length) active = Math.max(0, rows.findIndex((o) => (multiple ? sel.has(o.value) : sel === o.value)));
    setActive(active, true);
  }
  function setActive(i, scroll) {
    active = i;
    if (!list) return;
    const items = list.querySelectorAll('.tn-combo-opt');
    items.forEach((el, k) => el.classList.toggle('is-active', k === i));
    const cur = items[i];
    (input || /** @type {HTMLElement} */ (list)).setAttribute('aria-activedescendant', cur ? cur.id : '');
    if (cur && scroll) cur.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const o = shown[i];
    if (!o || o.disabled) return;
    if (multiple) { if (sel.has(o.value)) sel.delete(o.value); else sel.add(o.value); paint(); renderList(); changed(); }
    else { sel = o.value; paint(); changed(); close(true); }
  }
  function changed() { onChange?.(get()); fire(root, 'input'); fire(root, 'change'); }
  const outside = (e) => { if (pop && !pop.contains(e.target) && !root.contains(e.target)) close(false); };
  const esc = (e) => { if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); close(true); } };
  const onResize = () => { if (Math.abs(document.documentElement.clientWidth - width0) >= 1) close(false); };
  function close(refocus) {
    if (!pop) return;
    removeOverlay(pop); pop = null; list = null; input = null; q = '';
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    window.removeEventListener('resize', onResize);
    if (refocus && btn.isConnected) btn.focus({ preventScroll: true });
  }
  function key(e) {
    if (imeComposing(e)) return;   // the input method owns Enter and the arrows while it composes a character
    const last = Math.min(shown.length, MAX_RENDER) - 1;
    const d = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key];
    if (d) { e.preventDefault(); if (last >= 0) setActive(Math.max(0, Math.min(last, active + d)), true); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); }
    else if (e.key === 'Tab') close(false);
    else if (!input && (e.key === 'Home' || e.key === 'End') && last >= 0) { e.preventDefault(); setActive(e.key === 'Home' ? 0 : last, true); }
    else if (!input && e.key === ' ') { e.preventDefault(); if (active >= 0) choose(active); }
  }
  function open() {
    if (root.classList.contains('is-disabled')) return;
    hideTooltip();
    q = '';
    list = h('div', { class: 'tn-combo-list', role: 'listbox', id: pid, 'aria-multiselectable': multiple ? 'true' : null, 'aria-label': label || null, tabindex: withSearch ? null : '0' });
    input = withSearch ? h('input', {
      class: 'tn-combo-q', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': pid, 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'enter',
      placeholder: searchPlaceholder ?? t('input.search'), 'aria-label': searchPlaceholder ?? t('input.search'), oninput: () => { q = input?.value ?? ''; active = 0; renderList(); },
    }) : null;
    pop = h('div', { class: 'tn-combo-pop', onkeydown: key },
      input && h('label', { class: 'tn-combo-search' }, icon('search'), input), list,
      multiple && h('div', { class: 'tn-combo-foot' },
        h('button', { class: 'tn-btn tn-btn-ghost tn-btn-sm', type: 'button', onclick: () => { sel.clear(); paint(); renderList(); changed(); } }, t('common.reset')),
        h('button', { class: 'tn-btn tn-btn-default tn-btn-sm', type: 'button', onclick: () => close(true) }, t('common.done'))));
    showOverlay(pop);
    renderList();
    const r = btn.getBoundingClientRect();
    pop.style.setProperty('min-width', `${Math.round(r.width)}px`);
    placeOverlay(pop, r);
    btn.setAttribute('aria-expanded', 'true');
    width0 = document.documentElement.clientWidth;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', onResize);
    if (input && !coarse()) input.focus({ preventScroll: true });
    else if (!input) list.focus({ preventScroll: true });
  }
  return Object.assign(/** @type {Control} */ (root), { open, close: () => close(false) });
}
