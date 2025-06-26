# WFC Snapshot System Debugging Strategy

## Problem Analysis

The error "Snapshot 319 not found" indicates that:
1. A snapshot with ID 319 was created at some point
2. That snapshot was later deleted from the `snapshots` Map
3. Something tried to restore snapshot 319 after it was deleted

This suggests a **snapshot lifecycle management bug** where snapshots are being deleted prematurely.

## Debugging Approach

### Phase 1: Add Comprehensive Logging

First, we need visibility into snapshot lifecycle events. Add logging to track:

#### 1. Snapshot Creation/Deletion Events

```typescript
private takeSnapshot(): number {
  const id = this.snapshotCounter++;
  // ... existing code ...
  
  this.log(LogLevel.INFO, `📷 SNAPSHOT CREATE: ${id} (total: ${this.snapshots.size + 1})`);
  this.log(LogLevel.DEBUG, `📷 Available snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`);
  
  return id;
}

private restoreSnapshot(id: number): void {
  this.log(LogLevel.INFO, `🔄 SNAPSHOT RESTORE: Attempting to restore ${id}`);
  this.log(LogLevel.DEBUG, `🔄 Available snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`);
  
  const snapshot = this.snapshots.get(id);
  if (!snapshot) {
    this.log(LogLevel.ERROR, `❌ SNAPSHOT ERROR: ${id} not found!`);
    this.log(LogLevel.ERROR, `❌ Current snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`);
    this.log(LogLevel.ERROR, `❌ Snapshot counter: ${this.snapshotCounter}`);
    throw new Error(`Snapshot ${id} not found`);
  }
  
  // ... rest of restoration logic
}

// Add this method to track deletions
private deleteSnapshot(id: number, context: string): void {
  const exists = this.snapshots.has(id);
  this.log(LogLevel.INFO, `🗑️ SNAPSHOT DELETE: ${id} from ${context} (existed: ${exists})`);
  if (exists) {
    this.snapshots.delete(id);
    this.log(LogLevel.DEBUG, `🗑️ Remaining snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`);
  }
}
```

#### 2. BacktrackState Lifecycle Tracking

```typescript
private createBacktrackState(group: CollapseGroup, snapshotId: number): BacktrackState {
  const state: BacktrackState = {
    snapshotId,
    group,
    triedValues: new Map(),
    attempts: 0,
    parentState: this.currentBacktrackState,
  };
  
  this.log(LogLevel.INFO, `🔗 BACKTRACK CREATE: snapshot ${snapshotId}, parent: ${state.parentState?.snapshotId || 'none'}`);
  return state;
}
```

### Phase 2: Replace All Direct Snapshot Deletions

Replace direct `this.snapshots.delete(id)` calls with the tracked version:

```typescript
// In processCollapseQueueGenerator
this.deleteSnapshot(snapshotId, "processCollapseQueue-success");

// In handleMultiLevelBacktrackGenerator  
this.deleteSnapshot(currentState.snapshotId, "multiLevelBacktrack");

// In exception handlers
this.deleteSnapshot(snapshotId, "exception-handler");
```

### Phase 3: Add Stack Trace Capture

To understand the call flow leading to the error:

```typescript
private restoreSnapshot(id: number): void {
  this.log(LogLevel.INFO, `🔄 SNAPSHOT RESTORE: Attempting to restore ${id}`);
  
  const snapshot = this.snapshots.get(id);
  if (!snapshot) {
    // Capture and log the call stack
    const stack = new Error().stack;
    this.log(LogLevel.ERROR, `❌ SNAPSHOT ERROR: ${id} not found!`);
    this.log(LogLevel.ERROR, `❌ Call stack:\n${stack}`);
    
    // Additional debugging info
    this.logBacktrackStateChain();
    this.validateSnapshotIntegrity();
    
    throw new Error(`Snapshot ${id} not found`);
  }
  
  // ... rest of restoration logic
}

private logBacktrackStateChain(): void {
  let current = this.currentBacktrackState;
  let depth = 0;
  
  this.log(LogLevel.ERROR, "🔗 Current BacktrackState chain:");
  while (current && depth < 10) { // Prevent infinite loops
    this.log(LogLevel.ERROR, `  Depth ${depth}: snapshot ${current.snapshotId}, attempts ${current.attempts}`);
    current = current.parentState;
    depth++;
  }
}

private validateSnapshotIntegrity(): void {
  let current = this.currentBacktrackState;
  const issues: string[] = [];
  
  while (current) {
    if (!this.snapshots.has(current.snapshotId)) {
      issues.push(`BacktrackState references missing snapshot ${current.snapshotId}`);
    }
    current = current.parentState;
  }
  
  if (issues.length > 0) {
    this.log(LogLevel.ERROR, "🔍 Snapshot integrity issues:");
    issues.forEach(issue => this.log(LogLevel.ERROR, `  - ${issue}`));
  }
}
```

### Phase 4: Reproduce with Detailed Logging

Run the failing seed (126985) with debug logging enabled:

```typescript
// In iso.js, modify the WFC initialization:
wfc = new Schrodinger.WFC(TILES, grid, {
  maxRetries: 10,
  logLevel: Schrodinger.LogLevel.INFO, // Change from DEBUG to avoid spam
  random: rng
});
```

### Phase 5: Analyze the Log Pattern

Look for these patterns in the logs:

1. **Premature Deletion**: A snapshot being deleted while still referenced
2. **Double Deletion**: Attempting to delete the same snapshot twice
3. **Orphaned References**: BacktrackStates referencing non-existent snapshots
4. **Restoration After Deletion**: Calls to restore after the snapshot was deleted

### Phase 6: Root Cause Hypotheses

Based on the code analysis, the most likely causes are:

#### Hypothesis 1: Multi-Level Backtrack Cleanup Issue

In `handleMultiLevelBacktrackGenerator()`, snapshots are deleted before confirming they're no longer needed:

```typescript
// This is problematic:
this.snapshots.delete(currentState.snapshotId);
currentState = currentState.parentState;
```

**Fix**: Don't delete until we're sure the parent state doesn't need it.

#### Hypothesis 2: Exception Handler Race Condition

Exception handlers might be deleting snapshots that are still referenced by other BacktrackStates:

```typescript
// In processCollapseQueueGenerator catch block:
this.snapshots.delete(snapshotId); // Might be premature
```

**Fix**: Only delete if we're sure no other references exist.

#### Hypothesis 3: Success Path Cleanup Too Aggressive

The success path deletes snapshots immediately, but parent BacktrackStates might still reference them:

```typescript
// Success! Keep the backtrack state for potential future backtracking
backtrackState.wasSuccessful = true;
// Clean up snapshot since we succeeded
this.snapshots.delete(snapshotId); // This might be too early
```

### Phase 7: Quick Fix Strategy

While debugging, implement a safer cleanup strategy:

```typescript
// Instead of immediate deletion, mark for later cleanup
private readonly snapshotsToDelete = new Set<number>();

private markSnapshotForDeletion(id: number, context: string): void {
  this.log(LogLevel.DEBUG, `📝 MARK FOR DELETION: ${id} from ${context}`);
  this.snapshotsToDelete.add(id);
}

private cleanupUnusedSnapshots(): void {
  // Only delete snapshots that aren't referenced by any BacktrackState
  const referencedSnapshots = new Set<number>();
  
  let current = this.currentBacktrackState;
  while (current) {
    referencedSnapshots.add(current.snapshotId);
    current = current.parentState;
  }
  
  for (const id of this.snapshotsToDelete) {
    if (!referencedSnapshots.has(id)) {
      this.deleteSnapshot(id, "cleanup");
    }
  }
  
  this.snapshotsToDelete.clear();
}
```

### Phase 8: Test with Incremental Changes

1. **First**: Just add logging without changing behavior
2. **Second**: Replace direct deletions with tracked deletions  
3. **Third**: Implement safer cleanup strategy
4. **Fourth**: Test with the failing seed to confirm fix

## Expected Outcomes

With comprehensive logging, you should be able to identify:

1. **When** snapshot 319 was created
2. **When** and **why** it was deleted
3. **What** tried to restore it after deletion
4. **Which** BacktrackState was holding the stale reference

This will pinpoint the exact cause and guide the appropriate fix.

## Emergency Workaround

As a temporary measure, you could make `restoreSnapshot()` more forgiving:

```typescript
private restoreSnapshot(id: number): void {
  const snapshot = this.snapshots.get(id);
  if (!snapshot) {
    this.log(LogLevel.WARN, `⚠️ Snapshot ${id} not found, attempting recovery`);
    
    // Try to find the most recent snapshot as fallback
    const availableIds = Array.from(this.snapshots.keys()).sort((a, b) => b - a);
    if (availableIds.length > 0) {
      const fallbackId = availableIds[0];
      this.log(LogLevel.WARN, `⚠️ Using fallback snapshot ${fallbackId}`);
      this.restoreSnapshot(fallbackId);
      return;
    }
    
    // If no snapshots available, reset to initial state
    this.log(LogLevel.WARN, `⚠️ No snapshots available, resetting to initial state`);
    this.initializeGrid();
    return;
  }
  
  // ... normal restoration logic
}
```

This won't fix the root cause but will prevent crashes while you debug. 