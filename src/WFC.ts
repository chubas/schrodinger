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
  snapshot: (id: number) => void;
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

// New type for delta snapshots
export type CellDelta = {
  cellId: string; // Formatted as "x,y" for SquareGrid
  choices: TileDef[]; // The choices at the time of snapshot
  collapsed: boolean; // Whether the cell was collapsed
  value?: TileDef; // The value if collapsed
};

export type DeltaSnapshot = {
  deltas: Map<string, CellDelta>; // Map of cell IDs to their state
  changedCellIds: Set<string>; // Set of cell IDs that have changed since the last snapshot
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

export type StepResult = {
  type: "collapse" | "backtrack" | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
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
  private readonly snapshots: Map<number, DeltaSnapshot> = new Map(); // Changed to DeltaSnapshot
  private readonly lastCellState: Map<string, CellDelta> = new Map(); // Track last known state of each cell
  private snapshotCounter: number = 0;
  private currentBacktrackState?: BacktrackState;
  private readonly MAX_ATTEMPTS_PER_LEVEL = 10;
  private readonly logLevel: LogLevel;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.validateTileDefs(tileDefs);
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

  validateTileDefs(tileDefs: TileDef[]) {
    // Throw an error if two tiles have the same name
    const names = new Set();
    for (const tile of tileDefs) {
      if (names.has(tile.name)) {
        throw new Error(`Duplicate tile name: ${tile.name}`);
      }
      names.add(tile.name);
    }
  }

  // Utility function to pick a random item from an array
  pick<T>(array: T[]): T {
    const r = this.rng.random();
    const i = Math.floor(r * array.length);
    const item = array[i];
    return item;
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
      // Create and run the generator to completion
      const generator = this.execute(initialSeed, true); // Use the generator with events
      let result: IteratorResult<StepResult>;
      do {
        result = generator.next();
        // Events are emitted inside the generator
      } while (!result.done);
    } catch (error) {
      this.emit("error", error);
    }
  }

  *execute(initialSeed?: CellCollapse[], emitEvents: boolean = true): Generator<StepResult, void, unknown> {
    try {
      if (initialSeed && initialSeed.length > 0) {
        this.log(LogLevel.DEBUG, "Starting with initial seed");
        this.log(
          LogLevel.DEBUG,
          `Seed cells: ${initialSeed.map((c) => `${c.coords}=${c.value?.name}`).join(", ")}`,
        );

        // Create a snapshot before applying the seed
        const snapshotId = this.takeSnapshot();

        try {
          // Apply the seed and check for forced collapses
          const result = this.collapseGroupWithValues(
            { cells: initialSeed, cause: "initial" as const },
            new Map(
              initialSeed.map((cell) => [
                `${cell.coords[0]},${cell.coords[1]}`,
                cell.value!,
              ]),
            ),
          );

          if (!result.success) {
            // If the initial seed is invalid, restore and throw
            this.restoreSnapshot(snapshotId);
            this.snapshots.delete(snapshotId);
            throw new Error("Initial seed creates an impossible state");
          }

          // Yield the initial collapse step
          const initialGroup = { cells: initialSeed, cause: "initial" as const };
          if (emitEvents) this.emit("collapse", initialGroup);
          yield { type: "collapse", group: initialGroup, affectedCells: result.affectedCells };

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
            this.log(
              LogLevel.DEBUG,
              `Adding entropy-based collapse for cell ${lowestEntropy.coords}`,
            );
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
        this.log(LogLevel.DEBUG, "Starting without seed");
        // Start with lowest entropy tile
        const uncollapsed = this.#grid
          .getCells()
          .filter((cell) => !cell.collapsed);
        if (uncollapsed.length > 0) {
          const lowestEntropy = this.getLowestEntropyTile(uncollapsed);
          this.log(
            LogLevel.DEBUG,
            `Selected initial cell ${lowestEntropy.coords} with choices: ${lowestEntropy.choices.map((c) => c.name).join(",")}`,
          );
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

      yield* this.processCollapseQueueGenerator(emitEvents);
      
      if (this.completed) {
        if (emitEvents) this.emit("complete");
        yield { type: "complete" };
      }
    } catch (error) {
      if (emitEvents) this.emit("error", error);
      throw error;
    }
  }

  private *processCollapseQueueGenerator(emitEvents: boolean = true): Generator<StepResult, void, unknown> {
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
        const stepResults = this.attemptCollapseWithRetriesGenerator(backtrackState, emitEvents);
        let stepResult: IteratorResult<StepResult>;
        
        do {
          stepResult = stepResults.next();
          if (!stepResult.done && stepResult.value) {
            yield stepResult.value;
          }
        } while (!stepResult.done);

        const success = stepResult.value;

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

          // Try multi-level backtrack
          const multiBacktrackResults = this.handleMultiLevelBacktrackGenerator(emitEvents);
          let multiResult: IteratorResult<StepResult, boolean>;
          
          do {
            multiResult = multiBacktrackResults.next();
            if (!multiResult.done && multiResult.value) {
              yield multiResult.value;
            }
          } while (!multiResult.done);
          
          const multiSuccess = multiResult.value;
          
          if (!multiSuccess) {
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
        // Clean up snapshot on any error
        this.snapshots.delete(snapshotId);
        // Fatal error - restore to last known good state
        if (this.currentBacktrackState) {
          this.restoreSnapshot(this.currentBacktrackState.snapshotId);
        }
        throw error;
      }
    }
  }

  private *attemptCollapseWithRetriesGenerator(state: BacktrackState, emitEvents: boolean = true): Generator<StepResult, boolean, unknown> {
    const maxAttempts = state.group.maxAttempts ?? this.MAX_ATTEMPTS_PER_LEVEL;

    while (state.attempts < maxAttempts) {
      // Restore state before each attempt (except first)
      if (state.attempts > 0) {
        this.restoreSnapshot(state.snapshotId);
        // Emit backtrack event when we retry
        if (emitEvents) this.emit("backtrack", state.group);
        yield { type: "backtrack", group: state.group };
      }

      state.attempts++;

      const result = this.collapseGroupWithTracking(state);
      if (result.success) {
        // Emit collapse event
        if (emitEvents) this.emit("collapse", state.group);
        yield { type: "collapse", group: state.group, affectedCells: result.affectedCells };
        return true;
      }

      // If we failed but have more attempts, continue to next iteration
      this.log(
        LogLevel.DEBUG,
        `Attempt ${state.attempts}/${maxAttempts} failed, will retry if attempts remain`,
      );
    }

    return false;
  }

  private *handleMultiLevelBacktrackGenerator(emitEvents: boolean = true): Generator<StepResult, boolean, unknown> {
    let currentState = this.currentBacktrackState;
    let backtrackDepth = 0;

    while (currentState) {
      backtrackDepth++;
      if (emitEvents) this.emit("backtrack", currentState.group); // Emit backtrack event for each level
      yield { type: "backtrack", group: currentState.group };

      // Try to find a previous state that still has untried possibilities
      if (!this.hasExhaustedAllChoices(currentState)) {
        this.log(
          LogLevel.INFO,
          `Found valid backtrack state at depth ${backtrackDepth}`,
        );

        // Restore to this state and try again
        this.restoreSnapshot(currentState.snapshotId);

        // Clear propagation queue before trying new values
        this.propagationQueue.clear();

        // Attempt to collapse with new choices
        const stepResults = this.attemptCollapseWithRetriesGenerator(currentState, emitEvents);
        let stepResult: IteratorResult<StepResult, boolean>;
        
        do {
          stepResult = stepResults.next();
          if (!stepResult.done && stepResult.value) {
            yield stepResult.value;
          }
        } while (!stepResult.done);
        
        const success = stepResult.value;
        
        if (success) {
          return true;
        }
      }

      // Clean up snapshot before moving to parent
      this.snapshots.delete(currentState.snapshotId);
      currentState = currentState.parentState;
    }

    return false;
  }

  private processCollapseQueue(): void {
    const generator = this.processCollapseQueueGenerator(false); // Don't emit events directly
    let result: IteratorResult<StepResult>;
    do {
      result = generator.next();
      // Don't emit events here since this is used within start()
    } while (!result.done);
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

    this.log(LogLevel.DEBUG, "Starting collapse group validation");
    this.log(
      LogLevel.DEBUG,
      `Selected values: ${Array.from(selectedValues.entries())
        .map(([k, v]) => `${k}=${v.name}`)
        .join(", ")}`,
    );

    // First pass: validate that all cells in the group can coexist
    this.log(
      LogLevel.DEBUG,
      "🔍 First pass: validating and selecting values for collapse",
    );
    for (const cellCollapse of group.cells) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey)!;

      this.log(
        LogLevel.DEBUG,
        `Validating cell at ${coordKey} with value ${value.name}`,
      );
      this.log(
        LogLevel.DEBUG,
        `Cell adjacencies: ${value.adjacencies.map((a) => JSON.stringify(a)).join(", ")}`,
      );

      // Check if this value is compatible with all neighbors that are already collapsed
      // or are part of the group
      const neighbors = this.#grid.getNeighbors(cellCollapse.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const neighborCoordKey = `${neighbor.coords[0]},${neighbor.coords[1]}`;
        const neighborValue =
          selectedValues.get(neighborCoordKey) ||
          (neighbor.collapsed ? neighbor.choices[0] : undefined);

        this.log(
          LogLevel.DEBUG,
          `Checking neighbor at ${neighborCoordKey}: ${neighborValue?.name}`,
        );

        if (neighborValue) {
          // Get the adjacency rules for this direction
          const cellAdjacency = value.adjacencies[i];
          // Get the opposite direction's adjacency rule from the neighbor
          const neighborAdjacency =
            neighborValue.adjacencies[this.#grid.adjacencyMap[i]];

          this.log(
            LogLevel.DEBUG,
            `Direction ${i} -> ${this.#grid.adjacencyMap[i]}`,
          );
          this.log(
            LogLevel.DEBUG,
            `Cell adjacency: ${JSON.stringify(cellAdjacency)}`,
          );
          this.log(
            LogLevel.DEBUG,
            `Neighbor adjacency: ${JSON.stringify(neighborAdjacency)}`,
          );

          if (!matchAdjacencies(cellAdjacency, neighborAdjacency)) {
            this.log(
              LogLevel.DEBUG,
              "Adjacencies do not match - collapse group is invalid",
            );
            return { success: false, affectedCells };
          }
        }
      }
    }

    this.log(
      LogLevel.DEBUG,
      `🎳 Second pass - collapsing group: ${JSON.stringify(group.cells)}`,
    );
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
    this.log(
      LogLevel.DEBUG,
      `💥Third pass: propagating collapse for: ${JSON.stringify(affectedCells)}`,
    );
    this.propagationQueue.clear();
    for (const cell of affectedCells) {
      this.queueNeighborsForPropagation(cell);
    }

    // Process propagation queue until empty
    while (this.propagationQueue.size > 0) {
      const currentCell = this.propagationQueue.values().next().value;
      if (!currentCell) continue; // TypeScript safety

      this.propagationQueue.delete(currentCell);
      this.log(
        LogLevel.DEBUG,
        ` 🦋 Propagating from ${currentCell.coords}, cell: ${JSON.stringify(currentCell)}`,
      );
      const originalChoices = [...currentCell.choices];
      const neighbors = this.#grid.getNeighbors(currentCell.coords);

      this.log(
        LogLevel.DEBUG,
        `  🏘️ Neighbors of ${currentCell.coords}: ${neighbors.map((n) => (n ? n.coords : "")).join(", ")}`,
      );

      // Update choices based on all neighbors
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        this.log(
          LogLevel.DEBUG,
          `   >>>> Will filter valid adjacencies for cell ${currentCell.coords} against neighbor ${neighbor.coords}`,
        );
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
          " 🐍 Removed choices:",
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
          this.log(
            LogLevel.DEBUG,
            `🧱 Forcing collapse on ${JSON.stringify(currentCell)}, enqueueing`,
          );
          currentCell.collapsed = true;
          forcedCollapses.push({
            coords: currentCell.coords,
            value: currentCell.choices[0],
          });
          this.queueNeighborsForPropagation(currentCell);
        } else {
          this.log(
            LogLevel.DEBUG,
            `⛱️ No propagation occured for ${currentCell.coords}`,
          );
          this.queueNeighborsForPropagation(currentCell);
        }
      }
    }

    // Emit a single collapse event with all cells (initial + forced)
    const allCollapses = [...group.cells].map((cellCollapse) => {
      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const value = selectedValues.get(coordKey);
      if (!value) {
        throw new Error(`No value found for cell at ${coordKey}`);
      }
      return {
        coords: cellCollapse.coords,
        value,
      };
    });

    for (const forced of forcedCollapses) {
      if (!forced.value) {
        throw new Error(`No value found for forced cell at ${forced.coords}`);
      }
      allCollapses.push({
        coords: forced.coords,
        value: forced.value,
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
    this.log(
      LogLevel.DEBUG,
      `  🏘️ Neighbors of ${cell.coords}: ${neighbors.map((n) => (n ? n.coords : "")).join(", ")}`,
    );

    for (const neighbor of neighbors) {
      if (neighbor && !neighbor.collapsed) {
        this.propagationQueue.add(neighbor);
      }
    }
  }

  private takeSnapshot(): number {
    const id = this.snapshotCounter++;
    const snapshot: DeltaSnapshot = {
      deltas: new Map(),
      changedCellIds: new Set()
    };

    // Iterate through all cells and store their current state
    for (const [cell, coords] of this.#grid.iterate()) {
      const cellId = `${coords[0]},${coords[1]}`;

      // Create a delta for this cell
      const delta: CellDelta = {
        cellId,
        choices: [...cell.choices], // Clone the choices array
        collapsed: cell.collapsed,
        value: cell.collapsed && cell.choices.length > 0 ? cell.choices[0] : undefined
      };

      // Store the delta in the snapshot
      snapshot.deltas.set(cellId, delta);

      // Check if this cell has changed since the last known state
      const lastState = this.lastCellState.get(cellId);
      if (!lastState ||
          lastState.collapsed !== delta.collapsed ||
          lastState.choices.length !== delta.choices.length ||
          (lastState.value !== delta.value && (lastState.value || delta.value))) {
        snapshot.changedCellIds.add(cellId);
      }

      // Update the last known state
      this.lastCellState.set(cellId, delta);
    }

    this.snapshots.set(id, snapshot);
    this.log(LogLevel.DEBUG, "📷 Taking snapshot", id, "Current grid state:");
    this.debugGridState();

    // Emit snapshot event
    this.emit("snapshot", id);

    return id;
  }

  private restoreSnapshot(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot ${id} not found`);
      // console.error(`Snapshot ${id} not found`);
      // return;
    }

    this.log(LogLevel.DEBUG, "Restoring snapshot", id, "Previous grid state:");
    this.debugGridState();

    // Restore only the cells that have changed since this snapshot was taken
    for (const cellId of snapshot.changedCellIds) {
      const delta = snapshot.deltas.get(cellId);
      if (!delta) continue;

      // Parse the cell coordinates from the cellId
      const [x, y] = cellId.split(',').map(Number);
      const cell = this.#grid.get([x, y]);

      if (cell) {
        // Restore the cell state
        cell.choices = [...delta.choices]; // Clone the choices array
        cell.collapsed = delta.collapsed;
      }
    }

    // Update the last known state for all cells in the snapshot
    for (const [cellId, delta] of snapshot.deltas.entries()) {
      this.lastCellState.set(cellId, delta);
    }

    this.log(LogLevel.DEBUG, "After restore:");
    this.debugGridState();

    // Emit snapshot event for the restored snapshot
    this.emit("snapshot", id);
  }

  private debugGridState() {
    const iterator = this.#grid.iterate();
    const str = [];
    for (const [cell, coords] of iterator) {
      // this.log(
      // LogLevel.DEBUG,
      str.push(`[${coords}]: ${cell.choices.map((c) => c.name).join(",")}`);
      // );
    }
    this.log(LogLevel.DEBUG, str.join("\n"));
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

    // If neighbor is collapsed, we must match its adjacency
    if (neighbor.collapsed) {
      this.log(
        LogLevel.DEBUG,
        ` 🤔 Comparing against collapsed neighbor ${neighbor.coords}`,
      );
      const neighborAdjacency =
        neighbor.choices[0].adjacencies[oppositeDirection];
      // this.log(LogLevel.DEBUG, `Neighbor adjacency at ${oppositeDirection}: ${JSON.stringify(neighborAdjacency)}`);
      for (const option of cell.choices) {
        // this.log(LogLevel.DEBUG, `Checking cell option ${option.name} adjacency at ${direction}: ${JSON.stringify(option.adjacencies[direction])}`);
        if (
          matchAdjacencies(option.adjacencies[direction], neighborAdjacency)
        ) {
          valid.add(option);
          // this.log(LogLevel.DEBUG, `Added ${option.name} as valid option`);
        }
      }
    } else {
      // Otherwise, check all possible combinations
      this.log(
        LogLevel.DEBUG,
        ` 🤔 Checking all combinations for cell ${cell.coords} against neighbor ${neighbor.coords}`,
      );
      for (const option of cell.choices) {
        const optionAdjacency = option.adjacencies[direction];
        // this.log(LogLevel.DEBUG, `Cell option ${option.name} adjacency at ${direction}: ${JSON.stringify(optionAdjacency)}`);

        for (const neighborOption of neighbor.choices) {
          const neighborAdjacency =
            neighborOption.adjacencies[oppositeDirection];
          // this.log(LogLevel.DEBUG, `Neighbor option ${neighborOption.name} adjacency at ${oppositeDirection}: ${JSON.stringify(neighborAdjacency)}`);

          // Tiles can connect if their adjacencies match
          if (matchAdjacencies(optionAdjacency, neighborAdjacency)) {
            valid.add(option);
            // this.log(LogLevel.DEBUG, `Added ${option.name} as valid option`);
            break; // Once we find a valid neighbor, we can stop checking this option
          }
        }
      }
    }

    const result = Array.from(valid);
    this.log(
      LogLevel.DEBUG,
      ` ➡️ Valid options for cell ${cell.coords}: ${result.map((r) => r.name).join(",")}`,
    );
    return result;
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
    // Check if we've tried all possible values for each cell in the group
    for (const cellCollapse of state.group.cells) {
      const [x, y] = cellCollapse.coords;
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${x},${y}`;
      const tried = state.triedValues.get(coordKey) || new Set();

      // Get choices from the snapshot state
      const snapshot = this.snapshots.get(state.snapshotId);
      if (!snapshot) return true; // If no snapshot, consider exhausted

      const cellId = `${x},${y}`;
      const snapshotCell = snapshot.deltas.get(cellId);
      if (!snapshotCell) return true;

      // If there are any untried choices from the snapshot state, we haven't exhausted all possibilities
      if (snapshotCell.choices.some((choice: TileDef) => !tried.has(choice))) {
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