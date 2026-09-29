# Spec: Support-Counting Propagation (AC-4) with Trail-Based Snapshots

Status: Implemented (all phases; decisions D1–D5 taken as recommended). See §12 for results.
Scope: `src/WFC.ts` propagation and snapshot internals. No change to the public generation API.

## 1. Goal

Replace the from-scratch constraint propagation (`processConstraintPropagation` → `filterValidAdjacencies` → `canBeAdjacent`) with incremental support counting, and replace full-copy snapshots with an undo trail, so that:

- propagation cost scales with the number of tile removals, not with |domain|² per re-check;
- snapshots are O(1) to take and O(undone changes) to restore;
- for tilesets meeting the preconditions in §6 (the iso tileset does), every seed produces **the same result** as the current engine.

Notation: `C` cells, `T` tiles, `D` directions per cell (max), `k` average number of compatible tiles per (tile, direction). For the iso tileset: `C = 150`, `T = 90`, `D = 4`, `k ≈ 10`.

## 2. Current behavior and cost

- **Propagation.** `processConstraintPropagation` pops a cell and, for every neighbor, keeps each of the cell's tiles only if *some* tile in the neighbor supports it. That's O(|dom(c)| × |dom(n)|) checks per neighbor, repeated every time any neighbor shrinks. After the recent fixes this is ~95% of runtime, and cost grows roughly cubically with `T`.
- **Snapshots.** Before every collapse, `getChangedCells()` returns *every* uncollapsed cell, and `createSnapshot` copies each one's choice names: O(C·T) string work per step, O(C²·T) per run. That's cheap next to propagation today, but it will dominate once propagation is fast.
- **Restore.** `restoreSnapshot` rebuilds `cell.choices` from names. It restores only what's visible on `Cell`, so any derived state (like support counts) can't be recovered from it. That's why an earlier incremental approach clashed with snapshots.

## 3. Data structures

All built once when `execute()` starts, since `setPrecomputedAdjacencies` may be called after the constructor.

| Structure | Shape | Purpose |
|---|---|---|
| `cellIndex` | `Map<Cell, number>` + `cells: Cell[]` | Stable integer id per cell (from `grid.iterate()` order) |
| `cellType` | `Uint8Array[C]` | Index of `grid.getAdjacencyType(coords)` |
| `neighbor` | `Int32Array[C·D]` | Neighbor cell index per direction, `-1` if none |
| `incoming` | CSR: `offsets[C+1]`, `srcCell[]`, `srcDir[]` | For cell `n`, all `(c, d)` with `neighbor[c][d] = n`. Built from `neighbor`, so it never assumes a reverse direction (works for directed/custom graphs) |
| `compat` | CSR per `(type, d, t)` → tiles `t'` | `t'` allowed at `neighbor(c, d)` when `c` holds `t` |
| `inverse` | CSR per `(type, d, t')` → tiles `t` | Transpose of `compat`: which `t` lose support when `t'` is removed |
| `domain` | `Uint8Array[C·T]` | 1 if tile still possible |
| `size` | `Int32Array[C]` | Domain cardinality (entropy) |
| `support` | `Uint16Array[C·T·D]` (`Uint32Array` if `T > 65535`) | Number of tiles in `domain(neighbor(c, d))` compatible with `t` at `c` in direction `d` |
| `trail` | growable `Int32Array` | Undo log (§5) |
| `removalQueue` | growable `Int32Array` of `c·T + t` | Pending removals to propagate |

`compat` source: the compiled precomputed adjacencies when present (per tile/type/direction), otherwise `matchAdjacencies` on **pre-parsed** rules, evaluated once per `(type, d, t, t')`. This also removes the current per-call string re-parsing on the rules path. `canBeAdjacent` becomes a lookup in `compat` and stays public.

Memory: iso ≈ 54k support entries (~108 KB). A 100×100 grid with 90 tiles and D = 4 is 3.6M entries (~7 MB).

## 4. Operations

```
init():                                   // start of execute()
  domain := all 1; size[c] := T
  for c, t, d with neighbor[c][d] != -1:
    support[c][t][d] := |compat[type(c)][d][t]|
  for c, t, d with neighbor != -1 and support == 0:  remove(c, t)   // initial propagation, see D1
  propagate()

remove(c, t):
  if !domain[c][t]: return
  domain[c][t] := 0; size[c]--; trail.push(REMOVE c·T+t); dirty.add(c)
  if size[c] == 0: contradiction := true
  removalQueue.push(c·T+t)

propagate():
  while removalQueue not empty and !contradiction:
    (n, t') := removalQueue.pop()
    for (c, d) in incoming[n]:
      for t in inverse[type(c)][d][t']:
        if --support[c][t][d] == 0: remove(c, t)
  for c in dirty (not collapsed, size == 1): markCollapsed(c)   // auto-collapse
  materializeChoices(dirty); dirty.clear()
  return !contradiction

collapse(c, t):                            // entropy pick or initial seed
  if !domain[c][t]: contradiction := true; return
  for t2 in domain[c], t2 != t: remove(c, t2)
  markCollapsed(c)                         // trail.push(COLLAPSE c); cell.collapsed/value set
```

Rules:

- Decrements are **unconditional**, including for tiles already removed from `c`. `support` is therefore always exactly "number of compatible tiles currently in the neighbor's domain," never negative, and a removal can be undone by the exact inverse increment. Only the `== 0` transition while the tile is still present triggers `remove`.
- Collapsed cells are **not** skipped as propagation targets. A collapsed cell losing its only tile is a contradiction. Under precondition P1 (§6) this matches today's behavior, and without P1 it's the more correct semantics.
- Group collapses (multi-cell initial seeds) apply all `collapse` calls, then propagate once. Cells in the same group are therefore validated against each other, which the current engine doesn't do (its first pass checks only already-collapsed neighbors). This may explain the currently timing-out "invalid initial seed" test; to be verified.
- Removal order (stack vs FIFO) doesn't affect the fixpoint. Use a stack for cache locality.

### Materializing `Cell`

`cell.choices`, `cell.collapsed` and `cell.value` stay the public view. `materializeChoices` rebuilds `choices` for dirty cells by scanning `domain` in tile-definition order, the same order the current engine keeps (`filter` preserves order, and restore preserves stored order). Guarantee: `Cell` objects are accurate at every `yield`, every emitted event, and after a thrown error. They may be stale *during* `propagate`, which no caller can observe.

## 5. Snapshots and backtracking (trail)

Trail entries:

- `REMOVE(c, t)`. Undo: `domain[c][t] := 1`, `size[c]++`, then for each `(c', d)` in `incoming[c]` and each `t2` in `inverse[type(c')][d][t]`: `support[c'][t2][d]++`. Mark `c` dirty.
- `COLLAPSE(c)`. Undo: `collapsed := false`, `value := undefined`. Mark `c` dirty.

A snapshot is just `trail.length`. `SnapshotManager` keeps its current interface (`createSnapshot` / `addReference` / `removeReference` / `restoreSnapshot` / `cleanup`), so `BacktrackTree`, `ExhaustionTracker` and `handleBacktrack` don't change. Only the payload changes:

- `createSnapshot()` → `{ id, marker: trail.length }`, O(1). `getChangedCells()` is deleted.
- `restoreSnapshot(id)` → pop and undo entries until `trail.length == marker`, clear `removalQueue` and `contradiction`, then materialize dirty cells.

**Invariant (stack discipline).** `handleBacktrack` restores only ancestors of the current `BacktrackTree` node (`findViableAncestor` walks `parent`). Every restore since an ancestor's creation targeted that ancestor or a descendant, so its trail prefix is still intact and `marker ≤ trail.length`. Snapshots of abandoned branches are never restored. Debug builds assert `marker ≤ trail.length`.

Trail length per path is at most `C·T + C` entries (each tile removed at most once per cell, one collapse per cell).

## 6. Equivalence with the current engine

Preconditions:

- **P1, symmetric compatibility across every edge:** `t' ∈ compat[type(c)][d][t]` ⇔ `t ∈ compat[type(n)][d'][t']`, where `n = neighbor(c, d)` and `neighbor(n, d') = c`.
- **P2, full domains already arc-consistent:** every `(type, d, t)` has at least one compatible tile, so initial propagation is a no-op.

Claim: with P1 and P2, after every step the new engine produces identical `choices` (same tiles, same order), `collapsed` and `value` for every cell. It therefore consumes the RNG identically and gives the same output for every seed.

Sketch: both engines compute the largest arc-consistent subset of the domains after each collapse. That fixpoint is unique and doesn't depend on processing order. Both detect a contradiction exactly when it contains an empty domain. The current engine's skipping of collapsed cells doesn't change the fixpoint under P1: a collapsed tile can lose support only if the neighbor empties, which is itself detected. Restores produce the same state in both engines.

Measured for the iso tileset (10×15 grid, 90 tiles): **0 asymmetric pairs, 0 unsupported (tile, direction)**. P1 and P2 hold, so the 1000-seed sweep must match exactly. Tilesets that violate P1 or P2 may legitimately diverge; for those, use the validator and statistics in §8.

## 7. Complexity

| | Current | Proposed |
|---|---|---|
| Propagation per run | ~O(re-checks · D · \|dom\|²), roughly cubic in `T` | O(C·T·D·k) worst case (each tile removed ≤ once per cell, D·k decrements each) |
| Snapshot per step | O(C·T) string copies | O(1) |
| Restore | O(C·T) | O(undone removals · D·k) |
| Iso upper bound | — | ≤ 13.5k removals × ~40 decrements ≈ 540k integer ops per run |

What's left after this change, out of scope here: `selectCellsToCollapse` and the `completed` getter are O(C) per step, so O(C²) per run. That will be the next limit on large grids; an entropy bucket or heap plus a collapsed counter would fix it.

## 8. Verification plan

1. **Golden fingerprints (exact).** Extend `stress-test` to record, per seed, a hash of the final grid (tile name per cell) plus collapse and backtrack counts, and add `--compare <baseline.json>`. Record the baseline on the current engine before any change. Every phase must reproduce it for iso at 10×15 (1000 seeds), at 20×30, and with the `aggressive` and `deep` strategies.
2. **Independent solution validator.** For every successful run, check that all cells are collapsed and every neighboring pair satisfies `compat`. This doesn't depend on engine internals, and `stress-test` doesn't check it today.
3. **Invariant checker** (`WFCOptions.debugChecks`, off by default). After every `propagate` and `restore`, recompute `support` from `domain` and compare; check `size == popcount(domain)`, that `choices` mirrors `domain` in index order, and that `marker ≤ trail.length`. Enable it in jest fixtures and in a `stress-test --check-invariants` run on small grids.
4. **Backtrack-heavy fixtures.** Backtracking is rare on iso (~1% of runs), so add a small synthetic tileset with sparse random compatibility on small grids, run under all strategies with invariants on, to exercise the trail's undo path.
5. **Existing suite.** `npm test` stays at the same pass set or better, including Hex, Triangular, Cube and custom grids.
6. **Performance.** Before/after `stress-test` timings plus `--prof`, and the cell-count scaling table from the previous analysis, extended with a tile-count axis.

## 9. Implementation phases

Each phase ends with §8 checks 1, 2 and 5 passing. Phase 2 onward also runs 3 and 4.

0. **Harness:** fingerprints, `--compare`, validator; record the baseline.
1. **Static tables:** cell indexing, `neighbor`/`incoming`, `compat`/`inverse`; `canBeAdjacent` backed by `compat`. Behavior unchanged. Also speeds up the rules path.
2. **AC-4 propagation:** `domain`/`support`/`removalQueue` replace `filterValidAdjacencies` and `processConstraintPropagation`. Existing snapshots stay; after `restoreSnapshot`, rebuild `domain` and `support` from `cell.choices` (O(C·T·D·k), acceptable because restores are rare). This separates the propagation change from the snapshot change.
3. **Trail snapshots:** replace name-copy snapshots and `getChangedCells`; delete the Phase 2 rebuild-on-restore.
4. **Cleanup:** remove dead code and public surface per D3.

## 10. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Run initial propagation at `execute()` start? No-op under P2; otherwise it prevents picking tiles that can never be completed, but shifts seeds for such tilesets. | Yes |
| D2 | The root node restore (`snapshotId -1` → "Snapshot -1 not found"). With the trail, the root is simply marker 0. | Keep current behavior in this change, so it stays a pure refactor; fix separately |
| D3 | Public surface that becomes dead: `filterValidAdjacencies` (public, internal use only), `validateProposedChanges` (private, unused), `undoChange`/`DeltaChange` (legacy), exported `CellDelta`/`DeltaSnapshot` types, `DeltaSnapshot.test.ts` (already failing). | Keep `canBeAdjacent`; remove the rest in Phase 4 and rewrite the snapshot tests against the trail |
| D4 | Phase 2 as an intermediate (rebuild on restore) vs. going straight to the trail. | Phased: easier to bisect if fingerprints diverge |
| D5 | Invariant checker as a `WFCOptions` flag vs. a test-only hook. | `WFCOptions.debugChecks` so `stress-test` can use it too |

## 11. Constraints for callers (to document)

- `setPrecomputedAdjacencies` must be called before `execute()`/`start()`.
- The grid's cell objects must not be replaced (`grid.set`) and `cell.choices` must not be mutated externally while a run is in progress. Both are true of all current callers.
- `getNeighbors` must return a fixed-length array per cell (with `null` for missing neighbors), whose indices match the tile `adjacencies` and `adjacencyMaps` direction order.

## 12. Results

Implementation: `src/AdjacencyTables.ts` (Phase 1), `src/SupportPropagator.ts` (Phases 2–3), integration in `src/WFC.ts`. Removed: `filterValidAdjacencies`, `processConstraintPropagation`, `getChangedCells`, `validateProposedChanges`, `undoChange`, the `DeltaChange`/`CellDelta`/`DeltaSnapshot` types and exports, `src/util.ts`, `tests/DeltaSnapshot.test.ts`.

**Equivalence.** Baselines were recorded on `8d00674` (the engine with the field/lookup fixes, before this work) with `npm run stress-test:record`: 9 configurations, 7,650 seeds, covering the iso tileset (all three strategies, 10×15 and 20×30) and two backtrack-heavy random tilesets (up to ~137 backtracks per run, depth 10, including runs that hit the root-snapshot bug). After every phase, `npm run stress-test:compare` reported **7,650/7,650 identical fingerprints** (full collapse/backtrack trace plus final grid) and 0 invalid solutions. Invariant-checked runs (`--check-invariants`) were identical too, and mutation tests confirmed the checker catches broken decrements and broken undo.

**Performance** (same session, same stress-test build, `--fast`, avg ms per run):

| Config | `8d00674` | Final | Speedup |
|---|---|---|---|
| iso 10×15 | 113.7 | 5.3 | 21.6× |
| iso 20×15 | 331.1 | 12.0 | 27.7× |
| iso 10×30 | 205.5 | 11.0 | 18.7× |
| iso 20×30 | 601.0 | 25.6 | 23.5× |
| random-a, deep, 10×10 | 41.0 | 4.4 | 9.4× |

These are on top of the field/lookup fixes already in `8d00674`, which were worth roughly 3× on their own over the original engine. Runtime now grows about linearly with cell count. At 40×60 the remaining profile is dominated by the O(C) per-step scans (`iterate` + `selectCellsToCollapse` ≈ 32%); propagation itself is ≈ 15%.

**Behavior changes (intentional):**

- Asymmetric neighborhoods are now propagated correctly. On the custom `TriangleGrid` test, the previous engine reported success in ~72% of runs, but every one of those outputs violated a constraint (no valid assignment exists: 0 of 3⁶). The engine now reports "No solution exists"; the test was split into a solvable case (with output validation) and an unsolvable one.
- Multi-cell initial seeds are validated against each other. An invalid seed now fails immediately with "Initial seed creates an impossible state"; previously that test timed out.
- D1: tiles with no compatible tile in some neighboring direction are removed before the first collapse.

**Open items:**

- ~~`tests/Backtracking.test.ts` failures~~ Resolved after this work: failures before the main loop (contradictory constraints at load, invalid initial seed) now emit `error` before throwing, like failures inside it; and the backtracking test uses a scenario that needs a backtrack on a later collapse (random tileset, seed 21).
- ~~D2: root-snapshot restore~~ Resolved by replacing backtracking entirely (see §13).
- ~~`LogLevel.NONE` is ignored~~ Fixed (`??` instead of `||`).
- ~~O(C) per-step scans through the grid's `iterate()`~~ Cell selection and the completion check now read the propagator's typed arrays and a collapsed-cell counter (1.2× at 10×15, 3.1× at 80×80). Selection is still O(C) per step; an entropy bucket/heap would only matter for much larger grids.

## 13. Depth-first backtracking

Making the backtrack tree's root restorable wasn't enough on its own: nothing ever marked the root exhausted, so an instance where every first choice fails looped forever. Separately, "No solution exists" was often false: in the random-tileset baselines every seed runs the same (solvable) problem, yet most seeds reported no solution.

`BacktrackTree`, `ExhaustionTracker` and `SnapshotManager` were replaced by a decision stack on the trail. Each decision records the trail position from before it. On a contradiction: undo the last decision, exclude its tile from that cell, propagate; if that also fails, undo the previous decision and exclude its tile, and so on. An empty stack proves there is no solution (for this grid and initial seed). The initial seed is never undone.

- `maxRetries` is now the backtrack budget (default 10,000). Exceeding it throws "Gave up after N backtracks ...", distinct from the proven "No solution exists ...". Both are emitted as `error` before being thrown.
- `backtrackStrategy`, `backtrackStep` and `BACKTRACK_STRATEGIES` are deprecated and ignored.
- `backtrack` events and step results now carry the decision that was undone (`group`), and `depth` is how many decisions the current backtrack has undone.

Verification: seeds solved without backtracking in the old baselines are identical (1,466/1,466). Success rates on the known-solvable configurations went from 8.6% to 99.9% (`random-a`), 16.5% to 100% (`random-b`) and 92% to 94% (iso 20×30); every remaining failure is "gave up", none falsely claims no solution. New tests compare the engine against brute force on 32 small instances (21 solvable, 11 not) with debug checks on, and cover the odd-cycle case that used to hang, the budget, and multi-level backtracking. Baselines were re-recorded for the new behavior (old ones kept under `stress-test/baselines/pre-dfs/`, gitignored).

Possible later improvements, deliberately not done yet: per-level retry limits, restarts, backjumping (see the discussion that led to this section).
