// node --test tests/  ·  Markdown parser: fixtures per rule and security cases (AST → HTML string only in the test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, safeUrl, MAX_DEPTH } from '../js/markdown.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inl = (nodes) => nodes.map((n) => {
  switch (n.t) {
    case 'text': return esc(n.v);
    case 'em': return `<em>${inl(n.c)}</em>`;
    case 'strong': return `<strong>${inl(n.c)}</strong>`;
    case 'del': return `<del>${inl(n.c)}</del>`;
    case 'code': return `<code>${esc(n.v)}</code>`;
    case 'br': return '<br>';
    case 'a': return `<a href="${esc(n.href)}"${n.ext ? ' rel="noopener noreferrer"' : ''}>${inl(n.c)}</a>`;
    case 'img': return `<img src="${esc(n.src)}" alt="${esc(n.alt)}">`;
    case 'imgoff': return `[Bild: ${esc(n.alt)}]`;
    default: throw new Error(`unbekannt ${n.t}`);
  }
}).join('');
const blk = (n) => {
  switch (n.t) {
    case 'h': return `<h${n.n}>${inl(n.c)}</h${n.n}>`;
    case 'p': return `<p>${inl(n.c)}</p>`;
    case 'hr': return '<hr>';
    case 'quote': return `<blockquote>${n.c.map(blk).join('')}</blockquote>`;
    case 'pre': return `<pre${n.lang ? ` lang="${esc(n.lang)}"` : ''}>${esc(n.v)}</pre>`;
    case 'list': return `<${n.ordered ? 'ol' : 'ul'}${n.start ? ` start="${n.start}"` : ''}>${n.items.map((it) => `<li>${it.task != null ? `[${it.task ? 'x' : ' '}] ` : ''}${!n.loose && it.c[0]?.t === 'p' ? inl(it.c[0].c) + it.c.slice(1).map(blk).join('') : it.c.map(blk).join('')}</li>`).join('')}</${n.ordered ? 'ol' : 'ul'}>`;
    case 'table': return `<table><tr>${n.head.map((c, k) => `<th${n.align[k] ? ` ${n.align[k]}` : ''}>${inl(c)}</th>`).join('')}</tr>${n.rows.map((r) => `<tr>${r.map((c, k) => `<td${n.align[k] ? ` ${n.align[k]}` : ''}>${inl(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    default: throw new Error(`unbekannt ${n.t}`);
  }
};
const html = (src, o) => parseMarkdown(src, o).map(blk).join('');

test('headings and paragraphs', () => {
  assert.equal(html('# Titel\n\nText eins\nText zwei\n\n###### Klein'), '<h1>Titel</h1><p>Text eins\nText zwei</p><h6>Klein</h6>');
  assert.equal(html('## Mit Abschluss ##'), '<h2>Mit Abschluss</h2>');
  assert.equal(html('#kein Heading'), '<p>#kein Heading</p>');
  assert.equal(html('Zeile  \nUmbruch\\\nzwei'), '<p>Zeile<br>Umbruch<br>zwei</p>');
});

test('emphasis: bold, italic, strikethrough, nested', () => {
  assert.equal(html('**fett** *kursiv* _auch_ __stark__ ~~weg~~'), '<p><strong>fett</strong> <em>kursiv</em> <em>auch</em> <strong>stark</strong> <del>weg</del></p>');
  assert.equal(html('***beides***'), '<p><em><strong>beides</strong></em></p>');
  assert.equal(html('**fett mit *kursiv* darin**'), '<p><strong>fett mit <em>kursiv</em> darin</strong></p>');
  assert.equal(html('snake_case_name und 2*3*4'), '<p>snake_case_name und 2<em>3</em>4</p>');
});

test('emphasis: unclosed markers stay text', () => {
  assert.equal(html('**offen und *auch'), '<p>**offen und *auch</p>');
  assert.equal(html('5 * 3 = 15 und a ~~ b'), '<p>5 * 3 = 15 und a ~~ b</p>');
  assert.equal(html('`nie geschlossen'), '<p>`nie geschlossen</p>');
  assert.equal(html('[Text](nie geschlossen'), '<p>[Text](nie geschlossen</p>');
  assert.equal(html('~einfach~'), '<p>~einfach~</p>');
});

test('inline code and code blocks', () => {
  assert.equal(html('Nimm `rsync -a` oder ``a ` b``'), '<p>Nimm <code>rsync -a</code> oder <code>a ` b</code></p>');
  assert.equal(html('`*nicht fett*`'), '<p><code>*nicht fett*</code></p>');
  assert.equal(html('```sh\nrsync -a /src /dst\n# kommentar\n```\nDanach'), '<pre lang="sh">rsync -a /src /dst\n# kommentar</pre><p>Danach</p>');
  assert.equal(html('~~~\n<b>roh</b>\n~~~'), '<pre>&lt;b&gt;roh&lt;/b&gt;</pre>');
  assert.equal(html('```\nunbeendet\nbis zum Ende'), '<pre>unbeendet\nbis zum Ende</pre>');
  assert.equal(html('````\n```\ninnen\n```\n````'), '<pre>```\ninnen\n```</pre>');
});

test('quotes', () => {
  assert.equal(html('> eins\n> zwei\n>\n> - a\n> - b'), '<blockquote><p>eins\nzwei</p><ul><li>a</li><li>b</li></ul></blockquote>');
  assert.equal(html('> > tief\n>\n> außen'), '<blockquote><blockquote><p>tief</p></blockquote><p>außen</p></blockquote>');
});

test('lists: simple, ordered, nested', () => {
  assert.equal(html('- a\n- b\n- c'), '<ul><li>a</li><li>b</li><li>c</li></ul>');
  assert.equal(html('* a\n+ b'), '<ul><li>a</li></ul><ul><li>b</li></ul>');
  assert.equal(html('1. eins\n2. zwei'), '<ol><li>eins</li><li>zwei</li></ol>');
  assert.equal(html('3) drei\n4) vier'), '<ol start="3"><li>drei</li><li>vier</li></ol>');
  assert.equal(html('- a\n  - a1\n  - a2\n    - a2x\n- b'), '<ul><li>a<ul><li>a1</li><li>a2<ul><li>a2x</li></ul></li></ul></li><li>b</li></ul>');
  assert.equal(html('1. eins\n   - unter\n2. zwei'), '<ol><li>eins<ul><li>unter</li></ul></li><li>zwei</li></ol>');
  assert.equal(html('- a\n\n- b'), '<ul><li><p>a</p></li><li><p>b</p></li></ul>');
  assert.equal(html('- a\nFortsetzung\n- b'), '<ul><li>a\nFortsetzung</li><li>b</li></ul>');
  assert.equal(html('Text\n- a\n- b'), '<p>Text</p><ul><li>a</li><li>b</li></ul>');
  assert.equal(html('Text\n2. kein Listenstart'), '<p>Text\n2. kein Listenstart</p>');
});

test('task lists', () => {
  assert.equal(html('- [ ] offen\n- [x] erledigt\n- [X] auch\n- [y] kein Task'), '<ul><li>[ ] offen</li><li>[x] erledigt</li><li>[x] auch</li><li>[y] kein Task</li></ul>');
});

test('tables (GFM)', () => {
  assert.equal(html('| Job | Status | Dauer |\n|---|:---:|---:|\n| backup | ok | 21 min |\n| sync | **Fehler** | 3 s |'),
    '<table><tr><th>Job</th><th center>Status</th><th right>Dauer</th></tr><tr><td>backup</td><td center>ok</td><td right>21 min</td></tr><tr><td>sync</td><td center><strong>Fehler</strong></td><td right>3 s</td></tr></table>');
  assert.equal(html('a | b\n--|--\n1 | 2'), '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>');
  assert.equal(html('| a | b |\n|---|---|\n| `x \\| y` | 2 |'), '<table><tr><th>a</th><th>b</th></tr><tr><td><code>x | y</code></td><td>2</td></tr></table>');
  assert.equal(html('| a | b |\n|---|---|\n| nur eine |'), '<table><tr><th>a</th><th>b</th></tr><tr><td>nur eine</td><td></td></tr></table>');
  assert.equal(html('| a | b |\nkeine Trennzeile'), '<p>| a | b |\nkeine Trennzeile</p>');
});

test('rule', () => {
  assert.equal(html('oben\n\n---\n\nunten'), '<p>oben</p><hr><p>unten</p>');
  assert.equal(html('***\n___\n- - -'), '<hr><hr><hr>');
});

test('links and autolinks', () => {
  assert.equal(html('[Doku](https://example.com/a?b=1 "Titel")'), '<p><a href="https://example.com/a?b=1" rel="noopener noreferrer">Doku</a></p>');
  assert.equal(html('[rel](../log.md) [anker](#abschnitt) [mail](mailto:a@b.de)'), '<p><a href="../log.md">rel</a> <a href="#abschnitt">anker</a> <a href="mailto:a@b.de">mail</a></p>');
  assert.equal(html('<https://example.com/x> und <mail@example.com>'), '<p><a href="https://example.com/x" rel="noopener noreferrer">https://example.com/x</a> und <a href="mailto:mail@example.com">mail@example.com</a></p>');
  assert.equal(html('Siehe https://example.com/pfad, danach (http://a.de/x) und https://b.de.'),
    '<p>Siehe <a href="https://example.com/pfad" rel="noopener noreferrer">https://example.com/pfad</a>, danach (<a href="http://a.de/x" rel="noopener noreferrer">http://a.de/x</a>) und <a href="https://b.de" rel="noopener noreferrer">https://b.de</a>.</p>');
  assert.equal(html('[**fett** Link](https://x.de)'), '<p><a href="https://x.de" rel="noopener noreferrer"><strong>fett</strong> Link</a></p>');
  assert.equal(html('[mit (Klammer)](https://x.de/a_(b))'), '<p><a href="https://x.de/a_(b)" rel="noopener noreferrer">mit (Klammer)</a></p>');
});

test('security: unsafe link schemes become text', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java&#x0A;script:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '//evil.example/x', '/\\evil.example', '\\\\evil.example']) {
    const out = html(`[Klick](${bad})`);
    assert.ok(!out.includes('<a '), `${bad} → ${out}`);
    assert.ok(out.includes('Klick'), bad);
  }
  assert.equal(html('<javascript:alert(1)>'), '<p>&lt;javascript:alert(1)&gt;</p>');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.deepEqual(safeUrl('https://a.de'), { href: 'https://a.de', ext: true });
  assert.deepEqual(safeUrl('docs/a.md'), { href: 'docs/a.md', ext: false });
});

test('security: raw HTML stays text, entities become text', () => {
  assert.equal(html('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(html('Text <img src=x onerror=alert(1)> **fett**'), '<p>Text &lt;img src=x onerror=alert(1)&gt; <strong>fett</strong></p>');
  assert.equal(html('<div style="x">a</div>\n\n<b>fett?</b>'), '<p>&lt;div style=&quot;x&quot;&gt;a&lt;/div&gt;</p><p>&lt;b&gt;fett?&lt;/b&gt;</p>');
  assert.equal(html('&lt;script&gt; &amp; &#60;b&#62; &#x3c;i&#x3e; &unbekannt; &#0; &'), '<p>&lt;script&gt; &amp; &lt;b&gt; &lt;i&gt; &amp;unbekannt; � &amp;</p>');
  assert.equal(html('```html\n<script>alert(1)</script>\n```'), '<pre lang="html">&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
  assert.equal(html('| <b>x</b> | y |\n|---|---|\n| <i>a</i> | b |'), '<table><tr><th>&lt;b&gt;x&lt;/b&gt;</th><th>y</th></tr><tr><td>&lt;i&gt;a&lt;/i&gt;</td><td>b</td></tr></table>');
});

test('images: off by default, with the option only relative paths', () => {
  assert.equal(html('![Diagramm](https://example.com/x.png)'), '<p>[Bild: Diagramm]</p>');
  assert.equal(html('![Diagramm](bilder/x.png)'), '<p>[Bild: Diagramm]</p>');
  assert.equal(html('![Diagramm](bilder/x.png)', { images: true }), '<p><img src="bilder/x.png" alt="Diagramm"></p>');
  assert.equal(html('![x](https://example.com/x.png)', { images: true }), '<p>[Bild: x]</p>');
  assert.equal(html('![x](javascript:alert(1))', { images: true }), '<p>[Bild: x]</p>');
  assert.equal(html('![x](//evil/x.png)', { images: true }), '<p>[Bild: x]</p>');
});

test('robustness: depth, empty input, control characters', () => {
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown(null), []);
  assert.deepEqual(parseMarkdown(undefined), []);
  const deep = '>'.repeat(5000) + ' tief';
  const ast = parseMarkdown(deep);
  let d = 0, n = ast[0];
  while (n?.t === 'quote') { d++; n = n.c[0]; }
  assert.ok(d <= MAX_DEPTH + 1, `Tiefe ${d}`);
  const nested = `${'  '.repeat(0)}${Array.from({ length: 60 }, (_, i) => `${'  '.repeat(i)}- x`).join('\n')}`;
  assert.doesNotThrow(() => parseMarkdown(nested));
  assert.doesNotThrow(() => parseMarkdown('['.repeat(3000) + 'x' + ']('.repeat(3000)));
  assert.doesNotThrow(() => parseMarkdown('*'.repeat(5000) + 'a' + '_'.repeat(5000)));
  assert.equal(html('a\u0000b'), '<p>a�b</p>');
  assert.equal(html('Windows\r\nZeilen\r\n\r\nzwei'), '<p>Windows\nZeilen</p><p>zwei</p>');
});

test('agent report: mixed text', () => {
  const out = html('## Lauf 12\n\n**Ergebnis:** `offsite-sync` schlug fehl (Exit 12).\n\n1. Verbindung prüfen\n2. Erneut starten\n   - mit `--partial`\n\n| Ziel | Dauer |\n|---|--:|\n| nas-b | 45 min |\n\n> Hinweis: siehe <https://example.com/log>');
  assert.match(out, /^<h2>Lauf 12<\/h2><p><strong>Ergebnis:<\/strong> <code>offsite-sync<\/code> schlug fehl \(Exit 12\)\.<\/p><ol><li>Verbindung prüfen<\/li><li>Erneut starten<ul><li>mit <code>--partial<\/code><\/li><\/ul><\/li><\/ol><table>/);
  assert.match(out, /<blockquote><p>Hinweis: siehe <a href="https:\/\/example.com\/log" rel="noopener noreferrer">/);
});
