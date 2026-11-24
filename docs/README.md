# Tarn documentation

Reference for the kit, one topic per page. Each page starts with what it covers and for whom. Building a board with a coding agent: start with [Building a board](building-a-board.md). New to Tarn: read [getting started](getting-started.md), then look
at the [gallery](https://r0gner.github.io/tarn/gallery/) and the [demo board](https://r0gner.github.io/tarn/example/) side by side with
[shell](shell.md) and [components](components.md).

| Page | Covers |
|---|---|
| [Building a board](building-a-board.md) | the guide for an agent or person who uses the kit: decisions, steps from nothing to a checked board, rules, kit gaps |
| [What goes on a view](dashboard-guidelines.md) | the content rules: one question per view, no explanations or caveats on the screen, short labels, a number once, where caveats go |
| [Getting started](getting-started.md) | running the kit locally, the four levels, core and shell, what belongs in the kit, including it in a project (git dependency, fixed copy with `vendor.mjs`) |
| [The shell](shell.md) | `createApp`, views and details, routing, layout on phone, tablet and desktop, detail in place, languages and time zones, theme and density, several boards |
| [Components](components.md) | primitives, layout, cards, rows, table, toast, menu, sheets, Markdown, formatters |
| [Charts](charts.md) | line, bar, sparkline, donut, heat row, timeline, chart maths |
| [Data](data.md) | `dataSource`, freshness and stale data, what the server has to give |
| [Inputs, filters, forms and actions](inputs-and-actions.md) | input fields and validation, filter bar, forms, confirm, running actions |
| [Notifications](notifications.md) | web push, browser half: sheet, server interface, service worker |
| [Identity, icons, installing](identity.md) | favicon and title, `brand.mjs`, Lucide icons, install entry and manifest |
| [Checks](checks.md) | `verify`, `lint`, board mode with `tarn-board.json`, `tempo`, `shoot` |
| [Releasing](releasing.md) | `tools/release.mjs` (preflight, verify stamp, ff main, tag, push), shipping a release into a board |
| [Visual judge](visual-judge.md) | the optional, experimental picture check; never a gate |
| [Design language and tokens](design.md) | principles, colours, status, type, spacing, density, motion, overlays, fonts, licence |

Other files: [AGENTS.md](../AGENTS.md) holds the rules for agents that build or change a board; [CHANGELOG.md](../CHANGELOG.md) lists every change per
version. This folder is documentation only: it is not part of a vendored copy or of the npm package.
