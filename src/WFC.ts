import { Emitter } from "./Emitter.js";
import { Grid, Cell } from "./Grid.js";
import { TileDef } from "./TileDef.js";
import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { PrecomputedAdjacencies } from "./PrecomputedAdjacencies.js";
import { AdjacencyTables } from "./AdjacencyTables.js";
import { SupportPropagator } from "./SupportPropagator.js";

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export type WFCOptions = {
  // Maximum number of backtracks, across all restarts, before giving up
  // (default 10,000). Giving up is reported differently from a proven
  // "No solution exists".
  maxRetries?: number;
  // Start over (undo everything but the initial seed, keep drawing from the
  // same random source) when an attempt has needed too many backtracks. A
  // mistake made early in an attempt can make the rest of it hopeless, and
  // undoing recent choices never fixes that; a fresh attempt usually does.
  //
  // This is the unit of the cutoff: attempts are cut off after restartAfter
  // backtracks times the Luby sequence 1, 1, 2, 1, 1, 2, 4, 1, 1, 2, ...
  // Mostly short attempts, with ever longer ones now and then, so the search
  // stays complete (a long enough attempt can prove there is no solution).
  // Default 25. 0 disables restarts, which makes proving "no solution" on
  // hard instances several times faster.
  restartAfter?: number;
  /** @deprecated Ignored; backtracking is a depth-first search limited by maxRetries. */
  backtrackStep?: number;
  // The random source. Defaults to DefaultRandom (Math.random, or a
  // deterministic generator once seeded).
  random?: RandomLib;
  // Passed to random.setSeed() so the run is repeatable: the same tiles, grid,
  // options and seed always give the same result.
  seed?: string | number;
  logLevel?: LogLevel;
  /** @deprecated Ignored; backtracking is a depth-first search limited by maxRetries. */
  backtrackStrategy?: BacktrackStrategy;
  // Recompute propagation state from scratch after every propagation and
  // restore, throwing on any mismatch with the incremental state. Slow;
  // meant for tests and stress testing.
  debugChecks?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CellCollapse<Coords = any> = {
  coords: Coords;
  value?: TileDef; // If undefined, will pick based on entropy
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CollapseGroup<Coords = any> = {
  cells: CellCollapse<Coords>[];
  cause: "initial" | "entropy";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WFCEvents<Coords = any> = {
  collapse: (group: CollapseGroup<Coords>) => void;
  backtrack: (from: CollapseGroup<Coords>) => void;
  restart: (info: { restarts: number; backtracks: number }) => void;
  complete: () => void;
  error: (error: Error) => void;
};

/** @deprecated Ignored; backtracking is a depth-first search limited by WFCOptions.maxRetries. */
export interface BacktrackStrategy {
  name: string;
  maxLevels: number;
  exhaustionPolicy: "immediate" | "deferred";
  cleanupFrequency: number;
}

/** @deprecated Ignored; backtracking is a depth-first search limited by WFCOptions.maxRetries. */
export const BACKTRACK_STRATEGIES = {
  conservative: { name: "conservative", maxLevels: 1, exhaustionPolicy: "immediate" as const, cleanupFrequency: 100 },
  aggressive: { name: "aggressive", maxLevels: 5, exhaustionPolicy: "deferred" as const, cleanupFrequency: 50 },
  deep: { name: "deep", maxLevels: 10, exhaustionPolicy: "deferred" as const, cleanupFrequency: 25 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StepResult<Coords = any> = {
  type: "collapse" | "backtrack" | "restart" | "complete";
  // For "backtrack": the decision (cell and tile) that was undone and ruled out.
  group?: CollapseGroup<Coords>;
  affectedCells?: Cell<Coords>[];
  // For "backtrack": how many decisions this backtrack has undone so far.
  depth?: number;
};

const DEFAULT_MAX_BACKTRACKS = 10_000;
const DEFAULT_RESTART_AFTER = 25;

// The Luby sequence 1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8, ... (i >= 1).
// Using it to scale restart cutoffs is within a logarithmic factor of the best
// fixed cutoff for any problem, without knowing which one that is.
export function luby(i: number): number {
  let k = 1;
  while (2 ** k - 1 < i) k++;
  return 2 ** k - 1 === i ? 2 ** (k - 1) : luby(i - 2 ** (k - 1) + 1);
}

const NO_SOLUTION_MESSAGE = "No solution exists - all possibilities exhausted";

// A tile chosen for a cell, and the trail position from just before it was
// applied (so it can be undone).
type Decision<Coords> = {
  cell: Cell<Coords>;
  tile: TileDef;
  marker: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class WFC<Coords = any> extends Emitter<WFCEvents<Coords>> {
  private readonly tileDefs: TileDef[];
  private readonly options: WFCOptions;
  private readonly maxBacktracks: number;
  private readonly restartAfter: number;
  // Plain TS `private` rather than a native `#` field: at this project's
  // ES2020 build target, TypeScript downlevels `#field` into a WeakMap-backed
  // polyfill, and this field is read many times per adjacency check (the
  // hottest path in the engine) - profiling showed that indirection alone
  // accounting for ~38% of total runtime.
  private grid: Grid<Coords>;
  private readonly rng: RandomLib;
  private readonly logLevel: LogLevel;
  private precomputedAdjacencies?: PrecomputedAdjacencies;
  private readonly tileIndexByName: Map<string, number> = new Map();
  // Built lazily from the tileset + precomputed adjacencies; reset whenever
  // the precomputed adjacencies change.
  private tables?: AdjacencyTables;
  // Created at the start of execute(); owns the propagation state that the
  // grid's Cell objects mirror.
  private propagator?: SupportPropagator;

  constructor(tileDefs: TileDef[], grid: Grid<Coords>, options: WFCOptions = {}) {
    super();
    this.tileDefs = tileDefs;
    this.grid = grid;
    tileDefs.forEach((tileDef, index) => this.tileIndexByName.set(tileDef.name, index));
    this.options = options;
    this.maxBacktracks = options.maxRetries ?? DEFAULT_MAX_BACKTRACKS;
    this.restartAfter = options.restartAfter ?? DEFAULT_RESTART_AFTER;
    if (!(this.restartAfter >= 0)) throw new Error("restartAfter must be 0 (no restarts) or a positive number");

    this.rng = options.random || new DefaultRandom();
    if (options.seed !== undefined) this.rng.setSeed(options.seed);
    this.logLevel = options.logLevel ?? LogLevel.WARN;

    this.validateTileDefs(tileDefs);
    this.initializeGrid();
  }

  initializeGrid() {
    for (const [cell] of this.grid.iterate()) {
      cell.choices = [...this.tileDefs];
      cell.collapsed = false;
      cell.value = undefined;
    }
  }

  validateTileDefs(tileDefs: TileDef[]) {
    if (!tileDefs || tileDefs.length === 0) {
      throw new Error("No tile definitions provided");
    }

    // Check for duplicate tile names
    const tileNames = new Set<string>();
    for (const tileDef of tileDefs) {
      if (tileNames.has(tileDef.name)) {
        throw new Error(`Duplicate tile name: ${tileDef.name}`);
      }
      tileNames.add(tileDef.name);

      if (!tileDef.adjacencies || tileDef.adjacencies.length === 0) {
        throw new Error(`Tile ${tileDef.name} has no adjacencies defined`);
      }
    }
  }

  pick<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    // Always consume exactly 1 RNG call for predictable testing
    const index = Math.floor(this.rng.random() * array.length);
    return array[index];
  }

  /**
   * Picks a tile from an array using weighted random selection
   * @param tiles Array of tiles to pick from
   * @returns Selected tile based on weight distribution
   */
  pickWeighted(tiles: TileDef[]): TileDef {
    if (tiles.length === 0) {
      throw new Error("Cannot pick from empty array");
    }

    // Always consume exactly 1 RNG call for predictable testing
    const randomValue = this.rng.random();

    // If only one tile, consume the RNG value but return the only option
    if (tiles.length === 1) {
      return tiles[0];
    }

    // Calculate total weight
    let totalWeight = 0;
    for (const tile of tiles) {
      totalWeight += tile.weight || 1; // Default weight of 1 if not specified
    }

    // Handle edge case where all weights are 0 - use consumed random value for uniform selection
    if (totalWeight === 0) {
      const index = Math.floor(randomValue * tiles.length);
      return tiles[index];
    }

    // Use the consumed random value for weighted selection
    const weightedRandomValue = randomValue * totalWeight;

    // Find the tile corresponding to this random value
    let currentWeight = 0;
    for (const tile of tiles) {
      currentWeight += tile.weight || 1;
      if (weightedRandomValue <= currentWeight) {
        return tile;
      }
    }

    // Fallback (should never reach here, but safety net)
    return tiles[tiles.length - 1];
  }

  get completed(): boolean {
    if (this.propagator) return this.propagator.isComplete();
    for (const [cell] of this.grid.iterate()) {
      if (!cell.collapsed) {
        return false;
      }
    }
    return true;
  }

  start(initialSeed?: CellCollapse<Coords>[]): void {
    const generator = this.execute(initialSeed);
    let result = generator.next();
    while (!result.done) {
      result = generator.next();
    }
  }

  *execute(
    initialSeed?: CellCollapse<Coords>[],
    emitEvents: boolean = true,
  ): Generator<StepResult<Coords>, void, unknown> {
    this.log(LogLevel.INFO, "Starting WFC execution");

    // Loading also removes tiles that have no compatible tile in some
    // neighboring direction, before the first collapse.
    this.propagator = new SupportPropagator(this.grid, this.tileDefs, this.adjacencyTables());
    const consistent = this.propagator.load();
    this.checkPropagator();
    if (!consistent) {
      throw this.failure("No solution exists - the tile constraints are contradictory on this grid", emitEvents);
    }

    // The initial seed is applied before any decision, so it is never undone:
    // if it can't be satisfied, there is nothing to backtrack to.
    if (initialSeed && initialSeed.length > 0) {
      this.log(LogLevel.DEBUG, "Processing initial seed");
      const seeded = this.applySeed(initialSeed);
      if (!seeded) {
        throw this.failure("Initial seed creates an impossible state", emitEvents);
      }
      const group: CollapseGroup<Coords> = { cells: seeded, cause: "initial" };
      if (emitEvents) this.emit("collapse", group);
      yield { type: "collapse", group, affectedCells: seeded.map((c) => this.grid.get(c.coords)!) };
    }

    const propagator = this.activePropagator();
    const decisions: Decision<Coords>[] = [];
    // A restart returns to here: after loading, and after the initial seed.
    const startMarker = propagator.mark();
    let backtracks = 0;
    let restarts = 0;
    let attemptBacktracks = 0;
    const cutoffFor = (attempt: number) => (this.restartAfter > 0 ? this.restartAfter * luby(attempt) : Infinity);
    let restartCutoff = cutoffFor(1);

    try {
      while (!propagator.isComplete()) {
        const cell = this.pick(propagator.lowestEntropyCells());
        const tile = this.pickWeighted(cell.choices);
        const marker = propagator.mark();

        propagator.collapse(cell, tile);
        const consistent = propagator.propagate();
        this.checkPropagator();

        if (consistent) {
          decisions.push({ cell, tile, marker });
          const group: CollapseGroup<Coords> = { cells: [{ coords: cell.coords, value: tile }], cause: "entropy" };
          if (emitEvents) this.emit("collapse", group);
          yield { type: "collapse", group, affectedCells: [cell] };
          continue;
        }

        // Depth-first backtracking: undo the failed decision and rule its
        // tile out for that cell. If that also leads to a contradiction, the
        // previous decision was wrong too: undo it and rule out its tile, and
        // so on. Running out of decisions proves there is no solution.
        let failed: Decision<Coords> = { cell, tile, marker };
        for (let depth = 1; ; depth++) {
          if (++backtracks > this.maxBacktracks) {
            throw new Error(
              `Gave up after ${this.maxBacktracks} backtracks (${restarts} restarts) without finding a solution ` +
                "(raise maxRetries to search longer)",
            );
          }

          // Too many backtracks in this attempt: start over instead.
          if (++attemptBacktracks > restartCutoff) {
            propagator.restore(startMarker);
            this.checkPropagator();
            decisions.length = 0;
            attemptBacktracks = 0;
            restarts++;
            restartCutoff = cutoffFor(restarts + 1);
            this.log(LogLevel.DEBUG, `Restart ${restarts} after ${backtracks} backtracks`);
            if (emitEvents) this.emit("restart", { restarts, backtracks });
            yield { type: "restart" };
            break;
          }

          propagator.restore(failed.marker);
          propagator.exclude(failed.cell, failed.tile);
          const recovered = propagator.propagate();
          this.checkPropagator();

          this.log(LogLevel.DEBUG, `Backtrack: ruled out ${failed.tile.name} at ${failed.cell.coords}`);
          const group: CollapseGroup<Coords> = {
            cells: [{ coords: failed.cell.coords, value: failed.tile }],
            cause: "entropy",
          };
          if (emitEvents) this.emit("backtrack", group);
          yield { type: "backtrack", group, depth };

          if (recovered) break;
          const previous = decisions.pop();
          if (!previous) throw new Error(NO_SOLUTION_MESSAGE);
          failed = previous;
        }
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.log(LogLevel.ERROR, `WFC execution failed: ${failure.message}`);
      if (emitEvents) this.emit("error", failure);
      throw error;
    }

    this.log(LogLevel.INFO, "WFC completed successfully");
    if (emitEvents) this.emit("complete");
    yield { type: "complete" };
  }

  // Collapses every seeded cell, then propagates once, so seeded cells are
  // also checked against each other. Returns the applied collapses, or
  // undefined on contradiction.
  private applySeed(initialSeed: CellCollapse<Coords>[]): CellCollapse<Coords>[] | undefined {
    const propagator = this.activePropagator();
    const applied: CellCollapse<Coords>[] = [];
    for (const { coords, value } of initialSeed) {
      const cell = this.grid.get(coords);
      if (!cell) continue;
      const tile = value ?? this.pickWeighted(cell.choices);
      propagator.collapse(cell, tile);
      applied.push({ coords, value: cell.value ?? tile });
    }
    const consistent = propagator.propagate();
    this.checkPropagator();
    return consistent ? applied : undefined;
  }

  // Unrecoverable failures outside the main loop are reported the same way
  // as failures inside it: logged, emitted as "error", then thrown.
  private failure(message: string, emitEvents: boolean): Error {
    const error = new Error(message);
    this.log(LogLevel.ERROR, `WFC execution failed: ${message}`);
    if (emitEvents) this.emit("error", error);
    return error;
  }

  private activePropagator(): SupportPropagator {
    if (!this.propagator) throw new Error("Propagation state is only available while execute() is running");
    return this.propagator;
  }

  private checkPropagator(): void {
    if (!this.options.debugChecks) return;
    const problem = this.activePropagator().checkInvariants();
    if (problem) throw new Error(`Propagation invariant violated: ${problem}`);
  }

  private adjacencyTables(): AdjacencyTables {
    this.tables ??= new AdjacencyTables(this.tileDefs, this.grid.adjacencyMaps, this.precomputedAdjacencies);
    return this.tables;
  }

  // Checks if two tiles can be adjacent in the given direction
  canBeAdjacent(tile1: TileDef, coords: Coords, direction: number, tile2: TileDef): boolean {
    const t1 = this.tileIndexByName.get(tile1.name);
    const t2 = this.tileIndexByName.get(tile2.name);
    if (t1 === undefined || t2 === undefined) return false;

    const tables = this.adjacencyTables();
    const type = tables.typeIndex(this.grid.getAdjacencyType(coords));
    return tables.isCompatible(type, direction, t1, t2);
  }

  // Public method to safely iterate over the current grid state
  iterate(): IterableIterator<[Cell<Coords>, Coords]> {
    return this.grid.iterate();
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level <= this.logLevel) {
      const prefix = LogLevel[level].padEnd(5);
      console.log(`[${prefix}]`, message, ...args);
    }
  }

  /**
   * Sets precomputed adjacencies to be used for optimized adjacency checks.
   * The (name-keyed, array-valued) PrecomputedAdjacencies format is kept as
   * the public/serializable shape; the engine compiles it into index-based
   * AdjacencyTables on first use. Must be called before execute()/start().
   * @param precomputed The precomputed adjacencies object
   */
  setPrecomputedAdjacencies(precomputed: PrecomputedAdjacencies): void {
    this.precomputedAdjacencies = precomputed;
    this.tables = undefined;
  }
}
