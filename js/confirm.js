// @ts-check
// tarn · confirm(): confirmation of dangerous actions (a small modal dialog; shell, uses the scroll lock of the sheet layer).
import './locales/shell.js';   // shell texts
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { button } from './primitives.js';
import { lockScroll } from './sheet.js';
import { field, textField } from './inputs.js';
import { confirmMatches } from './actions-data.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {{ title: string, text?: Child, confirmLabel?: string, cancelLabel?: string, danger?: boolean, typeToConfirm?: string }} ConfirmOptions */

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
    const d = h('dialog', { class: cls('tn-confirm', danger && 'is-danger'), role: danger ? 'alertdialog' : 'dialog', 'aria-labelledby': `${id}-t`, 'aria-describedby': text ? `${id}-d` : null },
      h('h2', { class: 'tn-confirm-title', id: `${id}-t` }, danger && icon('alert', { size: 16 }), h('span', null, title)),
      text && h('div', { class: 'tn-confirm-text', id: `${id}-d` }, text),
      typed && field({ label: t('confirm.type', { text: String(typeToConfirm) }) }, typed),
      h('div', { class: 'tn-confirm-actions' }, no, ok));
    typed?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!ok.disabled) done(true); } });
    d.addEventListener('click', (e) => { if (e.target === d) done(false); });
    d.addEventListener('close', () => { lockScroll(false); d.remove(); resolve(answer); });
    document.body.append(d);
    d.showModal();
    lockScroll(true);
    (typed ? typed.focusEl : danger ? no : ok).focus({ preventScroll: true });
  });
}
