// node --test tests/  ·  chart maths and data source without DOM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extent, linear, niceStep, niceDomain, ticks, timeTicks, timeAxis, timeLabel, tzOffset, nearestIndex, stack, linePath, areaPath, arcPath, findConflicts,
} from '../js/charts/scale.js';

test('extent and linear scale', () => {
  assert.deepEqual(extent([3, null, -1, NaN, 7]), [-1, 7]);
  assert.deepEqual(extent([]), [0, 1]);
  const s = linear([0, 10], [100, 0]);
  assert.equal(s(5), 50);
  assert.equal(s.invert(25), 7.5);
  assert.equal(linear([4, 4], [0, 10])(4), 5, 'constant domain → middle');
});

test('nice steps, domain and ticks', () => {
  assert.equal(niceStep(100, 5), 20);
  assert.equal(niceStep(9, 4), 2.5);
  assert.deepEqual(niceDomain([3, 97], 4), [0, 100]);
  assert.deepEqual(niceDomain([20, 30], 4, { zeroBased: true }), [0, 30]);
  assert.deepEqual(niceDomain([5, 5], 4), [4.5, 5.5]);
  assert.deepEqual(niceDomain([0, 0]), [0, 1]);
  assert.deepEqual(ticks([0, 100], 4), [0, 25, 50, 75, 100]);
  assert.deepEqual(ticks([0, 1], 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test('time ticks on local full hours (Europe/Berlin)', () => {
  assert.equal(tzOffset(Date.UTC(2026, 10, 9)), 3600e3);
  assert.equal(tzOffset(Date.UTC(2026, 6, 9)), 7200e3);
  const a = Date.UTC(2026, 10, 8, 23, 0), b = a + 24 * 3600e3; // 00:00 to 00:00 local
  const t = timeTicks([a, b], 8);
  assert.equal(t.unit, 'hour');
  assert.equal(t.step, 3 * 3600e3);
  assert.equal(t.ticks[0], a, 'first tick at 00:00 local');
  for (const x of t.ticks) assert.equal(((x + tzOffset(x)) / 3600e3) % 3, 0, 'on full 3-hour marks');
  const d = timeTicks([a, a + 14 * 24 * 3600e3], 7);
  assert.equal(d.unit, 'day');
});

test('time axis: labels follow the span, ticks follow the width, no label is cut or overlaps (1 h – 30 d, phone and desktop, en and de)', async () => {
  const { setLocale } = await import('../js/i18n.js');
  const { fmtDay, fmtTime } = await import('../js/format.js');
  const now = Date.UTC(2026, 10, 15, 13, 0);
  for (const loc of ['en', 'de']) {
    setLocale(loc);
    for (const W of [340, 950]) for (const sec of [3600, 6 * 3600, 86400, 7 * 86400, 30 * 86400]) {
      const where = `${loc} ${W} px ${sec / 3600} h`;
      const ax = timeAxis([now - sec * 1000, now], { left: 38, right: W - 8, width: W, charW: 6.82 });
      assert.ok(ax.ticks.length >= 2, `${where}: at least two ticks (${ax.ticks.length})`);
      ax.ticks.forEach((k, i) => {
        assert.ok(k.l >= 0 && k.r <= W, `${where}: “${k.text}” leaves the axis`);
        if (i) assert.ok(k.l - ax.ticks[i - 1].r >= 10, `${where}: “${k.text}” touches “${ax.ticks[i - 1].text}”`);
        assert.equal(k.text, ax.step >= 864e5 || (k.t + tzOffset(k.t)) % 864e5 === 0 ? fmtDay(k.t) : fmtTime(k.t), `${where}: label through Intl`);
      });
      if (sec >= 7 * 86400) assert.equal(ax.unit, 'day', `${where}: day and month for long spans`);
      if (sec <= 6 * 3600) assert.notEqual(ax.unit, 'day', `${where}: time of day for short spans`);
    }
    const narrow = timeAxis([now - 7 * 864e5, now], { left: 38, right: 332, width: 340, charW: 6.82 }).ticks.length;
    const wide = timeAxis([now - 7 * 864e5, now], { left: 38, right: 942, width: 950, charW: 6.82 }).ticks.length;
    assert.ok(wide > narrow, `${loc}: more ticks on a wider axis (${narrow} → ${wide})`);
  }
  setLocale('en');
  assert.equal(timeLabel(Date.UTC(2026, 10, 12, 11), 864e5), fmtDay(Date.UTC(2026, 10, 12, 11)), 'whole day and month, never a cut date');
  assert.doesNotMatch(timeLabel(Date.UTC(2026, 10, 12, 11), 864e5), /\/$/);
});

test('nearest index (scrubbing)', () => {
  const xs = [0, 10, 20, 30];
  assert.equal(nearestIndex(xs, -5), 0);
  assert.equal(nearestIndex(xs, 14), 1);
  assert.equal(nearestIndex(xs, 16), 2);
  assert.equal(nearestIndex(xs, 99), 3);
  assert.equal(nearestIndex([], 1), -1);
});

test('stacks and paths', () => {
  assert.deepEqual(stack([[1, 2], [3, null]]), [[[0, 1], [0, 2]], [[1, 4], [2, 2]]]);
  assert.equal(linePath([[0, 1], [1, null], [2, 3], [3, 4]]), 'M0,1M2,3L3,4');
  assert.equal(areaPath([[0, 1], [1, 2]], 10), 'M0,10L0,1L1,2L1,10Z');
  assert.match(arcPath(10, 10, 10, 6, 0, Math.PI / 2), /^M10,0A10,10 0 0 1 20,10L16,10A6,6 0 0 0 10,4Z$/);
});

test('conflicts: only heavy runs of different rows', () => {
  const rows = [
    { id: 'a', heavy: true, items: [{ start: 0, end: 10 }] },
    { id: 'b', heavy: true, items: [{ start: 5, end: 20 }, { start: 30, end: 40 }] },
    { id: 'c', heavy: false, items: [{ start: 0, end: 100 }] },
    { id: 'd', heavy: true, items: [{ start: 10, end: 12 }] },
  ];
  assert.deepEqual(findConflicts(rows), [{ a: 'a', b: 'b', start: 5, end: 10 }, { a: 'b', b: 'd', start: 10, end: 12 }]);
  assert.deepEqual(findConflicts([{ id: 'x', heavy: true, items: [{ start: 0, end: 5 }, { start: 1, end: 6 }] }]), [], 'same row does not count');
});

test('dataSource: age, errors, the last state stays', async () => {
  globalThis.document ??= { hidden: false, addEventListener() {}, removeEventListener() {} };
  const { dataSource } = await import('../js/data.js');
  let t = 1_000_000, fail = false;
  const fetch = async () => (fail ? { ok: false, status: 503, json: async () => ({ error: 'Wartung' }) } : { ok: true, status: 200, json: async () => ({ v: 1, ageSec: 30 }) });
  const ds = dataSource({ url: '/x', fetch, now: () => t, staleAfter: 60, ageOf: (d) => d.ageSec });
  assert.equal(ds.state.stale, true);
  await ds.reload();
  assert.equal(ds.state.data.v, 1);
  assert.equal(ds.state.age, 30);
  t += 20_000;
  assert.equal(ds.state.age, 50);
  assert.equal(ds.state.stale, false);
  t += 20_000;
  assert.equal(ds.state.stale, true);
  fail = true;
  await ds.reload();
  assert.equal(ds.state.error, 'Wartung');
  assert.equal(ds.state.data.v, 1, 'last state stays visible');
});
