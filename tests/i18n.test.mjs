// node --test tests/  ·  i18n: catalogs have the same keys and placeholders, lookup and fallback, locale resolution, formats per locale
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIT_CATALOGS, KIT_LOCALES, t, setLocale, setTimeZone, addMessages, resolveLocale, placeholdersOf, missingKeys, baseLang } from '../js/i18n.js';
import { fmtNum, fmtPct, fmtAgo, fmtDuration, fmtTime, fmtDate, fmtWhen, fmtBytes } from '../js/format.js';

const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

test('catalogs: same keys and placeholders in every language', () => {
  const ref = KIT_CATALOGS.en, keys = Object.keys(ref).sort();
  assert.ok(keys.length > 60);
  for (const l of KIT_LOCALES) {
    assert.deepEqual(Object.keys(KIT_CATALOGS[l]).sort(), keys, `keys of ${l}`);
    for (const k of keys) {
      assert.deepEqual(placeholdersOf(KIT_CATALOGS[l][k]), placeholdersOf(ref[k]), `${l}:${k} placeholders`);
      assert.equal(typeof KIT_CATALOGS[l][k], typeof ref[k], `${l}:${k} type (plural object or string)`);
      const vals = typeof KIT_CATALOGS[l][k] === 'object' ? Object.values(KIT_CATALOGS[l][k]) : [KIT_CATALOGS[l][k]];
      for (const v of vals) assert.ok(String(v).trim(), `${l}:${k} empty`);
    }
  }
});

test('t(): placeholders, plural, board messages override, fallback to English', () => {
  setLocale('en');
  assert.equal(t('common.close'), 'Close');
  assert.equal(t('shell.updated', { age: '5 min. ago' }), 'Updated 5 min. ago');
  assert.equal(t('chart.runs', { count: 1, bad: 0 }), '1 run, 0 failed');
  assert.equal(t('chart.runs', { count: 5, bad: 2 }), '5 runs, 2 failed');
  setLocale('de');
  assert.equal(t('common.close'), 'Schließen');
  assert.equal(t('chart.runs', { count: 1, bad: 0 }), '1 Lauf, 0 fehlgeschlagen');
  addMessages({ en: { 'test.only': 'English only', 'test.both': 'Both EN' }, de: { 'test.both': 'Beide DE', 'common.close': 'Zu' } });
  assert.equal(quiet(() => t('test.only')), 'English only');   // missing in de → English
  assert.ok(missingKeys.has('de:test.only'));
  assert.equal(t('test.both'), 'Beide DE');
  assert.equal(t('common.close'), 'Zu');                        // board overrides the kit
  assert.equal(quiet(() => t('no.such.key')), 'no.such.key');   // unknown everywhere → the key
  setLocale('de-AT');
  assert.equal(t('test.both'), 'Beide DE');                     // regional locale uses the language catalog
  setLocale('en');
});

test('resolveLocale: forced > stored > browser languages > English', () => {
  const o = ['en', 'de', 'fr'];
  assert.equal(resolveLocale({ locale: 'de', locales: o, languages: ['fr'] }).locale, 'de');
  assert.equal(resolveLocale({ locale: 'de', locales: o }).forced, true);
  assert.equal(resolveLocale({ locales: o, stored: 'fr', languages: ['de'] }).locale, 'fr');
  assert.equal(resolveLocale({ locales: o, stored: 'auto', languages: ['de-AT', 'en'] }).locale, 'de');
  assert.equal(resolveLocale({ locales: o, stored: 'xx', languages: ['fr-CA'] }).locale, 'fr');
  assert.equal(resolveLocale({ locales: o, languages: ['ja', 'ko'] }).locale, 'en');
  assert.equal(resolveLocale({ languages: ['es-MX'] }).locale, 'es');                 // default: all kit locales
  assert.equal(resolveLocale({ locales: ['de'], languages: ['ja'] }).locale, 'en');   // fallback is English even if not offered
  assert.equal(baseLang('pt-BR'), 'pt');
});

test('formats follow the locale and the time zone', () => {
  setTimeZone('Europe/Berlin');
  const t0 = Date.UTC(2026, 10, 9, 6, 15);
  setLocale('en'); assert.equal(fmtNum(12345.678), '12,345.68'); assert.equal(fmtPct(0.4567), '45.7%'); assert.equal(fmtTime(t0), '07:15 AM'); assert.equal(fmtBytes(1536), '1.5 KB');
  setLocale('de'); assert.equal(fmtNum(12345.678), '12.345,68'); assert.equal(fmtTime(t0), '07:15'); assert.equal(fmtDate(t0), '09.11.2026');
  setLocale('fr'); assert.equal(fmtDuration(7300), '2 h 1 min'); assert.match(fmtAgo(300), /5\s*min/);
  setLocale('es'); assert.equal(fmtDuration(200000), '2 d 7 h');
  setLocale('de'); assert.equal(fmtDuration(200000), '2 T 7 Std.');
  setLocale('en'); assert.equal(fmtDuration(200000), '2 d 7 h'); assert.equal(fmtAgo(5), 'now');
  const now = Date.UTC(2026, 10, 9, 9, 0);
  assert.match(fmtWhen(Date.UTC(2026, 10, 8, 21, 10), now), /^yesterday /);
  setLocale('de'); assert.match(fmtWhen(Date.UTC(2026, 10, 8, 21, 10), now), /^gestern 22:10$/);
  setTimeZone('America/New_York');
  setLocale('en'); assert.equal(fmtTime(t0), '01:15 AM');                                // no hard-wired zone
  setTimeZone(null); setLocale('en');
});

test('plurals: Intl.PluralRules per language incl. 0 and 1, board messages with two counts', async () => {
  const { default: msgs } = await import('../example/messages.js');
  addMessages(msgs);
  const expect = {
    en: ['0 errors · 0 warnings', '1 error · 1 warning', '2 errors · 2 warnings'],
    de: ['0 Fehler · 0 Warnungen', '1 Fehler · 1 Warnung', '2 Fehler · 2 Warnungen'],
    es: ['0 errores · 0 avisos', '1 error · 1 aviso', '2 errores · 2 avisos'],
    fr: ['0 erreur · 0 avertissement', '1 erreur · 1 avertissement', '2 erreurs · 2 avertissements'],   // French: 0 is singular
  };
  for (const [l, want] of Object.entries(expect)) {
    setLocale(l);
    const got = [0, 1, 2].map((n) => t('board.tile.jobsSub', { errors: t('board.tile.errors', { count: n }), warnings: t('board.tile.warnings', { count: n }) }));
    assert.deepEqual(got, want, l);
  }
  setLocale('en');
  assert.equal(t('board.tile.errors'), '{count} errors');   // no count → "other" form, placeholder stays visible
});

test('sample board catalogs: same keys and placeholders in every language', async () => {
  const { default: msgs } = await import('../example/messages.js');
  const keys = Object.keys(msgs.en).sort();
  for (const l of ['de', 'es', 'fr']) {
    assert.deepEqual(Object.keys(msgs[l]).sort(), keys, `keys of ${l}`);
    for (const k of keys) assert.deepEqual(placeholdersOf(msgs[l][k]), placeholdersOf(msgs.en[k]), `${l}:${k}`);
  }
});
