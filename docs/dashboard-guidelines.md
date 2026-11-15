# What goes on a view

What belongs on a view and what does not. For an agent or person who decides the content of a board; the other pages say how to use the parts. A
view that follows these rules needs no explanation. `node tools/verify.mjs` checks what a machine can measure ([checks](checks.md#content)).

## The rules

**1. A view answers one question.** Everything on it serves that question; the rest goes into a detail or is left out. When in doubt, leave it out.
Why: every extra element costs a look and hides the one that matters.
Do: the sample board's overview asks "is anything wrong?" – four tiles, Problems, Up next, Recently failed.
Don't: add a "System info" card with version, uptime and host count because the data is there.

**2. The view is understood without explanation.** Text that is always visible to explain the view means the labels, the order or the choice of block
is wrong; fix those instead.
Why: an explanation is read once and then ignored for good, while it keeps taking space.
Do: a section titled "Recently failed" with `3×` and "in 30 runs" in the row.
Don't: a paragraph above the list: "This list shows jobs that failed at least once in their last 30 runs but are OK now."

**3. No disclaimers, caveats or method notes on the screen.** What you are unsure about, what is not covered and how a value is computed go into the
hand-in report (see [Where your caveats go](#where-your-caveats-go)).
Why: the person reading the board cannot act on your doubts; the person who ordered it can.
Do: show the value; write "disk figures exclude network shares" in the report.
Don't: `banner('Note: values are estimates and may be incomplete.', { tone: 'info' })`.

**4. Labels are short nouns, values carry their unit, a sub-line is one fact.** No sentences in tiles, rows, table cells or card titles.
Why: a board is scanned, not read.
Do: `statTile({ label: 'Storage', value: 4.1, unit: 'TB', sub: 'nas-01 · 91 %' })`.
Don't: `sub: 'The fullest host is nas-01, which is 91 % full'`.

**5. A complex display may get one optional explanation, behind an "i".** `card({ info })` or `section(title, { info })`: closed by default, a few
plain sentences, only what is needed to read the display (what a colour or an axis means), never a disclaimer.
Why: the reader who needs it finds it; everyone else is not slowed down.
Do: a timeline card whose info says "Bars are runs today; a red edge marks an overlap with a heavy run."
Don't: the same text as a `footer` under the chart, or an info on a plain list.

**6. Status text says what is the case, not what the system did.**
Why: the reader wants the state; the process behind it is noise.
Do: "3 failed", "Disk 91 %", "No response since 14:02".
Don't: "The check found that 3 jobs have failed", "We detected high disk usage".

**7. Empty and error states are one line and, where it exists, one action.**
Why: an empty list is a normal state, not an event.
Do: `list(items, render, { empty: 'No problems' })`; `error({ text, onRetry })`.
Don't: "There are currently no problems to display. Problems appear here as soon as a job fails or a host stops responding."

**8. Show a number once.** No tile, chart and table that repeat the same value on one view.
Why: a repeated number makes the reader compare two places that say the same.
Do: the tile says "Jobs 24, 2 errors"; the Problems list names the two jobs.
Don't: a tile "Errors 2", a donut "2 of 24 failed" and a "Failed: 2" line in a card on the same view.

**9. Overview first, worst first.** The start view shows state (tiles, then what is red or yellow, worst first); the reason and the history live in
the detail, opened in place.
Why: the overview answers "do I need to act?"; the detail answers "why?".
Do: a problem row carries the reason in one line (`metricRow({ wrapSub: true })`) and opens the detail on tap.
Don't: log excerpts, charts per job or a "how to fix" text on the overview.

## How much goes on the overview

Start from the question "do I need to act, and where?". That gives tiles for the few figures with a goal (four to six), a Problems list, and at most
two short lists of what comes next or just went wrong. Everything else needs a reason to be there: name the decision it helps with. If you cannot,
it belongs in a view of its own or in a detail. A view per thing the user looks at (jobs, hosts) holds the full list with filters; the overview only
links into it through tiles and rows. Charts belong on the overview only when the trend is the answer (a sparkline in a tile); a full chart is a
History view.

## Where your caveats go

Into the hand-in report to the person who ordered the board, never onto the screen: what you are unsure about, data you could not get, how a value
is computed, assumptions about thresholds, what a later version should add. A board that needs a caveat to be read correctly has a wrong label or a
wrong block: fix that first (rule 2). The one exception is a display that cannot be read without a key: give it an `info` (rule 5).

## What the checks find

`verify` fails on running text that is always visible in a card, section, tile or row beyond a limit, on an info banner that sits on a view, and on an
`info` text over 280 characters (limits and exceptions: [checks](checks.md#content)). Rules 1, 6, 8 and 9 cannot be checked by a machine, rules 2, 3, 4
and 7 only by length and placement: check those yourself before handing in.
