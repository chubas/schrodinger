# How it works

This page explains what the engine does when you call `start()`, why it is fast, and what its guarantees are. You don't need any of it to use the library.

## The search

A run is a loop of **decisions**. Each cell holds the set of tiles still possible there. The engine repeatedly:

1. picks an uncollapsed cell with the fewest possible tiles (ties are broken at random);
2. picks one of its remaining tiles, at random, weighted by the tiles' `weight`;
3. **propagates** the consequences to the rest of the grid;
4. repeats until every cell has exactly one tile.

If propagation empties a cell, the decision was wrong and the engine **backtracks**.

## Propagation

Two neighbouring cells constrain each other: a tile can stay in a cell only while at least one tile in each neighbour is compatible with it. Re-checking every tile against every neighbouring tile after each change is slow, so the engine counts instead.

For every cell, tile and direction it keeps a **support count**: how many of the neighbour's remaining tiles are compatible with that tile in that direction. When a tile is removed from a cell, the engine decrements exactly the counts that depended on it, and a tile is removed when any of its counts reaches zero. Each removal is processed once, so propagation costs time proportional to the number of tiles removed rather than to the grid size times the tileset size squared.

Compatibility between tiles is computed once, when the engine first runs, into index-based lookup tables (one per adjacency type and direction). That is where your adjacency rules are parsed and compared; after that, a run only does table lookups.

Neighbours are read through each cell's list of incoming neighbours, so grids whose neighbour relation isn't symmetric work correctly.

## Undo

Every removal and every collapse is appended to an **undo log**. Taking a snapshot is just remembering the log's length, and restoring one pops entries back to it, applying the exact inverse of each change, including the support counts. Nothing is copied, so a snapshot costs O(1) and a restore costs only as much as the changes being undone.

## Backtracking

When a decision leads to a contradiction, the engine undoes it, **rules that tile out** for that cell, and propagates. If that also fails, the previous decision was wrong too: it is undone and its tile ruled out, and so on. This is plain depth-first search, so it is **complete**: if the engine runs out of decisions to undo, no assignment satisfies the rules for that grid and those initial cells, and it reports `No solution exists`. That statement is a proof, not a guess.

Backtracking effort is bounded by `maxRetries` (the total number of backtracks). Running out is reported separately, as `Gave up`, because a solution may still exist.

## Restarts

Depth-first search always undoes the most recent decision first. When the real mistake was made long ago, that wastes the whole budget on recent decisions that cannot fix it, which is what happens on large, tightly constrained grids.

So an attempt is abandoned and restarted (everything undone except the initial cells, with the random source continuing so the next attempt chooses differently) once it has used its share of backtracks. The share follows the **Luby sequence**, `restartAfter × (1, 1, 2, 1, 1, 2, 4, 1, 1, 2, …)`: mostly short attempts, with ever longer ones now and then. Because the cutoffs grow without bound, a long enough attempt can still exhaust the search, so restarts keep the search complete.

The trade-off is in proofs: proving that no solution exists needs one attempt long enough to exhaust the search, so with restarts on it can take several times more backtracks than plain search (6.6×, 11× and 15× on a family of colouring problems needing 719, 5,039 and 40,319 backtracks). Setting `restartAfter: 0` disables restarts. Runs that need no more than `restartAfter` backtracks are never affected.

## Determinism

Everything the engine does is a function of the tiles, the grid, the options and the random source. With a `seed` (or your own seeded `random`) the same inputs always give the same result, in Node and in browsers, on every platform: the built-in generator is plain 32-bit integer arithmetic followed by an exact division by 2^32.

## How it is tested

- **Unit tests** cover the propagator, the emitter, the grids, the rule grammar and the types.
- **A brute-force comparison** checks, on small grids, that the engine finds a solution exactly when exhaustive search does, and proves there is none exactly when there is none, with and without restarts.
- **The stress test** (`npm run stress-test`) runs thousands of seeds, validates every produced solution against the adjacency rules independently of the engine, and fingerprints each run's complete sequence of steps. Recording fingerprints on one version and comparing on another (`stress-test:record`, `stress-test:compare`) shows exactly which seeds a change affects: a pure refactor affects none.
- **Invariant checking** (`debugChecks`, or `--check-invariants` in the stress test) recomputes the propagation state from scratch after every step and fails on any mismatch with the incremental state, which is what catches mistakes in the undo log.
- **A packaging check** (`npm run check:package`) installs the built tarball into an empty project and uses it from ESM, CommonJS, several TypeScript versions and a browser bundler.
