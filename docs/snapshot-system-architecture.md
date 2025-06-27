# WFC Snapshot-Based Backtracking System Architecture

## Overview

The WFC implementation uses a sophisticated snapshot-based backtracking mechanism to handle contradictions and invalid states during the wave function collapse process. This system allows the algorithm to revert to previous valid states when it encounters impossible configurations.

## Current Implementation (Post-Fix)

### Hierarchical Architecture

The new implementation uses three main components:

1. **SnapshotManager**: Handles delta-only snapshots with reference counting
2. **BacktrackTree**: Manages hierarchical backtracking structure  
3. **ExhaustionTracker**: Tracks tried combinations for precise exhaustion detection

### Key Data Structures

#### `DeltaSnapshot`
```typescript
interface DeltaSnapshot {
  id: number;
  parentSnapshotId?: number;
  deltas: CellDelta[];           // Only changed cells
  referenceCount: number;        // Reference counting for cleanup
  timestamp: number;             // For debugging and cleanup
}
```

#### `BacktrackNode`
```typescript
interface BacktrackNode {
  id: number;
  snapshotId: number;
  parent?: BacktrackNode;
  children: BacktrackNode[];
  targetCells: CellCoords[];
  triedChoices: Map<string, Set<TileId>>;
  depth: number;
  isExhausted: boolean;
}
```

### Reference Counting Fix

**The Problem**: The original implementation had a critical bug where snapshots were deleted immediately after creation due to a `finally` block that always executed:

```typescript
// BUGGY CODE (Fixed)
try {
  // ... collapse logic
  return result;
} finally {
  this.snapshots.removeReference(snapshotId); // Always executed!
}
```

**The Fix**: Reference counting now correctly manages snapshot lifecycle:

```typescript
// FIXED CODE
if (result.success) {
  // Keep snapshot alive - we might need to backtrack to it
  return result;
} else {
  // Remove reference since we're failing
  this.snapshots.removeReference(snapshotId);
  return result;
}
```

**Key Insight**: Successful collapses must keep their snapshots alive because they might be backtrack targets later. Only failed collapses should immediately clean up their snapshots.

## Memory Implications Analysis

### Current Memory Usage Pattern

With the fix, snapshots now accumulate during successful algorithm progression:

```
Algorithm Progress:
Node 1 (success) → Snapshot 1 kept alive (refCount = 1)
├─ Node 2 (success) → Snapshot 2 kept alive (refCount = 1)  
│  ├─ Node 3 (success) → Snapshot 3 kept alive (refCount = 1)
│  │  └─ Node 4 (fail) → Backtrack to Node 3
│  └─ Node 5 (success) → Snapshot 5 kept alive (refCount = 1)
└─ Continue...
```

### Memory Growth Characteristics

#### 1. **Linear Growth During Success**
- Each successful collapse creates a new snapshot
- Snapshots remain in memory as potential backtrack points
- Memory usage grows linearly with algorithm depth

#### 2. **Delta-Only Storage Efficiency**
- Each snapshot only stores changed cells, not full grid state
- Typical delta size: 10-50 cells out of 600 total (83-92% memory savings)
- Storage per delta: ~100 bytes (coordinates + tile names)

#### 3. **Cleanup Triggers**
Snapshots are cleaned up when:
- **Backtracking occurs**: Deeper snapshots become unreachable
- **Algorithm completes**: All snapshots can be freed
- **Reference count reaches zero**: Automatic cleanup

### Memory Usage Estimation

For a 30x20 grid (600 cells) with typical WFC progression:

```
Grid Size: 30x20 = 600 cells
Average Delta Size: ~30 cells (5% of grid)
Bytes per Delta: ~100 bytes
Algorithm Depth: ~300-400 successful collapses

Peak Memory Usage:
- Snapshots: 400 × 30 × 100 bytes = ~1.2 MB
- Grid State: 600 × 200 bytes = ~120 KB  
- Total: ~1.3 MB (very reasonable)
```

### Potential Memory Issues

#### 1. **Deep Backtracking Scenarios**
If the algorithm frequently backtracks many levels deep, older snapshots might accumulate:

```
Scenario: Algorithm gets stuck in deep exploration
├─ 100 successful collapses (100 snapshots)
├─ Backtrack 50 levels
├─ 100 more successful collapses (150 snapshots total)
└─ Memory usage: 150 × 3KB = ~450KB (still reasonable)
```

#### 2. **Large Grid Scenarios**
For very large grids, delta sizes might increase proportionally:

```
Large Grid: 100x100 = 10,000 cells
Average Delta: ~500 cells (5% of grid)
Peak Usage: 1000 × 500 × 100 bytes = ~50 MB (getting significant)
```

#### 3. **Complex Constraint Scenarios**
Highly constrained tilesets might cause more frequent backtracking, keeping more snapshots alive longer.

### Memory Management Strategies

#### Current Mitigations
1. **Reference Counting**: Automatic cleanup when snapshots become unreachable
2. **Delta-Only Storage**: 90%+ memory savings vs full snapshots
3. **Hierarchical Cleanup**: Backtracking automatically prunes deeper snapshots

#### Future Optimizations (If Needed)
1. **Depth-Limited Cleanup**: Automatically clean snapshots older than N levels
2. **Memory Pressure Cleanup**: Clean oldest snapshots when memory usage exceeds threshold
3. **Snapshot Compression**: Compress delta data for long-term storage
4. **Lazy Snapshot Creation**: Only create snapshots when backtracking is likely

### Recommendations

#### For Current Use Cases (Small-Medium Grids)
- **No immediate action needed**: Memory usage is very reasonable
- **Monitor in benchmarks**: Track peak memory usage during testing
- **Consider cleanup frequency**: The current `cleanupFrequency` settings are conservative

#### For Future Large-Scale Use
- **Implement memory monitoring**: Add memory usage tracking to WFC class
- **Add configurable limits**: Allow users to set maximum snapshot count/memory
- **Consider hybrid approaches**: Keep recent snapshots in memory, archive older ones

### Configuration Impact

The current backtrack strategies have different memory profiles:

```typescript
BACKTRACK_STRATEGIES = {
  conservative: { maxLevels: 1, cleanupFrequency: 100 },  // Low memory
  aggressive: { maxLevels: 5, cleanupFrequency: 50 },     // Medium memory  
  deep: { maxLevels: 10, cleanupFrequency: 25 }           // Higher memory
};
```

**Recommendation**: Start with `conservative` for memory-constrained environments, use `aggressive` for balanced performance, and `deep` only when necessary for complex problems.

## Conclusion

The reference counting fix resolved the critical "snapshot not found" bug while introducing a predictable memory usage pattern. For typical use cases, memory consumption remains very reasonable (~1-2 MB), and the delta-only approach provides excellent efficiency. The system is well-positioned for future optimization if needed for larger-scale applications.

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