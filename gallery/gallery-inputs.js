// tarn · gallery: input primitives (inputs.js) in all states.
import {
  h, card, section, openSheet, field, textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange, button, toast, t, getTimeZone, rangeFromPreset,
} from '../js/tarn.js';

const code = (txt) => h('pre', { class: 'g-code' }, txt.trim());
const demo = (title, usage, ...stage) => card({ title }, h('div', { class: 'g-demo' }, stage, usage && code(usage)));
const col = (...k) => h('div', { class: 'g-stage-col' }, k);

export const HOSTS = ['atlas', 'bastion', 'cedar', 'delta', 'ember', 'falcon', 'garnet', 'harbor', 'iris', 'juno', 'kestrel', 'lumen', 'mistral', 'nimbus', 'onyx', 'pylon']
  .map((n) => ({ value: n, label: n, hint: n < 'g' ? 'rack A' : 'rack B' }));
const MODES = [{ value: 'rolling', label: 'Rolling' }, { value: 'blue-green', label: 'Blue/green' }, { value: 'canary', label: 'Canary' }];

export function viewInputs() {
  const out = h('span', { class: 'g-state-l' }, 'Value: –');
  const show = (v) => { out.textContent = `Value: ${JSON.stringify(v)}`; };
  const rng = dateRange({ from: rangeFromPreset('7d', Date.now(), getTimeZone()).from, to: rangeFromPreset('7d', Date.now(), getTimeZone()).to, onChange: show });
  return [
    h('p', { class: 'g-intro' }, 'Inputs share one contract: el.focusEl (focusable), getValue(), setValue(v), setInvalid(), setDisabled(). Wrap them in field() for label, help and error text. 44 px touch targets on the phone, native pickers for number and date, an own popover only for the combobox.'),
    h('div', { class: 'g-grid2' },
      demo('textField()', `textField({ value, placeholder, type, prefix?, suffix?, rows?, onInput, onChange })\nfield({ label, help, error, required, rules }, control)   // validates on change`,
        col(
          field({ label: 'Name', help: 'Shown in the job list.' }, textField({ value: 'offsite-sync', placeholder: 'Job name' })),
          field({ label: 'Address', required: true }, textField({ value: 'not a url', prefix: 'https://', invalid: true })),
          field({ label: 'Address', error: 'Enter a host name.', required: true }, textField({ value: '', invalid: true })),
          field({ label: 'Disabled' }, textField({ value: 'Read only value', disabled: true })),
          field({ label: 'Notes' }, textField({ rows: 3, placeholder: 'Optional notes' })))),
      demo('numberField()', `numberField({ value, unit: 'min', min: 1, max: 120, step: 1, onChange })\nfield({ label, required }, numberField({ … }))   // min/max validated on change\nel.getValue() → number | null | NaN`,
        col(
          field({ label: 'Timeout', help: 'Between 1 and 120.' }, numberField({ value: 30, unit: 'min', min: 1, max: 120 })),
          field({ label: 'Threshold', required: true, error: 'At most 100' }, numberField({ value: 500, unit: 'GB', min: 1, max: 100, invalid: true })),
          field({ label: 'Ratio' }, numberField({ value: 0.5, step: 0.1, min: 0, max: 1 })),
          field({ label: 'Disabled' }, numberField({ value: 8, unit: 'GB', disabled: true }))))),
    h('div', { class: 'g-grid2' },
      demo('select()', `select({ options: [{ value, label }], value, placeholder, onChange })   // native, for up to ~8 options`,
        col(
          field({ label: 'Strategy' }, select({ options: MODES, value: 'rolling' })),
          field({ label: 'Strategy', error: 'Choose a strategy.', required: true }, select({ options: MODES, placeholder: 'Choose …', invalid: true })),
          field({ label: 'Disabled' }, select({ options: MODES, value: 'canary', disabled: true })))),
      demo('combobox()', `combobox({ options: [{ value, label, hint? }], value, placeholder, onChange })              // single choice, search from 7 options\ncombobox({ options, multiple: true, value: [] })   // checkmarks, stays open\n// ↑ ↓ choose · Enter selects · Esc closes the popover first · lists > 100 show the first 100 matches`,
        col(
          field({ label: 'Target host' }, combobox({ options: HOSTS, value: 'delta', onChange: show })),
          field({ label: 'Hosts' }, combobox({ options: HOSTS, multiple: true, value: ['atlas', 'cedar', 'harbor'], onChange: show })),
          field({ label: 'Empty' }, combobox({ options: HOSTS, multiple: true, placeholder: 'Any host' })),
          field({ label: 'Disabled' }, combobox({ options: HOSTS, value: 'iris', disabled: true })),
          out))),
    h('div', { class: 'g-grid2' },
      demo('checkbox() and toggle()', `checkbox({ label, help?, checked, indeterminate?, onChange(checked) })\ntoggle({ label, checked, onChange })   // the setting takes effect at once`,
        col(
          checkbox({ label: 'Dry run', help: 'Simulate the deployment, change nothing.', checked: true }),
          checkbox({ label: 'Notify me' }),
          checkbox({ label: 'Some hosts', indeterminate: true }),
          checkbox({ label: 'Disabled', checked: true, disabled: true }),
          toggle({ label: 'Maintenance mode', checked: true, onChange: (v) => toast(v ? 'Maintenance mode on' : 'Maintenance mode off', { tone: 'info' }) }),
          toggle({ label: 'Alerts', help: 'Send a message on failure.' }),
          toggle({ label: 'Disabled', disabled: true }))),
      demo('dateField() and dateRange()', `dateField({ value: '2026-11-10', min, max, time?, onChange })   // native picker\ndateRange({ from, to, presets: ['today', '7d', '30d', 'month'], onChange({ from, to }) })`,
        col(
          field({ label: 'Start date' }, dateField({ value: '2026-11-10' })),
          field({ label: 'Start', help: 'Date and time.' }, dateField({ value: '2026-11-10T06:30', time: true })),
          field({ label: 'Period' }, rng),
          field({ label: 'Invalid range' }, dateRange({ from: '2026-11-10', to: '2026-11-01', presets: [] }))))),
    section('In a sheet', {}, h('div', { class: 'g-stack' },
      h('p', { class: 'g-intro' }, 'The combobox popover lives in the overlay layer: it also works inside a sheet or panel (it sits above and is not inert).'),
      h('div', null, button('Open sheet with inputs', { onClick: () => openSheet({
        title: 'Edit job', sub: 'offsite-sync',
        body: h('div', { class: 'g-stack' },
          field({ label: 'Target host' }, combobox({ options: HOSTS, value: 'delta' })),
          field({ label: 'Hosts' }, combobox({ options: HOSTS, multiple: true, value: ['atlas'] })),
          field({ label: 'Timeout' }, numberField({ value: 30, unit: 'min', min: 1, max: 120 })),
          toggle({ label: 'Enabled', checked: true })),
        footer: [button(t('common.done'), { variant: 'primary' })],
      }) })))),
  ];
}
