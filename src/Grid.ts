import { TileDef } from "./TileDef.js";

export type Cell<Coords = any> = {
  choices: TileDef[];
  collapsed: boolean;
  forbidden: TileDef[];
  coords: Coords;
};

export type GridSnapshot = {
  cells: Cell[];
  width: number;
  height: number;
};

export interface Grid<Coords = any> {
  iterate(): IterableIterator<[Cell<Coords>, Coords]>;
  get(coords: Coords): Cell<Coords> | null;
  set(coords: Coords, cell: Cell<Coords>): void;
  getNeighbors(coords: Coords): (Cell<Coords> | null)[];
  getCells(): Cell<Coords>[];
  clone(): Grid<Coords>;
  toSnapshot(): GridSnapshot;
  // Adjacency map is an array, where for each cell in the TileDef grid, its index indicates the index of the neighbor it matches
  adjacencyMap: number[];
}

export class SquareGrid implements Grid<[number, number]> {
  private cells: Cell[];
  private width: number;
  private height: number;

  constructor(width: number, height: number, cells?: Cell[]) {
    this.width = width;
    this.height = height;
    if (cells) {
      this.cells = cells.map(cell => ({
        ...cell,
        choices: [...cell.choices],
        forbidden: [...cell.forbidden]
      }));
    } else {
      // Initialize with empty cells
      this.cells = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          this.cells.push({
            choices: [],
            collapsed: false,
            forbidden: [],
            coords: [x, y],
          });
        }
      }
    }
  }

  static fromSnapshot(snapshot: GridSnapshot): SquareGrid {
    return new SquareGrid(snapshot.width, snapshot.height, snapshot.cells);
  }

  clone(): Grid<[number, number]> {
    return new SquareGrid(this.width, this.height, this.cells);
  }

  toSnapshot(): GridSnapshot {
    return {
      cells: this.cells.map(cell => ({
        ...cell,
        choices: [...cell.choices],
        forbidden: [...cell.forbidden]
      })),
      width: this.width,
      height: this.height
    };
  }

  *iterate(): IterableIterator<[Cell, [number, number]]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const n = this.width * y + x;
        // console.log(n, x, y, this.cells[n]);
        yield [this.cells[n], [x, y]];
      }
    }
  }

  getNeighbors(coords: [number, number]): (Cell | null)[] {
    const deltas = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const [x, y] = coords;
    const neighbors = [];
    for (const [dx, dy] of deltas) {
      const neighbor = this.get([x + dx, y + dy]);
      if (neighbor) {
        neighbors.push(neighbor);
      } else {
        neighbors.push(null);
      }
    }
    return neighbors;
  }

  get([x, y]: [number, number]): Cell | null {
    const n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      return null;
    }
    return this.cells[n];
  }

  set([x, y]: [number, number], cell: Cell) {
    const n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      return;
    }
    this.cells[n] = cell;
  }

  getCells(): Cell[] {
    return this.cells;
  }

  adjacencyMap: number[] = [2, 3, 0, 1]; // Bottom, Left, Top, Right
}
