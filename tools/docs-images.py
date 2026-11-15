#!/usr/bin/env python3
"""tarn · docs pictures: rebuilds docs/img/*.png from the sample board and the gallery (invented data only).

    python3 tools/docs-images.py [--out docs/img] [--tmp DIR]

Takes the raw screenshots with tools/shoot.mjs (Node, own headless Chrome, the repo's files over CDP, no server), then crops, scales and joins them with
Pillow into a few small PNGs (palette of 256 colours). Needs Node >= 22, a Chromium-based browser and Python 3 with Pillow. Not part of verify or CI; run it when
the look of the kit changes. The sample board's times are relative to "now", so a rebuilt picture differs in its clock texts.
"""
import argparse, glob, os, subprocess, sys, tempfile, shutil
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX, GA = '/example/?lang=en', '/gallery/?lang=en'
CLICK_FILTER = "[...document.querySelectorAll('button')].find(b=>/^\\s*Filter/.test(b.textContent))?.click()"

# key: (url, size, theme, eval, full)
SHOTS = {
    'detail-p-light': (f'{EX}#/jobs?open=offsite-sync', 'phone', 'light', None, False),
    'jobs-t': (f'{EX}#/jobs', 'tablet', 'dark', None, False),
    'ov-p': (f'{EX}#/overview', 'phone', 'dark', None, False),
    'jobs-p': (f'{EX}#/jobs', 'phone', 'dark', None, False),
    'detail-p': (f'{EX}#/jobs?open=offsite-sync', 'phone', 'dark', None, False),
    'hist-p': (f'{EX}#/history', 'phone', 'dark', None, False),
    'hist-d': (f'{EX}#/history', 'desktop', 'dark', None, True),
    'jobs-d': (f'{EX}#/jobs', 'desktop', 'dark', None, False),
    'filter-d': (f'{EX}#/jobs', 'desktop', 'dark', CLICK_FILTER, False),
    'deploy-d': (f'{EX}#/deploy?run=ok', 'desktop', 'dark', None, False),
    'notif-d': (f'{GA}#/shell', 'desktop', 'dark', None, True),
}


def shoot(key, spec, tmp):
    url, size, theme, ev, full = spec
    cmd = ['node', os.path.join(ROOT, 'tools/shoot.mjs'), '--out', tmp, '--sizes', size, '--themes', theme, '--prefix', key + '_']
    if ev: cmd += ['--eval', ev]
    if full: cmd += ['--full']
    r = subprocess.run(cmd + [url], capture_output=True, text=True)
    if r.returncode: sys.exit(f'shoot {key} failed:\n{r.stdout[-800:]}{r.stderr[-800:]}')
    f = glob.glob(os.path.join(tmp, f'{key}_-*.png'))
    if len(f) != 1: sys.exit(f'shoot {key}: expected one file, got {f}')
    return Image.open(f[0]).convert('RGB')


def scale(im, w=None, h=None):
    if w: h = round(im.height * w / im.width)
    else: w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)


def rounded(im, r=14, border=None):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
    out = Image.new('RGB', im.size, (0, 0, 0))
    out.paste(im, (0, 0), m)
    return out, m


def canvas(w, h, bg):
    return Image.new('RGB', (w, h), bg)


def paste_round(cv, im, xy, r=14, line=(70, 72, 80)):
    im2, m = rounded(im, r)
    ImageDraw.Draw(cv).rounded_rectangle((xy[0] - 1, xy[1] - 1, xy[0] + im.width, xy[1] + im.height), r + 1, outline=line, width=2)
    cv.paste(im2, xy, m)


def save(im, path):
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'img'))
    ap.add_argument('--tmp', default=None, help='folder for the raw screenshots (default: a temp folder, deleted afterwards)')
    a = ap.parse_args()
    tmp = a.tmp or tempfile.mkdtemp(prefix='tarn-docs-img-')
    os.makedirs(tmp, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    try:
        s = {k: shoot(k, v, tmp) for k, v in SHOTS.items()}
        bg = s['hist-d'].getpixel((1430, 1180))
        sizes = {}

        # 1. hero: the range of the kit in one frame. Main frame: the History view (dark, desktop: line chart, stacked bars, ranking, timeline); on its right edge a
        #    job detail as a bottom sheet (light, phone: run strip and Markdown run report); below it a narrow view of the jobs table (dark, tablet: status, run strips).
        #    Only the right margin of the main frame is overlapped, the charts stay free.
        W, H = 1700, 1030
        d = scale(s['hist-d'], w=1070)
        p = scale(s['detail-p-light'].crop((0, 0, 1170, 2054)), w=420)
        t = scale(s['jobs-t'].crop((0, 0, 1640, 738)), w=560)
        cv = canvas(W, H, bg)
        paste_round(cv, d, (24, (H - d.height) // 2), r=10)
        paste_round(cv, p, (1090, 20), r=22)
        paste_round(cv, t, (W - t.width - 24, H - t.height - 26), r=12)
        sizes['hero.png'] = save(cv, os.path.join(a.out, 'hero.png'))

        # 2. charts: the history view (line, stacked bars, ranking, schedule), cropped
        h = s['hist-d']
        sizes['charts.png'] = save(scale(h.crop((0, 0, 1440, 952)), w=1200), os.path.join(a.out, 'charts.png'))

        # 3. tables with filters: the table next to the filter sheet
        t = scale(s['jobs-d'].crop((0, 0, 1440, 560)), w=1000)
        f = s['filter-d']
        fp = scale(f.crop((986, 0, 1440, 560)), w=340)
        cv = canvas(t.width + 20 + fp.width, t.height, bg)
        cv.paste(t, (0, 0)); cv.paste(fp, (t.width + 20, 0))
        sizes['tables.png'] = save(cv, os.path.join(a.out, 'tables.png'))

        # 4. forms and actions: the deploy view (form, finished run with log, toast)
        sizes['forms.png'] = save(scale(s['deploy-d'].crop((0, 0, 1440, 620)), w=1200), os.path.join(a.out, 'forms.png'))

        # 5. phone views
        ph = [scale(s[k], w=330) for k in ('ov-p', 'jobs-p', 'detail-p', 'hist-p')]
        cv = canvas(sum(i.width for i in ph) + 20 * 5, ph[0].height + 40, bg)
        x = 20
        for i in ph:
            paste_round(cv, i, (x, 20), r=18); x += i.width + 20
        sizes['phone.png'] = save(cv, os.path.join(a.out, 'phone.png'))

        # 6. notifications: every state of the settings sheet (the gallery mocks the browser and the server)
        n = s['notif-d']
        sizes['notifications.png'] = save(scale(n.crop((228, 1250, 1420, 1960)), w=1100), os.path.join(a.out, 'notifications.png'))
    finally:
        if not a.tmp: shutil.rmtree(tmp, ignore_errors=True)
    total = sum(sizes.values())
    for k, v in sizes.items(): print(f'{k:20} {v // 1024:4} KB')
    print(f'{len(sizes)} files, {total // 1024} KB')


if __name__ == '__main__':
    main()
