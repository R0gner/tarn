# Inputs, filters, forms and actions

Everything a user types, filters or triggers: input fields with validation, the filter bar, forms that are sent, the confirmation before a dangerous
step and the live view of a running action. For a board author whose board does more than display. Never write a bare `<input>`, `window.confirm`,
`alert` or `prompt`; the kit parts below carry the validation, the touch sizes, the overlay layer and the translations.

```js
import { field, textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange,
         filterBar, matchFilters, form, confirm, actionRun, openSheet, toast } from '/tarn/js/tarn.js';
```

The input primitives and `form` also come from `/tarn/js/core.js` for plain pages; `filterBar`, `confirm` and `actionRun` belong to the shell.

## Inputs

All inputs share one contract (the root element is returned): `el.focusEl` (the focusable element), `el.getValue()`, `el.setValue(v)` (fires no
`onChange`), `el.setInvalid(bool)`, `el.setDisabled(bool)`; `input` and `change` events bubble as usual. On a phone the touch target is 44 px
(`--tn-input-h`). Numbers and dates use the native `<input>` (right keyboard and picker); only the combobox has its own popover (in the overlay layer, so
it works inside a sheet).

```js
field({ label: t('job.name'), help: t('job.nameHelp'), required: true }, textField({ value: job.name, placeholder: 'offsite-sync' }));
field({ label: t('job.timeout') }, numberField({ value: 30, unit: 'min', min: 1, max: 120 }));
field({ label: t('job.host') }, combobox({ options: hosts.map((x) => ({ value: x.id, label: x.name, hint: x.role })), value: 'nas-a' }));
field({ label: t('job.hosts') }, combobox({ options, multiple: true, value: [] }));                   // checkmarks, stays open
field({ label: t('job.period') }, dateRange({ from, to, onChange: ({ from, to }) => … }));             // presets today, 7d, 30d, month
checkbox({ label: t('job.dry'), help: t('job.dryHelp'), checked: true });   toggle({ label: t('job.enabled'), onChange: (on) => … });
```

| Input | Options (besides `className`, `name`, `label` = aria-label, `disabled`, `invalid`) |
|---|---|
| `textField` | `value`, `type` (`text search url email password tel`), `rows` (multi-line), `placeholder`, `maxlength`, `autocomplete`, `inputmode`, `mono`, `prefix`, `suffix`, `onInput`, `onChange` |
| `numberField` | `value`, `unit`, `min`, `max`, `step`, `placeholder`, `onInput`, `onChange` (both get `NaN` for text that is not a number) |
| `select` | `options: [{ value, label, disabled?, hint? }]`, `value`, `placeholder`, `onChange` |
| `combobox` | `options`, `value` (a value, or an array with `multiple`), `multiple`, `placeholder`, `searchPlaceholder`, `search`, `onChange` |
| `checkbox`, `toggle` | `checked`, `indeterminate`, `label`, `help`, `onChange(checked)` |
| `dateField` | `value` (`'YYYY-MM-DD'`, with `time: true` a local date-time), `min`, `max`, `onChange` |
| `dateRange` | `from`, `to`, `presets` (default `today`, `7d`, `30d`, `month`), `min`, `max`, `onChange({ from, to })` |

- **`field(opts, control)`** adds label, help and error text, `aria-describedby`, `aria-invalid` and **validation**:
  `rules: { required, min, max, minLength, maxLength, pattern, number, validate }`. It runs when a value is committed and re-runs while an error is shown.
  Rule texts come from the catalog (`validate.*`); a custom `validate(value)` returns its own text. The element has `validate()`, `setError(text)`,
  `setHelp(text)`.
- **`select` or `combobox`:** `select` is native and for up to about 8 options; more options → `combobox` (search field from 7 options, single or multiple
  choice, arrow keys and Enter, Esc closes the popover first, a list of more than 100 matches shows the first 100). On touch devices the search field is not
  focused automatically, because the keyboard would cover the list.
- Dates are calendar days (`'YYYY-MM-DD'`, no time zone); `dayStart(day, timeZone)` turns one into a point in time.
- Logic without DOM, exported for your own code and tests: `parseNumber` (decimal comma and point), `validateValue`, `filterOptions`, `rangeFromPreset`,
  `dayStart`, `isoDay`, `addDays`.

## Filters

`filterBar({ filters })` is a search field plus a filter sheet; the type of each filter decides its control and the text of its chip.

| `type` | Control | State value | Chip |
|---|---|---|---|
| `options` (default) | pills; above `pills` values (default 8) a combobox | `string[]` | `Status: Error` |
| `bool` | segment *All · Yes · No* (`labels: { yes, no }`) | `true` / `false` | `Failed: Yes` |
| `range` | from/to number fields with `unit`, `min`, `max`, `step`, `format` | `{ min?, max? }` | `Duration ≥ 10 min`, `10–20 min` |
| `time` | presets (default `1h 24h 7d`; `6h` and `30d` are available through `presets`) plus an own period (`custom: false` removes it) | `{ preset }` or `{ from?, to? }` (days) | `Last run: last 24 hours` |

```js
const fb = filterBar({
  placeholder: t('jobs.search'), value: state, onChange: (s) => { state = s; render(); },
  filters: [
    { key: 'status', label: t('col.status'), options: STATUS_OPTIONS },      // options: [{ value, label, count? }], single?: true
    { key: 'failing', label: t('jobs.failing'), type: 'bool' },
    { key: 'duration', label: t('col.duration'), type: 'range', unit: 'min' },
    { key: 'last', label: t('col.lastRun'), type: 'time', presets: ['1h', '24h', '7d'] },
  ],
});
rows.filter((row) => matchFilters(row, state.f, (row, key) => ({ failing: row.fails > 0, duration: row.sec / 60, last: row.lastAt })[key] ?? row[key]));
```

- The state is `{ q, f }`: the search text and a map from filter key to value. `matchFilters(row, f, get?, { now?, timeZone? })` applies every type (the type
  follows from the value); `get(row, key)` reads a value that is not simply `row[key]`. A row without a number or a time does not match a range or time
  filter. `matchQuery(text, query)` does the search words.
- `filterBar({ count })` is a function `(state) => string` for a result counter next to the bar. The element has `state`, `set(partial)` and `refresh()`.
- The filter sheet has one calm group per filter with its own *Clear*. Its controls are built once and only synchronised afterwards, so the focus stays
  where the user is. When a view is redrawn for new data the filter bar is built again from the board's state (`filterBar({ value: state })`): the shell
  gives focus and caret back to the field the user was typing in.
- Long results: `table({ pageSize })` draws the first 20 rows (`0` = all) and *Show more* adds the next ones. Drawing rows, not filtering, is what costs time.

## Forms

```js
const f = form({
  fields: [
    { name: 'host', type: 'combobox', label: t('dep.host'), required: true, options },
    { name: 'version', label: t('dep.version'), required: true, rules: { pattern: /^\d+\.\d+\.\d+$/ } },
    { name: 'dry', type: 'checkbox', label: t('dep.dry'), value: true },
  ],
  submitLabel: t('dep.start'),
  onSubmit: async (v) => {
    if (!(await confirm({ title: t('dep.confirm', v), danger: !v.dry, typeToConfirm: v.dry ? undefined : v.host }))) return;
    const run = await api.deploy(v);                      // return { errors: { version: '…' } } or { error: '…' } to report a failure
    box.replaceChildren(actionRun({ source: `/api/runs/${run.id}`, title: …, onCancel: () => api.cancel(run.id) }));
    toast(t('dep.started'), { tone: 'ok' });
  },
});
```

`form({ fields, value, submitLabel, runningLabel, cancelLabel, danger, onSubmit, onSuccess, onCancel, actions, className })`

- A field is `{ name, type?, label?, help?, required?, rules?, value?, … }`. `type` is one of `text url email password tel search textarea number select combobox
  checkbox toggle date datetime dateRange` (default `text`); further keys go to the input of that type (`options`, `unit`, `min`, `placeholder`, …). `control`
  takes a ready-made input instead.
- The form validates all fields first (errors on the fields, focus on the first one, “Please fix the marked fields.”). Then the submit button shows
  *Running …*, the fields are locked, and a second submit (click, Enter, double tap) is ignored until `onSubmit` has finished.
- `onSubmit(values)` may return `{ errors, error }` or throw: `errors` appear on the fields, `error` in the form; the values stay. Anything else goes to
  `onSuccess(result)`. `danger` makes the submit button red; `onCancel` adds a cancel button.
- In a sheet pass the buttons as footer: `openSheet({ body: f, footer: f.buttons() })` (`actions: false` leaves them out of the form; they are linked to the form, Enter
  submits). The element has `values()`, `setErrors(map)`, `setError(text)`, `submit()`, `busy` and `fields`.

## Confirm

`confirm({ title, text, danger, typeToConfirm, confirmLabel, cancelLabel })` → `Promise<boolean>`: a centred modal dialog above everything, open sheets
included. `danger` puts the focus on *Cancel*. `typeToConfirm` keeps the confirm button disabled until the text (the host name, say) is typed exactly; case
matters, surrounding spaces do not.

## Running an action

`actionRun({ source, title, intervalMs = 2000, maxLog = 300, onCancel, onDone })` shows a run: status badge, elapsed time, progress (a bar with a percentage
when `progress` is known, else indeterminate), a live `log()` that sticks to the bottom unless the user scrolls up, and an optional *Cancel run* button
(shown while the run is pending or running, when `onCancel` is given).

`source` is a function `(signal) => run` or a same-origin URL that answers with:

```json
{ "status": "pending | running | ok | bad | cancelled", "startedAt": 1788000000000, "endedAt": null, "progress": 0.4,
  "log": [{ "t": 1788000001000, "level": "info", "text": "step 1" }], "message": "…" }
```

All fields except `status` are optional; times are epoch milliseconds, `progress` 0–1. An unknown status counts as `running` (polling continues). It polls
every `intervalMs` until the status is final (`ok`, `bad`, `cancelled`) or the element leaves the page (no WebSocket needed). A failing poll shows a note
and retries; after 8 failed polls in a row it stops and offers *Try again*. The element has `stop()`, `refresh()` and `run`.

## Rules for boards

- **Every action gives feedback** (`toast` or `actionRun`), **every dangerous action asks first** (`confirm({ danger: true })`, with `typeToConfirm` when a name
  or data is at stake).
- Fields only through `field()`; several fields that are sent together only through `form()`.
- The sample board's *Deploy* view shows the whole path with a fixture (`example/deploy-steps.json`; nothing is deployed). The gallery views `inputs`,
  `forms` and `actions` show all states.
