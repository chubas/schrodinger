import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { TileDef, TileDefFactory } from "./TileDef.js";
import { Grid, Cell } from "./Grid.js";
import { EventEmitter } from "events";
import { matchAdjacencies } from "./Adjacencies.js";
import { Rule, parseAdjacencyRule } from "./AdjacencyGrammar.js";
import { PrecomputedAdjacencies } from "./PrecomputedAdjacencies.js";

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
  #precomputedAdjacencies?: PrecomputedAdjacencies;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.validateTileDefs(tileDefs);
    
    // Ensure all adjacency rules are parsed during initialization
    this.tileDefs = tileDefs.map(tileDef => {
      // Use TileDefFactory to ensure all adjacency rules are Rule objects
      return TileDefFactory.ensureParsedRules(tileDef);
    });
    
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
            this.deleteSnapshot(snapshotId, "initial-seed-invalid");
            throw new Error("Initial seed creates an impossible state");
          }

          // Yield the initial collapse step
          const initialGroup = { cells: initialSeed, cause: "initial" as const };
          if (emitEvents) this.emit("collapse", initialGroup);
          yield { type: "collapse", group: initialGroup, affectedCells: result.affectedCells };

          // Clean up the snapshot since we succeeded
          this.deleteSnapshot(snapshotId, "initial-seed-success");
        } catch (error) {
          // Clean up snapshot on any error
          this.deleteSnapshot(snapshotId, "initial-seed-error");
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

      // Log backtrack state creation
      console.log(`%cBACKTRACK CREATE: snapshot ${snapshotId}, parent: ${this.currentBacktrackState?.snapshotId || 'none'}`, 'color: #9C27B0; font-weight: bold;');
      
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
        this.deleteSnapshot(snapshotId, "collapse-queue-success");

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
        this.deleteSnapshot(snapshotId, "collapse-queue-error");
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
    
    // First pass: Find a viable state without deleting anything
    let viableState: BacktrackState | undefined = undefined;
    let tempState = currentState;
    let tempDepth = 0;

    while (tempState && tempDepth < 50) { // Prevent infinite loops
      tempDepth++;
      
      // Try to find a previous state that still has untried possibilities
      if (!this.hasExhaustedAllChoices(tempState)) {
        this.log(
          LogLevel.INFO,
          `Found viable backtrack state at depth ${tempDepth}`,
        );
        viableState = tempState;
        break;
      }
      
      tempState = tempState.parentState;
    }

    // If no viable state found, we've exhausted all possibilities
    if (!viableState) {
      this.log(LogLevel.INFO, "No viable backtrack state found - all possibilities exhausted");
      
      // Clean up all snapshots in the chain since we're giving up
      let cleanupState = currentState;
      while (cleanupState) {
        this.deleteSnapshot(cleanupState.snapshotId, "multi-level-backtrack-cleanup");
        cleanupState = cleanupState.parentState;
      }
      
      return false;
    }

    // Second pass: Clean up snapshots that are deeper than the viable state
    let cleanupState = currentState;
    while (cleanupState && cleanupState !== viableState) {
      backtrackDepth++;
      if (emitEvents) this.emit("backtrack", cleanupState.group);
      yield { type: "backtrack", group: cleanupState.group };
      
      const nextState = cleanupState.parentState;
      this.deleteSnapshot(cleanupState.snapshotId, "multi-level-backtrack-deeper");
      cleanupState = nextState;
    }

    // Third pass: Restore to the viable state and try again
    this.log(
      LogLevel.INFO,
      `Restoring to viable backtrack state at depth ${backtrackDepth + 1}`,
    );

    // Restore to this state and try again
    this.restoreSnapshot(viableState.snapshotId);

    // Clear propagation queue before trying new values
    this.propagationQueue.clear();

    // Update current backtrack state to the viable one
    this.currentBacktrackState = viableState;

    // Attempt to collapse with new choices
    const stepResults = this.attemptCollapseWithRetriesGenerator(viableState, emitEvents);
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
    } else {
      // Even the viable state failed, continue the multi-level backtrack from its parent
      this.log(LogLevel.INFO, "Viable state also failed, continuing backtrack from its parent");
      this.deleteSnapshot(viableState.snapshotId, "multi-level-backtrack-failed");
      this.currentBacktrackState = viableState.parentState;
      
      // Recursively try multi-level backtrack from the parent
      if (this.currentBacktrackState) {
        const recursiveResults = this.handleMultiLevelBacktrackGenerator(emitEvents);
        let recursiveResult: IteratorResult<StepResult, boolean>;
        
        do {
          recursiveResult = recursiveResults.next();
          if (!recursiveResult.done && recursiveResult.value) {
            yield recursiveResult.value;
          }
        } while (!recursiveResult.done);
        
        return recursiveResult.value;
      }
      
      return false;
    }
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
          const adjacencyMap = this.#grid.getAdjacencyMap(cellCollapse.coords);
          const oppositeDirection = adjacencyMap[i];
          const neighborAdjacency =
            neighborValue.adjacencies[oppositeDirection];

          this.log(
            LogLevel.DEBUG,
            `Direction ${i} -> ${oppositeDirection}`,
          );
          this.log(
            LogLevel.DEBUG,
            `Cell adjacency: ${JSON.stringify(cellAdjacency)}`,
          );
          this.log(
            LogLevel.DEBUG,
            `Neighbor adjacency: ${JSON.stringify(neighborAdjacency)}`,
          );

          if (!matchAdjacencies(
            this.ensureRule(cellAdjacency),
            this.ensureRule(neighborAdjacency)
          )) {
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
    
    // Log snapshot creation with color
    this.logSnapshot("SNAPSHOT CREATE", id, `total: ${this.snapshots.size}, changed cells: ${snapshot.changedCellIds.size}`);
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(`%cAvailable snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`, 'color: #4CAF50; font-size: 11px;');
      this.debugGridState();
    }

    // Emit snapshot event
    this.emit("snapshot", id);

    return id;
  }

  private restoreSnapshot(id: number): void {
    // Log restore attempt
    this.logSnapshotRestore("SNAPSHOT RESTORE", id, false);
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(`%cAvailable snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`, 'color: #2196F3; font-size: 11px;');
    }

    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      // Enhanced error logging with call stack
      console.log(`%cSNAPSHOT ERROR: ${id} not found!`, 'color: #f44336; font-weight: bold; font-size: 14px;');
      console.log(`%cCurrent snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`, 'color: #f44336;');
      console.log(`%cSnapshot counter: ${this.snapshotCounter}`, 'color: #f44336;');
      
      // Log current backtrack state chain
      this.logBacktrackStateChain();
      
      // Capture and log the call stack
      const stack = new Error().stack;
      console.log(`%cCall stack:`, 'color: #f44336; font-weight: bold;');
      console.log(stack);
      
      throw new Error(`Snapshot ${id} not found`);
    }

    if (this.logLevel >= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, "Previous grid state before restore:");
      this.debugGridState();
    }

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

    // Log successful restore
    this.logSnapshotRestore("SNAPSHOT RESTORE", id, true, `restored ${snapshot.changedCellIds.size} cells`);

    if (this.logLevel >= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, "After restore:");
      this.debugGridState();
    }

    // Emit snapshot event for the restored snapshot
    this.emit("snapshot", id);
  }

  // Add helper method to track snapshot deletions
  private deleteSnapshot(id: number, context: string): void {
    const existed = this.snapshots.has(id);
    this.logSnapshotDelete("SNAPSHOT DELETE", id, context, existed);
    
    if (existed) {
      this.snapshots.delete(id);
      if (this.logLevel >= LogLevel.DEBUG) {
        console.log(`%cRemaining snapshots: [${Array.from(this.snapshots.keys()).join(', ')}]`, 'color: #f44336; font-size: 11px;');
      }
    } else {
      console.log(`%cWARNING: Attempted to delete non-existent snapshot ${id}`, 'color: #FF9800; font-weight: bold;');
    }
  }

  // Helper method to log backtrack state chain
  private logBacktrackStateChain(): void {
    let current = this.currentBacktrackState;
    let depth = 0;
    
    console.log(`%cCurrent BacktrackState chain:`, 'color: #9C27B0; font-weight: bold;');
    while (current && depth < 10) { // Prevent infinite loops
      const parentSnapshot = current.parentState?.snapshotId || 'none';
      console.log(`%c  Depth ${depth}: snapshot ${current.snapshotId}, attempts ${current.attempts}, parent: ${parentSnapshot}`, 'color: #9C27B0;');
      current = current.parentState;
      depth++;
    }
    
    if (depth >= 10) {
      console.log(`%c  ... (chain truncated at depth 10)`, 'color: #9C27B0; font-style: italic;');
    }
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
            const adjacencyMap = this.#grid.getAdjacencyMap(cell.coords);
            const oppositeDirection = adjacencyMap[i];
            const d2 = neighborOption.adjacencies[oppositeDirection];
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

  // Helper method to ensure an adjacency value is a Rule object
  private ensureRule(adjacencyValue: string | Rule): Rule {
    if (typeof adjacencyValue === 'string') {
      const result = parseAdjacencyRule(adjacencyValue);
      if (result instanceof Error) {
        throw new Error(`Failed to parse adjacency rule: ${result.message}`);
      }
      return result;
    }
    return adjacencyValue;
  }

  // Checks if two tiles can be adjacent in the given direction
  canBeAdjacent(tile1: TileDef, coords: [number, number], direction: number, tile2: TileDef): boolean {
    // If precomputed adjacencies are available, use them for faster lookup
    if (this.#precomputedAdjacencies) {
      const adjacencyType = this.#grid.getAdjacencyType(coords);
      
      if (this.#precomputedAdjacencies[tile1.name] && 
          this.#precomputedAdjacencies[tile1.name][adjacencyType] &&
          this.#precomputedAdjacencies[tile1.name][adjacencyType][direction]) {
        return this.#precomputedAdjacencies[tile1.name][adjacencyType][direction].includes(tile2.name);
      }
    }
    
    // Otherwise fall back to rule matching
    const adjacencyMap = this.#grid.getAdjacencyMap(coords);
    const oppositeDirection = adjacencyMap[direction];
    
    return matchAdjacencies(
      this.ensureRule(tile1.adjacencies[direction]),
      this.ensureRule(tile2.adjacencies[oppositeDirection])
    );
  }

  // TODO: Implementation is quadratic, can be optimized by precalculating the total of possible adjacencies
  filterValidAdjacencies(
    cell: Cell,
    neighbor: Cell,
    direction: number,
  ): TileDef[] {
    const valid = new Set<TileDef>();
    const adjacencyMap = this.#grid.getAdjacencyMap(cell.coords);
    const oppositeDirection = adjacencyMap[direction];

    // If neighbor is collapsed, we must match its adjacency
    if (neighbor.collapsed) {
      this.log(
        LogLevel.DEBUG,
        ` 🤔 Comparing against collapsed neighbor ${neighbor.coords}`,
      );
      const neighborTile = neighbor.choices[0];
      for (const option of cell.choices) {
        if (this.canBeAdjacent(option, cell.coords, direction, neighborTile)) {
          valid.add(option);
        }
      }
    } else {
      // Otherwise, check all possible combinations
      this.log(
        LogLevel.DEBUG,
        ` 🤔 Checking all combinations for cell ${cell.coords} against neighbor ${neighbor.coords}`,
      );
      for (const option of cell.choices) {
        for (const neighborOption of neighbor.choices) {
          // Tiles can connect if their adjacencies match
          if (this.canBeAdjacent(option, cell.coords, direction, neighborOption)) {
            valid.add(option);
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
      if (!snapshot) {
        this.log(LogLevel.DEBUG, `No snapshot ${state.snapshotId} found for exhaustion check`);
        return true; // If no snapshot, consider exhausted
      }

      const cellId = `${x},${y}`;
      const snapshotCell = snapshot.deltas.get(cellId);
      if (!snapshotCell) {
        this.log(LogLevel.DEBUG, `No snapshot cell data for ${cellId}`);
        return true;
      }

      // Check both the snapshot choices AND the current grid state
      // We need choices that are:
      // 1. In the original snapshot
      // 2. Still available in the current grid state (after propagation)
      // 3. Not yet tried
      const availableChoices = snapshotCell.choices.filter((choice: TileDef) => {
        // Must not have been tried yet
        if (tried.has(choice)) return false;
        
        // Must still be available in current grid state
        // (propagation might have eliminated some choices)
        return cell.choices.some(currentChoice => currentChoice.name === choice.name);
      });

      this.log(
        LogLevel.DEBUG,
        `Exhaustion check for ${coordKey}: snapshot choices: ${snapshotCell.choices.length}, ` +
        `current choices: ${cell.choices.length}, tried: ${tried.size}, available: ${availableChoices.length}`
      );

      // If there are any available untried choices, we haven't exhausted all possibilities
      if (availableChoices.length > 0) {
        this.log(
          LogLevel.DEBUG,
          `Cell ${coordKey} still has ${availableChoices.length} untried choices: ${availableChoices.map(c => c.name).join(', ')}`
        );
        return false;
      }
    }

    this.log(LogLevel.DEBUG, "All choices exhausted for this backtrack state");
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

  // Helper method for colored snapshot logging
  private logSnapshot(message: string, id: number, context?: string, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      const contextStr = context ? ` (${context})` : '';
      console.log(`%c${message} ${id}${contextStr}`, 'color: #4CAF50; font-weight: bold;', ...args);
    }
  }

  private logSnapshotDelete(message: string, id: number, context?: string, existed?: boolean, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      const contextStr = context ? ` (${context})` : '';
      const existedStr = existed !== undefined ? ` - existed: ${existed}` : '';
      console.log(`%c${message} ${id}${contextStr}${existedStr}`, 'color: #f44336; font-weight: bold;', ...args);
    }
  }

  private logSnapshotRestore(message: string, id: number, success: boolean, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      const color = success ? '#2196F3' : '#FF9800';
      const status = success ? 'SUCCESS' : 'ATTEMPTING';
      console.log(`%c${message} ${id} - ${status}`, `color: ${color}; font-weight: bold;`, ...args);
    }
  }

  /**
   * Sets precomputed adjacencies to be used for optimized adjacency checks
   * @param precomputed The precomputed adjacencies object
   */
  setPrecomputedAdjacencies(precomputed: PrecomputedAdjacencies): void {
    this.#precomputedAdjacencies = precomputed;
  }
}