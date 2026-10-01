// Generating rotated and mirrored tiles from one base tile.
//
//   npm run build && node examples/node/symmetry.mjs
//
// The engine doesn't know about rotations or reflections: they are operations
// on a grid's directions, and often on your edge rules too, so only you know
// what they mean for your tiles. This file is one way to do it. The helpers in
// the first section are small on purpose; copy them into your project and
// change whatever your tileset needs.
import { WFC, SquareGrid, HexagonalGrid } from '../../dist/index.js';

// ---------------------------------------------------------------------------
// 1. A grid's symmetries are data: permutations of its side indices.
//    `permutation[i]` says which old side ends up on side i.
// ---------------------------------------------------------------------------

// SquareGrid sides are [top, right, bottom, left]. Turning a tile 90 degrees
// clockwise moves its left side to the top, its top to the right, and so on.
const SQUARE = {
  rotate: [3, 0, 1, 2],
  angle: Math.PI / 2, // one rotation step, for canvas drawing
  mirrors: {
    x: [0, 3, 2, 1], // left-right: swap left and right
    y: [2, 1, 0, 3], // top-bottom: swap top and bottom
  },
};

// HexagonalGrid sides are [N, NE, SE, S, SW, NW], clockwise.
const HEX = {
  rotate: [5, 0, 1, 2, 3, 4],
  angle: Math.PI / 3,
  mirrors: {
    x: [0, 5, 4, 3, 2, 1], // left-right
  },
};

const permute = (sides, permutation) => permutation.map((from) => sides[from]);

// ---------------------------------------------------------------------------
// 2. Generating variants.
// ---------------------------------------------------------------------------

/**
 * All distinct rotations of `tile` (and of its mirror images, for the mirror
 * axes you list), as new tiles.
 *
 * - `mirrors`: axes from the symmetry table to include, e.g. ['x'].
 * - `mapRule(rule, { mirrored })`: changes a rule when its tile is mirrored.
 *   The default leaves rules alone, which is right for plain labels. Rules
 *   that have a direction (like [a>b]) or a reading order need one.
 * - Duplicates (a cross looks the same rotated) are dropped, and the tile's
 *   weight is split between the variants that remain, so a tile keeps the
 *   same total chance however many variants it has.
 * - Each variant's `draw` is wrapped so it draws the transformed picture.
 */
function variants(tile, symmetry, { mirrors = [], mapRule = (rule) => rule } = {}) {
  const steps = symmetry.rotate.length;
  const seen = new Map();

  for (const axis of [null, ...mirrors]) {
    // Mirror first, then rotate.
    let sides = axis ? permute(tile.adjacencies, symmetry.mirrors[axis]).map((r) => mapRule(r, { mirrored: true })) : tile.adjacencies;
    for (let turns = 0; turns < steps; turns++) {
      const key = sides.join('|');
      if (!seen.has(key)) {
        seen.set(key, {
          ...tile,
          name: `${tile.name}${axis ? `~${axis}` : ''}${turns ? `/${turns}` : ''}`,
          adjacencies: sides,
          draw: tile.draw && transformDraw(tile.draw, { turns, angle: symmetry.angle, mirror: axis }),
        });
      }
      sides = permute(sides, symmetry.rotate);
    }
  }

  const result = [...seen.values()];
  return result.map((variant) => ({ ...variant, weight: (tile.weight ?? 1) / result.length }));
}

/**
 * Wraps a canvas-style draw(ctx, x, y, w, h) so it draws rotated by `turns`
 * steps of `angle`, after an optional mirror ('x' = left-right, 'y' = top-bottom),
 * around the middle of its cell. Works with any Canvas 2D-style context
 * (p5's drawingContext, a <canvas>, ...).
 */
function transformDraw(draw, { turns, angle, mirror }) {
  if (!turns && !mirror) return draw;
  return (ctx, x, y, w, h) => {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(turns * angle);
    if (mirror) ctx.scale(mirror === 'x' ? -1 : 1, mirror === 'y' ? -1 : 1);
    ctx.translate(-w / 2, -h / 2);
    draw(ctx, 0, 0, w, h);
    ctx.restore();
  };
}

// ---------------------------------------------------------------------------
// 3. Using it: a pipe network from four base shapes instead of 11 hand-written tiles.
// ---------------------------------------------------------------------------

const LINE = '1';
const BLANK = '0';
const base = [
  { name: 'blank', adjacencies: [BLANK, BLANK, BLANK, BLANK], weight: 3 },
  { name: 'straight', adjacencies: [BLANK, LINE, BLANK, LINE] },
  { name: 'corner', adjacencies: [BLANK, LINE, LINE, BLANK] },
  { name: 'T', adjacencies: [LINE, LINE, BLANK, LINE] }, // your sketch's "(U)" tile
  { name: 'cross', adjacencies: [LINE, LINE, LINE, LINE] },
];

const tiles = base.flatMap((tile) => variants(tile, SQUARE));
console.log(`${base.length} base tiles -> ${tiles.length} tiles:`);
for (const tile of base) {
  const made = tiles.filter((t) => t.name === tile.name || t.name.startsWith(`${tile.name}/`));
  console.log(`  ${tile.name.padEnd(9)} ${made.length} variant(s): ${made.map((t) => t.name).join(', ')}`);
}

// Box-drawing glyph for a tile, read from its sides (top, right, bottom, left).
const GLYPHS = { '0000': ' ', '0101': '─', '1010': '│', '0110': '┌', '0011': '┐', '1100': '└', '1001': '┘', '1101': '┴', '1110': '├', '0111': '┬', '1011': '┤', '1111': '┼' };
const glyph = (tile) => GLYPHS[tile.adjacencies.join('')] ?? '?';

const width = 32;
const height = 8;
const grid = new SquareGrid(width, height);
const wfc = new WFC(tiles, grid, { seed: 11 });
wfc.start();
const rows = Array.from({ length: height }, () => '');
for (const [cell, [, y]] of wfc.iterate()) rows[y] += glyph(cell.value);
console.log('\n' + rows.join('\n'));

// ---------------------------------------------------------------------------
// 4. Same helper, another grid: hexagons have six rotations.
// ---------------------------------------------------------------------------

const ridge = { name: 'ridge', adjacencies: ['a', 'a', 'b', 'b', 'b', 'b'] }; // an 'a' edge pair, four 'b' edges
const hexTiles = [{ name: 'ground', adjacencies: ['b', 'b', 'b', 'b', 'b', 'b'] }, ...variants(ridge, HEX, { mirrors: ['x'] })];
// 6 rotations, and the mirror image is one of them, so it adds nothing.
console.log(`\nhex: ridge -> ${hexTiles.length - 1} distinct variants (12 candidates with mirrors)`);
const hexGrid = new HexagonalGrid(6, 4);
new WFC(hexTiles, hexGrid, { seed: 2 }).start();
console.log(`hex: generated ${[...hexGrid.iterate()].length} cells`);

// ---------------------------------------------------------------------------
// 5. Rules that have a direction need mapRule, or mirroring does nothing.
//    [x>y] only matches [y>x]. A pinwheel whose sides are all [a>b] turns the
//    same way however you rotate it; its mirror image turns the other way.
// ---------------------------------------------------------------------------

const pinwheel = { name: 'pinwheel', adjacencies: ['[a>b]', '[a>b]', '[a>b]', '[a>b]'] };
const flipDirection = (rule, { mirrored }) => (mirrored ? rule.replace(/\[(\w+)>(\w+)\]/g, '[$2>$1]') : rule);

const withoutHook = variants(pinwheel, SQUARE, { mirrors: ['x'] });
const withHook = variants(pinwheel, SQUARE, { mirrors: ['x'], mapRule: flipDirection });
console.log(`\npinwheel without mapRule: ${withoutHook.length} tile(s) (the mirror image is indistinguishable)`);
console.log(`pinwheel with mapRule:    ${withHook.length} tiles: ${withHook.map((t) => `${t.name} ${t.adjacencies[0]}`).join(', ')}`);

// ---------------------------------------------------------------------------
// 6. Drawing: the wrapped draw applies the transform to a canvas-style context.
// ---------------------------------------------------------------------------

// Four different sides, so its mirror image is a genuinely new tile.
const arrow = { name: 'arrow', adjacencies: ['p', 'q', 'r', 's'], draw: (ctx, x, y, w, h) => ctx.call(`drawArrow(${x}, ${y}, ${w}, ${h})`) };
const calls = [];
const recorder = new Proxy({}, { get: (_, method) => (...args) => calls.push(`${String(method)}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(2) : a)).join(', ')})`) });
const rotated = variants(arrow, SQUARE, { mirrors: ['x'] }).find((t) => t.name === 'arrow~x/1');
rotated.draw(recorder, 40, 40, 20, 20);
console.log(`\n${rotated.name} draws as:\n  ${calls.join('\n  ')}`);
