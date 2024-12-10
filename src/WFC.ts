// import { TileDef } from "./TileDef";

interface RandomLib {
  random(): number;
  setSeed(seed: number|string): void;
}

class DefaultRandom implements RandomLib {
  random(): number {
    return Math.random();
  }

  setSeed(seed: number): void {
    // Do nothing
  }
}

const seedrandom = require('seedrandom');

class SeedRandom implements RandomLib {
  private rng: any;

  constructor(seed?: string|number) {
    this.rng = seed === undefined ? seedrandom() : seedrandom(seed);
  }

  random(): number {
    return this.rng();
  }

  setSeed(seed: string): void {
    this.rng = seedrandom(seed);
  }
}

// export type TileDef = {
type TileDef = {
  /**
   * List of adjacency definitions.
   * The adjacency is an arbitrary string that must match the adjacency of another tile.
   * It can accept multiple adjacencies as strings joined by |
   * The adjacencies are ordered: top, right, bottom, left
   * Example: ["A", "B", "A|B", "C"]
  */
  adjacencies: string[];
  name: string;
  rotation?: number;
  reflection?: number;
  weight?: number;
  draw: () => void;
};

// export class TileDefFactory {
class TileDefFactory {
  /**
   * Creates a TileDef with the provided properties. Adds a noop `draw` method if not specified.
   * @param tile - Partial tile definition
   * @returns Complete TileDef object
   */
  static defineTile(tile: Partial<TileDef>): TileDef {
    return {
      name: tile.name ?? "",
      adjacencies: tile.adjacencies ?? [],
      rotation: tile.rotation ?? 0,
      reflection: tile.reflection ?? 0,
      draw: tile.draw ?? (() => {}),
    };
  }

  static extractAdjacencies = (adjacency: string): string[][] => {
    let result: string[][] = [];
    let adjacencyDefs = adjacency.split("|");
    for (let adjacencyDef of adjacencyDefs) {
      // Adjacencies can be a single character, or a sequence of characters between parentheses (except `(`, `)`, and `|`)
      let adjacencyDefParts = adjacencyDef.match(/\(([^)]+)\)|./g);
      if (adjacencyDefParts) {
        let adjacencyDefPartsCleaned = adjacencyDefParts.map(part => part.replace(/[()]/g, ""));
        result.push(adjacencyDefPartsCleaned);
      }
    }
    return result;
  }
}

type Cell = {
  choices: TileDef[];
  collapsed: boolean;
  forbidden: TileDef[];
  coords: any; // TODO: How to specify the variable type?
}

interface Grid<Coords = any> {
  // Define a method for iterating, a getter and setter with variable attributes (ex: x, y), and a method to get neighbors

  iterate(): IterableIterator<[Cell, Coords]>;
  get(coords: Coords): Cell | null;
  set(coords: Coords, cell: Cell): void;
  getNeighbors(coords: Coords): (Cell|null)[];
  getCells(): Cell[];
  // Adjacency map is an array, where for each cell in the TileDef grid, its index indicates the index of the neighbor it matches
  adjacencyMap: number[];
}

class SquareGrid implements Grid<[number, number]> {
  private cells: Cell[];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    // Initialize the grid with empty cells
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill({ choices: [], collapsed: false, forbidden: [] });
  }

  *iterate(): IterableIterator<[Cell, [number, number]]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let n = this.width * y + x;
        // console.log(n, x, y, this.cells[n]);
        yield [this.cells[n], [x, y]];
      }
    }
  }

  getNeighbors(coords: [number, number]): (Cell|null)[] {
    let deltas = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let [x, y] = coords;
    let neighbors = [];
    for (let [dx, dy] of deltas) {
      let neighbor = this.get([x + dx, y + dy]);
      if (neighbor) {
        neighbors.push(neighbor);
      } else {
        neighbors.push(null);
      }
    }
    return neighbors;
  }

  get([x, y]:[number, number]): Cell | null {
    let n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      return null;
    }
    return this.cells[n];
  }

  set([x, y]:[number, number], cell: Cell) {
    let n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      // console.log('Out of bounds', x, y, n, this.cells.length);
      return;
    }
    this.cells[n] = cell;
  }

  getCells(): Cell[] {
    return this.cells;
  }

  adjacencyMap: number[] = [2, 3, 0, 1]; // Bottom, Left, Top, Right
}

type WFCOptions = {
  maxRetries?: number;
  backtrackStep?: number;
  random?: RandomLib;
};

type DeltaChange<Coords> ={
  collapsedCell: Cell;
  pickedValue: TileDef;
  discardedValues: Array<{ coords: Coords, tiles: TileDef[], collapsed: boolean }>;
  backtrack?: boolean;
}

let debugDelta = (delta: DeltaChange<[number, number]>) => {
  console.log('Delta:')
  console.log('Collapsed cell:', delta.collapsedCell.coords);
  console.log('Picked value:', delta.pickedValue);
  console.log('Discarded values:');
  for (let { coords, tiles, collapsed } of delta.discardedValues) {
    console.log(coords, ' => ', tiles.map(t => t.name))
  }
}

// export class WFC {
class WFC {
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
    let iterator = this.grid.iterate();
    for (let [cells, [x, y]] of iterator) {
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
    let iterator = this.grid.iterate();
    for (let [cell, _] of iterator) {
      if (!cell.collapsed) {
        return false;
      }
    }
    return true;
  }

  generate(): { collapsed: Cell[], reverted: Cell[] } {
    console.log('=======================================')
    let cells = this.grid.getCells();
    let uncollapsed = cells.filter(cell => !cell.collapsed)
    if (uncollapsed.length === 0) {
      return { collapsed: [], reverted: [] };
    }
    let lowestEntropy:Cell = this.getLowestEntropyTile(uncollapsed);
    console.log('Lowest entropy:', lowestEntropy.coords);
    // let collapseValue:TileDef = pick(lowestEntropy.choices.filter(choice => !lowestEntropy.forbidden.includes(choice)));
    let collapseValue:TileDef = this.pick(lowestEntropy.choices);

    // Collapse the tile
    let delta: DeltaChange<[number, number]> = this.collapse(lowestEntropy, collapseValue);
    if (delta.backtrack) {
      console.log('Some backtracking is needed');
      // Apply backtracking
      return { collapsed: [], reverted: [] };
    } else {
      // Save the delta in the queue and return the changed cells
      this.deltaStack.push(delta);
      let collapsed = delta.discardedValues.filter(d => d.collapsed).map(d => this.grid.get(d.coords)).filter(c => c !== null) as Cell[];
      return { collapsed, reverted: [] };
    }
    // return { collapsed, reverted };

    // lowestEntropy.collapsed = true;
    // lowestEntropy.choices = [collapseValue];
    // added.push(lowestEntropy);


  }

  collapse(cell: Cell, tile: TileDef) : DeltaChange<[number, number]> {
    console.log('Collapsing to:', tile, 'at', cell.coords);
    let previousChoices = [...cell.choices];
    let removed = previousChoices.filter(c => c !== tile);
    cell.collapsed = true;
    cell.choices = [tile];

    let delta: DeltaChange<[number, number]> = this.propagate(cell, tile);

    // Add the cell to the delta
    delta.collapsedCell = cell;
    delta.pickedValue = tile;
    delta.discardedValues.push({ coords: cell.coords, tiles: removed, collapsed: cell.collapsed });

    // From the cells that changed, collapse those with only one possible tile definition, or mark backtracking if any cell has no possible tile definitions
    for (let { coords, tiles, collapsed } of delta.discardedValues) {
      let cell = this.grid.get(coords);
      if (cell && cell.choices.length === 0) {
        delta.backtrack = true;
      }
      if (cell && cell.choices.length === 1 && !cell.collapsed) {
        cell.collapsed = true;
      }
    }
    debugDelta(delta);
    return delta;
  }


  // Return the tile with the least amount of possible tile definitions.
  // In case of a tie, return a random one.
  getLowestEntropyTile(cells:Cell[]): Cell {
    let candidates: Cell[] = [];
    let minEntropy = Number.MAX_SAFE_INTEGER;
    for (let cell of cells) {
      let entropy = cell.choices.length;
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
    let iterator = this.grid.iterate();
    let changedValues: DeltaChange<[number, number]> = {
      collapsedCell: cell,
      pickedValue: collapseValue,
      discardedValues: []
    };
    for (let [cell, [x, y]] of iterator) {
      if (cell.collapsed) {
        continue;
      }
      let currentOptions = [...cell.choices];
      let neighbors = this.grid.getNeighbors([x, y]);
      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];
        if (neighbor) {
          let validAdjacencies = this.filterValidAdjacencies(cell, neighbor, i);
          cell.choices = validAdjacencies;
        }
      }
      console.log('Comparing:', currentOptions.map(c => c.name).join(','), 'vs', cell.choices.map(c => c.name).join(','), 'at', cell.coords);
      // Check if the cell has changed
      if (currentOptions.length !== cell.choices.length) {
        // changedValues.discardedValues.push({ coords: [x, y], tiles: currentOptions, collapsed: cell.collapsed });
        // Only push the removed values if they are different from the collapse value
        // let removed = currentOptions.filter(c => c !== collapseValue);
        let removed = currentOptions.filter(c => !cell.choices.includes(c));
        console.log('Removed:', removed.map(c => c.name), 'from', cell.coords);
        changedValues.discardedValues.push({ coords: [x, y], tiles: removed, collapsed: cell.collapsed });
      }
    }
    return changedValues;
  }

  // TODO: Implementation is quadratic, can be optimized by precalculating the total of possible adjacencies
  filterValidAdjacencies(cell: Cell, neighbor: Cell, direction: number): TileDef[] {
    let valid = [];
    for (let option of cell.choices) {
      for (let adjacentOption of neighbor.choices) {
        let d1 = option.adjacencies[direction];
        let d2 = adjacentOption.adjacencies[this.grid.adjacencyMap[direction]];
        if (d1 === d2) {
          valid.push(option);
          break;
        }
      }
    }
    return valid;
  }

}

let tiledefs: TileDef[] = [
  {
    // name: "empty",
    name: ".",
    adjacencies: ["E", "E", "E", "E"],
    draw: () => { process.stdout.write("."); }
  },
  {
    // name: "horizontal wall",
    name: "─",
    adjacencies: ["E", "W", "E", "W"],
    draw: () => { process.stdout.write("─"); }
  },
  {
    // name: "vertical wall",
    name: "│",
    adjacencies: ["W", "E", "W", "E"],
    draw: () => { process.stdout.write("│"); }
  },
  {
    // name: "topleft corner",
    name: "┌",
    adjacencies: ["E", "W", "W", "E"],
    draw: () => { process.stdout.write("┌"); }
  },
  {
    // name: "topright corner",
    name: "┐",
    adjacencies: ["E", "E", "W", "W"],
    draw: () => { process.stdout.write("┐"); }
  },
  {
    // name: "bottomleft corner",
    name: "└",
    adjacencies: ["W", "W", "E", "E"],
    draw: () => { process.stdout.write("└"); }
  },
  {
    // name: "bottomright corner",
    name: "┘",
    adjacencies: ["W", "E", "E", "W"],
    draw: () => { process.stdout.write("┘"); }
  },
]

let grid = new SquareGrid(6, 6);
// let r = Math.floor(Math.random() * 10000);
// let r = process.argv[2] || 100;
let r = "63";
console.log('Initial seed:', r);

let random = new SeedRandom(r);

let wfc = new WFC(tiledefs, grid, { random });

let debugWFC = (clean = false) => {
  // Iterate over all the tiles in the grid, and draw them
  let iterator = grid.iterate();
  let lastRow = 0;
  for (let [cell, [x, y]] of iterator) {
    if (y > lastRow) {
      process.stdout.write("\n");
      lastRow = y;
    }
    if (!clean) {
      process.stdout.write("[");
      if (cell.collapsed) {
        process.stdout.write("*");
      }
    }
    for (let choice of cell.choices) {
      choice.draw();
    }
    if (!clean) {
      process.stdout.write("]");
    }
  }
}

let maxTries = 100;
while (!wfc.completed && maxTries > 0) {
  maxTries--;
  debugWFC();
  console.log('\n')
  let { collapsed, reverted } = wfc.generate();
}

debugWFC(true);
console.log('\n')