// import { TileDef } from "./TileDef";

// Utility functions

// Assume the array is not empty
let pick: <T>(array: T[]) => T = (array) => {
  return array[Math.floor(Math.random() * array.length)]
};

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
};

// export class WFC {
class WFC {
  private tileDefs: TileDef[];
  private options: Required<WFCOptions>;
  private retries: number;
  private grid: Grid;

  constructor(tileDefs: TileDef[], grid: Grid, options: WFCOptions = {}) {
    this.tileDefs = tileDefs;
    this.grid = grid;
    this.initializeGrid();
    this.options = {
      maxRetries: options.maxRetries ?? 100,
      backtrackStep: options.backtrackStep ?? 1,
    };
    this.retries = 0;
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

  generate(): { added: Cell[], removed: Cell[] } {
    let cells = this.grid.getCells();
    let uncollapsed = cells.filter(cell => !cell.collapsed)
    let added: Cell[] = [];
    let removed: Cell[] = [];
    if (uncollapsed.length === 0) {
      return { added: [], removed: [] }; // Finished
    }
    let lowestEntropy:Cell = this.getLowestEntropyTile(uncollapsed);
    console.log('Lowest entropy:', lowestEntropy);
    // let collapseValue:TileDef = pick(lowestEntropy.choices.filter(choice => !lowestEntropy.forbidden.includes(choice)));
    let collapseValue:TileDef = pick(lowestEntropy.choices);
    lowestEntropy.collapsed = true;
    lowestEntropy.choices = [collapseValue];
    added.push(lowestEntropy);

    console.log('Collapsing to:', collapseValue, 'at', lowestEntropy.coords);

    let changedValues = this.propagate(lowestEntropy, collapseValue);
    return { added, removed };
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
    return pick(candidates);
  }

  // TODO: This implementation is naive, in that it iterates over all the cells and checks
  // only once, instead of propagating from the changed values until no more changes are made.
  propagate(cell: Cell, collapseValue: TileDef): Cell[] {
    let iterator = this.grid.iterate();
    for (let [cell, [x, y]] of iterator) {
      if (cell.collapsed) {
        continue;
      }
      let neighbors = this.grid.getNeighbors([x, y]);
      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];
        if (neighbor) {
          let validAdjacencies = this.filterValidAdjacencies(cell, neighbor, i);
          cell.choices = validAdjacencies;
        }
      }
      if (cell.choices.length === 1) {
        // Collapse the cell
        cell.collapsed = true;
        console.log('Collapsed cell:', cell);
      }
      if (cell.choices.length === 0) {
        // No possible solution, backtrack
        console.log('No possible solution, backtracking');
        return [];
      }
    }
    return [];
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
    name: "empty",
    adjacencies: ["E", "E", "E", "E"],
    draw: () => { process.stdout.write("."); }
  },
  {
    name: "horizontal wall",
    adjacencies: ["E", "W", "E", "W"],
    draw: () => { process.stdout.write("─"); }
  },
  {
    name: "vertical wall",
    adjacencies: ["W", "E", "W", "E"],
    draw: () => { process.stdout.write("│"); }
  },
  {
    name: "topleft corner",
    adjacencies: ["E", "W", "W", "E"],
    draw: () => { process.stdout.write("┌"); }
  },
  {
    name: "topright corner",
    adjacencies: ["E", "E", "W", "W"],
    draw: () => { process.stdout.write("┐"); }
  },
  {
    name: "bottomleft corner",
    adjacencies: ["W", "W", "E", "E"],
    draw: () => { process.stdout.write("└"); }
  },
  {
    name: "bottomright corner",
    adjacencies: ["W", "E", "E", "W"],
    draw: () => { process.stdout.write("┘"); }
  },
]

let grid = new SquareGrid(10, 10);
let wfc = new WFC(tiledefs, grid);

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
  let { added, removed } = wfc.generate();
}

debugWFC(true);
console.log('\n')