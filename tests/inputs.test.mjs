// node --test tests/  ·  input logic: number parsing, validation, option search, day presets, time zones
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../js/i18n.js';
import { parseNumber, roundTo, validateValue, validationText, filterOptions, isoDay, addDays, rangeFromPreset, presetOf, dayStart } from '../js/inputs-data.js';

test('parseNumber: decimal comma and point, empty, junk', () => {
  assert.equal(parseNumber('1,5'), 1.5);
  assert.equal(parseNumber(' 12 000.25 '), 12000.25);
  assert.equal(parseNumber('-3'), -3);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('1,2,3')));
  assert.ok(Number.isNaN(parseNumber(NaN)));
  assert.equal(roundTo(0.1 + 0.2, 0.1), 0.3);
  assert.equal(roundTo(5, 1), 5);
});

test('validateValue: required, number range, text length, pattern, custom', () => {
  setLocale('en');
  assert.equal(validateValue('', {}), null);
  assert.deepEqual(validateValue('', { required: true }), { key: 'validate.required' });
  assert.deepEqual(validateValue([], { required: true }), { key: 'validate.required' });
  assert.equal(validateValue(['a'], { required: true }), null);
  assert.equal(validateValue(5, { number: true, min: 1, max: 10 }), null);
  assert.deepEqual(validateValue(0, { number: true, min: 1 }), { key: 'validate.min', vars: { min: 1 } });
  assert.deepEqual(validateValue(11, { max: 10 }), { key: 'validate.max', vars: { max: 10 } });
  assert.deepEqual(validateValue(NaN, { number: true }), { key: 'validate.number' });
  assert.deepEqual(validateValue('ab', { minLength: 3 }), { key: 'validate.minLength', vars: { count: 3 } });
  assert.deepEqual(validateValue('abcd', { maxLength: 3 }), { key: 'validate.maxLength', vars: { count: 3 } });
  assert.deepEqual(validateValue('x y', { pattern: /^\S+$/ }), { key: 'validate.pattern' });
  assert.deepEqual(validateValue('bad', { validate: (v) => (v === 'bad' ? 'Not allowed' : null) }), { key: null, text: 'Not allowed' });
  assert.equal(validationText(validateValue(0, { number: true, min: 1 })), 'At least 1');
  assert.equal(validationText(validateValue('a', { minLength: 3 })), 'At least 3 characters');
  assert.equal(validationText(validateValue('', { required: true })), 'Required');
  assert.equal(validationText(null), null);
  setLocale('de');
  assert.equal(validationText(validateValue('', { required: true })), 'Pflichtfeld');
  setLocale('en');
});

test('filterOptions: all words, case, accents, hint and value count', () => {
  const o = [{ value: 'a1', label: 'Atlas', hint: 'rack A' }, { value: 'b2', label: 'Bastión', hint: 'rack B' }, { value: 'c3', label: 'Cedar' }];
  assert.equal(filterOptions(o, '').length, 3);
  assert.deepEqual(filterOptions(o, 'ATL').map((x) => x.value), ['a1']);
  assert.deepEqual(filterOptions(o, 'bastion').map((x) => x.value), ['b2']);        // accent-insensitive
  assert.deepEqual(filterOptions(o, 'rack b').map((x) => x.value), ['b2']);         // hint
  assert.deepEqual(filterOptions(o, 'c3').map((x) => x.value), ['c3']);             // value
  assert.deepEqual(filterOptions(o, 'zzz'), []);
});

test('day presets: today, 7d, 30d, month in a time zone; month and year boundaries', () => {
  const tz = 'Europe/Berlin';
  const now = Date.UTC(2026, 10, 9, 23, 30);      // 00:30 on 10 Nov in Berlin
  assert.equal(isoDay(now, tz), '2026-11-10');
  assert.equal(isoDay(now, 'UTC'), '2026-11-09');
  assert.deepEqual(rangeFromPreset('today', now, tz), { from: '2026-11-10', to: '2026-11-10' });
  assert.deepEqual(rangeFromPreset('7d', now, tz), { from: '2026-11-04', to: '2026-11-10' });
  assert.deepEqual(rangeFromPreset('30d', now, tz), { from: '2026-10-12', to: '2026-11-10' });
  assert.deepEqual(rangeFromPreset('month', now, tz), { from: '2026-11-01', to: '2026-11-10' });
  assert.equal(rangeFromPreset('nope', now, tz), null);
  assert.equal(addDays('2026-01-03', -5), '2025-12-29');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(presetOf({ from: '2026-11-04', to: '2026-11-10' }, now, tz), '7d');
  assert.equal(presetOf({ from: '2026-11-05', to: '2026-11-10' }, now, tz), null);
});

test('dayStart: start of a calendar day in a time zone, DST days', () => {
  assert.equal(dayStart('2026-11-10', 'UTC'), Date.UTC(2026, 10, 10));
  assert.equal(dayStart('2026-11-10', 'Europe/Berlin'), Date.UTC(2026, 10, 9, 23));       // CET = UTC+1
  assert.equal(dayStart('2026-07-01', 'Europe/Berlin'), Date.UTC(2026, 5, 30, 22));       // CEST = UTC+2
  assert.equal(dayStart('2026-03-29', 'Europe/Berlin'), Date.UTC(2026, 2, 28, 23));       // day of the spring change: starts in CET
  assert.equal(dayStart('2026-03-30', 'Europe/Berlin') - dayStart('2026-03-29', 'Europe/Berlin'), 23 * 3600000);   // a 23-hour day
});
