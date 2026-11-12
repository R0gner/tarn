// node --test tests/  ·  forms and actions: field validation, type-to-confirm, run state
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../js/i18n.js';
import { validateFields } from '../js/inputs-data.js';
import { confirmMatches, normalizeRun, isFinal, elapsedSec, runTone, RUN_STATUS } from '../js/actions-data.js';

test('validateFields: required, rules, first invalid field, language', () => {
  setLocale('en');
  const fields = [{ name: 'host', required: true }, { name: 'version', required: true, rules: { pattern: /^\d+\.\d+\.\d+$/ } }, { name: 'timeout', rules: { number: true, min: 1, max: 120 } }, { name: 'skip', required: true, skip: true }];
  assert.deepEqual(validateFields(fields, { host: 'delta', version: '2.4.1', timeout: 30 }), { errors: {}, first: null });
  const r = validateFields(fields, { host: null, version: '2.4', timeout: 500 });
  assert.deepEqual(r.errors, { host: 'Required', version: 'Invalid format', timeout: 'At most 120' });
  assert.equal(r.first, 'host');
  assert.equal(validateFields(fields, { host: 'x', version: 'x' }).first, 'version');
  assert.equal(validateFields(fields, { host: 'x', version: '1.0.0', timeout: null }).first, null);       // empty optional number is fine
  assert.equal(validateFields([{ name: 'tags', required: true }], { tags: [] }).errors.tags, 'Required');   // empty multi-selection
  setLocale('de');
  assert.equal(validateFields(fields, {}).errors.host, 'Pflichtfeld');
  setLocale('en');
});

test('confirmMatches: exact text, spaces ignored, case matters', () => {
  assert.equal(confirmMatches('delta', 'delta'), true);
  assert.equal(confirmMatches('  delta ', 'delta'), true);
  assert.equal(confirmMatches('Delta', 'delta'), false);
  assert.equal(confirmMatches('delt', 'delta'), false);
  assert.equal(confirmMatches('', 'delta'), false);
  assert.equal(confirmMatches(null, 'delta'), false);
});

test('normalizeRun: status, progress, log, junk', () => {
  assert.equal(normalizeRun(null).status, 'running');
  assert.equal(normalizeRun({ status: 'weird' }).status, 'running');                 // unknown → keep polling
  for (const s of RUN_STATUS) assert.equal(normalizeRun({ status: s }).status, s);
  assert.equal(normalizeRun({ progress: 1.7 }).progress, 1);
  assert.equal(normalizeRun({ progress: -2 }).progress, 0);
  assert.equal(normalizeRun({ progress: 'x' }).progress, null);
  assert.equal(normalizeRun({ progress: NaN }).progress, null);
  const r = normalizeRun({ status: 'ok', startedAt: 1000, endedAt: 'x', message: 5, log: [{ t: 1, text: 'a', level: 'ok' }, { text: null }, null, { text: 'b' }] });
  assert.deepEqual(r.log.map((e) => e.text), ['a', 'b']);
  assert.equal(r.endedAt, null); assert.equal(r.message, '5'); assert.equal(r.startedAt, 1000);
  assert.deepEqual(normalizeRun({ log: 'nope' }).log, []);
});

test('isFinal, elapsedSec, runTone', () => {
  assert.deepEqual(RUN_STATUS.filter(isFinal), ['ok', 'bad', 'cancelled']);
  assert.equal(elapsedSec({ status: 'running', startedAt: 1000, endedAt: null }, 6000), 5);
  assert.equal(elapsedSec({ status: 'ok', startedAt: 1000, endedAt: 4000 }, 99999), 3);          // final: until endedAt, not until now
  assert.equal(elapsedSec({ status: 'ok', startedAt: 1000, endedAt: null }, 6000), 5);
  assert.equal(elapsedSec({ status: 'pending', startedAt: null }, 6000), null);
  assert.equal(elapsedSec({ status: 'running', startedAt: 9000, endedAt: null }, 6000), 0);        // clock skew never negative
  assert.deepEqual(RUN_STATUS.map(runTone), ['pending', 'info', 'ok', 'bad', 'warn']);
});
