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
- **Complete backtracking with restarts.** On a contradiction the engine backtracks depth-first, and when an attempt goes badly it starts over with fresh random choices, so large grids finish instead of thrashing. Given enough budget it finds a solution whenever one exists, or proves that none does. A configurable budget bounds the effort.
- **Reproducible.** Give it a seeded random source and get the same result every time.
- **Fast.** Propagation uses incremental support counting with an undo log instead of re-checking tiles: a 10×15 grid with 90 tiles takes about 5 ms, and the time of a successful run grows roughly linearly with grid size.
- **Observable.** Events for every collapse and backtrack, or drive it one step at a time with a generator to animate it.
- **Verified.** A stress test runs thousands of seeds, validates every result independently of the engine, and compares runs against recorded baselines.
- **Runs in the browser**, with TypeScript types included.

## Install

```bash
npm install schrodinger-wfc
```

Works in Node 18 or later and in browsers, as ESM (`import { WFC } from 'schrodinger-wfc'`) or CommonJS (`const { WFC } = require('schrodinger-wfc')`), with TypeScript types included (TypeScript 4.5 or later). Bundlers (webpack, Vite, esbuild, ...) need no configuration: the main entry doesn't touch Node's `fs`.

The code is plain ES2020 with no dependency beyond a parser library, so it doesn't need a recent runtime: CI tests Node 18, 20, 22 and 24, and the built package also runs on Node 16. For TypeScript, 4.5 is the oldest version that can read the type declarations; `moduleResolution` `node16`/`nodenext` needs 4.7+ and `bundler` needs 5.0+, which are TypeScript's own requirements.

**In a browser without a bundler**, use the self-contained build, which exposes a `Schrodinger` global:

```html
<script src="https://cdn.jsdelivr.net/npm/schrodinger-wfc/dist/index.global.min.js"></script>
<script>
  const { WFC, SquareGrid } = Schrodinger;
</script>
```

> The package isn't published yet, so the install command and CDN URL above won't work until it is. To try it now, clone this repository and run `npm install` (this also builds `dist/`), then import from `dist/index.js` or `npm link` it.

## Quick start

```js
import { WFC, SquareGrid } from 'schrodinger-wfc';

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

In TypeScript the same tiles are typed `TileDef[]`. `TileDef` also has an optional `draw` function for your renderer's convenience; the engine never calls it. Coordinates are typed by the grid (`[number, number]` for `SquareGrid`, `[number, number, number]` for `CubeGrid`, and so on), and event listeners are type-checked.

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
| `restart` | `{ restarts, backtracks }` | the attempt needed too many backtracks, so the engine started over from the initial cells (see [Restarts](#restarts)); `restarts` and `backtracks` are totals so far |
| `complete` | none | every cell is collapsed |
| `error` | `Error` | the run failed (it is also thrown) |

The engine has its own small event emitter (`on`, `once`, `off`, `emit`, `removeAllListeners`, ...) rather than Node's `EventEmitter`, so it behaves the same in Node and in browsers, and listeners are type-checked in TypeScript.

**`execute()` is a generator** yielding `{ type: 'collapse' | 'backtrack' | 'restart' | 'complete', group, affectedCells, depth }` after each step (after a `restart` every cell except the initial ones is uncollapsed again), which is how the browser demos animate one collapse per frame. See [docs/generator-functionality.md](docs/generator-functionality.md).

**Reproducibility.** Pass a `seed` (a number or a string) and the same tiles, grid, options and seed always give the same result, on every platform:

```js
const wfc = new WFC(tiles, grid, { seed: 42 });
```

Without a seed the engine uses `Math.random()`. To use your own generator, pass `random`, an object with `random()` (a number in [0, 1)) and `setSeed()`; the `seed` option is handed to its `setSeed()`.

[`examples/node/control.mjs`](examples/node/control.mjs) has a complete, working version of everything in this section.

### Options

```js
new WFC(tiles, grid, {
  seed,          // number | string: makes the run repeatable
  random,        // your own random source ({ random(), setSeed() }); default Math.random, deterministic once seeded
  maxRetries,    // maximum number of backtracks, in total, before giving up; default 10000
  restartAfter,  // restart cutoff unit, in backtracks; default 25; 0 disables restarts
  logLevel,      // LogLevel.NONE | ERROR | WARN (default) | INFO | DEBUG
  debugChecks,   // recompute internal state after every step and throw on any mismatch; slow, for testing
});
```

`backtrackStrategy` and `backtrackStep` from earlier versions are ignored.

## Restarts

Backtracking always undoes the most recent choice first. That is the right thing when the last few choices caused the problem, but when the real mistake was made long ago, the engine can spend its whole budget re-trying recent choices that can't fix it. On large grids that used to mean many runs never finished.

So when an attempt has needed too many backtracks, the engine throws it away and starts over: everything is undone except the initial cells you passed to `start()`, and the next attempt draws different random numbers from the same random source, so it makes different choices. The cutoff follows the Luby sequence, `restartAfter × (1, 1, 2, 1, 1, 2, 4, 1, 1, 2, …)` backtracks: mostly short attempts, with ever longer ones now and then, so the search stays complete and can still prove that no solution exists.

- `restartAfter` (default 25) is the unit. Runs that need no more than that many backtracks are unaffected.
- `restartAfter: 0` turns restarts off, which makes *proving* that a hard instance has no solution faster (see [Limitations](#limitations)), at the price of the large-grid behaviour above.
- Restarts count against `maxRetries`, and are reported as `restart` events.

## Errors

When the engine hits a contradiction it undoes its most recent choice, rules that tile out for that cell, and tries again, undoing earlier choices if it has to. A run ends in one of three ways:

- it finishes and every cell has a tile;
- it throws **`No solution exists - ...`**: it tried everything, so no assignment satisfies the rules for this grid and these initial cells (this is proven, not a guess);
- it throws **`Gave up after N backtracks (R restarts) ...`**: the budget (`maxRetries`) ran out first. A solution may still exist. Raise `maxRetries` to search longer, or run again with a different seed.

```js
try {
  wfc.start();
} catch (error) {
  if (error.message.startsWith('No solution exists')) { /* the rules can't be satisfied */ }
  else if (error.message.startsWith('Gave up')) { /* try a bigger budget or a different seed */ }
  else throw error;
}
```

An invalid starting configuration ("Initial seed creates an impossible state") fails the same way. The error is also emitted as an `error` event before being thrown, and logged at the default log level (`LogLevel.NONE` silences the log).

## Custom grids

`SquareGrid`, `HexagonalGrid` and `CubeGrid` are built in, but a grid is just five members (`iterate`, `get`, `getNeighbors`, `getAdjacencyType`, `adjacencyMaps`), so you can supply your own for any topology: hex maps in other coordinate systems, tori, meshes, graphs. [docs/custom-grids.md](docs/custom-grids.md) is the guide, and [`examples/node/custom-graph.mjs`](examples/node/custom-graph.mjs) two-colours a binary tree.

## Other APIs

- **`TilesetImporter`** (Node only: `import { TilesetImporter } from 'schrodinger-wfc/node'`) loads tiles from JSON: `{ "tiles": [{ "name": "grass", "adjacencies": ["g", "g", "g", "g"], "weight": 2 }] }`.
- **`AdjacencyPrecomputer`** compares every pair of tiles ahead of time and can serialize the result; `wfc.setPrecomputedAdjacencies(table)` (before starting) then skips that work. Optional: the engine builds its own lookup tables when it first runs.
- **`parseAdjacencyRule`, `matchAdjacencies`** expose the rule parser and matcher.

## Examples

[`examples/`](examples/README.md) has the Node scripts used above and three p5.js browser demos (isometric cubes on a square grid, an Escher-style marching composition, and isometric cubes on a hexagonal grid using a custom grid).

## Performance

Results on a laptop with the 90-tile isometric tileset from the demos, using seeds 1 upwards and the default options (your numbers will differ). "Finished" is the number of seeds that produced a solution within the default budget; the last column is the same count with restarts turned off (`restartAfter: 0`).

| Grid | Cells | Time per successful run | Finished | Without restarts |
|---|---|---|---|---|
| 10×15 | 150 | ~5 ms | 100 / 100 | 100 / 100 |
| 20×30 | 600 | ~12 ms | 100 / 100 | 94 / 100 |
| 30×40 | 1,200 | ~29 ms | 50 / 50 | 38 / 50 |
| 40×60 | 2,400 | ~107 ms | 30 / 30 | 15 / 30 |
| 80×80 | 6,400 | ~2.2 s | 9 / 10 | 0 / 10 |

Time grows roughly linearly with the number of cells until the grid gets large enough that attempts start failing and restarting (about 1.4 restarts per run at 40×60, about 19 at 80×80).

Comparing tile rules and building the lookup tables (a few milliseconds for 90 tiles) happens once per `WFC` instance, when it first runs, and doesn't depend on the grid's size. If you create many instances of the same tileset, `AdjacencyPrecomputer` and `setPrecomputedAdjacencies` skip the rule comparisons. How the engine works and how it was measured is written up in [docs/propagation-support-counting-spec.md](docs/propagation-support-counting-spec.md).

## Limitations

- **Very large grids with tightly constrained tilesets are slow.** Restarts make them finish (80×80 above), but each restart repeats work, so they can take seconds. A search that learns why it failed (backjumping) would waste less; see [TODO.md](TODO.md).
- **Proving that no solution exists can take longer with restarts on**, because it needs one attempt long enough to exhaust the search. On colouring complete graphs with too few colours it took 6.6×, 11× and 15× the backtracks of plain search for proofs that need 719, 5,039 and 40,319 backtracks; proofs that need fewer than 25 are unaffected. Set `restartAfter: 0` if you mostly need that.
- **Rotations, reflections and boundary wrapping aren't built in** (see above and [TODO.md](TODO.md)).
- **`TriangularGrid`** exists in the source but isn't exported: its neighbour relation is wrong.
- Everything else known is in [TODO.md](TODO.md).

## Development

```bash
npm test                    # unit tests (jest)
npm run build               # dist/: ESM, CJS, type declarations and the browser builds
npm run lint                # eslint + prettier check (npm run lint:fix, npm run format to fix)
npm run stress-test         # 1000 seeds on the isometric tileset; see --help for options
npm run stress-test:record  # record baselines (run this on a known-good version)
npm run stress-test:compare # check the current code against the baselines, seed by seed
npm run benchmark           # timing and memory on synthetic tilesets
npm run check:package       # packs the library and uses the tarball as a consumer would (ESM, CJS, TypeScript, browser)
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

Copyright (C) 2024-2026 Rubén Medellín <ruben.medellin.c@gmail.com>

Licensed under the GNU Lesser General Public License v2.1 (LGPL-2.1). See [LICENSE](LICENSE).
