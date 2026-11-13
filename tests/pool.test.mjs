// node --test tests/  ·  verify --ci: a failed Chrome start is tried once more (and said so), nothing else is retried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWithRetry } from '../tools/lib/pool.mjs';

const flaky = (fails, err) => { let n = 0; return async () => { n++; if (n <= fails) throw err(); return `pool after ${n}`; }; };
const chromeErr = () => Object.assign(new Error('Chrome debugger on port 4242 not reachable'), { chromeStart: true });

test('ci: the first Chrome start fails, the second works → the result and the first error (for the output)', async () => {
  const r = await startWithRetry(flaky(1, chromeErr), true);
  assert.deepEqual(r, { value: 'pool after 2', retried: 'Chrome debugger on port 4242 not reachable' });
});

test('ci: a start that works needs no retry; two failures end with the error', async () => {
  assert.deepEqual(await startWithRetry(flaky(0, chromeErr), true), { value: 'pool after 1', retried: null });
  await assert.rejects(startWithRetry(flaky(2, chromeErr), true), /debugger on port/);
});

test('no retry without --ci, and none for errors that are not a failed Chrome start (no Chrome found, a page that does not load)', async () => {
  await assert.rejects(startWithRetry(flaky(1, chromeErr), false), /debugger on port/);
  const other = () => Object.assign(new Error('no Chrome found'), { env: true });
  let calls = 0;
  await assert.rejects(startWithRetry(async () => { calls++; throw other(); }, true), /no Chrome found/);
  assert.equal(calls, 1);
});
