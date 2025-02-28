import { RandomLib, DefaultRandom } from "./RandomLib.js";
import { TileDef } from "./TileDef.js";
import { Grid, Cell } from "./Grid.js";
import { debugDelta } from "./util.js";

export type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
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

export class WFC {
  private tileDefs: TileDef[];
  private options: Required<WFCOptions>;
  private retries: number;
  private grid: Grid;
  private rng: RandomLib;
  private deltaStack: DeltaChange<[number, number]>[];

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
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

  generate(): { collapsed: Cell[]; reverted: Cell[] } {
    // console.log('=======================================')
    const cells = this.grid.getCells();
    const uncollapsed = cells.filter((cell) => !cell.collapsed);
    if (uncollapsed.length === 0) {
      return { collapsed: [], reverted: [] };
    }
    const lowestEntropy: Cell = this.getLowestEntropyTile(uncollapsed);
    // console.log('Lowest entropy:', lowestEntropy.coords);
    // let collapseValue:TileDef = pick(lowestEntropy.choices.filter(choice => !lowestEntropy.forbidden.includes(choice)));
    const collapseValue: TileDef = this.pick(lowestEntropy.choices);

    // Collapse the tile
    const delta: DeltaChange<[number, number]> = this.collapse(
      lowestEntropy,
      collapseValue,
    );
    if (delta.backtrack) {
      console.log('Some backtracking is needed');
      // console.log('---')
      // debugWFC();
      // console.log('\n---')
      debugDelta(delta);
      throw "Backtracking is needed";

      this.deltaStack.push(delta);
      const backtracked = this.backtrack();
      // console.log('Backtracked:', backtracked.map(c => c.coords));
      // Debug the whole grid
      return { collapsed: [], reverted: backtracked };
    } else {
      // Save the delta in the queue and return the changed cells
      this.deltaStack.push(delta);
      const collapsed = delta.discardedValues
        .filter((d) => d.collapsed)
        .map((d) => this.grid.get(d.coords))
        .filter((c) => c !== null) as Cell[];
      return { collapsed, reverted: [] };
    }
    // return { collapsed, reverted };

    // lowestEntropy.collapsed = true;
    // lowestEntropy.choices = [collapseValue];
    // added.push(lowestEntropy);
  }

  backtrack(): Cell[] {
    console.log("Backtracking");
    const delta = this.deltaStack.pop();
    if (delta) {
      return this.undoChange(delta);
    } else {
      throw "Cannot backtrack";
    }
  }

  collapse(cell: Cell, tile: TileDef): DeltaChange<[number, number]> {
    // console.log('Collapsing to:', tile.name, 'at', cell.coords);
    const previousChoices = [...cell.choices];
    const removed = previousChoices.filter((c) => c !== tile);
    cell.collapsed = true;
    cell.choices = [tile];

    const delta: DeltaChange<[number, number]> = this.propagate(cell, tile);

    // Add the cell to the delta
    delta.collapsedCell = cell;
    delta.pickedValue = tile;
    delta.discardedValues.push({
      coords: cell.coords,
      tiles: removed,
      collapsed: cell.collapsed,
    });

    // From the cells that changed, collapse those with only one possible tile definition, or mark backtracking if any cell has no possible tile definitions
    for (const { coords, tiles, collapsed } of delta.discardedValues) {
      const cell = this.grid.get(coords);
      if (cell && cell.choices.length === 0) {
        delta.backtrack = true;
      }
      if (cell && cell.choices.length === 1 && !cell.collapsed) {
        cell.collapsed = true;
      }
    }
    return delta;
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
