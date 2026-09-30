# Schrodinger

A [Wave Function Collapse](https://github.com/mxgmn/WaveFunctionCollapse) engine for TypeScript and JavaScript that works on **any** grid or graph, not just squares.

You describe your tiles and which sides may touch; the engine fills a grid (or a hex map, a 3D volume, a tree, a graph) so that every rule is satisfied, making random choices along the way and backtracking when it paints itself into a corner.

```
┘ │ └──┘ └┐   │┌─┐│┌┐  ┌┘┌────┐┌─┐┌┐   └
┌┐│    ┌──┘┌┐ ││ └┘└┘ ┌┘ └┐   └┘ │└┘ ┌──
└┘└┐ ┌┐└───┘│ └┘┌─┐   └───┘      └┐┌┐└┐┌
  ┌┘┌┘│┌┐┌──┘ ┌─┘ └┐   ┌─┐  ┌──┐┌┐││└┐│└
```

> **Status: early (0.x).** The engine is well tested, but the API may still change, and the package isn't published to npm yet. See [TODO.md](TODO.md) for known gaps.

## Features

- **Grid-agnostic.** The engine only needs each cell's neighbours and how two neighbours face each other. Square, hexagonal and 3D cube grids are built in; a [custom grid](docs/custom-grids.md) is a few dozen lines (there's a binary tree in the examples).
- **Expressive rules.** Tile sides can be plain labels or [rules](docs/adjacency-grammar.md) with choice (`a|b`), negation (`^a`), combinations (`a+b`) and directional "must differ" relationships (`[a>b]`).
- **Complete backtracking.** On a contradiction the engine backtracks depth-first, so given enough budget it finds a solution whenever one exists, or proves that none does. A configurable budget bounds the effort (see [Limitations](#limitations) for when that matters).
- **Reproducible.** Give it a seeded random source and get the same result every time.
- **Fast.** Propagation uses incremental support counting with an undo log instead of re-checking tiles: a 10×15 grid with 90 tiles takes about 5 ms, and the time of a successful run grows roughly linearly with grid size.
- **Observable.** Events for every collapse and backtrack, or drive it one step at a time with a generator to animate it.
- **Verified.** A stress test runs thousands of seeds, validates every result independently of the engine, and compares runs against recorded baselines.
- **Runs in the browser**, with TypeScript types included.

## Install

Not on npm yet. To use it from a clone:

```bash
git clone <this repository> && cd schrodinger
npm install
npm run build          # writes dist/ (ESM, CJS, types)
npm run build:browser  # also writes dist/index.global.js for <script> tags
```

and import from `dist/`, or `npm link` it. The examples below import from `'schrodinger'`, the name in `package.json`. Tested on Node 22.

## Quick start

```js
import { WFC, SquareGrid } from 'schrodinger';

// A tile is a name plus one adjacency rule per side, in the grid's direction
// order. For SquareGrid that's top, right, bottom, left. Two tiles can sit next
// to each other when the rules on their touching sides match; here the rules
// are just labels: "1" means a pipe crosses that edge, "0" means it doesn't.
const tile = (name, adjacencies, weight = 1) => ({ name, adjacencies, weight });

const tiles = [
  tile(' ', ['0', '0', '0', '0'], 3), // empty tiles are more likely
  tile('─', ['0', '1', '0', '1']),
  tile('│', ['1', '0', '1', '0']),
  tile('┌', ['0', '1', '1', '0']),
  tile('┐', ['0', '0', '1', '1']),
  tile('└', ['1', '1', '0', '0']),
  tile('┘', ['1', '0', '0', '1']),
];

const width = 40;
const height = 12;
const grid = new SquareGrid(width, height);
const wfc = new WFC(tiles, grid);

wfc.start(); // throws if no solution is found; see "Errors"

// wfc.iterate() yields [cell, coords] pairs, row by row for a SquareGrid.
const rows = Array.from({ length: height }, () => '');
for (const [cell, [, y]] of wfc.iterate()) {
  rows[y] += cell.value.name;
}
console.log(rows.join('\n'));
```

This is [`examples/node/quickstart.mjs`](examples/node/quickstart.mjs). After `start()` returns, every cell has `collapsed === true` and `cell.value` is its tile.

In TypeScript, `TileDef` also requires a `draw` function (it's for your renderer; the engine never calls it), so write `draw: () => {}` if you don't need one.

## Tiles and grids

A tile's `adjacencies` array has one rule per **direction** of the grid, in the grid's order. `weight` (default 1) makes a tile proportionally more or less likely to be chosen.

| Grid | Directions, in order | Coordinates |
|---|---|---|
| `new SquareGrid(width, height)` | top, right, bottom, left | `[x, y]` |
| `new HexagonalGrid(width, height)` | north, north-east, south-east, south, south-west, north-west | axial `[q, r]` |
| `new CubeGrid(width, height, depth)` | +x, -x, +y, -y, +z, -z | `[x, y, z]` |

Two tiles are compatible across an edge when the rule on one tile's side *matches* the rule on the facing side of the other. With plain strings that means equal strings. A cell with no neighbour in some direction (the edge of the grid) is unconstrained there.

### Rules

A side can be more than a label. `adjacencies: ['grass', 'water|sand', '^rock', '[a>b]']` uses a simple value, a choice, a negation and a directional rule. The full grammar, what each form matches, and some gotchas are in [docs/adjacency-grammar.md](docs/adjacency-grammar.md).

### Rotations and reflections

The engine doesn't generate rotated or mirrored tiles for you. Tiles are plain data, so you generate the variants you need and pass them all in:

```js
// SquareGrid sides are [top, right, bottom, left].
const rotate = (sides) => [sides[3], sides[0], sides[1], sides[2]]; // 90 degrees clockwise
const mirror = (sides) => [sides[0], sides[3], sides[2], sides[1]]; // left-right

const corner = ['1', '1', '0', '0'];
const corners = [0, 1, 2, 3].map((turns) => ({
  name: `corner-${turns * 90}`,
  adjacencies: Array.from({ length: turns }).reduce(rotate, corner),
}));
```

[`examples/node/variants.mjs`](examples/node/variants.mjs) builds a full tileset this way, dropping duplicate variants (a straight pipe only has two distinct rotations). `TileDef` has `rotation` and `reflection` fields, but they are just metadata: nothing is generated from them yet.

## Controlling a run

```js
wfc.start();                         // run to completion
wfc.start([{ coords: [0, 0], value: tiles[3] }]);   // ...with some cells pinned first
for (const step of wfc.execute()) {} // the same run, one step at a time
```

**Events** are emitted as the run progresses:

| Event | Payload | When |
|---|---|---|
| `collapse` | `{ cells: [{ coords, value }], cause }` | a cell was given a tile and the consequences propagated (`cause` is `'entropy'` for the engine's choices, `'initial'` for pinned cells) |
| `backtrack` | `{ cells: [{ coords, value }], cause }` | a choice led to a contradiction and was undone; that tile is ruled out for that cell |
| `complete` | none | every cell is collapsed |
| `error` | `Error` | the run failed (it is also thrown) |

**`execute()` is a generator** yielding `{ type: 'collapse' | 'backtrack' | 'complete', group, affectedCells, depth }` after each step, which is how the browser demos animate one collapse per frame. See [docs/generator-functionality.md](docs/generator-functionality.md).

**Reproducibility.** The engine takes a random source with `random()` and `setSeed()` (by default `Math.random`, which ignores seeds). Pass a seedable one to make runs repeatable:

```js
const wfc = new WFC(tiles, grid, { random: mySeededRandom(42) });
```

[`examples/node/control.mjs`](examples/node/control.mjs) has a complete, working version of everything in this section, including a small seedable generator.

### Options

```js
new WFC(tiles, grid, {
  random,        // RandomLib ({ random(), setSeed() }); default Math.random
  maxRetries,    // maximum number of backtracks before giving up; default 10000
  logLevel,      // LogLevel.NONE | ERROR | WARN (default) | INFO | DEBUG
  debugChecks,   // recompute internal state after every step and throw on any mismatch; slow, for testing
});
```

`backtrackStrategy` and `backtrackStep` from earlier versions are ignored.

## Errors

When the engine hits a contradiction it undoes its most recent choice, rules that tile out for that cell, and tries again, undoing earlier choices if it has to. A run ends in one of three ways:

- it finishes and every cell has a tile;
- it throws **`No solution exists - ...`**: it tried everything, so no assignment satisfies the rules for this grid and these initial cells (this is proven, not a guess);
- it throws **`Gave up after N backtracks ...`**: the budget (`maxRetries`) ran out first. A solution may still exist. Raising the budget can help, but often the quickest fix is simply to run again with a different seed (see [Limitations](#limitations)).

```js
try {
  wfc.start();
} catch (error) {
  if (error.message.startsWith('No solution exists')) { /* the rules can't be satisfied */ }
  else if (error.message.startsWith('Gave up')) { /* try a different seed, or a bigger budget */ }
  else throw error;
}
```

An invalid starting configuration ("Initial seed creates an impossible state") fails the same way. The error is also emitted as an `error` event before being thrown, and logged at the default log level (`LogLevel.NONE` silences the log).

## Custom grids

`SquareGrid`, `HexagonalGrid` and `CubeGrid` are built in, but the engine only calls five methods on a grid, so you can supply your own for any topology: hex maps in other coordinate systems, tori, meshes, graphs. [docs/custom-grids.md](docs/custom-grids.md) is the guide, and [`examples/node/custom-graph.mjs`](examples/node/custom-graph.mjs) two-colours a binary tree.

## Other APIs

- **`TilesetImporter`** (Node only) loads tiles from JSON: `{ "tiles": [{ "name": "grass", "adjacencies": ["g", "g", "g", "g"], "weight": 2 }] }`.
- **`AdjacencyPrecomputer`** compares every pair of tiles ahead of time and can serialize the result; `wfc.setPrecomputedAdjacencies(table)` (before starting) then skips that work. Optional: the engine builds its own lookup tables when it first runs.
- **`parseAdjacencyRule`, `matchAdjacencies`** expose the rule parser and matcher.

## Examples

[`examples/`](examples/README.md) has the Node scripts used above and three p5.js browser demos (isometric cubes on a square grid, an Escher-style marching composition, and isometric cubes on a hexagonal grid using a custom grid).

## Performance

Times for a **successful** run on a laptop, with the 90-tile isometric tileset from the demos (measured with seeds 1 upwards; your numbers will differ):

| Grid | Cells | Time per successful run |
|---|---|---|
| 10×15 | 150 | ~5 ms |
| 20×30 | 600 | ~11 ms |
| 30×40 | 1,200 | ~27 ms |
| 40×60 | 2,400 | ~50 ms |

Comparing tile rules and building the lookup tables (a few milliseconds for 90 tiles) happens once per `WFC` instance, when it first runs, and doesn't depend on the grid's size. If you create many instances of the same tileset, `AdjacencyPrecomputer` and `setPrecomputedAdjacencies` skip the rule comparisons. How the engine works and how it was measured is written up in [docs/propagation-support-counting-spec.md](docs/propagation-support-counting-spec.md).

## Limitations

- **Large grids with tightly constrained tilesets can exhaust the backtrack budget.** Backtracking always undoes the *most recent* choice first. If the real mistake was made long ago, the engine can spend its whole budget re-trying recent choices that can't fix it. With the isometric tileset (each side of a tile fits only 3 to 15 of the 90 tiles), the runs that finished within the default budget were: 10×15 30 of 30 seeds, 20×30 19 of 20, 30×40 8 of 10, 40×60 3 of 6. Ten times the budget didn't change the 40×60 result, but successful runs need almost no backtracking, so when a run gives up, **running again with a different seed is usually the fastest fix.** Restarting automatically is the obvious improvement and is on the [TODO](TODO.md) list.
- **Rotations, reflections and boundary wrapping aren't built in** (see above and [TODO.md](TODO.md)).
- **`TriangularGrid`** exists in the source but isn't exported: its neighbour relation is wrong.
- Everything else known is in [TODO.md](TODO.md).

## Development

```bash
npm test                    # unit tests (jest)
npm run build               # dist/: ESM, CJS and type declarations
npm run build:browser       # also dist/index.global.js for the browser demos
npm run stress-test         # 1000 seeds on the isometric tileset; see --help for options
npm run stress-test:record  # record baselines (run this on a known-good version)
npm run stress-test:compare # check the current code against the baselines, seed by seed
npm run benchmark           # timing and memory on synthetic tilesets
```

`stress-test/` is the main correctness tool: it fingerprints each seed's complete run, so a refactor that changes behavior anywhere shows up as a mismatched seed. Layout:

```
src/           the library
tests/         jest tests
stress-test/   seeded stress test, baselines and the compare script
benchmark/     timing/memory benchmark
examples/      Node scripts and browser demos
docs/          grammar and custom grid guides, design notes
```

## License

GNU Lesser General Public License v2.1 (LGPL-2.1). See [LICENSE](LICENSE).
