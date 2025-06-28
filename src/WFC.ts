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

export type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
  logLevel?: LogLevel;
  backtrackStrategy?: BacktrackStrategy;
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

// New hierarchical backtracking types
export type CellCoords = [number, number];
export type TileId = string;

export interface CellDelta {
  coords: CellCoords;
  previousChoices: TileId[];
  previousCollapsed: boolean;
  previousValue?: TileId;
}

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
  
  // Decision context
  targetCells: CellCoords[];
  triedChoices: Map<string, Set<TileId>>;
  
  // Metadata
  depth: number;
  createdAt: number;
  isExhausted: boolean;
}

export interface BacktrackStrategy {
  name: string;
  maxLevels: number;
  exhaustionPolicy: 'immediate' | 'deferred';
  cleanupFrequency: number;
}

export const BACKTRACK_STRATEGIES = {
  conservative: { name: 'conservative', maxLevels: 1, exhaustionPolicy: 'immediate' as const, cleanupFrequency: 100 },
  aggressive: { name: 'aggressive', maxLevels: 5, exhaustionPolicy: 'deferred' as const, cleanupFrequency: 50 },
  deep: { name: 'deep', maxLevels: 10, exhaustionPolicy: 'deferred' as const, cleanupFrequency: 25 }
};

export type StepResult = {
  type: "collapse" | "backtrack" | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
  depth?: number;
};

// Snapshot Manager - handles delta-only snapshots with reference counting
class SnapshotManager {
  private snapshots = new Map<number, DeltaSnapshot>();
  private counter = 0;

  createSnapshot(changedCells: Cell[], parentId?: number): number {
    const id = this.counter++;
    const deltas: CellDelta[] = [];

    for (const cell of changedCells) {
      deltas.push({
        coords: cell.coords,
        previousChoices: cell.choices.map(t => t.name),
        previousCollapsed: cell.collapsed,
        previousValue: cell.collapsed && cell.choices.length > 0 ? cell.choices[0].name : undefined
      });
    }

    const snapshot: DeltaSnapshot = {
      id,
      parentSnapshotId: parentId,
      deltas,
      referenceCount: 0,
      timestamp: Date.now()
    };

    this.snapshots.set(id, snapshot);
    return id;
  }

  addReference(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (snapshot) {
      snapshot.referenceCount++;
    }
  }

  removeReference(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (snapshot) {
      snapshot.referenceCount--;
      if (snapshot.referenceCount <= 0) {
        this.snapshots.delete(id);
      }
    }
  }

  restoreSnapshot(id: number, grid: Grid, tileDefs: TileDef[]): boolean {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      console.error(`Snapshot ${id} not found`);
      return false;
    }

    // Create a map for quick tile lookup
    const tileMap = new Map<string, TileDef>();
    for (const tile of tileDefs) {
      tileMap.set(tile.name, tile);
    }

    // Restore each cell delta
    for (const delta of snapshot.deltas) {
      const cell = grid.get(delta.coords);
      if (!cell) {
        console.warn(`Cell at ${delta.coords} not found during restoration`);
        continue;
      }

      // Validate that all tile names can be resolved
      const missingTiles: string[] = [];
      const resolvedTiles: TileDef[] = [];
      
      for (const tileName of delta.previousChoices) {
        const tile = tileMap.get(tileName);
        if (!tile) {
          missingTiles.push(tileName);
        } else {
          resolvedTiles.push(tile);
        }
      }

      if (missingTiles.length > 0) {
        console.error(`Failed to resolve tiles: ${missingTiles.join(', ')}`);
        return false;
      }

      if (resolvedTiles.length === 0) {
        console.error(`Cell ${delta.coords} would have no choices after restoration`);
        return false;
      }

      // Restore choices
      cell.choices = resolvedTiles;
      cell.collapsed = delta.previousCollapsed;
    }

    return true;
  }

  hasSnapshot(id: number): boolean {
    return this.snapshots.has(id);
  }

  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  cleanup(olderThan: number): number {
    let cleaned = 0;
    for (const [id, snapshot] of this.snapshots.entries()) {
      if (snapshot.referenceCount <= 0 && snapshot.timestamp < olderThan) {
        this.snapshots.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// Backtrack Tree - manages the hierarchical backtracking structure
class BacktrackTree {
  private root: BacktrackNode;
  private current: BacktrackNode;
  private nodeCounter = 0;

  constructor() {
    this.root = {
      id: this.nodeCounter++,
      snapshotId: -1, // Root has no snapshot
      children: [],
      targetCells: [],
      triedChoices: new Map(),
      depth: 0,
      createdAt: Date.now(),
      isExhausted: false
    };
    this.current = this.root;
  }

  createChild(targetCells: CellCoords[], snapshotId: number): BacktrackNode {
    const child: BacktrackNode = {
      id: this.nodeCounter++,
      snapshotId,
      parent: this.current,
      children: [],
      targetCells: [...targetCells],
      triedChoices: new Map(),
      depth: this.current.depth + 1,
      createdAt: Date.now(),
      isExhausted: false
    };

    this.current.children.push(child);
    this.current = child;
    return child;
  }

  markExhausted(node: BacktrackNode): void {
    node.isExhausted = true;
  }

  findViableAncestor(maxLevels: number): BacktrackNode | null {
    let node = this.current.parent;
    let levels = 1;

    while (node && levels <= maxLevels) {
      if (!node.isExhausted) {
        return node;
      }
      node = node.parent;
      levels++;
    }

    return null;
  }

  moveToNode(node: BacktrackNode): void {
    this.current = node;
  }

  getCurrentNode(): BacktrackNode {
    return this.current;
  }

  getRoot(): BacktrackNode {
    return this.root;
  }

  cleanup(keepDepth: number): number {
    // Prune branches that are too deep or old
    let pruned = 0;
    const prune = (node: BacktrackNode): void => {
      node.children = node.children.filter(child => {
        if (child.depth > keepDepth || child.isExhausted) {
          pruned++;
          return false;
        }
        prune(child);
        return true;
      });
    };

    prune(this.root);
    return pruned;
  }
}

// Exhaustion Tracker - precisely tracks what combinations have been tried
class ExhaustionTracker {
  private triedCombinations = new Map<string, Set<string>>();

  markTried(cells: CellCoords[], choices: Map<string, TileId>): void {
    const contextKey = this.getContextKey(cells);
    const combinationKey = this.getCombinationKey(choices);

    if (!this.triedCombinations.has(contextKey)) {
      this.triedCombinations.set(contextKey, new Set());
    }
    this.triedCombinations.get(contextKey)!.add(combinationKey);
  }

  isExhausted(cells: CellCoords[], grid: Grid): boolean {
    const contextKey = this.getContextKey(cells);
    const tried = this.triedCombinations.get(contextKey) || new Set();
    const available = this.generateValidCombinations(cells, grid);

    return available.length > 0 && available.every(combo => tried.has(combo));
  }

  private getContextKey(cells: CellCoords[]): string {
    return cells.map(c => `${c[0]},${c[1]}`).sort().join('|');
  }

  private getCombinationKey(choices: Map<string, TileId>): string {
    const sorted = Array.from(choices.entries()).sort();
    return sorted.map(([coords, tile]) => `${coords}:${tile}`).join('|');
  }

  private generateValidCombinations(cells: CellCoords[], grid: Grid): string[] {
    // For now, return a simple implementation
    // In a full implementation, this would generate all valid tile combinations
    const combinations: string[] = [];
    
    for (const coords of cells) {
      const cell = grid.get(coords);
      if (cell && cell.choices.length > 0) {
        for (const choice of cell.choices) {
          const choiceMap = new Map([[`${coords[0]},${coords[1]}`, choice.name]]);
          combinations.push(this.getCombinationKey(choiceMap));
        }
      }
    }

    return combinations;
  }
}

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

export class WFC extends EventEmitter {
  private readonly tileDefs: TileDef[];
  private readonly options: WFCOptions;
  private readonly retries: number;
  #grid: Grid;
  private readonly rng: RandomLib;
  private readonly collapseQueue: CollapseGroup[] = [];
  private readonly propagationQueue: Set<Cell> = new Set();
  private readonly logLevel: LogLevel;
  #precomputedAdjacencies?: PrecomputedAdjacencies;

  // New hierarchical backtracking system
  private snapshots: SnapshotManager;
  private backtrackTree: BacktrackTree;
  private exhaustionTracker: ExhaustionTracker;
  private strategy: BacktrackStrategy;
  private stepCounter = 0;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    super();
    this.tileDefs = tileDefs;
    this.#grid = grid;
    this.options = options;
    this.retries = options.maxRetries || 10;
    this.rng = options.random || new DefaultRandom();
    this.logLevel = options.logLevel || LogLevel.WARN;
    this.strategy = options.backtrackStrategy || BACKTRACK_STRATEGIES.conservative;

    // Initialize new systems
    this.snapshots = new SnapshotManager();
    this.backtrackTree = new BacktrackTree();
    this.exhaustionTracker = new ExhaustionTracker();

    this.validateTileDefs(tileDefs);
    this.initializeGrid();
  }

  initializeGrid() {
    for (const [cell] of this.#grid.iterate()) {
      cell.choices = [...this.tileDefs];
      cell.collapsed = false;
    }
  }

  validateTileDefs(tileDefs: TileDef[]) {
    if (!tileDefs || tileDefs.length === 0) {
      throw new Error("No tile definitions provided");
    }
    for (const tileDef of tileDefs) {
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
    return array[index];
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

  *execute(initialSeed?: CellCollapse[], emitEvents: boolean = true): Generator<StepResult, void, unknown> {
    this.log(LogLevel.INFO, "Starting WFC execution");
    
    // Handle initial seed if provided
    if (initialSeed && initialSeed.length > 0) {
      this.log(LogLevel.DEBUG, "Processing initial seed");
      const group: CollapseGroup = {
        cells: initialSeed,
        cause: "initial"
      };
      
      const result = yield* this.attemptCollapse(group, emitEvents);
      if (!result.success) {
        throw new Error("Initial seed creates an impossible state");
      }
    }

    // Main execution loop
    while (!this.completed) {
      try {
        // Select cells to collapse based on entropy
        const targetCells = this.selectCellsToCollapse();
        if (targetCells.length === 0) {
          this.log(LogLevel.INFO, "WFC completed successfully");
          if (emitEvents) this.emit("complete");
          yield { type: "complete" };
          return;
        }

        const group: CollapseGroup = {
          cells: targetCells.map(coords => ({ coords })),
          cause: "entropy"
        };

        const result = yield* this.attemptCollapse(group, emitEvents);
        if (!result.success) {
          // Failed - try backtracking
          const backtrackResult = yield* this.handleBacktrack(emitEvents);
          if (!backtrackResult) {
            throw new Error("No solution exists - all possibilities exhausted");
          }
        }

        // Periodic cleanup
        this.stepCounter++;
        if (this.stepCounter % this.strategy.cleanupFrequency === 0) {
          this.performCleanup();
        }

      } catch (error) {
        this.log(LogLevel.ERROR, "WFC execution failed:", error);
        if (emitEvents) this.emit("error", error);
        throw error;
      }
    }

    this.log(LogLevel.INFO, "WFC completed successfully");
    if (emitEvents) this.emit("complete");
    yield { type: "complete" };
  }

  private *attemptCollapse(group: CollapseGroup, emitEvents: boolean = true): Generator<StepResult, CollapseResult, unknown> {
    // Get cells that have changed since last snapshot
    const changedCells = this.getChangedCells();
    
    // Create snapshot
    const snapshotId = this.snapshots.createSnapshot(changedCells);
    this.snapshots.addReference(snapshotId);
    
    // Create backtrack node
    const targetCells: CellCoords[] = group.cells.map(c => c.coords);
    const node = this.backtrackTree.createChild(targetCells, snapshotId);

    // Get untried choices for this node
    const availableChoices = this.getUntriedChoices(node);
    if (availableChoices.size === 0) {
      this.log(LogLevel.DEBUG, `No untried choices for node ${node.id}`);
      this.backtrackTree.markExhausted(node);
      // Remove reference since we're failing
      this.snapshots.removeReference(snapshotId);
      return { success: false, affectedCells: [] };
    }

    // Select choices for collapse
    const selectedChoices = this.selectChoices(group.cells, availableChoices);
    
    // Mark these choices as tried
    this.exhaustionTracker.markTried(targetCells, selectedChoices);
    this.updateTriedChoices(node, selectedChoices);

    // Attempt the actual collapse
    const result = this.collapseWithChoices(group.cells, selectedChoices);
    
    if (result.success) {
      this.log(LogLevel.DEBUG, `Collapsed ${group.cells.length} cells at depth ${node.depth}`);
      if (emitEvents) this.emit("collapse", group);
      yield { type: "collapse", group, affectedCells: result.affectedCells };
      // Keep the snapshot alive since collapse succeeded - we might need to backtrack to it
      return result;
    } else {
      this.log(LogLevel.DEBUG, `Collapse failed for node ${node.id}`);
      // Remove reference since we're failing
      this.snapshots.removeReference(snapshotId);
      return result;
    }
  }

  private *handleBacktrack(emitEvents: boolean = true): Generator<StepResult, boolean, unknown> {
    this.log(LogLevel.INFO, "Starting backtrack");

    for (let depth = 1; depth <= this.strategy.maxLevels; depth++) {
      const viableNode = this.backtrackTree.findViableAncestor(depth);
      if (!viableNode) {
        continue;
      }

      this.log(LogLevel.INFO, `Backtracking to depth ${depth}, node ${viableNode.id}`);
      
      // Restore to this state
      const restored = this.snapshots.restoreSnapshot(viableNode.snapshotId, this.#grid, this.tileDefs);
      if (!restored) {
        this.log(LogLevel.WARN, `Failed to restore snapshot ${viableNode.snapshotId}`);
        continue;
      }

      // Move to this node
      this.backtrackTree.moveToNode(viableNode);
      
      if (emitEvents) {
        this.emit("backtrack", { cells: viableNode.targetCells.map(coords => ({ coords })), cause: "entropy" as const });
      }
      yield { type: "backtrack", depth };

      // Check if this node still has untried possibilities
      if (!this.exhaustionTracker.isExhausted(viableNode.targetCells, this.#grid)) {
        return true;
      }

      // Mark as exhausted and continue to deeper levels
      this.backtrackTree.markExhausted(viableNode);
    }

    this.log(LogLevel.ERROR, "All backtrack levels exhausted");
    return false;
  }

  private selectCellsToCollapse(): CellCoords[] {
    let minEntropy = Infinity;
    const candidates: Cell[] = [];

    // Find cells with minimum entropy (fewest choices)
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

    if (candidates.length === 0) return [];

    // Pick one cell randomly from candidates
    const selectedCell = this.pick(candidates);
    return [selectedCell.coords];
  }

  private getChangedCells(): Cell[] {
    // For now, return all cells that are not collapsed
    // In a more sophisticated implementation, we'd track actual changes
    const changed: Cell[] = [];
    for (const [cell] of this.#grid.iterate()) {
      if (!cell.collapsed) {
        changed.push(cell);
      }
    }
    return changed;
  }

  private getUntriedChoices(node: BacktrackNode): Map<string, TileDef[]> {
    const untried = new Map<string, TileDef[]>();

    for (const coords of node.targetCells) {
      const cell = this.#grid.get(coords);
      if (!cell) continue;

      const coordKey = `${coords[0]},${coords[1]}`;
      const triedSet = node.triedChoices.get(coordKey) || new Set<TileId>();
      
      const availableChoices = cell.choices.filter(choice => !triedSet.has(choice.name));
      if (availableChoices.length > 0) {
        untried.set(coordKey, availableChoices);
      }
    }

    return untried;
  }

  private selectChoices(cellCollapses: CellCollapse[], availableChoices: Map<string, TileDef[]>): Map<string, TileId> {
    const selected = new Map<string, TileId>();

    for (const cellCollapse of cellCollapses) {
      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const choices = availableChoices.get(coordKey);
      
      if (choices && choices.length > 0) {
        const selectedTile = cellCollapse.value || this.pick(choices);
        selected.set(coordKey, selectedTile.name);
      }
    }

    return selected;
  }

  private updateTriedChoices(node: BacktrackNode, selectedChoices: Map<string, TileId>): void {
    for (const [coordKey, tileId] of selectedChoices.entries()) {
      if (!node.triedChoices.has(coordKey)) {
        node.triedChoices.set(coordKey, new Set());
      }
      node.triedChoices.get(coordKey)!.add(tileId);
    }
  }

  private collapseWithChoices(cellCollapses: CellCollapse[], selectedChoices: Map<string, TileId>): CollapseResult {
    const affectedCells: Cell[] = [];
    const tileMap = new Map<string, TileDef>();
    
    // Create tile lookup map
    for (const tile of this.tileDefs) {
      tileMap.set(tile.name, tile);
    }

    // First pass: validate all choices are compatible
    for (const cellCollapse of cellCollapses) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tileId = selectedChoices.get(coordKey);
      if (!tileId) continue;

      const tile = tileMap.get(tileId);
      if (!tile) continue;

      // Check compatibility with neighbors
      const neighbors = this.#grid.getNeighbors(cellCollapse.coords);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor || !neighbor.collapsed) continue;

        if (!this.canBeAdjacent(tile, cellCollapse.coords, i, neighbor.choices[0])) {
          return { success: false, affectedCells: [] };
        }
      }
    }

    // Second pass: perform the collapse
    for (const cellCollapse of cellCollapses) {
      const cell = this.#grid.get(cellCollapse.coords);
      if (!cell) continue;

      const coordKey = `${cellCollapse.coords[0]},${cellCollapse.coords[1]}`;
      const tileId = selectedChoices.get(coordKey);
      if (!tileId) continue;

      const tile = tileMap.get(tileId);
      if (!tile) continue;

      cell.collapsed = true;
      cell.choices = [tile];
      affectedCells.push(cell);
    }

    // Third pass: propagate constraints
    this.propagationQueue.clear();
    for (const cell of affectedCells) {
      this.queueNeighborsForPropagation(cell);
    }

    const propagationResult = this.processConstraintPropagation();
    if (!propagationResult) {
      return { success: false, affectedCells };
    }

    return { success: true, affectedCells };
  }

  private processConstraintPropagation(): boolean {
    while (this.propagationQueue.size > 0) {
      const cell = this.propagationQueue.values().next().value;
      if (!cell) continue;

      this.propagationQueue.delete(cell);
      
      const originalChoices = [...cell.choices];
      const neighbors = this.#grid.getNeighbors(cell.coords);

      // Update choices based on all neighbors
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;

        const validChoices = this.filterValidAdjacencies(cell, neighbor, i);
        cell.choices = cell.choices.filter(choice => validChoices.includes(choice));
      }

      // Check for contradictions
      if (cell.choices.length === 0) {
        this.log(LogLevel.DEBUG, `Cell ${cell.coords} has no valid choices after propagation`);
        return false;
      }

      // If choices changed, queue neighbors for propagation
      if (cell.choices.length !== originalChoices.length) {
        this.queueNeighborsForPropagation(cell);
      }

      // Auto-collapse if only one choice remains
      if (cell.choices.length === 1 && !cell.collapsed) {
        cell.collapsed = true;
        this.queueNeighborsForPropagation(cell);
      }
    }

    return true;
  }

  private queueNeighborsForPropagation(cell: Cell): void {
    const neighbors = this.#grid.getNeighbors(cell.coords);
    for (const neighbor of neighbors) {
      if (neighbor && !neighbor.collapsed) {
        this.propagationQueue.add(neighbor);
      }
    }
  }

  private performCleanup(): void {
    const oldTime = Date.now() - 60000; // 1 minute ago
    const cleaned = this.snapshots.cleanup(oldTime);
    const pruned = this.backtrackTree.cleanup(this.strategy.maxLevels * 2);
    
    if ((cleaned > 0 || pruned > 0) && this.logLevel >= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, `Cleanup: removed ${cleaned} snapshots, ${pruned} tree nodes`);
    }
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

    // If neighbor is collapsed, we must match its adjacency
    if (neighbor.collapsed) {
      const neighborTile = neighbor.choices[0];
      for (const option of cell.choices) {
        if (this.canBeAdjacent(option, cell.coords, direction, neighborTile)) {
          valid.add(option);
        }
      }
    } else {
      // Otherwise, check all possible combinations
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

  /**
   * Sets precomputed adjacencies to be used for optimized adjacency checks
   * @param precomputed The precomputed adjacencies object
   */
  setPrecomputedAdjacencies(precomputed: PrecomputedAdjacencies): void {
    this.#precomputedAdjacencies = precomputed;
  }
}