// tarn · starter page: a plain website built only from the core (js/core.js). No sidebar, no shell, no createApp, no board.
// Copy it as the start of a page that needs tokens, fonts, buttons, inputs and a form. All texts go through t() (messages.js).
import {
  h, mount, t, setLocale, addMessages, resolveLocale, LOCALE_NAMES, VERSION,
  button, iconButton, badge, statusDot, segmented, textField, form,
} from '../js/core.js';
import messages from './messages.js';

addMessages(messages);
const OFFERED = ['en', 'de'];
const query = new URLSearchParams(location.search).get('lang');   // preview aid: ?lang=de
setLocale(resolveLocale({ locale: query, locales: OFFERED, languages: navigator.languages }).locale);

const LANGS = OFFERED.map((l) => ({ value: l, label: LOCALE_NAMES[l] }));

function render() {
  document.title = t('starter.title');
  const lang = document.documentElement.lang.slice(0, 2);
  const statusText = h('span', null, t('starter.status.ok'));
  const dot = h('span', null, statusDot('ok'));
  const contact = form({
    fields: [
      { name: 'name', label: t('starter.form.name'), required: true, control: textField({ autocomplete: 'name' }) },
      { name: 'email', type: 'email', label: t('starter.form.email'), help: t('starter.form.emailHelp'), required: true, rules: { pattern: /^\S+@\S+\.\S+$/ } },
      { name: 'topic', type: 'select', label: t('starter.form.topic'), value: 'question', options: ['question', 'bug', 'feedback'].map((k) => ({ value: k, label: t(`starter.form.topic.${k}`) })) },
      { name: 'message', type: 'textarea', label: t('starter.form.message'), required: true, rules: { minLength: 10 } },
      { name: 'copy', type: 'checkbox', label: t('starter.form.copy') },
    ],
    submitLabel: t('starter.form.send'),
    onSubmit: async () => { statusText.textContent = t('starter.status.sent'); },
  });
  const discard = button(t('starter.btn.danger'), { variant: 'danger', onClick: () => { render(); } });
  mount(document.body,
    h('header', { class: 'st-header' },
      h('span', { class: 'st-brand' }, t('starter.brand')),
      h('span', { class: 'st-spacer' }),
      segmented({ options: LANGS, value: lang, label: t('starter.lang'), small: true, onChange: (l) => { setLocale(l); render(); } })),
    h('main', { class: 'st-main' },
      h('div', { class: 'st-intro' },
        h('h1', { class: 'st-title' }, t('starter.h1')),
        h('p', { class: 'st-lede' }, t('starter.lede')),
        h('p', { class: 'st-status', role: 'status' }, dot, statusText, badge(t('starter.badge'), { tone: 'info' }))),
      h('div', { class: 'st-buttons' },
        button(t('starter.btn.primary'), { variant: 'primary', icon: 'rocket' }),
        button(t('starter.btn.default')),
        button(t('starter.btn.ghost'), { variant: 'ghost' }),
        iconButton('info', { label: t('starter.btn.help') })),
      h('section', { class: 'st-panel', 'aria-labelledby': 'st-contact' },
        h('h2', { class: 'st-panel-title', id: 'st-contact' }, t('starter.form.title')),
        contact,
        h('div', { class: 'st-buttons' }, discard))),
    h('footer', { class: 'st-footer' }, t('starter.footer', { version: VERSION })));
  applyHash(contact);
}

/** Preview aid for verify: #/errors submits the empty form so that the validation state can be checked. */
function applyHash(contact) {
  if (location.hash === '#/errors') contact.submit(); else { contact.setErrors({}); contact.setError(null); }
}
window.addEventListener('hashchange', () => { const f = document.querySelector('form.tn-form'); if (f) applyHash(f); });

render();
