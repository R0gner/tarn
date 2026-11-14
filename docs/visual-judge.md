# Visual judge (optional, experimental)

A second layer after the deterministic [checks](checks.md): a decision model looks at screenshots and marks the ones that look broken. For anyone who
has a green `verify` after a larger UI change and wants one more pair of eyes on coarse faults.

**It is not part of the kit's checks.** `verify`, `lint` and CI never run it and never need a key. It needs its own API key, read from the environment
(`TYPESAFEAI_API_KEY`); there is one provider today, TypeSafe Jev (`jev-latest`). On the calibration set below it marked 12 of the 25 pictures with a
visible fault and 23 of the 167 clean pictures. Treat a marked picture as a reason to look, not as a finding, and never use the judge as a gate: it exits 0
even with marked pictures.

## What it does

`node tools/judge.mjs` takes a picture of every page × view × size × theme (the capture path of verify), asks the model five yes/no questions about each
picture, one per fault type, and prints at most ten lines: the pictures marked for a look, the calls made, the calls the cache saved and the cost.

| Fault type | The question is whether … |
|---|---|
| `overflow` | something sticks out of its box or the screen |
| `overlap` | elements overlap |
| `clipped` | text is cut without an ellipsis, or a word is chopped |
| `misaligned` | a row or grid is out of line, tiles are ragged |
| `malformed` | a control looks broken (a toggle knob outside its track, a squeezed segmented control) |

`judge-report.json` in `--out` lists every marked picture with its path; look at those pictures only.

```sh
export TYPESAFEAI_API_KEY=…                                       # read from the environment, sent in one header, never printed or stored
node tools/judge.mjs --pages gallery --views cards,inputs --sizes phone,desktop    # a few pictures (default pages: gallery, board, starter)
node tools/judge.mjs --dry-run                                    # capture and look up the cache, ask nothing: how many calls would a real run make?
node tools/judge.mjs --max-usd 0.05                               # stop before the run would cost more (default 0.10)
node tools/judge.mjs --mock recorded.json                         # answer from a recorded JSON, no key and no network
```

Without a key the tool refuses to run (exit 2) unless `--dry-run` or `--mock` is given. Further options: `--themes`, `--jobs`, `--out`, `--chrome`,
`--cache FILE`, `--max-total-usd`.

**What leaves the machine:** only pictures of pages with invented data. The choices are the pages of `tools/verify/targets.mjs` (gallery, sample board,
starter); the tool takes no URL. Do not point a board with real data at it.

## Cost and cache

The price is per input token: $0.042 per million, output free (`PRICE_PER_MTOK` in `tools/lib/judge.mjs`). One picture is one call with all five
questions and about 3,300 tokens, so about **$0.00014 per picture**; 100 pictures cost about 1.4 cents. The cost of every call comes from the
`usage.input_tokens` the API reports; `judge-ledger.jsonl` (next to the cache) books every call, a failed one with cost 0. A run estimates the next call
from the tokens seen so far and stops before it would pass `--max-usd`; `--max-total-usd` does the same for everything ever booked in the ledger.

**Never pay twice:** the cache key is the sha256 of the PNG bytes plus the question-set version (`QUESTION_SET_VERSION`, which changes whenever a question
or the way a picture is prepared changes). Verdicts live in `$XDG_CACHE_HOME/tarn/judge-verdicts.json` (default `~/.cache/tarn/`; `--cache FILE`
overrides). A second run over unchanged pictures makes zero calls. For the bytes to stay the same the capture uses the fixed clock of the snapshots,
switches animations, transitions and the caret off, and repeats the screenshot until two in a row are identical; about 1 picture in 70 still differs from
run to run (the foundations view) and costs one more call.

## Calibration

The labelled test set is free: the CSS and script mutants of `verify --selftest` are known faults, the same states without the mutant are clean.

```sh
node tools/judge.mjs --calibrate --with-clean --pages gallery,board,starter,gallery-comfortable,starter-comfortable --sizes phone,desktop,phone-s --themes dark,light
```

photographs 167 clean pictures and 26 pictures of 13 mutants, asks, and prints the table. The threshold per fault type (`THRESHOLDS` in
`tools/lib/judge.mjs`) is the lowest score (steps of 0.05, from 0.30) at which at most 5 % of the clean pictures are marked for that type. They were
measured on the same pictures they are judged on, so the numbers are optimistic. Last run: `jev-latest` = `jev-1.14.0`, 202 pictures, about 3.5 cents.

| Fault type | Threshold | Clean pictures marked | Faults of this type found by their own question |
|---|---|---|---|
| overflow | 0.85 | 4 of 167 | 3 of 5 |
| overlap | 0.50 | 8 of 167 | 2 of 2 |
| clipped | 0.65 | 8 of 167 | 3 of 7 |
| misaligned | 0.65 | 7 of 167 | 2 of 3 |
| malformed | 0.65 | 7 of 167 | 1 of 8 |
| any question | – | **23 of 167 (14 %)** | **12 of 25 pictures with a visible fault (48 %)** |

## When it helps, and when it does not

- **Run it** after a larger UI change, when the deterministic checks are green. `verify` finds what it can measure (overflow, overlap, truncation, touch
  targets, alignment); the judge looks at what a person would see.
- **It finds coarse faults:** tile overlap, ragged tiles, a banner path overflowing, a word broken letter by letter, a squeezed segmented control at 340 px.
  A toggle thumb outside its track shows on a desktop picture but not on a 390 px phone (the thumb sticks out by 8 px). The deterministic checks (`contained`,
  `scroll-x`) find both every time.
- **It does not catch** anything of a few pixels (a button 3 px out of line, touch targets 8 px smaller, a missing ellipsis in a narrow row, a crowded
  toolbar title), anything below the first screen of a view (the picture is the viewport, at most 1568 px on a side), behaviour (focus, menus, taps,
  notifications: that is what the overlay scenarios are for) and colour contrast.
- **It marks clean pictures:** about one in seven. The false alarms repeat in the same dense views (`gallery/shell`, `gallery/markdown`, `gallery/cards`,
  `gallery/rows`, `gallery/feedback`, `board/history`) in both themes: look once and move on. A score is a probability from a preview model, not a
  measurement; run the calibration again after a model update.

`tests/judge.test.mjs` tests the request, the cost, the cache, the ledger, the budget stop and the calibration against recorded answers, without network,
key or browser.
