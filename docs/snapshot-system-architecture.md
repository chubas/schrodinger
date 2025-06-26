# WFC Snapshot-Based Backtracking System Architecture

## Overview

The WFC implementation uses a sophisticated snapshot-based backtracking mechanism to handle contradictions and invalid states during the wave function collapse process. This system allows the algorithm to revert to previous valid states when it encounters impossible configurations.

## Core Components

### 1. Snapshot Data Structures

#### `CellDelta`
```typescript
type CellDelta = {
  cellId: string;        // Formatted as "x,y" for SquareGrid
  choices: TileDef[];    // The choices at the time of snapshot
  collapsed: boolean;    // Whether the cell was collapsed
  value?: TileDef;       // The value if collapsed
};
```

#### `DeltaSnapshot`
```typescript
type DeltaSnapshot = {
  deltas: Map<string, CellDelta>;     // Map of cell IDs to their state
  changedCellIds: Set<string>;        // Set of cell IDs that have changed since the last snapshot
};
```

#### `BacktrackState`
```typescript
type BacktrackState = {
  snapshotId: number;                          // Reference to the snapshot
  group: CollapseGroup;                        // The collapse group being attempted
  triedValues: Map<string, Set<TileDef>>;      // Track tried values per cell
  parentState?: BacktrackState;                // Link to previous state for multi-level backtrack
  attempts: number;                            // Current attempt count
  wasSuccessful?: boolean;                     // Track if this state led to success
};
```

### 2. Snapshot Management

#### Taking Snapshots (`takeSnapshot()`)
1. **Incremental Counter**: Each snapshot gets a unique ID via `snapshotCounter++`
2. **Full State Capture**: Iterates through all grid cells and captures their current state
3. **Change Detection**: Compares against `lastCellState` to identify changed cells
4. **Storage**: Stores the snapshot in the `snapshots` Map
5. **State Tracking**: Updates `lastCellState` for future change detection

#### Restoring Snapshots (`restoreSnapshot()`)
1. **Snapshot Lookup**: Retrieves snapshot by ID from the `snapshots` Map
2. **Selective Restoration**: Only restores cells marked as changed in `changedCellIds`
3. **Grid Update**: Directly modifies grid cells to match snapshot state
4. **State Sync**: Updates `lastCellState` to reflect the restored state

### 3. Backtracking Hierarchy

The system implements a multi-level backtracking hierarchy:

```
Current Collapse Attempt
├── Local Retries (up to MAX_ATTEMPTS_PER_LEVEL = 10)
│   ├── Restore to current snapshot
│   ├── Try different tile values
│   └── Repeat until success or exhausted
└── Multi-Level Backtrack
    ├── Check parent BacktrackState for untried options
    ├── Recursively traverse up the state hierarchy
    └── Find deepest state with remaining possibilities
```

## How the System Should Work

### 1. Normal Operation Flow

1. **Collapse Group Processing**:
   - Take snapshot before attempting collapse
   - Create BacktrackState linking to snapshot
   - Attempt to collapse the group

2. **Success Path**:
   - Mark BacktrackState as successful
   - Clean up snapshot (delete from storage)
   - Continue to next collapse group

3. **Failure Path**:
   - Restore to snapshot
   - Try different tile values (tracked in `triedValues`)
   - If all local options exhausted, escalate to multi-level backtrack

### 2. Multi-Level Backtracking

When local retries fail:
1. Walk up the `parentState` chain
2. For each level, check if there are untried choices using `hasExhaustedAllChoices()`
3. When a viable state is found:
   - Restore to that snapshot
   - Clean up snapshots from deeper states
   - Retry with different values

### 3. Snapshot Lifecycle

```
Creation → Active Use → Cleanup
    ↓           ↓          ↓
takeSnapshot  restore   delete
```

**Creation**: Snapshot taken before each collapse attempt
**Active Use**: Referenced by BacktrackState for restoration
**Cleanup**: Deleted when no longer needed to prevent memory leaks

## Identified Issues and Drawbacks

### 1. **Snapshot Cleanup Race Conditions**

**Issue**: Snapshots are being deleted in multiple places, potentially before they're needed:

```typescript
// In processCollapseQueueGenerator - Success path
this.snapshots.delete(snapshotId);

// In handleMultiLevelBacktrackGenerator - Before moving to parent
this.snapshots.delete(currentState.snapshotId);

// In exception handlers
this.snapshots.delete(snapshotId);
```

**Problem**: A snapshot might be deleted while still referenced by a BacktrackState, leading to "Snapshot X not found" errors.

### 2. **Inconsistent State Management**

**Issue**: The `hasExhaustedAllChoices()` method relies on snapshots being available:

```typescript
const snapshot = this.snapshots.get(state.snapshotId);
if (!snapshot) return true; // If no snapshot, consider exhausted
```

**Problem**: If a snapshot is prematurely deleted, the system incorrectly assumes all choices are exhausted.

### 3. **Memory Management Complexity**

**Issue**: The system maintains multiple data structures that must be kept in sync:
- `snapshots` Map
- `lastCellState` Map  
- `currentBacktrackState` hierarchy
- `triedValues` tracking

**Problem**: Complex interdependencies make it error-prone and difficult to debug.

### 4. **Incremental Snapshot Strategy Issues**

**Issue**: The system tries to optimize by only tracking "changed" cells, but this creates complexity:
- Change detection logic in `takeSnapshot()`
- Selective restoration in `restoreSnapshot()`
- Dependency on `lastCellState` accuracy

**Problem**: If change detection fails or `lastCellState` becomes inconsistent, restoration may be incomplete.

## Improvement Suggestions

### 1. **Reference Counting for Snapshots**

Instead of immediate deletion, implement reference counting:

```typescript
type SnapshotInfo = {
  snapshot: DeltaSnapshot;
  refCount: number;
  createdAt: number; // For debugging
};

private readonly snapshotRefs: Map<number, SnapshotInfo> = new Map();

addSnapshotRef(id: number): void {
  const info = this.snapshotRefs.get(id);
  if (info) info.refCount++;
}

removeSnapshotRef(id: number): void {
  const info = this.snapshotRefs.get(id);
  if (info && --info.refCount === 0) {
    this.snapshotRefs.delete(id);
  }
}
```

### 2. **Simplified Full-State Snapshots**

Replace the delta-based approach with full state snapshots for reliability:

```typescript
type FullSnapshot = {
  gridState: Map<string, CellState>; // Complete grid state
  metadata: {
    timestamp: number;
    context: string; // For debugging
  };
};
```

### 3. **Explicit Snapshot Ownership**

Make BacktrackState responsible for its snapshot lifecycle:

```typescript
class BacktrackState {
  private _snapshot?: DeltaSnapshot;
  
  constructor(private wfc: WFC, ...) {
    this._snapshot = wfc.createSnapshot();
  }
  
  restore(): void {
    if (this._snapshot) {
      this.wfc.restoreSnapshot(this._snapshot);
    }
  }
  
  dispose(): void {
    this._snapshot = undefined;
  }
}
```

### 4. **Defensive Programming**

Add more robust error handling:

```typescript
private restoreSnapshot(id: number): void {
  const snapshot = this.snapshots.get(id);
  if (!snapshot) {
    this.log(LogLevel.ERROR, `Snapshot ${id} not found. Available: ${Array.from(this.snapshots.keys())}`);
    throw new Error(`Snapshot ${id} not found`);
  }
  // ... rest of restoration logic
}
```

### 5. **Snapshot Debugging Tools**

Add comprehensive logging and validation:

```typescript
private validateSnapshotIntegrity(): void {
  for (const [id, state] of this.backtrackStates) {
    if (!this.snapshots.has(state.snapshotId)) {
      console.error(`BacktrackState ${id} references missing snapshot ${state.snapshotId}`);
    }
  }
}

private logSnapshotStats(): void {
  console.log(`Active snapshots: ${this.snapshots.size}`);
  console.log(`Snapshot IDs: ${Array.from(this.snapshots.keys())}`);
  console.log(`Current counter: ${this.snapshotCounter}`);
}
``` 