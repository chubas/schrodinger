# Trail-Based Rollback Solver Specification

## Purpose

This document specifies a replacement for the current snapshot-tree backtracking system in `src/WFC.ts`. The goal is to keep the solver useful for progressive creative-coding sketches: every collapse, propagation, contradiction, and rollback should be expressible as a small delta that can be rendered incrementally.

The implementation should preserve the public sketch-facing shape of the library:

- `new WFC(tileDefs, grid, options)`
- `start(initialSeed?)`
- `execute(initialSeed?)`
- `iterate()`
- events for collapse, propagation, backtrack, complete, and error
- custom `Grid` implementations and optional precomputed adjacencies

The main internal change is replacing snapshot ownership, backtrack trees, and global exhaustion tracking with a conventional CSP decision stack and an undo trail.

## Current System To Replace

The current solver keeps three structures in sync:

- `SnapshotManager`, which stores cell-state snapshots.
- `BacktrackTree`, which tracks parent/child backtracking nodes.
- `ExhaustionTracker`, which records tried combinations.

This creates several problems:

- A successful collapse keeps a snapshot alive even when it may no longer be a useful rollback target.
- `getChangedCells()` currently captures all uncollapsed cells rather than actual changes, so snapshots are larger than intended.
- Exhaustion is tracked outside the decision frame that owns the choices, making it hard to reason about retries.
- Restoration changes grid state, but the solver has no first-class delta describing exactly what changed for progressive rendering.
- The implementation permits multi-cell collapse groups but does not fully enumerate multi-cell choice combinations.

The trail-based design treats these as one search problem: a decision frame owns its target cell, ordered candidate values, and trail mark. Rollback restores all domain changes after that mark and then tries the next candidate.

## Solver Model

The WFC grid is treated as a binary CSP:

- Variables are grid cells.
- Domains are each cell's possible tiles.
- Constraints are adjacency compatibility between neighboring cells.
- A solution is a full assignment where every cell has exactly one tile and all neighbor pairs are compatible.

The solver alternates between:

1. Selecting an uncollapsed cell with minimum remaining values.
2. Assigning one candidate tile to that cell.
3. Propagating adjacency constraints through the grid.
4. Continuing on success or rolling back on contradiction.

This is chronological backtracking with propagation. It is complete for finite grids if every candidate is eventually tried and no execution budget stops the search.

## Core Data Structures

### Cell State

The existing `Cell` shape can remain the public state:

```typescript
type Cell = {
  choices: TileDef[];
  collapsed: boolean;
  forbidden: TileDef[];
  coords: Coords;
  value?: TileDef;
};
```

Internally, the first implementation can continue using `choices: TileDef[]`. A later performance pass can switch to tile ids or bitsets behind the same public shape.

The invariant is:

- `cell.choices.length > 0` unless the solver is in the middle of reporting a contradiction.
- `cell.collapsed === true` iff `cell.choices.length === 1`.
- `cell.value === cell.choices[0]` when collapsed.
- `cell.value === undefined` when not collapsed.

### Trail Entry

A trail entry records the previous state needed to undo one cell mutation.

```typescript
type TrailEntry<Coords> = {
  coords: Coords;
  previousChoices: TileDef[];
  previousCollapsed: boolean;
  previousValue?: TileDef;
  reason: "decision" | "propagation" | "seed";
};
```

Before changing a cell, the solver pushes exactly one trail entry for that cell for the current operation. If the same cell changes multiple times in one operation, coalesce those changes so rollback restores the state at the operation boundary, not an intermediate state.

### Decision Frame

A decision frame represents one explicit choice made by the solver.

```typescript
type DecisionFrame<Coords> = {
  coords: Coords;
  candidates: TileDef[];
  nextCandidateIndex: number;
  trailMark: number;
  depth: number;
};
```

The frame owns candidate exhaustion. There is no separate global exhaustion tracker for normal chronological search.

### Change Delta

Progressive sketches need forward and backward deltas. Each solver step should yield enough information to render the change without diffing the whole grid.

```typescript
type CellDelta<Coords> = {
  coords: Coords;
  before: {
    choices: TileDef[];
    collapsed: boolean;
    value?: TileDef;
  };
  after: {
    choices: TileDef[];
    collapsed: boolean;
    value?: TileDef;
  };
  reason: "decision" | "propagation" | "rollback" | "seed";
};
```

Rollback deltas are produced by applying trail entries in reverse. For rendering, the important fact is not just that a backtrack happened, but which cells regained choices or became uncollapsed.

### Step Result

The current `StepResult` should be expanded rather than replaced abruptly.

```typescript
type StepResult<Coords = unknown> = {
  type:
    | "decision"
    | "propagation"
    | "rollback"
    | "contradiction"
    | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
  deltas?: CellDelta<Coords>[];
  depth?: number;
  contradiction?: {
    coords: Coords;
    attempted?: TileDef;
    reason: string;
  };
};
```

Compatibility aliases can be kept initially:

- A `"decision"` step may also emit the existing `"collapse"` event.
- A `"rollback"` step may also emit the existing `"backtrack"` event.
- `affectedCells` remains available for existing sketches, while `deltas` becomes the preferred progressive rendering API.

## Algorithm

### Initialization

1. Validate tile definitions.
2. Initialize each cell with all tiles.
3. Clear the decision stack, trail, propagation queue, and counters.
4. Optionally apply initial seed assignments as fixed decisions.

Initial seed behavior should be strict:

- If a seed is immediately inconsistent, emit `error` and throw.
- Do not backtrack over user-provided fixed seed assignments unless a future option explicitly allows soft seeds.

### Main Loop

Pseudocode:

```typescript
while (!complete) {
  const cell = selectNextCell();

  if (!cell) {
    yield complete;
    return;
  }

  const frame = createDecisionFrame(cell);
  push(frame);

  while (frame exists) {
    if (frame.nextCandidateIndex >= frame.candidates.length) {
      const rollback = rollbackFrame(frame);
      yield rollback;
      pop(frame);
      frame = previousFrame();
      continue;
    }

    const candidate = frame.candidates[frame.nextCandidateIndex++];
    const decision = assign(frame.coords, candidate, "decision");
    yield decision;

    const propagation = propagateFrom(frame.coords);
    yield propagation steps as needed;

    if (propagation.success) {
      break; // return to outer loop and choose next cell
    }

    yield contradiction;
    const rollback = rollbackTo(frame.trailMark);
    yield rollback;
  }

  if (no frames and not complete) {
    throw unsatisfiable or restart, depending on options;
  }
}
```

In implementation, this can be expressed iteratively to keep generator stepping predictable.

### Selecting Variables

Use minimum remaining values:

- Ignore cells with `collapsed === true`.
- Choose the smallest `choices.length`.
- Break ties randomly with the injected RNG.

Later options can add:

- Degree heuristic as a tie breaker.
- Entropy using tile weights.
- Scanline mode for deterministic visual fills.

### Ordering Values

For the first implementation:

- Candidate order is weighted-random without replacement.
- The candidate list is stored on the frame so retries do not resample already failed choices.

Later options can add:

- Least-constraining value ordering.
- User-provided value ordering.
- Constraint-weighted ordering after repeated failures.

### Assignment

Assigning a candidate to a cell means:

1. Record the cell's previous state in the trail.
2. Replace `choices` with `[candidate]`.
3. Set `collapsed = true`.
4. Set `value = candidate`.
5. Emit/yield a decision delta.
6. Add neighboring arcs to the propagation queue.

### Propagation

Propagation should use an arc/worklist model:

- An arc is `(sourceCell, targetCell, directionFromTargetToSource)` or equivalent.
- Revising a target removes any target tile that has no compatible source tile.
- Every removed tile is represented in a delta and recorded on the trail.
- If a target domain changes, add its neighboring arcs back to the queue.
- If a target domain becomes empty, stop and report contradiction.

This matches AC-3-style propagation, scoped to arcs affected by recent decisions.

Auto-collapse remains an effect of propagation:

- If propagation reduces a cell to one tile, set `collapsed = true` and `value`.
- This must be recorded as a propagation delta, not as a new decision frame.
- Rollback restores it to uncollapsed if the trail says it was uncollapsed before.

### Contradiction

A contradiction occurs when a cell domain becomes empty.

The solver should report:

- The contradicted cell coordinates.
- The decision depth.
- The candidate currently being attempted, if known.
- Deltas already applied before the contradiction.

The grid should not be left with an empty-domain cell after the contradiction step is handled. The next rollback step restores the grid to the decision frame's trail mark.

### Rollback

Rollback applies trail entries in reverse until a target trail mark is reached.

For each restored cell:

1. Capture the current state as `before`.
2. Restore `choices`, `collapsed`, and `value` from the trail entry.
3. Emit a rollback delta with the restored state as `after`.

Rollback does not need snapshots. The trail itself is the source of truth.

There are two rollback scopes:

- `rollbackTo(frame.trailMark)`: undo a failed candidate, then try the next candidate on the same frame.
- `rollbackFrame(frame)`: undo the whole frame when all candidates are exhausted, pop it, and continue failure propagation to the previous frame.

### Completion

Completion requires:

- Every cell is collapsed.
- Every collapsed neighbor pair is compatible.
- The trail and decision stack may remain available for diagnostics, but no further rollback occurs.

The completion step should include no grid mutation deltas unless a final validation pass changes state, which it should not.

## Event Contract

Events should remain useful for passive consumers, but generator results are the richer API for progressive sketches.

Recommended events:

- `decision`: emitted when an explicit solver choice is made.
- `collapse`: existing alias for decision, kept for compatibility.
- `propagate`: emitted with propagation deltas or affected cells.
- `contradiction`: emitted before rollback.
- `rollback`: emitted with rollback deltas.
- `backtrack`: existing alias for rollback, kept for compatibility.
- `complete`: emitted when solved.
- `error`: emitted for unrecoverable failure.

Sketches that animate the wave should prefer `StepResult.deltas`.

## Options

The current options should be rationalized:

```typescript
type WFCOptions = {
  random?: RandomLib;
  logLevel?: LogLevel;
  maxBacktracks?: number;
  maxDecisions?: number;
  maxSteps?: number;
  onContradiction?: "backtrack" | "restart" | "fail";
  valueOrdering?: "weighted-random" | "least-constraining";
  variableOrdering?: "mrv" | "weighted-entropy" | "scanline";
};
```

Compatibility mapping:

- `maxRetries` can temporarily map to `maxBacktracks` or restart attempts, but docs should clarify the new meaning.
- `backtrackStep` and `backtrackStrategy` should be deprecated unless a real non-chronological strategy is implemented.

## Differences From The Current Implementation

| Concern | Current Snapshot Tree | Trail-Based Rollback |
| --- | --- | --- |
| Rollback source | Snapshot ids in a tree | Trail marks on decision frames |
| Tried choices | Node and global exhaustion structures | Candidate index inside the frame |
| Memory growth | Snapshot per successful collapse | One trail entry per mutated cell state |
| Progressive rendering | Backtrack event lacks cell-level restore deltas | Rollback deltas are first-class |
| Failure reasoning | Viable ancestor search | Exhaust current frame, then parent |
| Correctness model | Multiple structures must agree | Stack discipline enforces ownership |
| Multi-cell decisions | Type supports them, exhaustion is incomplete | Start with single-cell decisions; group decisions can be explicit later |

## Test Strategy

Tests should prove both solver correctness and progressive observability.

### Unit Tests

1. `Trail.test.ts`
   - Records a cell mutation and restores it exactly.
   - Coalesces repeated mutations in one operation.
   - Produces rollback deltas in reverse mutation order.

2. `DecisionStack.test.ts`
   - Candidate order is sampled once per frame.
   - Failed candidates are not retried.
   - Exhausting a frame rolls back to the parent frame.

3. `Propagation.test.ts`
   - A decision removes incompatible neighbor choices.
   - Empty domain reports contradiction.
   - Auto-collapse caused by propagation is recorded as propagation, not as a decision.

4. `StepDeltas.test.ts`
   - `decision` steps include before/after for the chosen cell.
   - `propagation` steps include only cells whose domains changed.
   - `rollback` steps restore cells and include deltas that match the grid after rollback.

### Integration Tests

1. Solvable without backtracking
   - Simple tileset where all choices are compatible.
   - Assert complete grid and zero rollback steps.

2. Requires one backtrack
   - Deterministic RNG first chooses a dead-end tile.
   - Assert contradiction, rollback delta, second candidate, completion.

3. Requires multiple-level backtracking
   - A small handcrafted grid where the failure is caused by an earlier decision.
   - Assert parent frame is retried and final solution is valid.

4. Unsatisfiable
   - Exhaust all candidates.
   - Assert the solver fails deterministically with no empty-domain cell left in the public grid.

5. Initial seed
   - Valid seed participates in propagation.
   - Invalid seed throws without backtracking over the seed.

6. Custom grid
   - Reuse or adapt the custom grid tests to ensure neighbor ordering and `getAdjacencyMap` still work.

7. Precomputed adjacencies
   - Run the same fixture with dynamic matching and precomputed matching.
   - Assert identical final validity and compatible step semantics.

### Property-Style Tests

For many small random tile sets and deterministic RNG seeds:

- Every successful run ends with all cells collapsed.
- Every adjacent pair is compatible.
- No step leaves a public cell with zero choices after rollback completes.
- Replaying deltas from an initialized empty grid reconstructs the solver's visible state at each step.

### Sketch-Oriented Tests

These tests should model the p5 usage pattern:

- Drive `execute()` one step at a time.
- Renderers can update from `deltas` without scanning the whole grid.
- Rollback deltas are sufficient to unrender or redraw changed cells.
- Chunked execution can process N steps per frame without losing event order.

### Regression Tests

Before using the known `iso.js` failing seed as the main target, keep it as a manual or long-running regression:

- Build a smaller deterministic fixture that fails under the old approach.
- Add the `iso.js` seed once the core trail tests are passing, ideally behind an integration or benchmark test because it may be larger and slower.

## Implementation Phases

1. Introduce internal types for trail entries, decision frames, and cell deltas.
2. Add tests for trail rollback in isolation.
3. Replace snapshot creation/restoration in `WFC` with trail recording and rollback.
4. Update generator `StepResult` and events to expose deltas.
5. Port existing backtracking tests to the new semantics.
6. Add multi-level, unsatisfiable, custom-grid, and precomputed-adjacency tests.
7. Remove unused snapshot-tree code after equivalent coverage is in place.
8. Run performance work only after correctness and observability are stable.

## Open Questions

These can be decided during implementation:

- Whether propagation yields one step per changed cell, one step per propagation wave, or one step per decision plus all propagation deltas.
- Whether `maxRetries` should mean restart attempts or candidate backtracks during the compatibility window.
- Whether public `Cell.forbidden` should be removed, deprecated, or repurposed for diagnostics only.
- Whether to expose `decision`, `rollback`, and `contradiction` events immediately or first route them through expanded generator results.

## Non-Goals For The First Rewrite

- Conflict-directed backjumping.
- Nogood learning.
- Global constraints such as connectivity or tile-count targets.
- Bitset domains.
- Parallel propagation.
- Automatic pattern extraction.

Those are compatible with the trail model, but they should follow a correct, inspectable chronological solver.
