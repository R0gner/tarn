# Releasing Tarn

One command from a green release branch to a pushed tag: `tools/release.mjs`. Default is a dry run that prints every step; only `--yes`
changes anything. GitHub then runs `verify` on main (plus the selftest as a parallel job; not on the tag, which is the tree main just verified), and `release.yml` creates the GitHub release from the CHANGELOG section.

```
node tools/release.mjs                 # dry run: preflight for real (read-only + git fetch), every changing step printed as "would run"
node tools/release.mjs --yes           # the release
node tools/release.mjs --yes --jobs 4  # same; --jobs is passed to the full selftest if it has to run
```

## Before you run it

On the release branch (e.g. `r12`), in its own worktree:

1. The change is committed; the version is bumped in **all four** places: `VERSION`, `js/version.js`, `package.json`, and the top
   section `## X.Y.Z` of `CHANGELOG.md` (a test keeps the first three equal; the script checks all four).
2. The branch is rebased onto `origin/main` (the script refuses otherwise; a release is always a fast-forward of main).

## The pre-push hook (optional, per clone)

`.githooks/pre-push` runs `node tools/verify.mjs --only tests,lint,types` (about 3 s, no browser) before every `git push`, so a red unit test or a lint
finding never leaves the machine. Enable it once per clone (nothing sets it globally):

```
git config core.hooksPath .githooks
```

`tools/release.mjs` pushes with the same hook, so a release also runs it. Skip it once, knowingly, with `git push --no-verify`.

## What the script does

| Step | What | Refuses when |
|---|---|---|
| 1 preflight | clean tree · on a branch that is not main · `git fetch origin --tags` · `origin/main` and local `main` are ancestors of HEAD · the four versions agree · `vX.Y.Z` is newer than the newest tag and does not exist · `tools/release-notes.mjs` finds a non-empty section | any of these fails – nothing is changed |
| 2 gates | a **green verify stamp for exactly this tree** (see below) counts as the gate; without one the full selftest runs now: `node tools/verify.mjs --full --selftest` | the selftest is not green |
| 3 main | fast-forward main to HEAD: `git -C <main worktree> merge --ff-only <sha>` when main is checked out somewhere (e.g. `/home/pete/src/tarn`), else `git update-ref` with the old value as guard | main's worktree has changes, or no fast-forward |
| 4 tag | `git tag -a vX.Y.Z -m X.Y.Z <sha>` (annotated, message = version, as all earlier tags) | tag exists |
| 5 push | `git push --atomic origin main vX.Y.Z` – both or neither | remote refuses |

Exit 0 done or dry run complete · 1 a check failed (the output says which; nothing after it ran) · 2 usage/environment.

## The verify stamp

`node tools/verify.mjs --full --selftest` writes, when it is green, a stamp
`<git common dir>/tarn-verify/stamps/<tree>.json`, where `<tree>` is the content hash of all tracked and untracked files
(`tools/lib/tree.mjs`, the same identity `--base-report` uses). Conditions: own headless Chrome (no `--base`/`--attach`), and the tree is
the same at the start and at the end of the run (an edit during the run means no stamp).

Because the git directory is shared by all worktrees and the key is the content, a green full selftest that a child ran in
`tarn-r12` on exactly the tree that is released counts for main in the same clone: main does not need to run it again. Any change to any
file – code, test, snapshot, verify tool, docs – is another tree and needs a new run. A stamp is older than 14 days → not accepted.

Limits (deliberate): the stamp is local evidence, never committed or pushed. It does not record the Chrome version as part of the key –
a Chrome update between the child's run and the release is not caught by it (CI on GitHub runs `verify` on the pushed tree with its own
Chrome). To force a fresh run: delete the stamp file (the dry run prints whether one was found).

## Board side: shipping a kit release into a consumer (e.g. the Homelab Board)

For a board that vendors the kit (`web/vendor/tarn`), after the kit tag exists. Run in the board's feature worktree, never in the
live checkout. Steps in order; stop at the first red one.

1. **Kit copy is the tagged version:** `node <kit>/tools/vendor.mjs --to web/vendor/tarn` from a kit checkout at the tag (or the same tree),
   then `node <kit>/tools/vendor.mjs --to web/vendor/tarn --check` → exit 0, version = the tag, no local changes.
   `cat web/vendor/tarn/VERSION` = X.Y.Z.
2. **Board gates** (one after another, never two verify runs at once):
   - `python3 -m unittest discover -s <each tests folder>` (Homelab Board: `web/tests`, `updater/tests`, `push/tests`, `collector` if it has tests)
   - the board's node tests (`node --test web/tests/` or what its README names)
   - `TARN_KIT=<kit checkout at the tag> web/verify/run.sh` → exit 0 (lint + verify of all fixture variants; ~3 min)
3. **Commit** the vendor update and board changes; the README's "Kit-Stand" line names the tag (not a branch).
4. **Rebase onto the consumer's main:** `git fetch origin && git rebase origin/main`. After a rebase that brought new commits, rerun step 2
   (another tree). If the rebase was a no-op, the gates from step 2 still hold.
5. **Fast-forward main** in the consumer's main checkout: `git -C <main checkout> merge --ff-only <feature branch>` (that checkout must be
   clean; no merge commits), then `git -C <main checkout> push origin main`.
6. **Check what is served:** the live board serves the main checkout directly, so after the ff the new files are live (a browser needs a
   reload; the service worker updates on its own schedule). `curl -fsS <board URL>/vendor/tarn/VERSION` = X.Y.Z and `/healthz` answers.
   If the server process caches files or the change touches `server.py`, the board's service needs a restart – that is an operator step.

A script for these steps belongs in the consumer's repo (it knows its tests folders, URL and checkout); this list is its specification.
