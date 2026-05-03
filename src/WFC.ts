import { EventEmitter } from "events";
import { Grid, Cell } from "./Grid.js";
import { TileDef } from "./TileDef.js";
import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { parseAdjacencyRule, Rule } from "./AdjacencyGrammar.js";
import { matchAdjacencies } from "./Adjacencies.js";
import { PrecomputedAdjacencies } from "./PrecomputedAdjacencies.js";

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export interface BacktrackStrategy {
  name: string;
  maxLevels: number;
  exhaustionPolicy: "immediate" | "deferred";
  cleanupFrequency: number;
}

export const BACKTRACK_STRATEGIES = {
  conservative: {
    name: "conservative",
    maxLevels: 1,
    exhaustionPolicy: "immediate" as const,
    cleanupFrequency: 100,
  },
  aggressive: {
    name: "aggressive",
    maxLevels: 5,
    exhaustionPolicy: "deferred" as const,
    cleanupFrequency: 50,
  },
  deep: {
    name: "deep",
    maxLevels: 10,
    exhaustionPolicy: "deferred" as const,
    cleanupFrequency: 25,
  },
};

export type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
  logLevel?: LogLevel;
  backtrackStrategy?: BacktrackStrategy;
  maxBacktracks?: number;
  maxDecisions?: number;
  maxSteps?: number;
  onContradiction?: "backtrack" | "restart" | "fail";
};

export type CellCoords = [number, number];
export type AnyCoords = CellCoords | number[];
export type TileId = string;

export type CellCollapse = {
  coords: CellCoords;
  value?: TileDef;
};

export type CollapseGroup = {
  cells: CellCollapse[];
  cause: "initial" | "entropy" | "propagation";
  maxAttempts?: number;
};

export type CollapseResult = {
  success: boolean;
  affectedCells: Cell[];
  propagatedCollapses?: CollapseGroup[];
};

export type CellStateDelta = {
  choices: TileId[];
  collapsed: boolean;
  value?: TileId;
};

export type CellDelta = {
  coords: AnyCoords;
  before: CellStateDelta;
  after: CellStateDelta;
  reason: "decision" | "propagation" | "rollback" | "seed";
};

export interface DeltaSnapshot {
  id: number;
  parentSnapshotId?: number;
  deltas: CellDelta[];
  referenceCount: number;
  timestamp: number;
}

export interface BacktrackNode {
  id: number;
  snapshotId: number;
  parent?: BacktrackNode;
  children: BacktrackNode[];
  targetCells: CellCoords[];
  triedChoices: Map<string, Set<TileId>>;
  depth: number;
  createdAt: number;
  isExhausted: boolean;
}

export type StepResult = {
  type: "collapse" | "propagation" | "contradiction" | "backtrack" | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
  deltas?: CellDelta[];
  depth?: number;
  contradiction?: {
    coords: AnyCoords;
    attempted?: TileDef;
    reason: string;
  };
};

export type WFCEvents = {
  collapse: (group: CollapseGroup) => void;
  propagate: (cells: Cell[]) => void;
  backtrack: (from: CollapseGroup) => void;
  complete: () => void;
  error: (error: Error) => void;
  snapshot: (id: number) => void;
  contradiction: (details: StepResult["contradiction"]) => void;
  rollback: (deltas: CellDelta[]) => void;
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

type TrailEntry = {
  cell: Cell;
  coords: AnyCoords;
  previousChoices: TileDef[];
  previousCollapsed: boolean;
  previousValue?: TileDef;
};

type DecisionFrame = {
  coords: AnyCoords;
  candidates: TileDef[];
  nextCandidateIndex: number;
  trailMark: number;
  depth: number;
};

type PropagationResult = {
  success: boolean;
  deltas: CellDelta[];
  affectedCells: Cell[];
  contradiction?: StepResult["contradiction"];
};

export class WFC extends EventEmitter {
  private readonly tileDefs: TileDef[];
  private readonly options: WFCOptions;
  private readonly rng: RandomLib;
  private readonly logLevel: LogLevel;
  private readonly decisionStack: DecisionFrame[] = [];
  private readonly trail: TrailEntry[] = [];
  private backtracks = 0;
  private decisions = 0;
  #grid: Grid;
  #precomputedAdjacencies?: PrecomputedAdjacencies;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.tileDefs = tileDefs;
    this.#grid = grid;
    this.options = options;
    this.rng = options.random || new DefaultRandom();
    this.logLevel = options.logLevel ?? LogLevel.WARN;

    this.validateTileDefs(tileDefs);
    this.initializeGrid();
  }

  initializeGrid(): void {
    this.decisionStack.length = 0;
    this.trail.length = 0;
    this.backtracks = 0;
    this.decisions = 0;

    for (const [cell] of this.#grid.iterate()) {
      cell.choices = [...this.tileDefs];
      cell.collapsed = false;
      cell.value = undefined;
      cell.forbidden = [];
    }
  }

  validateTileDefs(tileDefs: TileDef[]): void {
    if (!tileDefs || tileDefs.length === 0) {
      throw new Error("No tile definitions provided");
    }

    const names = new Set<string>();
    for (const tileDef of tileDefs) {
      if (names.has(tileDef.name)) {
        throw new Error(`Duplicate tile name: ${tileDef.name}`);
      }
      names.add(tileDef.name);

      if (!tileDef.adjacencies || tileDef.adjacencies.length === 0) {
        throw new Error(`Tile ${tileDef.name} has no adjacencies defined`);
      }
    }
  }

  pick<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    const index = Math.floor(this.rng.random() * array.length);
    return array[Math.min(index, array.length - 1)];
  }

  pickWeighted(tiles: TileDef[]): TileDef {
    if (tiles.length === 0) {
      throw new Error("Cannot pick from empty array");
    }

    if (tiles.length === 1) {
      return tiles[0];
    }

    let totalWeight = 0;
    for (const tile of tiles) {
      totalWeight += tile.weight || 1;
    }

    if (totalWeight === 0) {
      return this.pick(tiles);
    }

    const randomValue = this.rng.random() * totalWeight;
    let currentWeight = 0;
    for (const tile of tiles) {
      currentWeight += tile.weight || 1;
      if (randomValue <= currentWeight) {
        return tile;
      }
    }

    return tiles[tiles.length - 1];
  }

  get completed(): boolean {
    for (const [cell] of this.#grid.iterate()) {
      if (!cell.collapsed) {
        return false;
      }
    }
    return true;
  }

  start(initialSeed?: CellCollapse[]): void {
    const generator = this.execute(initialSeed);
    let result = generator.next();
    while (!result.done) {
      result = generator.next();
    }
  }

  *execute(
    initialSeed?: CellCollapse[],
    emitEvents: boolean = true,
  ): Generator<StepResult, void, unknown> {
    this.log(LogLevel.INFO, "Starting WFC execution");

    try {
      if (initialSeed && initialSeed.length > 0) {
        const seedResult = yield* this.applyInitialSeed(
          initialSeed,
          emitEvents,
        );
        if (!seedResult) {
          throw new Error("Initial seed creates an impossible state");
        }
      }

      const solved = yield* this.search(emitEvents);
      if (!solved) {
        throw new Error("No solution exists - all possibilities exhausted");
      }

      this.log(LogLevel.INFO, "WFC completed successfully");
      if (emitEvents) this.emit("complete");
      yield { type: "complete" };
    } catch (error) {
      this.log(LogLevel.ERROR, "WFC execution failed:", error);
      if (emitEvents) this.emit("error", error);
      throw error;
    }
  }

  private *applyInitialSeed(
    initialSeed: CellCollapse[],
    emitEvents: boolean,
  ): Generator<StepResult, boolean, unknown> {
    const trailMark = this.trail.length;
    const deltas: CellDelta[] = [];
    const affectedCells: Cell[] = [];
    const group: CollapseGroup = {
      cells: [],
      cause: "initial",
    };

    for (const seed of initialSeed) {
      if (!seed.value) {
        continue;
      }

      const cell = this.#grid.get(seed.coords);
      if (!cell) {
        throw new Error(
          `Initial seed cell not found at ${this.coordKey(seed.coords)}`,
        );
      }

      if (!cell.choices.some((choice) => choice.name === seed.value!.name)) {
        return false;
      }

      const delta = this.setCellChoices(cell, [seed.value], "seed");
      if (delta) {
        deltas.push(delta);
        affectedCells.push(cell);
      }
      group.cells.push({ coords: seed.coords, value: seed.value });
    }

    if (group.cells.length > 0) {
      if (emitEvents) this.emit("collapse", group);
      yield { type: "collapse", group, affectedCells, deltas };
    }

    const propagation = this.propagateFrom(affectedCells, "seed");
    if (propagation.deltas.length > 0) {
      if (emitEvents) this.emit("propagate", propagation.affectedCells);
      yield {
        type: "propagation",
        affectedCells: propagation.affectedCells,
        deltas: propagation.deltas,
      };
    }

    if (!propagation.success) {
      if (emitEvents) this.emit("contradiction", propagation.contradiction);
      yield {
        type: "contradiction",
        affectedCells: propagation.affectedCells,
        deltas: propagation.deltas,
        contradiction: propagation.contradiction,
      };
      this.rollbackTo(trailMark);
      return false;
    }

    return true;
  }

  private *search(
    emitEvents: boolean,
  ): Generator<StepResult, boolean, unknown> {
    if (this.completed) {
      return true;
    }

    if (
      this.options.maxDecisions !== undefined &&
      this.decisions >= this.options.maxDecisions
    ) {
      throw new Error(
        `Maximum decisions reached: ${this.options.maxDecisions}`,
      );
    }

    const cell = this.selectCellToCollapse();
    if (!cell) {
      return this.completed;
    }

    const frame: DecisionFrame = {
      coords: cell.coords,
      candidates: this.orderCandidates(cell.choices),
      nextCandidateIndex: 0,
      trailMark: this.trail.length,
      depth: this.decisionStack.length + 1,
    };
    this.decisionStack.push(frame);

    while (frame.nextCandidateIndex < frame.candidates.length) {
      const candidate = frame.candidates[frame.nextCandidateIndex++];
      this.decisions++;

      const currentCell = this.#grid.get(frame.coords);
      if (!currentCell) {
        throw new Error(
          `Decision cell not found at ${this.coordKey(frame.coords)}`,
        );
      }

      const group: CollapseGroup = {
        cells: [{ coords: frame.coords as CellCoords, value: candidate }],
        cause: "entropy",
      };
      const decisionDelta = this.setCellChoices(
        currentCell,
        [candidate],
        "decision",
      );
      const decisionDeltas = decisionDelta ? [decisionDelta] : [];

      if (emitEvents) this.emit("collapse", group);
      yield {
        type: "collapse",
        group,
        affectedCells: [currentCell],
        deltas: decisionDeltas,
        depth: frame.depth,
      };

      const propagation = this.propagateFrom([currentCell], "propagation");
      if (propagation.deltas.length > 0) {
        if (emitEvents) this.emit("propagate", propagation.affectedCells);
        yield {
          type: "propagation",
          affectedCells: propagation.affectedCells,
          deltas: propagation.deltas,
          depth: frame.depth,
        };
      }

      if (propagation.success) {
        const solved = yield* this.search(emitEvents);
        if (solved) {
          this.decisionStack.pop();
          return true;
        }
      } else {
        if (emitEvents) this.emit("contradiction", propagation.contradiction);
        yield {
          type: "contradiction",
          affectedCells: propagation.affectedCells,
          deltas: propagation.deltas,
          depth: frame.depth,
          contradiction: propagation.contradiction,
        };
      }

      const rollbackDeltas = this.rollbackTo(frame.trailMark);
      if (rollbackDeltas.length > 0) {
        this.backtracks++;
        if (
          this.options.maxBacktracks !== undefined &&
          this.backtracks > this.options.maxBacktracks
        ) {
          throw new Error(
            `Maximum backtracks reached: ${this.options.maxBacktracks}`,
          );
        }

        const rollbackGroup: CollapseGroup = {
          cells: rollbackDeltas.map((delta) => ({
            coords: delta.coords as CellCoords,
          })),
          cause: "entropy",
        };
        if (emitEvents) {
          this.emit("backtrack", rollbackGroup);
          this.emit("rollback", rollbackDeltas);
        }
        yield {
          type: "backtrack",
          group: rollbackGroup,
          affectedCells: rollbackDeltas
            .map((delta) => this.#grid.get(delta.coords))
            .filter((cell): cell is Cell => cell !== null),
          deltas: rollbackDeltas,
          depth: frame.depth,
        };
      }
    }

    this.decisionStack.pop();
    return false;
  }

  private selectCellToCollapse(): Cell | null {
    let minEntropy = Infinity;
    const candidates: Cell[] = [];

    for (const [cell] of this.#grid.iterate()) {
      if (cell.collapsed) continue;

      if (cell.choices.length < minEntropy) {
        minEntropy = cell.choices.length;
        candidates.length = 0;
        candidates.push(cell);
      } else if (cell.choices.length === minEntropy) {
        candidates.push(cell);
      }
    }

    if (candidates.length === 0) return null;
    return this.pick(candidates);
  }

  private orderCandidates(choices: TileDef[]): TileDef[] {
    const remaining = [...choices];
    const ordered: TileDef[] = [];

    while (remaining.length > 0) {
      const picked = this.pickWeighted(remaining);
      ordered.push(picked);
      const index = remaining.findIndex((tile) => tile.name === picked.name);
      remaining.splice(index, 1);
    }

    return ordered;
  }

  private propagateFrom(
    cells: Cell[],
    reason: "propagation" | "seed",
  ): PropagationResult {
    const queue: Cell[] = [];
    const queued = new Set<string>();
    const deltas: CellDelta[] = [];
    const affectedCells: Cell[] = [];

    const enqueue = (cell: Cell | null): void => {
      if (!cell) return;
      const key = this.coordKey(cell.coords);
      if (queued.has(key)) return;
      queued.add(key);
      queue.push(cell);
    };

    for (const cell of cells) {
      enqueue(cell);
      for (const neighbor of this.#grid.getNeighbors(cell.coords)) {
        enqueue(neighbor);
      }
    }

    while (queue.length > 0) {
      const cell = queue.shift()!;
      queued.delete(this.coordKey(cell.coords));

      const revisedChoices = this.reviseChoices(cell);
      if (this.sameChoices(cell.choices, revisedChoices)) {
        continue;
      }

      const delta = this.setCellChoices(cell, revisedChoices, reason);
      if (delta) {
        deltas.push(delta);
        affectedCells.push(cell);
      }

      if (revisedChoices.length === 0) {
        return {
          success: false,
          deltas,
          affectedCells,
          contradiction: {
            coords: cell.coords,
            attempted: this.currentAttemptedTile(),
            reason: "Cell has no valid choices after propagation",
          },
        };
      }

      for (const neighbor of this.#grid.getNeighbors(cell.coords)) {
        enqueue(neighbor);
      }
    }

    return { success: true, deltas, affectedCells };
  }

  private reviseChoices(cell: Cell): TileDef[] {
    let choices = [...cell.choices];
    const neighbors = this.#grid.getNeighbors(cell.coords);

    for (let direction = 0; direction < neighbors.length; direction++) {
      const neighbor = neighbors[direction];
      if (!neighbor || neighbor.choices.length === 0) continue;

      choices = choices.filter((choice) =>
        neighbor.choices.some((neighborChoice) =>
          this.canBeAdjacent(choice, cell.coords, direction, neighborChoice),
        ),
      );

      if (choices.length === 0) {
        break;
      }
    }

    return choices;
  }

  private setCellChoices(
    cell: Cell,
    choices: TileDef[],
    reason: "decision" | "propagation" | "seed",
  ): CellDelta | null {
    const before = this.cellState(cell);
    this.trail.push({
      cell,
      coords: cell.coords,
      previousChoices: [...cell.choices],
      previousCollapsed: cell.collapsed,
      previousValue: cell.value,
    });

    cell.choices = [...choices];
    cell.collapsed = choices.length === 1;
    cell.value = cell.collapsed ? choices[0] : undefined;

    const after = this.cellState(cell);
    if (this.sameState(before, after)) {
      this.trail.pop();
      return null;
    }

    return {
      coords: cell.coords,
      before,
      after,
      reason: reason === "seed" ? "seed" : reason,
    };
  }

  private rollbackTo(trailMark: number): CellDelta[] {
    const deltas: CellDelta[] = [];

    while (this.trail.length > trailMark) {
      const entry = this.trail.pop()!;
      const before = this.cellState(entry.cell);

      entry.cell.choices = [...entry.previousChoices];
      entry.cell.collapsed = entry.previousCollapsed;
      entry.cell.value = entry.previousValue;

      const after = this.cellState(entry.cell);
      if (!this.sameState(before, after)) {
        deltas.push({
          coords: entry.coords,
          before,
          after,
          reason: "rollback",
        });
      }
    }

    return deltas;
  }

  private cellState(cell: Cell): CellStateDelta {
    return {
      choices: cell.choices.map((choice) => choice.name),
      collapsed: cell.collapsed,
      value: cell.value?.name,
    };
  }

  private sameState(a: CellStateDelta, b: CellStateDelta): boolean {
    return (
      a.collapsed === b.collapsed &&
      a.value === b.value &&
      a.choices.length === b.choices.length &&
      a.choices.every((choice, index) => choice === b.choices[index])
    );
  }

  private sameChoices(a: TileDef[], b: TileDef[]): boolean {
    return (
      a.length === b.length &&
      a.every((choice, index) => choice.name === b[index].name)
    );
  }

  private currentAttemptedTile(): TileDef | undefined {
    const frame = this.decisionStack[this.decisionStack.length - 1];
    if (!frame) return undefined;
    return frame.candidates[frame.nextCandidateIndex - 1];
  }

  private coordKey(coords: AnyCoords): string {
    return coords.join(",");
  }

  private ensureRule(adjacencyValue: string | Rule): Rule {
    if (typeof adjacencyValue === "string") {
      const result = parseAdjacencyRule(adjacencyValue);
      if (result instanceof Error) {
        throw new Error(`Failed to parse adjacency rule: ${result.message}`);
      }
      return result;
    }
    return adjacencyValue;
  }

  canBeAdjacent(
    tile1: TileDef,
    coords: AnyCoords,
    direction: number,
    tile2: TileDef,
  ): boolean {
    if (this.#precomputedAdjacencies) {
      const adjacencyType = this.#grid.getAdjacencyType(coords);

      if (
        this.#precomputedAdjacencies[tile1.name] &&
        this.#precomputedAdjacencies[tile1.name][adjacencyType] &&
        this.#precomputedAdjacencies[tile1.name][adjacencyType][direction]
      ) {
        return this.#precomputedAdjacencies[tile1.name][adjacencyType][
          direction
        ].includes(tile2.name);
      }
    }

    const adjacencyMap = this.#grid.getAdjacencyMap(coords);
    const oppositeDirection = adjacencyMap[direction];

    return matchAdjacencies(
      this.ensureRule(tile1.adjacencies[direction]),
      this.ensureRule(tile2.adjacencies[oppositeDirection]),
    );
  }

  filterValidAdjacencies(
    cell: Cell,
    neighbor: Cell,
    direction: number,
  ): TileDef[] {
    const valid = new Set<TileDef>();

    for (const option of cell.choices) {
      for (const neighborOption of neighbor.choices) {
        if (
          this.canBeAdjacent(option, cell.coords, direction, neighborOption)
        ) {
          valid.add(option);
          break;
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
        cell.value = cell.collapsed ? cell.choices[0] : undefined;
        revertedCells.push(cell);
      }
    }
    return revertedCells;
  }

  iterate(): IterableIterator<[Cell, [number, number]]> {
    return this.#grid.iterate();
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level <= this.logLevel) {
      const prefix = LogLevel[level].padEnd(5);
      console.log(`[${prefix}]`, message, ...args);
    }
  }

  setPrecomputedAdjacencies(precomputed: PrecomputedAdjacencies): void {
    this.#precomputedAdjacencies = precomputed;
  }
}
