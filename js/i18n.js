// @ts-check
// tarn · i18n: a small catalog layer without a library.
//
//   t(key, vars)          translated text; {name} placeholders; plural via { one, other, … } values and vars.count
//   setLocale(code)       active locale (BCP 47, e.g. 'de', 'en-GB'); setTimeZone(zone) overrides the browser time zone
//   addMessages(msgs)     board texts: { en: { 'my.key': 'Text' }, de: { … } }, same fallback rule as the kit texts
//   resolveLocale(opts)   forced locale > stored choice > navigator.languages > 'en', limited to the offered locales
//
// Lookup order for the active locale L (language part B): board[L], board[B], kit[L], kit[B], then English (board, kit).
// A missing key shows the English text (or the key itself) and is recorded in missingKeys (console warning in development;
// verify reports it). Catalogs: js/locales/en.js is the source; de, es, fr ship with the kit. Core texts in <lang>.js, shell texts in <lang>-shell.js.
import en from './locales/en.js';
import de from './locales/de.js';
import es from './locales/es.js';
import fr from './locales/fr.js';

/** @typedef {string | { one?: string, two?: string, few?: string, many?: string, other: string, zero?: string }} Message A text, or plural forms chosen by vars.count (Intl.PluralRules categories). */
/** @typedef {Record<string, Message>} Catalog Key → text of one language. */
/** @typedef {Record<string, Catalog>} Messages Language code → catalog (board texts for createApp({ messages }) and addMessages()). */
/** @typedef {{ locale?: string | null, locales?: string[], languages?: readonly string[], stored?: string | null, fallback?: string | null }} ResolveLocaleOptions */

/** Kit catalogs per language: the core part (js/locales/<lang>.js); the shell part is added by js/locales/shell.js. */
export const KIT_CATALOGS = { en, de, es, fr };
/**
 * Add more kit texts (the shell part) to the kit catalogs. Existing keys are not overwritten.
 * @param {Messages} extra language → { key: text }
 */
export function addKitMessages(extra) {
  for (const [l, msgs] of Object.entries(extra)) {
    const lang = /** @type {keyof typeof KIT_CATALOGS} */ (l);
    if (KIT_CATALOGS[lang]) KIT_CATALOGS[lang] = /** @type {any} */ ({ ...msgs, ...KIT_CATALOGS[lang] });   // new object: the imported core catalog stays as it is
  }
}
export const KIT_LOCALES = Object.keys(KIT_CATALOGS);
/** Names of the languages in their own language, for the language menu. */
export const LOCALE_NAMES = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };

let locale = 'en';
/** @type {string | null} */
let timeZone = null;
/** @type {Messages} */
const board = {};
const listeners = new Set();
/** Keys that were not found in the active locale (deduplicated); verify reads this. */
export const missingKeys = new Set();
if (typeof window !== 'undefined') /** @type {any} */ (window).__tnMissingKeys = missingKeys;

/**
 * @param {unknown} code
 */
export const baseLang = (code) => String(code || 'en').toLowerCase().split(/[-_]/)[0];

export function getLocale() { return locale; }
/**
 * @param {string} code
 * @returns {string}
 */
export function setLocale(code) {
  locale = String(code || 'en');
  pluralRules = null;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  listeners.forEach((f) => f(locale));
  return locale;
}
/**
 * @param {(locale: string) => void} fn
 */
export const onLocaleChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Time zone in use: the one set by setTimeZone(), else the browser's. */
/** @type {string | null} */
let browserZone = null;   // resolved once: Intl.DateTimeFormat() per call costs ~0.1 ms, and format.js asks for every cell
export function getTimeZone() { return timeZone || (browserZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); }
/**
 * @param {string | null | undefined} zone
 */
export function setTimeZone(zone) { timeZone = zone || null; listeners.forEach((f) => f(locale)); }

/**
 * Add board texts: { en: {…}, de: {…} } (merged, later calls win).
 * @param {Messages} [msgs]
 */
export function addMessages(msgs = {}) {
  for (const [lang, m] of Object.entries(msgs)) board[lang] = { ...(board[lang] || {}), ...m };
}

/** @type {Intl.PluralRules | null} */
let pluralRules = null;
/**
 * @param {number} n
 */
const plural = (n) => (pluralRules ||= new Intl.PluralRules(locale)).select(n);

/**
 * @param {string} key
 */
function find(key) {
  const b = baseLang(locale);
  for (const src of [board[locale], board[b], KIT_CATALOGS[locale], KIT_CATALOGS[b]]) if (src && key in src) return { v: src[key], hit: true };
  return null;
}
/**
 * @param {string} key
 */
function lookup(key) {
  const own = find(key);
  if (own) return own.v;
  if (baseLang(locale) !== 'en') {
    missingKeys.add(`${locale}:${key}`);
    if (!warned.has(`${locale}:${key}`)) { warned.add(`${locale}:${key}`); console.warn(`tarn i18n: missing key "${key}" for "${locale}" (showing English)`); }
  }
  for (const src of [board.en, KIT_CATALOGS.en]) if (src && key in src) return src[key];
  missingKeys.add(`en:${key}`);
  if (!warned.has(`en:${key}`)) { warned.add(`en:${key}`); console.warn(`tarn i18n: unknown key "${key}"`); }
  return key;
}
const warned = new Set();

/**
 * Translated text. t('shell.updated', { age }) · t('chart.runs', { count: 3, bad: 1 }) with { one, other } plural values.
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  /** @type {any} */
  let v = lookup(key);
  if (v && typeof v === 'object') v = v[typeof vars?.count === 'number' ? plural(vars.count) : 'other'] ?? v.other ?? Object.values(v)[0];
  const text = String(v);
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Placeholders ({name}) of a catalog value (all plural forms). Used by tests. */
export const placeholdersOf = (v) => [...new Set([...(typeof v === 'object' ? Object.values(v) : [v]).join(' ').matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

/**
 * Locale choice. opts: { locale?: forced, locales?: offered (default: all kit locales), languages?: navigator.languages, stored?: saved choice,
 * fallback?: the offered language to use when none of the browser languages matches, default 'en' }.
 * Returns { locale, offered, forced }. Without a match the result is `fallback` (if it is offered), else 'en'.
 * @param {ResolveLocaleOptions} [o]
 * @returns {{ locale: string, offered: string[], forced: boolean }}
 */
export function resolveLocale({ locale: forced, locales, languages, stored, fallback } = {}) {
  const offered = (locales && locales.length ? locales : KIT_LOCALES).map(String);
  const pick = (code) => offered.find((o) => o.toLowerCase() === String(code).toLowerCase()) || offered.find((o) => baseLang(o) === baseLang(code));
  if (forced) return { locale: pick(forced) || forced, offered, forced: true };
  const saved = stored && stored !== 'auto' ? pick(stored) : undefined;
  if (saved) return { locale: saved, offered, forced: false };
  for (const l of languages || (typeof navigator !== 'undefined' ? navigator.languages : []) || []) { const p = pick(l); if (p) return { locale: p, offered, forced: false }; }
  return { locale: (fallback && pick(fallback)) || pick('en') || 'en', offered, forced: false };
}
