# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/) (while the version is 0.x, minor versions may include breaking changes).

## [0.1.0] - Unreleased

First public version.

### Features

- Wave Function Collapse engine for any grid or graph: `SquareGrid`, `HexagonalGrid` and `CubeGrid` are built in, and a custom grid is five members (`iterate`, `get`, `getNeighbors`, `getAdjacencyType`, `adjacencyMaps`).
- Adjacency rules with choice (`a|b`), negation (`^a`), combinations (`a+b`) and directional "must differ" rules (`[a>b]`), parsed from strings or given as rule objects.
- Incremental constraint propagation (support counting) with an undo log, so taking and restoring a snapshot is cheap.
- Complete depth-first backtracking with Luby-scaled restarts: it finds a solution whenever one exists, or proves that none does, within a configurable budget (`maxRetries`, `restartAfter`). Running out of budget is reported separately ("Gave up") from a proof ("No solution exists").
- Repeatable runs: `seed` option, and a `DefaultRandom` that is deterministic once seeded, the same on every platform.
- Events (`collapse`, `backtrack`, `restart`, `complete`, `error`) and a step-by-step generator (`execute()`), both typed. The engine has its own small event emitter, so it works the same in Node and browsers.
- TypeScript types: coordinates are typed by the grid, and event listeners are type-checked.
- `TilesetImporter` (Node only, from `schrodinger-wfc/node`) loads tiles from JSON.
- Supported environments: Node 18 or later (the built package also runs on Node 16), TypeScript 4.5 or later, and current browsers. CI tests Node 18, 20, 22 and 24 and TypeScript 4.5 to 5.9.
- Packaging: ESM and CommonJS builds with types, and self-contained browser builds (`dist/index.global.js`, `dist/index.global.min.js`) exposing a `Schrodinger` global, for script tags and CDNs.

### Known gaps

See [TODO.md](TODO.md): rotations and reflections are not generated for you, there is no boundary wrapping, and very large grids with tightly constrained tilesets can be slow.
