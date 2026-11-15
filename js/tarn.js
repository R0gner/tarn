// @ts-check
// tarn · Barrel export (core + ops shell). Boards import only from here:
//   import { createApp, dataSource, card, table, … } from '/tarn/js/tarn.js';
// Pages without the shell import from core.js instead.
import './locales/shell.js';   // shell texts
export * from './core.js';
export { boardSwitcher, boardGrid, boardIcon } from './boards.js';
export { normalizeBoards } from './boards-data.js';
export { parseHash, buildHash } from './router.js';
export * from './components.js';
export { table } from './table.js';
export { filterBar, matchFilters } from './filterbar.js';
export { confirm } from './confirm.js';
export { actionRun } from './actionrun.js';
export { openSheet } from './sheet.js';
export { markdown } from './markdown.js';
export { dataCard } from './datacard.js';
export { dataSource, promSource, combineSources } from './data.js';
export { promEscape, promValue, RANGE_PRESETS } from './prom-data.js';
export { createApp } from './shell.js';
export { notifications, openNotifications, notificationsPanel, openInstallHint } from './notifications.js';
export { createNotifications, manualInstall } from './notifications-data.js';
export { log, toast, usageBar, menu } from './widgets.js';
export { lineChart, barChart, sparkline, donut, heatRow, timeline, scale } from './charts/index.js';
