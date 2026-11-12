// @ts-check
// dashkit · form() and confirm(): forms with validation and a submit state, and confirmation of dangerous actions.
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { button } from './components.js';
import { lockScroll } from './sheet.js';
import { field, textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange } from './inputs.js';
import { validateFields, confirmMatches } from './actions-data.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./inputs.js').Control} Control */
/** @typedef {import('./inputs.js').FieldElement} FieldElement */
/** @typedef {import('./inputs.js').ValidationRules} ValidationRules */
/**
 * @typedef {{
 *   name: string,
 *   type?: 'text' | 'url' | 'email' | 'password' | 'tel' | 'search' | 'textarea' | 'number' | 'select' | 'combobox' | 'checkbox' | 'toggle' | 'date' | 'datetime' | 'dateRange',
 *   label?: string, help?: string, required?: boolean, rules?: ValidationRules, value?: any, className?: string,
 *   control?: Control,
 * } & Record<string, any>} FormField One field. Further keys go to the input primitive of the type (options, unit, min, max, placeholder, …); `control` takes a ready-made input instead.
 */
/** @typedef {{ errors?: Record<string, string>, error?: string }} FormFailure What onSubmit may return to report server-side problems. */
/** @typedef {{ fields?: FormField[], value?: Record<string, any>, submitLabel?: string, runningLabel?: string, cancelLabel?: string, danger?: boolean, onSubmit?: (values: Record<string, any>) => any, onSuccess?: (result: any) => void, onCancel?: () => void, actions?: boolean, className?: string }} FormOptions */
/** @typedef {HTMLFormElement & { values: () => Record<string, any>, setErrors: (map?: Record<string, string>) => FieldElement | null, setError: (text?: string | null) => void, submit: () => Promise<void>, readonly busy: boolean, buttons: () => HTMLElement[], fields: Record<string, FieldElement> }} FormElement */
/** @typedef {{ title: string, text?: Child, confirmLabel?: string, cancelLabel?: string, danger?: boolean, typeToConfirm?: string }} ConfirmOptions */

const META = new Set(['name', 'type', 'label', 'help', 'required', 'rules', 'value', 'control', 'className']);
/**
 * @param {Record<string, any>} spec
 */
const own = (spec) => Object.fromEntries(Object.entries(spec).filter(([k]) => !META.has(k)));

/**
 * Control of a field definition (type → input primitive).
 * @param {FormField} spec
 * @param {any} initial
 * @returns {Control}
 */
function controlOf(spec, initial) {
  if (spec.control) return spec.control;
  const o = own(spec);
  const v = initial;
  switch (spec.type || 'text') {
    case 'textarea': return textField({ rows: 3, ...o, value: v ?? '' });
    case 'number': return numberField({ ...o, value: v });
    case 'select': return select({ ...o, value: v });
    case 'combobox': return combobox({ ...o, value: v });
    case 'checkbox': return checkbox({ ...o, label: spec.label, help: spec.help, checked: !!v });
    case 'toggle': return toggle({ ...o, label: spec.label, help: spec.help, checked: !!v });
    case 'date': return dateField({ ...o, value: v });
    case 'datetime': return dateField({ ...o, time: true, value: v });
    case 'dateRange': return dateRange({ ...o, ...(v || {}) });
    default: return textField({ ...o, type: /** @type {'text'} */ (spec.type || 'text'), value: v ?? '' });
  }
}

/**
 * Form with validation and a submit state.
 * form({
 *   fields: [{ name, type?: 'text'|'url'|'email'|'password'|'textarea'|'number'|'select'|'combobox'|'checkbox'|'toggle'|'date'|'datetime'|'dateRange', label, help?, required?, rules?, value?,
 *             …options of the input (options, unit, min, max, …) } | { name, label, control: <element of an input primitive> }],
 *   value?: { name: initial value }, submitLabel?, runningLabel?, cancelLabel?, danger?,
 *   onSubmit(values) → Promise | any: may return { errors: { name: text }, error: text } to report server-side failures; a thrown error shows its message,
 *   onSuccess?(result), onCancel?: shows a cancel button, actions?: false (no buttons inside: put el.buttons() into a sheet footer)
 * }) → <form> with .values(), .setErrors({ name: text }), .setError(text), .submit(), .busy, .buttons() → [cancel?, submit], .fields (name → field element)
 *
 * Submit: all fields are validated first (errors on the fields, focus on the first one); then the button shows “Running …”, the fields are
 * locked and a second submit (click, Enter, double tap) is ignored until onSubmit has finished. The form keeps its values after a failure.
 * @param {FormOptions} [o]
 * @returns {FormElement}
 */
export function form({ fields = [], value = {}, submitLabel, runningLabel, cancelLabel, danger, onSubmit, onSuccess, onCancel, actions = true, className } = {}) {
  const id = nextId('form');
  /** @type {Map<string, FieldElement>} */
  const wrapped = new Map();
  /** @type {Map<string, FormField>} */
  const specs = new Map();
  const rows = fields.map((spec) => {
    const ctl = controlOf(spec, spec.value ?? value[spec.name]);
    specs.set(spec.name, spec);
    const standalone = ctl.classList?.contains('dk-tick');     // checkbox/toggle carry their own label
    const f = field({ label: standalone ? undefined : spec.label, help: standalone ? undefined : spec.help, required: spec.required, rules: spec.rules, className: spec.className }, ctl);
    if (standalone && spec.required) ctl.focusEl.setAttribute('aria-required', 'true');
    wrapped.set(spec.name, f);
    return f;
  });
  const formErr = h('div', { class: 'dk-form-error', id: `${id}-err`, role: 'alert', hidden: true });
  const submitBtn = button(submitLabel ?? t('form.submit'), { variant: danger ? 'danger' : 'primary', type: 'submit' });
  const submitText = submitBtn.querySelector('span');
  submitBtn.setAttribute('form', id);
  const cancelBtn = onCancel ? button(cancelLabel ?? t('common.cancel'), { variant: 'ghost', onClick: () => onCancel() }) : null;
  cancelBtn?.setAttribute('form', id);
  const bar = actions ? h('div', { class: 'dk-form-actions' }, cancelBtn, submitBtn) : null;
  const el = h('form', { class: cls('dk-form', className), id, novalidate: true, 'aria-describedby': `${id}-err` }, rows, formErr, bar);

  let pending = false;
  const fieldOf = (/** @type {string} */ name) => /** @type {FieldElement} */ (wrapped.get(name));
  const values = () => Object.fromEntries(fields.map((f) => [f.name, fieldOf(f.name).getValue()]));
  /** @param {string | null} [text] */
  function setError(text) {
    formErr.replaceChildren(...(text ? [icon('alert', { size: 14 }), h('span', null, text)] : []));
    formErr.hidden = !text;
  }
  /** @param {Record<string, string>} [map] */
  function setErrors(map = {}) {
    /** @type {FieldElement | null} */
    let first = null;
    for (const [name, f] of wrapped) { f.setError(map[name] || null); if (map[name] && !first) first = f; }
    return first;
  }
  /** @type {Set<string>} */
  let lockedBefore = new Set();
  /** @param {boolean} on */
  function setBusy(on) {
    submitBtn.classList.toggle('is-busy', on);
    submitBtn.setAttribute('aria-busy', String(on));
    submitBtn.setAttribute('aria-disabled', String(on));
    const spin = icon('spinner', { size: 14 });
    spin.classList.add('dk-spin');
    submitBtn.replaceChildren(...(on ? [spin, h('span', null, runningLabel ?? t('form.running'))] : [/** @type {HTMLElement} */ (submitText)]));
    if (on) lockedBefore = new Set([...wrapped].filter(([, f]) => f.input.classList?.contains('is-disabled')).map(([n]) => n));
    for (const [name, f] of wrapped) /** @type {Control} */ (f.input).setDisabled?.(on || lockedBefore.has(name));
  }
  async function submit() {
    if (pending) return;                                         // a second submit while the first one runs is ignored
    setError(null);
    const { errors } = validateFields(fields.map((f) => ({ name: f.name, required: f.required, rules: { ...(/** @type {Control} */ (fieldOf(f.name).input).rules || {}), ...(f.rules || {}) } })), values());
    const bad = setErrors(errors);
    if (bad) { setError(t('form.fixErrors')); bad.focusEl.focus(); return; }
    pending = true; setBusy(true);
    try {
      const res = await onSubmit?.(values());
      if (res && (res.errors || res.error)) {
        const first = setErrors(res.errors || {});
        setError(res.error || (first ? t('form.fixErrors') : t('form.failed')));
        pending = false; setBusy(false);
        first?.focusEl.focus();
        return;
      }
      pending = false; setBusy(false);
      onSuccess?.(res);
    } catch (err) {
      setError(/** @type {Error} */ (err)?.message || t('form.failed'));
      pending = false; setBusy(false);
    }
  }
  el.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  el.addEventListener('input', () => { if (!formErr.hidden && !pending) setError(null); });
  const fe = Object.assign(/** @type {HTMLFormElement} */ (el), {
    values, setErrors, setError, submit, fields: Object.fromEntries(wrapped),
    buttons: () => [cancelBtn, submitBtn].filter(Boolean),
  });
  Object.defineProperty(fe, 'busy', { get: () => pending });
  return /** @type {FormElement} */ (/** @type {unknown} */ (fe)); // 'busy' is defined as a getter right above
}

/**
 * Confirm a dangerous action. confirm({ title, text, confirmLabel?, cancelLabel?, danger?, typeToConfirm?: 'text' }) → Promise<boolean>
 * A small modal dialog (centred, on top of open sheets); Esc, a tap outside and “Cancel” answer false. With `danger` the focus starts on “Cancel”;
 * with `typeToConfirm` the confirm button stays off until the text has been typed exactly (e.g. the host name).
 * @param {ConfirmOptions} o
 * @returns {Promise<boolean>}
 */
export function confirm({ title, text, confirmLabel, cancelLabel, danger, typeToConfirm }) {
  return new Promise((resolve) => {
    const id = nextId('confirm');
    let answer = false;
    /** @param {boolean} v */
    const done = (v) => { answer = v; d.close(); };
    const ok = button(confirmLabel ?? t('confirm.ok'), { variant: danger ? 'danger' : 'primary', onClick: () => { if (!ok.disabled) done(true); } });
    const no = button(cancelLabel ?? t('common.cancel'), { variant: 'default', onClick: () => done(false) });
    const typed = typeToConfirm ? textField({ mono: true, autocomplete: 'off', onInput: (v) => { ok.disabled = !confirmMatches(v, typeToConfirm); } }) : null;
    if (typed) ok.disabled = true;
    const d = h('dialog', { class: cls('dk-confirm', danger && 'is-danger'), role: danger ? 'alertdialog' : 'dialog', 'aria-labelledby': `${id}-t`, 'aria-describedby': text ? `${id}-d` : null },
      h('h2', { class: 'dk-confirm-title', id: `${id}-t` }, danger && icon('alert', { size: 16 }), h('span', null, title)),
      text && h('div', { class: 'dk-confirm-text', id: `${id}-d` }, text),
      typed && field({ label: t('confirm.type', { text: String(typeToConfirm) }) }, typed),
      h('div', { class: 'dk-confirm-actions' }, no, ok));
    typed?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!ok.disabled) done(true); } });
    d.addEventListener('click', (e) => { if (e.target === d) done(false); });
    d.addEventListener('close', () => { lockScroll(false); d.remove(); resolve(answer); });
    document.body.append(d);
    d.showModal();
    lockScroll(true);
    (typed ? typed.focusEl : danger ? no : ok).focus({ preventScroll: true });
  });
}
