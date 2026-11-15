# Charts

Six chart types, drawn as SVG or HTML without a library, all from `/tarn/js/tarn.js`. For a board author who has numbers over time, per category or per
run and wants them on screen without choosing colours or sizes. Every chart takes its colours from tokens, scales to the container width and has a gallery entry in the `charts` view; line, bar, heat row and timeline show
their values in a data card on hover or touch.

| You have … | use |
|---|---|
| a time series, one or several lines | `lineChart({ x, series })`; from a metrics server: a `promSource` range query gives exactly this shape ([data](data.md#promql-promsource)) |
| counts per day, per category, a ranking with long names | `barChart({ labels, series })`, `horizontal: true` for rankings |
| a trend to put inside a tile or a row | `sparkline({ values })` |
| a share or a fill level | `donut({ segments })` or `donut({ value, max })` |
| the last runs, ok or failed | `heatRow({ items })` |
| a schedule, overlapping runs | `timeline({ start, end, rows })` |

**Colours:** a series colour is a token name: `blue green orange purple pink graphite` or a status (`ok warn bad unknown pending info`). Without `color`
the series take the palette in that order. Status colours only where the series means that status. Values may contain `null`/`undefined`; a line breaks
there.

## lineChart

```js
lineChart({
  x: [ms, …],                                   // epoch milliseconds (time: true, default) or plain numbers
  series: [{ label, values: [y | null, …], color?, area? }],
  height = 180, area = false, stacked = false, zeroBased = area || stacked,
  yFormat = fmtNum, xFormat?, time = true, yTicks = 4, yMin?, yMax?,
  label?,                                       // accessible name
  empty = 'No data',
})
```

`values` align with `x`. Axes use the active locale and time zone. Moving the mouse or swiping horizontally scrubs: a line and a data card show all series
at that point. `stacked` stacks the series; `area` fills below the line.

## barChart

```js
barChart({
  labels: ['Mo', …], series: [{ label, values, color? }],
  stacked = false, horizontal = false,
  height = 180 /* vertical */, rowHeight = 22 /* horizontal */,
  yFormat = fmtNum, onBar?: (index) => void, label?, empty?,
})
```

Vertical suits time series (runs per day), horizontal suits rankings with long names (storage per host). With `onBar` a bar is clickable.

## sparkline, donut, heatRow

```js
sparkline({ values, color = 'blue', height = 24, width?, area = true, last = true, label?, min?, max? })
donut({ segments: [{ label, value, color? | status? }], size = 72, thickness = 9, center?, sub?, legend = true, label? })
donut({ value: 0.82, max: 1, color: 'warn', center: '82 %' })            // one value and a maximum: a fill-level ring
heatRow({ items: [{ status, t?, label?, id? }], max = 30, onItem?, label?, size?: 'lg' })
```

- `sparkline` has no axes and no hover; without `width` it fills its container, so it fits into a `statTile` `sub` or a `metricRow`. `last` marks the last
  point.
- `donut` has no hover; `center` and `sub` are the texts inside the ring.
- `heatRow` shows the latest runs as small boxes, newest on the right; a data card shows time and status, `onItem` makes a box tappable. Boxes are dense
  data points below 40 px: when they are clickable the row around them should be the large target (see the touch exceptions under
  [timeline](#timeline) and in [checks](checks.md#a-board-outside-the-kit)).

## timeline

A schedule or run history as rows with bars on a time axis. Drawn as HTML so that text, click and scroll work.

```js
timeline({
  start, end, now?,                              // epoch ms
  rows: [{ id, label, sub?, group?, heavy?, status?, items: [{ start, end?, label? }], band?: [[start, end], …] }],
  groups?: [{ id, label }],
  windows?: [{ start, end, label?, tone?: 'info' | 'warn' }],     // maintenance windows in the background
  conflicts = 'auto' | [{ a, b, start, end }] | null,
  conflictTone = 'bad' | 'warn',
  title?, nameWidth?, minPxPerHour?, minBar = 4,
  onRow?: (row) => void, onItem?: (row, item) => void,
})  // → element with .conflicts
```

- An item without `end` is a point in time. `band` draws frequent runs as a quiet band instead of a bar per run.
- `conflicts: 'auto'` marks rows and bars of `heavy` rows whose runs overlap in different rows (`scale.findConflicts()` is the function behind it); they
  turn red, or with `conflictTone: 'warn'` yellow, for boards where an overlap is a risk and not a failure.
- The axis fits the container width, never scrolling sideways (`minPxPerHour` opts back into scrolling). From 560 px container width the names sit in a
  column on the left, below that above the track.
- Bars and cells are dense data points. A timeline with `onItem` passes `onRow` too: the row is the large touch target. A board that uses `onItem` (or
  `heatRow` with `onItem`) needs the kit's two touch exceptions `timeline-bars-touch` and `heat-cells-touch` from `tools/verify/exceptions.json` in its
  own exceptions file.

## scale

`scale` exports the chart maths for boards that need their own numbers on the same axes (all are pure functions, tested in Node): `extent`, `linear`,
`niceStep`, `niceDomain`, `ticks`, `timeTicks`, `tzOffset`, `nearestIndex`, `stack`, `linePath`, `areaPath`, `arcPath`, `findConflicts`.
