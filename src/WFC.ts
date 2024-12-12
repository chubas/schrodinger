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
      // console.log('Some backtracking is needed');
      // console.log('---')
      // debugWFC();
      // console.log('\n---')
      // debugDelta(delta);
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

  // TODO: This implementation is naive, in that it iterates over all the cells and checks
  // only once, instead of propagating from the changed values until no more changes are made.
  propagate(cell: Cell, collapseValue: TileDef): DeltaChange<[number, number]> {
    const iterator = this.grid.iterate();
    const changedValues: DeltaChange<[number, number]> = {
      collapsedCell: cell,
      pickedValue: collapseValue,
      discardedValues: [],
    };
    for (const [cell, [x, y]] of iterator) {
      if (cell.collapsed) {
        continue;
      }
      const currentOptions = [...cell.choices];
      const neighbors = this.grid.getNeighbors([x, y]);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (neighbor) {
          const validAdjacencies = this.filterValidAdjacencies(
            cell,
            neighbor,
            i,
          );
          cell.choices = validAdjacencies;
        }
      }
      // console.log('Comparing:', currentOptions.map(c => c.name).join(','), 'vs', cell.choices.map(c => c.name).join(','), 'at', cell.coords);
      // Check if the cell has changed
      if (currentOptions.length !== cell.choices.length) {
        // changedValues.discardedValues.push({ coords: [x, y], tiles: currentOptions, collapsed: cell.collapsed });
        // Only push the removed values if they are different from the collapse value
        // let removed = currentOptions.filter(c => c !== collapseValue);
        const removed = currentOptions.filter((c) => !cell.choices.includes(c));
        // console.log('Removed:', removed.map(c => c.name), 'from', cell.coords, 'remaining:', cell.choices.map(c => c.name));
        changedValues.discardedValues.push({
          coords: [x, y],
          tiles: removed,
          collapsed: cell.collapsed,
        });
      }
    }
    return changedValues;
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
