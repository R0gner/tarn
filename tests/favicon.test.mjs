// node --test tests/  ·  favicon(): pure SVG generation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faviconSvg } from '../js/favicon.js';

test('faviconSvg: square, hairline, symbol in the accent colour', () => {
  const svg = faviconSvg({ icon: 'server', color: 'rgb(180, 140, 245)', card: '#222', line: '#444' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 32 32"/);
  assert.match(svg, /<rect [^>]*rx="7" fill="#222" stroke="#444"\/>/);
  assert.match(svg, /stroke="rgb\(180, 140, 245\)"/);
  assert.match(svg, /<rect width="20" height="8" x="2" y="2" rx="2" ry="2"\/>/); // server (Lucide)
});

test('faviconSvg: dot icons and unknown names', () => {
  assert.match(faviconSvg({ icon: 'more' }), /<circle cx="12" cy="12" r="1"\/>/);
  assert.match(faviconSvg({ icon: 'gibt-es-nicht' }), /<rect width="7" height="7" x="3" y="3"/); // fallback: grid
});

test('faviconSvg: colours must not inject markup', () => {
  const svg = faviconSvg({ color: '"/><script>alert(1)</script>', card: 'red" onload="x', line: '<x>' });
  assert.ok(!/<script|onload|<x>/.test(svg));
});
