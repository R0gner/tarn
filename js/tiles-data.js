// @ts-check
// tarn · tiles layout, pure: how many columns for n tiles in a given width, and how wide each tile is so that every row closes.
// A grid of auto-fill columns leaves a ragged last row (5 tiles in 3 columns: 3 + 2 with an empty cell). fitTiles() balances the rows (5 tiles where 4 fit: 3 + 2,
// not 4 + 1) and gives the tiles of an incomplete row more width, in whole parts of a common grid (lcm), so the rows end at the same edge.

const gcd = (/** @type {number} */ a, /** @type {number} */ b) => (b ? gcd(b, a % b) : a);
const lcm = (/** @type {number} */ a, /** @type {number} */ b) => (a * b) / gcd(a, b);

/**
 * @param {number} n number of tiles
 * @param {number} width width of the container in px
 * @param {{ min?: number, gap?: number, minCols?: number }} [o] min: narrowest tile (default 150), gap between tiles, minCols: columns even when they get narrower than min (default 2, phones)
 * @returns {{ cols: number, grid: number, spans: number[] }} cols: tiles in a full row · grid: number of grid columns to use · spans: columns each tile takes (one entry per tile)
 */
export function fitTiles(n, width, { min = 150, gap = 8, minCols = 2 } = {}) {
  if (n <= 0) return { cols: 1, grid: 1, spans: [] };
  const cap = Math.max(Math.min(n, minCols), Math.min(n, Math.floor((width + gap) / (min + gap)) || 1));
  const rows = Math.ceil(n / cap);
  const cols = Math.ceil(n / rows);                      // balanced: as even as the number of rows allows
  const last = n - cols * (rows - 1);                    // tiles in the last row (1..cols)
  const grid = last === cols ? cols : lcm(cols, last);
  const full = grid / cols, wide = grid / last;
  return { cols, grid, spans: Array.from({ length: n }, (_, i) => (i < cols * (rows - 1) ? full : wide)) };
}
