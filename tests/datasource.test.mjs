// dataSource: revalidate (If-None-Match, 304 keeps the data and counts as current) and refreshOnShow (fetch at once on return to the tab).
import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Set();
globalThis.document ??= /** @type {any} */ ({ hidden: false, addEventListener(_e, f) { listeners.add(f); }, removeEventListener(_e, f) { listeners.delete(f); } });
const { dataSource } = await import('../js/data.js');

const NOW = Date.UTC(2026, 10, 22, 3, 0, 0);

function server() {
  const calls = [];
  let body = { n: 1 }, tag = '"a"';
  const fetch = async (_url, init) => {
    const inm = init.headers['If-None-Match'] ?? null;
    calls.push(inm);
    if (inm && inm === tag) return new Response(null, { status: 304, headers: { ETag: tag } });
    return new Response(JSON.stringify(body), { status: 200, headers: { ETag: tag, 'Content-Type': 'application/json' } });
  };
  return { fetch, calls, set(b, t) { body = b; tag = t; } };
}

test('dataSource revalidate: sends the ETag, a 304 keeps the same data object without parse and resets the age', async () => {
  let t = NOW, parses = 0;
  const srv = server();
  const src = dataSource({ url: '/api/snapshot', fetch: srv.fetch, now: () => t, revalidate: true, ageOf: (d) => d.age ?? 0,
    parse: (j) => { parses++; return { ...j, age: 0 }; } });
  await src.reload();
  const first = src.state.data;
  assert.deepEqual(srv.calls, [null], 'first request without If-None-Match');
  t += 20_000;
  assert.equal(src.state.age, 20);
  await src.reload();
  assert.deepEqual(srv.calls, [null, '"a"']);
  assert.equal(src.state.data, first, '304 keeps the same object');
  assert.equal(parses, 1, 'no parse on 304');
  assert.equal(src.state.age, 0, 'a 304 confirms the data is current');
  assert.equal(src.state.fetchedAt, t);
  srv.set({ n: 2 }, '"b"');
  await src.reload();
  assert.equal(src.state.data.n, 2);
  assert.equal(parses, 2);
  await src.reload();
  assert.deepEqual(srv.calls.slice(-1), ['"b"'], 'the new ETag is sent next');
});

test('dataSource without revalidate: no If-None-Match (unchanged behaviour)', async () => {
  const srv = server();
  const src = dataSource({ url: '/x', fetch: srv.fetch, now: () => NOW });
  await src.reload(); await src.reload();
  assert.deepEqual(srv.calls, [null, null]);
});

test('dataSource refreshOnShow: returning to the tab fetches at once; without it only after the interval', async () => {
  let t = NOW;
  for (const [refreshOnShow, expect] of [[true, 2], [false, 1]]) {
    const srv = server();
    const src = dataSource({ url: '/x', fetch: srv.fetch, now: () => t, interval: 30_000, refreshOnShow });
    src.start();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(srv.calls.length, 1);
    globalThis.document.hidden = true;
    for (const f of listeners) f();
    t += 5_000;                                   // back after 5 s, well inside the interval
    globalThis.document.hidden = false;
    for (const f of [...listeners]) f();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(srv.calls.length, expect, `refreshOnShow ${refreshOnShow}`);
    src.stop();
  }
});
