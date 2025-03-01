import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { TileDef } from "./TileDef.js";
import { Grid, Cell } from "./Grid.js";
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

export class WFC extends EventEmitter {
  private tileDefs: TileDef[];
  private options: Required<WFCOptions>;
  private retries: number;
  private grid: Grid;
  private rng: RandomLib;
  private deltaStack: DeltaChange<[number, number]>[];
  private collapseQueue: CollapseGroup[] = [];
  private propagationQueue: Set<Cell> = new Set();
  private snapshots: Map<number, Grid> = new Map();
  private snapshotCounter: number = 0;

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

      // Take a snapshot before attempting collapse
      const snapshotId = this.takeSnapshot();

      try {
        const result = this.collapseGroup(currentGroup);
        if (!result.success) {
          // Restore from snapshot and trigger backtrack
          this.restoreSnapshot(snapshotId);
          this.emit('backtrack', currentGroup);
          return;
        }

        this.emit('collapse', currentGroup);

        // Add any new collapses from propagation to the queue
        if (result.propagatedCollapses) {
          this.collapseQueue.push(...result.propagatedCollapses);
        }

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
        // Restore from snapshot
        this.restoreSnapshot(snapshotId);
        throw error;
      } finally {
        // Clean up snapshot
        this.snapshots.delete(snapshotId);
      }
    }

    if (this.completed) {
      this.emit('complete');
    }
  }

  private collapseGroup(group: CollapseGroup): CollapseResult {
    console.log('Attempting to collapse group:', group.cells.map(c => c.coords), ' due to ', group.cause);
    const affectedCells: Cell[] = [];
    const propagatedCollapses: CollapseGroup[] = [];

    // First pass: collapse all cells in the group
    for (const cellCollapse of group.cells) {
      const cell = this.grid.get(cellCollapse.coords);
      if (!cell) continue;

      const value = cellCollapse.value ?? this.pick(cell.choices);
      console.log('Picked value:', value.name, 'for cell', cell.coords);
      if (!cell.choices.includes(value)) {
        return { success: false, affectedCells: [] };
      }

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
    // For now, just do a deep copy - can be optimized later
    const snapshot = JSON.parse(JSON.stringify(this.grid));
    const id = this.snapshotCounter++;
    this.snapshots.set(id, snapshot);
    return id;
  }

  private restoreSnapshot(id: number): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot ${id} not found`);
    }
    this.grid = snapshot;
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
}
