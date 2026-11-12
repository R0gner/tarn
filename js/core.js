// @ts-check
// tarn · Core entry point: everything a plain website needs, without the ops shell (no createApp, router, boards, charts, tables).
//   import { button, field, textField, form, t, icon } from '/tarn/js/core.js';
// Load css/tokens.css, fonts.css, base.css and core.css with it. The barrel tarn.js re-exports this file plus the shell.
import './press.js';
export { VERSION } from './version.js';
export { h, s, cls, mount, $, $$, tokenMs } from './dom.js';
export { icon, ICON_NAMES } from './icons.js';
export { favicon } from './favicon.js';
export { DENSITIES, getDensity, setDensity } from './density.js';
export { t, setLocale, getLocale, setTimeZone, getTimeZone, addMessages, resolveLocale, KIT_LOCALES, LOCALE_NAMES } from './i18n.js';
export * from './format.js';
export * from './primitives.js';
export { segmented, tabs, progress, tooltip, hideTooltip } from './controls.js';
export { field, textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange } from './inputs.js';
export { parseNumber, validateValue, filterOptions, rangeFromPreset, dayStart, isoDay, addDays } from './inputs-data.js';
export { form } from './form.js';
