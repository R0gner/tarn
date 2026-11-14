# Identity, icons, installing

What makes a board recognisable and installable: its own favicon and title, the app icons and manifest, the icon set, and the “Install as app” entry.
For a board author setting up a new board.

## Favicon and title

**Every board has its own favicon (SVG) and a descriptive title.** The shell sets the title as `View · Board` (`createApp({ title: 'My board' })`); a
static `<title>` in the HTML is “Name · Context”. Never take the icon of another board or the kit logo. Lint rule `page` (every HTML page has
`<link rel="icon">` and a `<title>`) and the verify rule `identity` check this; a self-test mutant guards the rule.

Two ways to the icon:

- a file: `<link rel="icon" type="image/svg+xml" href="favicon.svg">` (template `example/favicon.svg`);
- no graphic file: `createApp({ icon: { icon: 'server', color: 'purple' } })` or `favicon({ icon, color })`. It draws a rounded square in card grey with a
  hairline and a single-colour kit symbol, as an SVG data URL, and follows the light/dark scheme. `color` is a token name (`blue green orange purple pink
  graphite`, `accent`) or a CSS colour.

## tools/brand.mjs

```sh
node tools/brand.mjs --name "My board" --icon server --accent purple --out <folder>
```

Writes to `--out`: `favicon.svg` (the rounded square with the symbol in the accent colour, light and dark via `prefers-color-scheme`), `icon-192.png`,
`icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180 px) and `manifest.webmanifest` (name, short name, icons, `start_url`,
`display: standalone`, colours, language), and prints the `<head>` lines to add. A headless Chrome renders the PNGs over CDP (no image library); on a host
without its own Chrome use `--attach <url>`.

| Option | Meaning |
|---|---|
| `--name`, `--short-name` | board name (required), short name (default: the name) |
| `--icon NAME` | a kit symbol from `icons/manifest.json` (required without `--source`) |
| `--accent COLOUR` | token name or CSS colour, default `blue` |
| `--source SVG`, `--bg COLOUR` | use an existing drawing (`gallery/` was made from `icons/logo.svg`) and fill the edge-to-edge variants with `--bg` |
| `--lang`, `--start-url`, `--scope` | manifest language (default `en`), start URL and scope (default `.`) |
| `--attach URL`, `--chrome PATH` | a running Chrome, or a Chrome binary |

## Icons

Lucide (ISC) in a fixed version, only the symbols the kit uses are in `icons/` (unchanged SVGs); sources and sha256 are in `icons/SOURCES.md`, the runtime
file is the generated `js/icons-data.js`. `ICON_NAMES` lists the kit names; `icon(name)` returns an SVG element. Boards use icons only from `icon()`:
no emoji, no own SVG.

```sh
node tools/icons.mjs add <lucide-name> [--as <kit-name>]   # fetch the symbol at the fixed version, register it, rebuild (the only command that uses the network)
node tools/icons.mjs list                                  # the registered symbols
node tools/icons.mjs build                                 # regenerate icons/SOURCES.md and js/icons-data.js
node tools/icons.mjs check                                 # do both match icons/*.svg? (exit 1 if not; tests/icons.test.mjs does the same)
```

A missing icon is a kit gap: add it with `icons.mjs add`, then check the gallery.

## Installing

“Install as app” sits at the bottom of the sidebar. It appears when the browser offers `beforeinstallprompt`; where the browser has no prompt (iPhone and
iPad in any browser, Safari on the Mac) the entry stays and opens a sheet with the steps (Share → Add to Home Screen, File → Add to Dock). After
installing (`appinstalled`) and in standalone mode (also iOS `navigator.standalone`) it is gone.

In the board's `<head>`:

```html
<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```

`crossorigin="use-credentials"` sends the cookies with the manifest request, which a board behind a login proxy needs.

The kit has **no service worker by default** and no offline cache: Chrome offers installation without one (the installability check for gallery and sample
board comes back empty, and the real `beforeinstallprompt` arrives). The only worker the kit offers is `js/push-sw.js`, for [notifications](notifications.md);
a board opts in.
