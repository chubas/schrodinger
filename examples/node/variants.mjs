// The engine doesn't generate rotated or mirrored tiles for you: tiles are
// plain data, so you generate the variants you want and pass them all in.
//
//   npm run build && node examples/node/variants.mjs
import { WFC, SquareGrid } from '../../dist/index.js';

// SquareGrid sides are [top, right, bottom, left].
// Rotating a tile 90 degrees clockwise moves each side to the next one.
const rotate = (sides) => [sides[3], sides[0], sides[1], sides[2]];
// Mirroring left-right swaps the right and left sides.
const mirror = (sides) => [sides[0], sides[3], sides[2], sides[1]];

// All distinct rotations (and optionally mirror images) of one base tile.
function variants(name, sides, { mirrored = false, weight = 1 } = {}) {
  const seen = new Set();
  const result = [];
  const candidates = [];
  for (const base of mirrored ? [sides, mirror(sides)] : [sides]) {
    let current = base;
    for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
      candidates.push({ sides: current, quarterTurns, mirrored: base !== sides });
      current = rotate(current);
    }
  }
  for (const { sides: s, quarterTurns, mirrored: m } of candidates) {
    const key = s.join(',');
    if (seen.has(key)) continue; // e.g. a straight pipe only has 2 distinct rotations
    seen.add(key);
    result.push({ name: `${name}-${m ? 'm' : ''}${quarterTurns * 90}`, adjacencies: s, weight });
  }
  return result;
}

const tiles = [
  { name: 'empty', adjacencies: ['0', '0', '0', '0'], weight: 3 },
  ...variants('straight', ['1', '0', '1', '0']), // 2 variants
  ...variants('corner', ['1', '1', '0', '0']), //   4 variants
];
console.log(`${tiles.length} tiles:`, tiles.map((t) => t.name).join(', '));

const grid = new SquareGrid(20, 6);
const wfc = new WFC(tiles, grid);
wfc.start();

const glyph = { empty: ' ', 'straight-0': '│', 'straight-90': '─', 'corner-0': '└', 'corner-90': '┌', 'corner-180': '┐', 'corner-270': '┘' };
const rows = Array.from({ length: 6 }, () => '');
for (const [cell, [, y]] of wfc.iterate()) rows[y] += glyph[cell.value.name];
console.log(rows.join('\n'));
