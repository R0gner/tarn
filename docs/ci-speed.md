# Check time: baseline and plan (stage 1, 24.11.2026)

Goal: a faster loop **without checks that lie**. Two rules outrank speed: the full suite (`verify --full --selftest`) runs on the
exact tree before it reaches main – selection only narrows the feedback while editing; and no speed from hiding failures (no retries,
wider timeouts or skipped checks).

## Baseline

Host: 16 threads, 30 GB; during all runs load 15–23 and I/O pressure "full" 43–71 % from another disk (noisy: compare per-task averages,
which stayed within 5 % between runs). Kit v0.16.0 (9567363), `node tools/verify.mjs --full --selftest --jobs N`, all green.

| --jobs | wall | of it verify | of it selftest | CPU (node + Chrome) |
|---|---|---|---|---|
| 2 (today's habit) | **349 s** | 220 s | 129 s | 34 % of one core |
| 4 (the tool's default here: min(4, cores/2)) | **190 s** | 114 s | 75 s | 64 % |
| 6 | **143 s** | 83 s | 59 s | 91 % |
| 8 | killed: an agent's exec memory bound (7.3 GiB) – ~0.9 GiB per Chrome worker | | | |

Worker time per phase (sum over tasks, independent of --jobs): mutants 231 s (78, avg 3.0 s) · overlay 226 s (148 scenarios) ·
geometry 112 s (410 states; **72 s of it is `settle`**, waiting for calm; the probe itself 11 s) · tempo inventory 69 s (36 page loads) ·
snapshots 30 s (118). Without a browser: tests 2.2 s (245), lint < 1 s, types 0.9 s. Serial selftest extras (board control, types/layers
mutants, isolation): ~15 s. The slowest tasks are the image viewer: scenario `image-zoom` 11–13 s per size, its 7 mutants 77 s = **33 % of
all mutant time**. `tools/verify/overlay.mjs` has 132 fixed `sleep()` calls.

**The checks are waiting, not computing**: per-task times do not grow with more workers, CPU stays far below the host's capacity, so wall time
scales almost linearly with --jobs. `--jobs 2` throws half of it away.

GitHub Actions (`verify.yml`, last 30 runs): job 3.6–4.2 min; waiting/setup 2–12 s (checkout, setup-node; nothing worth caching); the verify
step itself 216–226 s (ubuntu-latest has 4 vCPU → default 2 workers); no selftest. Every release runs verify **twice on the same tree**
(push of main and push of the tag).

A round (r10 from commit times, no session timings visible): feature commit 09:22 → snapshot fix 09:30 → full selftest red at main
(stale mutant patch) → fix 10:01 → tag 10:08. Gates of a green round at --jobs 2 (estimate from the phases): child 2–3× verify
(~3.7 min each) + targeted mutants, main full selftest 6 min, board gates ~4 min (run.sh ~3 min + unit/node tests) ≈ **20–25 min**;
a red full selftest at main adds a child round trip (**+30 min** in r10).

So: the suite is a large share of a round, but the biggest buckets are **duplication** (main reruns what a child ran), **--jobs 2**, and
**red at main** – not the number of tests.

## Proposal, ranked by minutes saved per round vs. risk

| # | Change | Saves per round | Risk |
|---|---|---|---|
| 1 | **Drop `--jobs 2`** (the default is already 4 here); final full selftest with `--jobs 6`. Max 6 under an agent's exec memory bound. | full selftest 349 → 190 s (j4) / 143 s (j6); with loops **−5 to −8 min** | low: identical findings at 2/4/6, no contention seen |
| 2 | **Verify stamp** *(built in this stage)*: a green `--full --selftest` writes `<git common dir>/tarn-verify/stamps/<tree>.json`; `tools/release.mjs` accepts it instead of rerunning. Keyed on the content hash of all files, shared by all worktrees. | main skips one full selftest: **−3 to −6 min** | low: any file change = new run; Chrome version not in the key (CI on GitHub covers a fresh Chrome) |
| 3 | **The child's last step is the full selftest on the final tree** (after the version bump and CHANGELOG), and the handover names the `Stamp:` line. Main's release refuses otherwise (release.mjs runs it again then). | avoids the red-at-main round trip: **−30 min when it happens** (r10) | none; `tests/mutants.test.mjs` (every patch applies, 2 s) already catches the r10 class earlier |
| 4 | **Wait for events, not for time** (stage 2, one scenario per step, before/after numbers): image-zoom first (13 s → target 4 s), then `settle` and the fixed sleeps in overlay.mjs. Proof per step: all 78 mutants still detected, the changed scenario 20× green in a row. | worker time −25–35 % → full selftest j4 ~190 → ~130 s, **−1 to −2 min** | medium: a shorter wait can flake – that is a bug to fix, never a retry |
| 5 | **Edit loop with selection**: `--changed` already narrows geometry/snapshots/overlay by a file→view map (`tools/verify/changed.mjs`; tests, lint, types always run; tempo only with everything; tokens/CSS/shell/router/components = everything). Add `--selftest --changed`: only mutants whose page/views/scenarios or patched files are in scope, all of them when `tools/` changes. Prove it with a test that hides a change from the map on purpose and expects the mutant to be selected. | loops on gallery/example/single components: 3–4 min → < 1 min; kit-core edits: no gain | low for the loop; the release still needs the full stamp |
| 6 | **CI**: no verify on tag pushes (`tags-ignore` – the tag is the tree main just verified); on push to main a second, parallel job `--selftest --jobs 4` so GitHub also proves the mutants with a clean Chrome. No caching needed (setup ≤ 12 s). | GitHub −4 runner-min per release; no human wait (CI is not on the critical path) | low |
| 7 | **Budgets visible**: verify prints worker seconds per phase; the report flags a full selftest > 240 s at j4. A **pre-push hook** (`.githooks/pre-push` → `verify --only tests,lint,types`, 3 s) instead of a line in AGENTS.md. Failing on a budget only once the host is quiet. | indirect: drift is seen at once | none |

## Value of the checks (candidates, nothing deleted)

CHANGELOG never says "found by verify", so fault provenance is not recorded – start recording it (stage 2), otherwise pruning stays a guess.
Mutant comments name the real faults they replay ("earlier banner fault", "round 9 F1", "TN-26 follow-up"): **50 of 78 mutants are
patches of kit JS that a scenario must catch** – real regression tests, high value. Their cost is maintenance: `mutants.mjs` changed in
44 of 141 commits; 17 patch `js/shell.js`.

| Candidate | Why (prune-tests criterion) | Risk if changed |
|---|---|---|
| 7 image-zoom mutants (33 % of mutant time) | possibly several guard the same behaviour ("duplicate") – check pairwise which finding each one produces | a gesture regression slips |
| Snapshots (118; 46 of 141 commits touch them, often rewritten together with the change) | coupled to the implementation, not to behaviour | an unintended DOM change goes unseen |
| Tempo inventory: 36 own page loads (69 s) | same pages that geometry loads anyway – reuse the load, same checks | low |
| Geometry light theme on all 5 sizes | themes differ in colour, rarely in geometry – first count findings per theme in old reports | a light-only overflow (borders, fonts) |

## Stage 2 (after review)

1 as the documented habit (AGENTS.md, briefings), 3 as the handover rule, 4 step by step with numbers, 5 with the hidden-change test, 6 and 7.
The board side gets its own script from the list in [releasing.md](releasing.md) (in the homelab repo).
