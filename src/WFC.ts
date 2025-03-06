import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { TileDef } from "./TileDef.js";
import { Grid, Cell, GridSnapshot, SquareGrid } from "./Grid.js";
import { EventEmitter } from "events";
import { matchAdjacencies } from "./Adjacencies.js";

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
  logLevel?: LogLevel;
};

export type CellCollapse = {
  coords: [number, number];
  value?: TileDef; // If undefined, will pick based on entropy
};

export type CollapseGroup = {
  cells: CellCollapse[];
  cause: "initial" | "entropy" | "propagation";
  maxAttempts?: number; // Optional limit for retries at this level
};

export type CollapseResult = {
  success: boolean;
  affectedCells: Cell[];
  propagatedCollapses?: CollapseGroup[];
};

export type WFCEvents = {
  collapse: (group: CollapseGroup) => void;
  propagate: (cells: Cell[]) => void;
  backtrack: (from: CollapseGroup) => void;
  complete: () => void;
  error: (error: Error) => void;
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
  triedValues: Map<string, Set<TileDef>>; // coords string -> tried values
  parentState?: BacktrackState; // Link to previous state for multi-level backtrack
  attempts: number;
  wasSuccessful?: boolean; // Track if this state led to a successful collapse
};

export class WFC extends EventEmitter {
  private readonly tileDefs: TileDef[];
  private readonly options: WFCOptions;
  private readonly retries: number;
  #grid: Grid; // Using private # field for true privacy
  private readonly rng: RandomLib;
  private readonly deltaStack: DeltaChange<[number, number]>[];
  private readonly collapseQueue: CollapseGroup[] = [];
  private readonly propagationQueue: Set<Cell> = new Set();
  private readonly snapshots: Map<number, GridSnapshot> = new Map();
  private snapshotCounter: number = 0;
  private currentBacktrackState?: BacktrackState;
  private readonly MAX_ATTEMPTS_PER_LEVEL = 10;
  private readonly logLevel: LogLevel;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.tileDefs = tileDefs;
    this.#grid = grid;
    this.initializeGrid();
    const random = options.random ?? new DefaultRandom();
    this.options = {
      maxRetries: options.maxRetries ?? 100,
      backtrackStep: options.backtrackStep ?? 1,
      random,
      logLevel: options.logLevel ?? LogLevel.ERROR,
    };
    this.rng = random;
    this.retries = 0;
    this.deltaStack = [];
    this.logLevel = this.options.logLevel ?? LogLevel.ERROR;
  }

  initializeGrid() {
    const iterator = this.#grid.iterate();
    for (const [_cell, [x, y]] of iterator) {
      // Initialize all tiles with all possible tile definitions
      this.#grid.set([x, y], {
        choices: [...this.tileDefs],
        collapsed: false,
        forbidden: [],
        coords: [x, y],
      });
    }
  }
  // Utility function: p
  pick<T>(array: T[]): T {
    let r = this.rng.random();
    let i = Math.floor(r * array.length);
    return array[i];
  }

  get completed(): boolean {
    // Return true if all cells have been collapsed, that is, they only have one possible tile definition
    const iterator = this.#grid.iterate();
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
        // Create a snapshot before applying the seed
        const snapshotId = this.takeSnapshot();

        try {
          // Apply the seed and check for forced collapses
          const result = this.collapseGroupWithValues(
            { cells: initialSeed, cause: "initial" },
            new Map(initialSeed.map(cell => [
              `${cell.coords[0]},${cell.coords[1]}`,
              cell.value!
            ]))
          );

          if (!result.success) {
            // If the initial seed is invalid, restore and throw
            this.restoreSnapshot(snapshotId);
            this.snapshots.delete(snapshotId);
            throw new Error("Initial seed creates an impossible state");
          }

          // Clean up the snapshot since we succeeded
          this.snapshots.delete(snapshotId);
        } catch (error) {
          // Clean up snapshot on any error
          this.snapshots.delete(snapshotId);
          throw error;
        }

        // If we're not done, continue with entropy-based collapses
        if (!this.completed) {
          const uncollapsed = this.#grid
            .getCells()
            .filter((cell) => !cell.collapsed);
          if (uncollapsed.length > 0) {
            const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
            this.collapseQueue.push({
              cells: [
                {
                  coords: lowestEntropy.coords,
                  value: undefined,
                },
              ],
              cause: "entropy",
            });
          }
        }
      } else {
        // Start with lowest entropy tile
        const uncollapsed = this.#grid
          .getCells()
          .filter((cell) => !cell.collapsed);
        if (uncollapsed.length > 0) {
          const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
          this.collapseQueue.push({
            cells: [
              {
                coords: lowestEntropy.coords,
                value: undefined,
              },
            ],
            cause: "entropy",
          });
        }
      }

      this.processCollapseQueue();
    } catch (error) {
      this.emit("error", error);
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
        parentState: this.currentBacktrackState,
      };

      this.currentBacktrackState = backtrackState;

      try {
        const success = this.attemptCollapseWithRetries(backtrackState);
        if (!success) {
          // If we couldn't collapse even with retries, we need to go back further
          this.log(
            LogLevel.INFO,
            "Failed to collapse with current state, attempting multi-level backtrack",
          );
          this.log(
            LogLevel.DEBUG,
            "Current state:",
            this.currentBacktrackState?.group.cells.map((c) => c.coords),
          );
          this.log(
            LogLevel.DEBUG,
            "Has parent:",
            !!this.currentBacktrackState?.parentState,
          );

          // Clean up the current snapshot before backtracking
          // this.snapshots.delete(snapshotId);

          if (!this.handleMultiLevelBacktrack()) {
            throw new Error(
              "Pattern is uncollapsable - no valid solutions found",
            );
          }
          continue; // Try next iteration with backtracked state
        }

        // Success! Keep the backtrack state for potential future backtracking
        // but mark it as successful so we know we can try different values if needed
        backtrackState.wasSuccessful = true;

        // Clean up snapshot since we succeeded
        this.snapshots.delete(snapshotId);

        // If queue is empty but we still have uncollapsed cells, add lowest entropy
        if (this.collapseQueue.length === 0 && !this.completed) {
          const uncollapsed = this.#grid
            .getCells()
            .filter((cell) => !cell.collapsed);
          if (uncollapsed.length > 0) {
            const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
            this.collapseQueue.push({
              cells: [
                {
                  coords: lowestEntropy.coords,
                  value: undefined,
                },
              ],
              cause: "entropy",
            });
          }
        }
      } catch (error) {
        console.log('The error is....', error)
        // Clean up snapshot on any error
        this.snapshots.delete(snapshotId);
        // Fatal error - restore to last known good state
        if (this.currentBacktrackState) {
          this.restoreSnapshot(this.currentBacktrackState.snapshotId);
        }
        throw error;
      }
    }

    if (this.completed) {
      this.emit("complete");
    }
  }

  private attemptCollapseWithRetries(state: BacktrackState): boolean {
    const maxAttempts = state.group.maxAttempts ?? this.MAX_ATTEMPTS_PER_LEVEL;

    while (state.attempts < maxAttempts) {
      // Restore state before each attempt (except first)
      if (state.attempts > 0) {
        this.restoreSnapshot(state.snapshotId);
        // Emit backtrack event when we retry
        this.emit("backtrack", state.group);
      }

      state.attempts++;

      const result = this.collapseGroupWithTracking(state);
      if (result.success) {
        return true;
      }

      // If we failed but have more attempts, continue to next iteration
      this.log(
        LogLevel.DEBUG,
        `Attempt ${state.attempts}/${maxAttempts} failed, will retry if attempts remain`
      );
    }

    return false;
  }

  private handleMultiLevelBacktrack(): boolean {
    let currentState = this.currentBacktrackState;
    let backtrackDepth = 0;

    while (currentState) {
      backtrackDepth++;
      this.emit("backtrack", currentState.group); // Emit backtrack event for each level

      // Try to find a previous state that still has untried possibilities
      if (!this.hasExhaustedAllChoices(currentState)) {
        this.log(
          LogLevel.INFO,
          `Found valid backtrack state at depth ${backtrackDepth}`
        );

        // Restore to this state and try again
        this.restoreSnapshot(currentState.snapshotId);

        // Clear propagation queue before trying new values
        this.propagationQueue.clear();

        // Attempt to collapse with new choices
        if (this.attemptCollapseWithRetries(currentState)) {
          return true;
        }
      }

      // Clean up snapshot before moving to parent
      this.snapshots.delete(currentState.snapshotId);
      currentState = currentState.parentState;
    }

    return false;
  }

  private collapseGroupWithTracking(state: BacktrackState): CollapseResult {
    const { group, triedValues } = state;

    // First pass: validate and select values for collapse
    const selectedValues = new Map<string, TileDef>();

    for (const cellCollapse of group.cells) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tried = triedValues.get(coordKey) || new Set<TileDef>();

      // Filter out already tried values - use cell.choices from current state
      const availableChoices = cell.choices.filter(
        (choice) => !tried.has(choice),
      );
      this.log(
        LogLevel.DEBUG,
        "Available choices for",
        cell.coords,
        ":",
        availableChoices.map((c) => c.name),
        "after excluding tried:",
        Array.from(tried).map((c) => c.name),
        "from total choices:",
        cell.choices.map((c) => c.name),
      );

      if (availableChoices.length === 0) {
        this.log(
          LogLevel.INFO,
          "No more available choices for cell:",
          cell.coords,
        );
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
    }

    // Now proceed with actual collapse using selected values
    return this.collapseGroupWithValues(group, selectedValues);
  }

  private collapseGroupWithValues(
    group: CollapseGroup,
    selectedValues: Map<string, TileDef>,
  ): CollapseResult {
    const affectedCells: Cell[] = [];
    const forcedCollapses: CellCollapse[] = [];

    // First pass: validate that all cells in the group can coexist
    for (const cellCollapse of group.cells) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey)!;

      this.log(LogLevel.DEBUG, `Validating cell at ${coordKey} with value ${value.name}`);

      // Check if this value is compatible with all neighbors that are already collapsed
      // or are part of the group
      const neighbors = this.#grid.getNeighbors(cellCollapse.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const neighborCoordKey = `${neighbor.coords[0]},${neighbor.coords[1]}`;
        const neighborValue = selectedValues.get(neighborCoordKey) || (neighbor.collapsed ? neighbor.choices[0] : undefined);

        console.log({ neighbor, neighborValue, neighborCoordKey, selectedValues })
        if (neighborValue) {
          // Get the adjacency rules for this direction
          const cellAdjacency = value.adjacencies[i];
          // Get the opposite direction's adjacency rule from the neighbor
          // The adjacencyMap maps each direction to its opposite
          const neighborAdjacency = neighborValue.adjacencies[this.#grid.adjacencyMap[i]];

          console.log(`  Checking neighbor at ${neighborCoordKey} with value ${neighborValue.name}`);
          console.log(`  Cell adjacency: ${JSON.stringify(cellAdjacency)}`);
          console.log(`  Neighbor adjacency: ${JSON.stringify(neighborAdjacency)}`);
          console.log(`  Direction: ${i}, Opposite: ${this.#grid.adjacencyMap[i]}`);

          let m = matchAdjacencies(cellAdjacency, neighborAdjacency)
          console.log('M', m)
          // Check if the adjacency rules allow these tiles to be neighbors
          if (!m) {
            this.log(LogLevel.DEBUG, `  Adjacencies do not match!`);
            return { success: false, affectedCells };
          }
        }
      }
    }

    // Second pass: collapse all cells in the group
    for (const cellCollapse of group.cells) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey)!;

      this.log(
        LogLevel.DEBUG,
        "Collapsing cell",
        cell.coords,
        "to",
        value.name,
        "from choices:",
        cell.choices.map((c) => c.name),
      );

      cell.collapsed = true;
      cell.choices = [value];
      affectedCells.push(cell);
    }

    // Third pass: propagate from all collapsed cells
    this.propagationQueue.clear();
    for (const cell of affectedCells) {
      this.queueNeighborsForPropagation(cell);
    }

    // Process propagation queue until empty
    while (this.propagationQueue.size > 0) {
      const currentCell = this.propagationQueue.values().next().value;
      if (!currentCell) continue; // TypeScript safety

      this.propagationQueue.delete(currentCell);
      const originalChoices = [...currentCell.choices];
      const neighbors = this.#grid.getNeighbors(currentCell.coords);

      // Update choices based on all neighbors
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const validChoices = this.filterValidAdjacencies(
          currentCell,
          neighbor,
          i,
        );
        currentCell.choices = currentCell.choices.filter((choice) =>
          validChoices.includes(choice),
        );
      }

      // If choices changed, queue neighbors for propagation
      if (currentCell.choices.length !== originalChoices.length) {
        // Log which choices were removed
        const removedChoices = originalChoices.filter(
          (c) => !currentCell.choices.includes(c),
        );
        this.log(
          LogLevel.DEBUG,
          "Removed choices:",
          removedChoices.map((c) => c.name),
          "for cell",
          currentCell.coords,
          " remain: ",
          currentCell.choices.map((c) => c.name),
        );

        affectedCells.push(currentCell);

        // If no choices left, collapse has failed
        if (currentCell.choices.length === 0) {
          return { success: false, affectedCells };
        }

        // If only one choice left, add to forced collapses
        if (currentCell.choices.length === 1 && !currentCell.collapsed) {
          currentCell.collapsed = true;
          forcedCollapses.push({
            coords: currentCell.coords,
            value: currentCell.choices[0],
          });
          this.queueNeighborsForPropagation(currentCell);
        } else {
          this.queueNeighborsForPropagation(currentCell);
        }
      }
    }

    // Emit a single collapse event with all cells (initial + forced)
    const allCollapses = [...group.cells].map(cellCollapse => {
      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey);
      if (!value) {
        throw new Error(`No value found for cell at ${coordKey}`);
      }
      return {
        coords: cellCollapse.coords,
        value
      };
    });

    for (const forced of forcedCollapses) {
      if (!forced.value) {
        throw new Error(`No value found for forced cell at ${forced.coords}`);
      }
      allCollapses.push({
        coords: forced.coords,
        value: forced.value
      });
    }

    this.emit("collapse", {
      cells: allCollapses,
      cause: group.cause,
    });

    return {
      success: true,
      affectedCells,
    };
  }

  private queueNeighborsForPropagation(cell: Cell): void {
    const neighbors = this.#grid.getNeighbors(cell.coords);
    for (const neighbor of neighbors) {
      if (neighbor && !neighbor.collapsed) {
        this.propagationQueue.add(neighbor);
      }
    }
  }

  private takeSnapshot(): number {
    const snapshot = this.#grid.toSnapshot();
    const id = this.snapshotCounter++;
    this.snapshots.set(id, snapshot);
    this.log(LogLevel.DEBUG, "Taking snapshot", id, "Current grid state:");
    this.debugGridState();
    return id;
  }

  private restoreSnapshot(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot ${id} not found`);
    }
    this.log(LogLevel.DEBUG, "Restoring snapshot", id, "Previous grid state:");
    this.debugGridState();
    this.#grid = SquareGrid.fromSnapshot(snapshot);
    this.log(LogLevel.DEBUG, "After restore:");
    this.debugGridState();
  }

  private debugGridState() {
    const iterator = this.#grid.iterate();
    let str = [];
    for (const [cell, coords] of iterator) {
      // this.log(
        // LogLevel.DEBUG,
        str.push(`[${coords}]: ${cell.choices.map((c) => c.name).join(",")}`)
      // );
    }
    this.log(
      LogLevel.DEBUG,
      str.join("\n")
    )
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

      const neighbors = this.#grid.getNeighbors(currentCell.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor || neighbor.collapsed) continue;

        const neighborKey = `${neighbor.coords[0]},${neighbor.coords[1]}`;
        if (processedCells.has(neighborKey)) continue;

        const validAdjacencies = this.filterValidAdjacencies(
          neighbor,
          currentCell,
          i,
        );

        // Only track changes if the choices would actually change
        if (validAdjacencies.length !== neighbor.choices.length) {
          proposedChanges.set(neighborKey, {
            cell: neighbor,
            newChoices: validAdjacencies,
            originalChoices: [...neighbor.choices],
          });
          cellsToProcess.push(neighbor);
        }
      }
    }
    this.log(LogLevel.DEBUG, "Proposed changes:", proposedChanges);

    // Phase 2: Validate and apply changes
    const invalidChanges = this.validateProposedChanges(proposedChanges);
    if (invalidChanges.size > 0) {
      // If we found invalid changes, mark for backtracking
      changedValues.backtrack = true;
      return changedValues;
    }

    // Apply all valid changes
    for (const [_key, change] of proposedChanges) {
      const { cell, newChoices, originalChoices } = change;
      cell.choices = newChoices;

      // Track removed choices for the delta
      const removed = originalChoices.filter((c) => !newChoices.includes(c));
      if (removed.length > 0) {
        changedValues.discardedValues.push({
          coords: cell.coords,
          tiles: removed,
          collapsed: cell.collapsed,
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
  private validateProposedChanges(
    proposedChanges: Map<string, ProposedChange>,
  ): Set<string> {
    const invalidChanges = new Set<string>();

    for (const [coordKey, change] of proposedChanges) {
      const { cell, newChoices } = change;

      // Check if cell would have no valid choices
      if (newChoices.length === 0) {
        invalidChanges.add(coordKey);
        continue;
      }

      // Check if changes would create conflicts with neighbors
      const neighbors = this.#grid.getNeighbors(cell.coords);
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
            const d2 = neighborOption.adjacencies[this.#grid.adjacencyMap[i]];
            if (d1 === d2) {
              hasValidAdjacency = true;
              break;
            }
          }
          if (hasValidAdjacency) break;
        }

        if (!hasValidAdjacency) {
          invalidChanges.add(coordKey);
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
    const valid = new Set<TileDef>();
    const oppositeDirection = this.#grid.adjacencyMap[direction];
    console.log('Filtering valid adjacencies for:', JSON.stringify(cell))

    // If neighbor is collapsed, we must match its adjacency
    if (neighbor.collapsed) {
      console.log('Neighbor collapsed')
      const neighborAdjacency = neighbor.choices[0].adjacencies[oppositeDirection];
      for (const option of cell.choices) {
        if (matchAdjacencies(option.adjacencies[direction], neighborAdjacency)) {
          valid.add(option);
        }
      }
    } else {
      // Otherwise, check all possible combinations
      console.log('No collapsed neighbor, checking all adjacency combinations')
      for (const option of cell.choices) {
        const optionAdjacency = option.adjacencies[direction];

        for (const neighborOption of neighbor.choices) {
          const neighborAdjacency = neighborOption.adjacencies[oppositeDirection];

          // Tiles can connect if their adjacencies match
          if (matchAdjacencies(optionAdjacency, neighborAdjacency)) {
            valid.add(option);
            break; // Once we find a valid neighbor, we can stop checking this option
          }
        }
      }
    }

    return Array.from(valid);
  }

  undoChange(delta: DeltaChange<[number, number]>): Cell[] {
    const revertedCells = [];
    const { collapsedCell, pickedValue, discardedValues } = delta;
    collapsedCell.collapsed = false;
    collapsedCell.forbidden.push(pickedValue);
    for (const { coords, tiles } of discardedValues) {
      const cell = this.#grid.get(coords);
      if (cell) {
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
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tried = triedValues.get(coordKey) || new Set<TileDef>();

      // Get choices from the snapshot state
      const snapshot = this.snapshots.get(state.snapshotId);
      if (!snapshot) return true; // If no snapshot, consider exhausted

      const snapshotCell = snapshot.cells.find(
        c => c.coords[0] === cell.coords[0] && c.coords[1] === cell.coords[1]
      );
      if (!snapshotCell) return true;

      // If there are any untried choices from the snapshot state, we haven't exhausted all possibilities
      if (snapshotCell.choices.some(choice => !tried.has(choice))) {
        return false;
      }
    }

    return true;
  }

  // Public method to safely iterate over the current grid state
  iterate(): IterableIterator<[Cell, [number, number]]> {
    return this.#grid.iterate();
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level <= this.logLevel) {
      const prefix = LogLevel[level].padEnd(5);
      console.log(`[${prefix}]`, message, ...args);
    }
  }
}
