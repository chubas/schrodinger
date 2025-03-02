import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { TileDef } from "./TileDef.js";
import { Grid, Cell, GridSnapshot, SquareGrid } from "./Grid.js";
import { debugDelta } from "./util.js";
import { EventEmitter } from "events";

export type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
};

export type CellCollapse = {
  coords: [number, number];
  value?: TileDef;  // If undefined, will pick based on entropy
};

export type CollapseGroup = {
  cells: CellCollapse[];
  cause: 'initial' | 'entropy' | 'propagation';
  maxAttempts?: number;  // Optional limit for retries at this level
};

export type CollapseResult = {
  success: boolean;
  affectedCells: Cell[];
  propagatedCollapses?: CollapseGroup[];
};

export type WFCEvents = {
  'collapse': (group: CollapseGroup) => void;
  'propagate': (cells: Cell[]) => void;
  'backtrack': (from: CollapseGroup) => void;
  'complete': () => void;
  'error': (error: Error) => void;
};

export type DeltaChange<Coords> = {
  collapsedCell: Cell;
  pickedValue: TileDef;
  discardedValues: Array<{
    coords: Coords;
    tiles: TileDef[];
    collapsed: boolean;
  }>;
  backtrack?: boolean;
};

interface ProposedChange {
  cell: Cell;
  newChoices: TileDef[];
  originalChoices: TileDef[];
}

// Add new types for backtracking
type BacktrackState = {
  snapshotId: number;
  group: CollapseGroup;
  triedValues: Map<string, Set<TileDef>>;  // coords string -> tried values
  parentState?: BacktrackState;  // Link to previous state for multi-level backtrack
  attempts: number;
  wasSuccessful?: boolean;  // Track if this state led to a successful collapse
};

export class WFC extends EventEmitter {
  private tileDefs: TileDef[];
  private options: Required<WFCOptions>;
  private retries: number;
  private grid: Grid;
  private rng: RandomLib;
  private deltaStack: DeltaChange<[number, number]>[];
  private collapseQueue: CollapseGroup[] = [];
  private propagationQueue: Set<Cell> = new Set();
  private snapshots: Map<number, GridSnapshot> = new Map();
  private snapshotCounter: number = 0;
  private currentBacktrackState?: BacktrackState;
  private readonly MAX_ATTEMPTS_PER_LEVEL = 10;  // Configurable

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.tileDefs = tileDefs;
    this.grid = grid;
    this.initializeGrid();
    this.options = {
      maxRetries: options.maxRetries ?? 100,
      backtrackStep: options.backtrackStep ?? 1,
      random: options.random ?? new DefaultRandom(),
    };
    this.rng = this.options.random;
    this.retries = 0;
    this.deltaStack = [];
  }

  initializeGrid() {
    const iterator = this.grid.iterate();
    for (const [cells, [x, y]] of iterator) {
      // Initialize all tiles with all possible tile definitions
      this.grid.set([x, y], {
        choices: [...this.tileDefs],
        collapsed: false,
        forbidden: [],
        coords: [x, y],
      });
    }
  }
  // Utility function: pick
  pick<T>(array: T[]): T {
    return array[Math.floor(this.rng.random() * array.length)];
  }

  get completed(): boolean {
    // Return true if all cells have been collapsed, that is, they only have one possible tile definition
    const iterator = this.grid.iterate();
    for (const [cell, _] of iterator) {
      if (!cell.collapsed) {
        return false;
      }
    }
    return true;
  }

  start(initialSeed?: CellCollapse[]): void {
    try {
      if (initialSeed && initialSeed.length > 0) {
        this.collapseQueue.push({
          cells: initialSeed,
          cause: 'initial'
        });
      } else {
        // Start with lowest entropy cell
        const uncollapsed = this.grid.getCells().filter(cell => !cell.collapsed);
        if (uncollapsed.length === 0) {
          this.emit('complete');
          return;
        }
        const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
        this.collapseQueue.push({
          cells: [{
            coords: lowestEntropy.coords,
            value: undefined
          }],
          cause: 'entropy'
        });
      }

      this.processCollapseQueue();
    } catch (error) {
      this.emit('error', error);
    }
  }

  private processCollapseQueue(): void {
    while (this.collapseQueue.length > 0) {
      const currentGroup = this.collapseQueue.shift()!;

      // Create new backtrack state
      const snapshotId = this.takeSnapshot();
      const backtrackState: BacktrackState = {
        snapshotId,
        group: currentGroup,
        triedValues: new Map(),
        attempts: 0,
        parentState: this.currentBacktrackState
      };

      this.currentBacktrackState = backtrackState;

      try {
        const success = this.attemptCollapseWithRetries(backtrackState);
        if (!success) {
          // If we couldn't collapse even with retries, we need to go back further
          console.log('Failed to collapse with current state, attempting multi-level backtrack');
          console.log('Current state:', this.currentBacktrackState?.group.cells.map(c => c.coords));
          console.log('Has parent:', !!this.currentBacktrackState?.parentState);
          if (!this.handleMultiLevelBacktrack()) {
            throw new Error("Pattern is uncollapsable - no valid solutions found");
          }
          continue;  // Try next iteration with backtracked state
        }

        // Success! Keep the backtrack state for potential future backtracking
        // but mark it as successful so we know we can try different values if needed
        backtrackState.wasSuccessful = true;

        // If queue is empty but we still have uncollapsed cells, add lowest entropy
        if (this.collapseQueue.length === 0 && !this.completed) {
          const uncollapsed = this.grid.getCells().filter(cell => !cell.collapsed);
          if (uncollapsed.length > 0) {
            const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
            this.collapseQueue.push({
              cells: [{
                coords: lowestEntropy.coords,
                value: undefined
              }],
              cause: 'entropy'
            });
          }
        }
      } catch (error) {
        // Fatal error - restore to last known good state
        if (this.currentBacktrackState) {
          this.restoreSnapshot(this.currentBacktrackState.snapshotId);
        }
        throw error;
      }
    }

    if (this.completed) {
      this.emit('complete');
    }
  }

  private attemptCollapseWithRetries(state: BacktrackState): boolean {
    const maxAttempts = state.group.maxAttempts ?? this.MAX_ATTEMPTS_PER_LEVEL;

    while (state.attempts < maxAttempts) {
      // Restore state before each attempt (except first)
      if (state.attempts > 0) {
        this.restoreSnapshot(state.snapshotId);
      }

      const result = this.collapseGroupWithTracking(state);
      if (result.success) {
        this.emit('collapse', state.group);
        // Add any new collapses from propagation to the queue
        if (result.propagatedCollapses) {
          this.collapseQueue.push(...result.propagatedCollapses);
        }
        return true;
      }

      state.attempts++;
      this.emit('backtrack', {
        ...state.group,
        // Add debug info about tried values
        debug: {
          attempts: state.attempts,
          triedValues: Array.from(state.triedValues.entries()).map(([coords, values]) => ({
            coords,
            values: Array.from(values).map(v => v.name)
          }))
        }
      });

      // Check if we've exhausted all possibilities for this group
      if (this.hasExhaustedAllChoices(state)) {
        console.log('Exhausted all choices for group:', state.group.cells.map(c => c.coords));
        return false;  // This will trigger multi-level backtrack in processCollapseQueue
      }
    }

    console.log('Exceeded max attempts:', maxAttempts, 'for group:', state.group.cells.map(c => c.coords));
    return false;  // Exceeded max attempts
  }

  private collapseGroupWithTracking(state: BacktrackState): CollapseResult {
    const { group, triedValues } = state;

    // First pass: validate and select values for collapse
    const selectedValues = new Map<string, TileDef>();

    for (const cellCollapse of group.cells) {
      const cell = this.grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tried = triedValues.get(coordKey) || new Set<TileDef>();

      // Filter out already tried values - use cell.choices from current state
      const availableChoices = cell.choices.filter(choice => !tried.has(choice));
      console.log('Available choices for', cell.coords, ':', availableChoices.map(c => c.name),
                 'after excluding tried:', Array.from(tried).map(c => c.name),
                 'from total choices:', cell.choices.map(c => c.name));

      if (availableChoices.length === 0) {
        console.log('No more available choices for cell:', cell.coords);
        return { success: false, affectedCells: [] };
      }

      // Select new value
      const value = cellCollapse.value ?? this.pick(availableChoices);
      selectedValues.set(coordKey, value);

      // Track this value as tried - ensure the set exists first
      if (!triedValues.has(coordKey)) {
        triedValues.set(coordKey, new Set());
      }
      triedValues.get(coordKey)!.add(value);

      console.log('Trying:', value.name, 'for cell', cell.coords,
                 '(attempt', state.attempts + 1, 'of', state.group.maxAttempts ?? this.MAX_ATTEMPTS_PER_LEVEL, ')',
                 'remaining untried:', availableChoices.filter(c => !tried.has(c)).map(c => c.name));
    }

    // Now proceed with actual collapse using selected values
    return this.collapseGroupWithValues(group, selectedValues);
  }

  private collapseGroupWithValues(group: CollapseGroup, selectedValues: Map<string, TileDef>): CollapseResult {
    const affectedCells: Cell[] = [];
    const propagatedCollapses: CollapseGroup[] = [];

    // First pass: collapse all cells in the group
    for (const cellCollapse of group.cells) {
      const cell = this.grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey)!;

      console.log('Collapsing cell', cell.coords, 'to', value.name,
                 'from choices:', cell.choices.map(c => c.name));

      cell.collapsed = true;
      cell.choices = [value];
      affectedCells.push(cell);
    }

    // Second pass: propagate from all collapsed cells
    this.propagationQueue.clear();
    for (const cell of affectedCells) {
      this.queueNeighborsForPropagation(cell);
    }

    // Process propagation queue until empty
    while (this.propagationQueue.size > 0) {
      const currentCell = this.propagationQueue.values().next().value;
      if (!currentCell) continue;  // TypeScript safety

      this.propagationQueue.delete(currentCell);
      const originalChoices = [...currentCell.choices];
      const neighbors = this.grid.getNeighbors(currentCell.coords);

      // Update choices based on all neighbors
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const validChoices = this.filterValidAdjacencies(currentCell, neighbor, i);
        currentCell.choices = currentCell.choices.filter(choice => validChoices.includes(choice));
      }

      // If choices changed, queue neighbors for propagation
      if (currentCell.choices.length !== originalChoices.length) {

        // Log which choices were removed
        const removedChoices = originalChoices.filter(c => !currentCell.choices.includes(c));
        console.log('Removed choices:', removedChoices.map(c => c.name), 'for cell', currentCell.coords, ' remain: ', currentCell.choices.map(c => c.name));

        affectedCells.push(currentCell);

        // If no choices left, collapse has failed
        if (currentCell.choices.length === 0) {
          return { success: false, affectedCells };
        }

        // If only one choice left, add to collapse queue
        if (currentCell.choices.length === 1 && !currentCell.collapsed) {
          propagatedCollapses.push({
            cells: [{
              coords: currentCell.coords,
              value: currentCell.choices[0]
            }],
            cause: 'propagation'
          });
        }

        this.queueNeighborsForPropagation(currentCell);
      }
    }

    this.emit('propagate', affectedCells);
    return {
      success: true,
      affectedCells,
      propagatedCollapses: propagatedCollapses.length > 0 ? propagatedCollapses : undefined
    };
  }

  private queueNeighborsForPropagation(cell: Cell): void {
    const neighbors = this.grid.getNeighbors(cell.coords);
    for (const neighbor of neighbors) {
      if (neighbor && !neighbor.collapsed) {
        this.propagationQueue.add(neighbor);
      }
    }
  }

  private takeSnapshot(): number {
    const snapshot = this.grid.toSnapshot();
    const id = this.snapshotCounter++;
    this.snapshots.set(id, snapshot);
    console.log('Taking snapshot', id, 'Current grid state:');
    this.debugGridState();
    return id;
  }

  private restoreSnapshot(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot ${id} not found`);
    }
    console.log('Restoring snapshot', id, 'Previous grid state:');
    this.debugGridState();
    this.grid = SquareGrid.fromSnapshot(snapshot);
    console.log('After restore:');
    this.debugGridState();
  }

  private debugGridState() {
    const iterator = this.grid.iterate();
    for (const [cell, coords] of iterator) {
      console.log(`[${coords}]: ${cell.choices.map(c => c.name).join(',')}`);
    }
  }

  // Return the tile with the least amount of possible tile definitions.
  // In case of a tie, return a random one.
  getLowestEntropyTile(cells: Cell[]): Cell {
    let candidates: Cell[] = [];
    let minEntropy = Number.MAX_SAFE_INTEGER;
    for (const cell of cells) {
      const entropy = cell.choices.length;
      if (entropy < minEntropy) {
        minEntropy = entropy;
        candidates = [cell];
      } else if (entropy === minEntropy) {
        candidates.push(cell);
      }
    }
    return this.pick(candidates);
  }

  // Modified propagate method to use two-phase approach
  propagate(cell: Cell, collapseValue: TileDef): DeltaChange<[number, number]> {
    const proposedChanges = new Map<string, ProposedChange>();
    const changedValues: DeltaChange<[number, number]> = {
      collapsedCell: cell,
      pickedValue: collapseValue,
      discardedValues: [],
    };

    // Phase 1: Collect all potential changes without applying them
    const cellsToProcess = [cell];
    const processedCells = new Set<string>();

    while (cellsToProcess.length > 0) {
      const currentCell = cellsToProcess.shift()!;
      const cellKey = `${currentCell.coords[0]},${currentCell.coords[1]}`;

      if (processedCells.has(cellKey)) continue;
      processedCells.add(cellKey);

      const neighbors = this.grid.getNeighbors(currentCell.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor || neighbor.collapsed) continue;

        const neighborKey = `${neighbor.coords[0]},${neighbor.coords[1]}`;
        if (processedCells.has(neighborKey)) continue;

        const validAdjacencies = this.filterValidAdjacencies(neighbor, currentCell, i);

        // Only track changes if the choices would actually change
        if (validAdjacencies.length !== neighbor.choices.length) {
          proposedChanges.set(neighborKey, {
            cell: neighbor,
            newChoices: validAdjacencies,
            originalChoices: [...neighbor.choices]
          });
          cellsToProcess.push(neighbor);
        }
      }
    }
    console.log('Proposed changes:', proposedChanges);

    // Phase 2: Validate and apply changes
    const invalidChanges = this.validateProposedChanges(proposedChanges);
    if (invalidChanges.size > 0) {
      // If we found invalid changes, mark for backtracking
      changedValues.backtrack = true;
      return changedValues;
    }

    // Apply all valid changes
    for (const [key, change] of proposedChanges) {
      const { cell, newChoices, originalChoices } = change;
      cell.choices = newChoices;

      // Track removed choices for the delta
      const removed = originalChoices.filter(c => !newChoices.includes(c));
      if (removed.length > 0) {
        changedValues.discardedValues.push({
          coords: cell.coords,
          tiles: removed,
          collapsed: cell.collapsed
        });
      }

      // Auto-collapse if only one choice remains
      if (newChoices.length === 1 && !cell.collapsed) {
        cell.collapsed = true;
      }
    }

    return changedValues;
  }

  // Helper method to validate proposed changes
  private validateProposedChanges(proposedChanges: Map<string, ProposedChange>): Set<string> {
    const invalidChanges = new Set<string>();

    for (const [key, change] of proposedChanges) {
      const { cell, newChoices } = change;

      // Check if cell would have no valid choices
      if (newChoices.length === 0) {
        invalidChanges.add(key);
        continue;
      }

      // Check if changes would create conflicts with neighbors
      const neighbors = this.grid.getNeighbors(cell.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const neighborKey = `${neighbor.coords[0]},${neighbor.coords[1]}`;
        const neighborChoices = proposedChanges.has(neighborKey)
          ? proposedChanges.get(neighborKey)!.newChoices
          : neighbor.choices;

        // Check if there's at least one valid adjacency between the cells
        let hasValidAdjacency = false;
        for (const option of newChoices) {
          for (const neighborOption of neighborChoices) {
            const d1 = option.adjacencies[i];
            const d2 = neighborOption.adjacencies[this.grid.adjacencyMap[i]];
            if (d1 === d2) {
              hasValidAdjacency = true;
              break;
            }
          }
          if (hasValidAdjacency) break;
        }

        if (!hasValidAdjacency) {
          invalidChanges.add(key);
          break;
        }
      }
    }

    return invalidChanges;
  }

  // TODO: Implementation is quadratic, can be optimized by precalculating the total of possible adjacencies
  filterValidAdjacencies(
    cell: Cell,
    neighbor: Cell,
    direction: number,
  ): TileDef[] {
    const valid = [];
    for (const option of cell.choices) {
      for (const adjacentOption of neighbor.choices) {
        const d1 = option.adjacencies[direction];
        const d2 =
          adjacentOption.adjacencies[this.grid.adjacencyMap[direction]];
        if (d1 === d2) {
          valid.push(option);
          break;
        }
      }
    }
    return valid;
  }

  undoChange(delta: DeltaChange<[number, number]>): Cell[] {
    const revertedCells = [];
    const { collapsedCell, pickedValue, discardedValues } = delta;
    collapsedCell.collapsed = false;
    // collapsedCell.choices = [...discardedValues[0].tiles];
    collapsedCell.forbidden.push(pickedValue);
    for (const { coords, tiles, collapsed } of discardedValues) {
      const cell = this.grid.get(coords);
      if (cell) {
        // Add back the removed tiles
        // console.log('Adding back:', tiles.map(t => t.name), 'to', cell.coords, cell.choices.map(t => t.name));
        cell.choices = [...cell.choices, ...tiles];
        cell.collapsed = cell.choices.length === 1;
        revertedCells.push(cell);
      }
    }
    return revertedCells;
  }

  private hasExhaustedAllChoices(state: BacktrackState): boolean {
    const { group, triedValues } = state;

    for (const cellCollapse of group.cells) {
      const cell = this.grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tried = triedValues.get(coordKey) || new Set<TileDef>();

      // If there are any untried choices, we haven't exhausted all possibilities
      if (cell.choices.some(choice => !tried.has(choice))) {
        return false;
      }
    }

    return true;
  }

  private handleMultiLevelBacktrack(): boolean {
    while (this.currentBacktrackState?.parentState) {
      console.log('Attempting to backtrack to parent state from:',
                 this.currentBacktrackState.group.cells.map(c => c.coords));

      // Clean up current level
      this.snapshots.delete(this.currentBacktrackState.snapshotId);

      // Go up one level
      const parentState = this.currentBacktrackState.parentState;
      console.log('Parent state:', parentState.group.cells.map(c => c.coords));
      console.log('Parent was successful:', parentState.wasSuccessful);
      console.log('Parent has untried choices:', !this.hasExhaustedAllChoices(parentState));

      // Restore parent state
      this.restoreSnapshot(parentState.snapshotId);
      this.currentBacktrackState = parentState;

      // Try to collapse at this level again if it was previously successful
      // and still has untried choices
      if (parentState.wasSuccessful && !this.hasExhaustedAllChoices(parentState)) {
        console.log('Found valid parent state to backtrack to:',
                   parentState.group.cells.map(c => c.coords));

        // Add this group back to the queue to retry with new values
        this.collapseQueue.unshift({
          ...parentState.group,
          maxAttempts: this.MAX_ATTEMPTS_PER_LEVEL - parentState.attempts
        });
        return true;
      }

      console.log('Parent state exhausted or was not successful, continuing up...');
    }

    return false;  // No more levels to backtrack to
  }
}
