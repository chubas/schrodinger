import { TileDef } from "./TileDef.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cell<Coords = any> = {
  choices: TileDef[];
  collapsed: boolean;
  /** @deprecated Unused by the engine; grids no longer need to provide it. */
  forbidden?: TileDef[];
  coords: Coords;
  value?: TileDef; // The selected tile when collapsed
};

export type GridSnapshot = {
  cells: Cell[];
  width: number;
  height: number;
  depth?: number; // Optional for 3D grids
};

/**
 * What the engine needs from a grid. See docs/custom-grids.md.
 *
 * `iterate`, `get` and `getNeighbors` must return the same cell objects every
 * time: the engine stores its state on them. `getNeighbors` returns one entry
 * per direction (null where there is no neighbour), in the order of the tiles'
 * adjacencies. `adjacencyMaps[type][d]` is the direction, from the neighbour's
 * point of view, that points back at a cell of that type looking in direction d.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Grid<Coords = any> {
  iterate(): IterableIterator<[Cell<Coords>, Coords]>;
  get(coords: Coords): Cell<Coords> | null;
  getNeighbors(coords: Coords): (Cell<Coords> | null)[];
  getAdjacencyType(coords: Coords): string;
  adjacencyMaps: Record<string, number[]>;
}

export class SquareGrid implements Grid<[number, number]> {
  private cells: Cell<[number, number]>[];
  private width: number;
  private height: number;

  // Define adjacency maps for square grids
  adjacencyMaps: Record<string, number[]> = {
    square: [2, 3, 0, 1], // Bottom, Left, Top, Right
  };

  constructor(width: number, height: number, cells?: Cell<[number, number]>[]) {
    this.width = width;
    this.height = height;
    if (cells) {
      this.cells = cells.map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      }));
    } else {
      // Initialize with empty cells
      this.cells = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          this.cells.push({
            choices: [],
            collapsed: false,
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
      cells: this.cells.map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      })),
      width: this.width,
      height: this.height,
    };
  }

  *iterate(): IterableIterator<[Cell<[number, number]>, [number, number]]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const n = this.width * y + x;
        yield [this.cells[n], [x, y]];
      }
    }
  }

  getNeighbors(coords: [number, number]): (Cell<[number, number]> | null)[] {
    const deltas = [
      [0, -1], // Top
      [1, 0], // Right
      [0, 1], // Bottom
      [-1, 0], // Left
    ];
    const [x, y] = coords;
    const neighbors = [];
    for (const [dx, dy] of deltas) {
      const nx = x + dx;
      const ny = y + dy;
      const neighbor = this.get([nx, ny]);
      neighbors.push(neighbor); // Push null if out of bounds
    }
    return neighbors;
  }

  get([x, y]: [number, number]): Cell<[number, number]> | null {
    // Check if coordinates are out of bounds
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    const n = this.width * y + x;
    return this.cells[n];
  }

  set([x, y]: [number, number], cell: Cell<[number, number]>) {
    const n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      return;
    }
    this.cells[n] = cell;
  }

  getCells(): Cell<[number, number]>[] {
    return this.cells;
  }

  // New method to get adjacency type for coordinates
  getAdjacencyType(_coords: [number, number]): string {
    // Square grid has only one type
    return "square";
  }

  // New method to get adjacency map for coordinates
  getAdjacencyMap(coords: [number, number]): number[] {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }

  // Keeping the adjacencyMap property for backward compatibility
  get adjacencyMap(): number[] {
    return this.adjacencyMaps["square"];
  }
}

export class TriangularGrid implements Grid<[number, number]> {
  private cells: Cell<[number, number]>[];
  private width: number;
  private height: number;

  // Define adjacency maps for triangular grids
  adjacencyMaps: Record<string, number[]> = {
    up: [2, 2, 0], // [topLeft, topRight, bottom] -> [bottom, bottom, topLeft]
    down: [0, 0, 2], // [bottomLeft, bottomRight, top] -> [topLeft, topRight, bottom]
  };

  constructor(width: number, height: number, cells?: Cell<[number, number]>[]) {
    this.width = width;
    this.height = height;
    if (cells) {
      this.cells = cells.map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      }));
    } else {
      // Initialize with empty cells
      this.cells = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          this.cells.push({
            choices: [],
            collapsed: false,
            coords: [x, y],
          });
        }
      }
    }
  }

  static fromSnapshot(snapshot: GridSnapshot): TriangularGrid {
    return new TriangularGrid(snapshot.width, snapshot.height, snapshot.cells);
  }

  clone(): Grid<[number, number]> {
    return new TriangularGrid(this.width, this.height, this.cells);
  }

  toSnapshot(): GridSnapshot {
    return {
      cells: this.cells.map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      })),
      width: this.width,
      height: this.height,
    };
  }

  *iterate(): IterableIterator<[Cell<[number, number]>, [number, number]]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const n = this.width * y + x;
        yield [this.cells[n], [x, y]];
      }
    }
  }

  getAdjacencyType(coords: [number, number]): string {
    const [x, y] = coords;
    // Determine if triangle points up or down based on coordinates
    return (x + y) % 2 === 0 ? "up" : "down";
  }

  getAdjacencyMap(coords: [number, number]): number[] {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }

  getNeighbors(coords: [number, number]): (Cell<[number, number]> | null)[] {
    const [x, y] = coords;
    const isPointingUp = this.getAdjacencyType(coords) === "up";

    if (isPointingUp) {
      // Order: topLeft, topRight, bottom
      return [this.get([x - 1, y - 1]), this.get([x + 1, y - 1]), this.get([x, y + 1])];
    } else {
      // Order: bottomLeft, bottomRight, top
      return [this.get([x - 1, y + 1]), this.get([x + 1, y + 1]), this.get([x, y - 1])];
    }
  }

  get([x, y]: [number, number]): Cell<[number, number]> | null {
    // Check if coordinates are out of bounds
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    const n = this.width * y + x;
    return this.cells[n];
  }

  set([x, y]: [number, number], cell: Cell<[number, number]>) {
    const n = this.width * y + x;
    if (n < 0 || n >= this.cells.length) {
      return;
    }
    this.cells[n] = cell;
  }

  getCells(): Cell<[number, number]>[] {
    return this.cells;
  }
}

export class HexagonalGrid implements Grid<[number, number]> {
  private cells: Map<string, Cell<[number, number]>> = new Map();
  private width: number;
  private height: number;

  // Define adjacency maps for hexagonal grids
  adjacencyMaps: Record<string, number[]> = {
    hex: [3, 4, 5, 0, 1, 2], // Each direction maps to its opposite (i+3)%6
  };

  constructor(width: number, height: number, cells?: Cell<[number, number]>[]) {
    this.width = width;
    this.height = height;

    // Initialize with empty cells
    if (cells) {
      for (const cell of cells) {
        const key = this.coordToKey(cell.coords as [number, number]);
        this.cells.set(key, {
          ...cell,
          choices: [...cell.choices],
        });
      }
    } else {
      // Using axial coordinates: q ranges from 0 to width-1, r from 0 to height-1
      for (let r = 0; r < height; r++) {
        for (let q = 0; q < width; q++) {
          const key = this.coordToKey([q, r]);
          this.cells.set(key, {
            choices: [],
            collapsed: false,
            coords: [q, r],
          });
        }
      }
    }
  }

  private coordToKey(coords: [number, number]): string {
    return `${coords[0]},${coords[1]}`;
  }

  static fromSnapshot(snapshot: GridSnapshot): HexagonalGrid {
    return new HexagonalGrid(snapshot.width, snapshot.height, snapshot.cells);
  }

  clone(): Grid<[number, number]> {
    return new HexagonalGrid(this.width, this.height, Array.from(this.cells.values()));
  }

  toSnapshot(): GridSnapshot {
    return {
      cells: Array.from(this.cells.values()).map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      })),
      width: this.width,
      height: this.height,
    };
  }

  *iterate(): IterableIterator<[Cell<[number, number]>, [number, number]]> {
    for (const [_, cell] of this.cells) {
      yield [cell, cell.coords as [number, number]];
    }
  }

  getAdjacencyType(_coords: [number, number]): string {
    // All hexagonal tiles use the same adjacency type
    return "hex";
  }

  getAdjacencyMap(coords: [number, number]): number[] {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }

  getNeighbors(coords: [number, number]): (Cell<[number, number]> | null)[] {
    const [q, r] = coords;

    // Axial coordinate directions (clockwise from N)
    // Order: north, northeast, southeast, south, southwest, northwest
    const directions = [
      [0, -1], // north
      [1, -1], // northeast
      [1, 0], // southeast
      [0, 1], // south
      [-1, 1], // southwest
      [-1, 0], // northwest
    ];

    return directions.map(([dq, dr]) => this.get([q + dq, r + dr]));
  }

  get(coords: [number, number]): Cell<[number, number]> | null {
    const key = this.coordToKey(coords);
    return this.cells.get(key) || null;
  }

  set(coords: [number, number], cell: Cell<[number, number]>) {
    const key = this.coordToKey(coords);
    this.cells.set(key, cell);
  }

  getCells(): Cell<[number, number]>[] {
    return Array.from(this.cells.values());
  }
}

export class CubeGrid implements Grid<[number, number, number]> {
  private cells: Map<string, Cell<[number, number, number]>> = new Map();
  private dimensions: [number, number, number];

  // Define adjacency maps for 3D cube grids
  adjacencyMaps: Record<string, number[]> = {
    cube: [1, 0, 3, 2, 5, 4], // +x, -x, +y, -y, +z, -z -> -x, +x, -y, +y, -z, +z
  };

  constructor(width: number, height: number, depth: number, cells?: Cell<[number, number, number]>[]) {
    this.dimensions = [width, height, depth];

    // Initialize with empty cells
    if (cells) {
      for (const cell of cells) {
        const key = this.coordToKey(cell.coords as [number, number, number]);
        this.cells.set(key, {
          ...cell,
          choices: [...cell.choices],
        });
      }
    } else {
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const key = this.coordToKey([x, y, z]);
            this.cells.set(key, {
              choices: [],
              collapsed: false,
              coords: [x, y, z],
            });
          }
        }
      }
    }
  }

  private coordToKey(coords: [number, number, number]): string {
    return `${coords[0]},${coords[1]},${coords[2]}`;
  }

  static fromSnapshot(snapshot: GridSnapshot): CubeGrid {
    // Assuming width, height, depth are stored in snapshot
    // This would need adjustment based on how you store 3D dimensions in snapshot
    return new CubeGrid(
      snapshot.width,
      snapshot.height,
      snapshot.depth || 1, // Fallback if depth not specified
      snapshot.cells,
    );
  }

  clone(): Grid<[number, number, number]> {
    return new CubeGrid(this.dimensions[0], this.dimensions[1], this.dimensions[2], Array.from(this.cells.values()));
  }

  toSnapshot(): GridSnapshot {
    return {
      cells: Array.from(this.cells.values()).map((cell) => ({
        ...cell,
        choices: [...cell.choices],
      })),
      width: this.dimensions[0],
      height: this.dimensions[1],
      depth: this.dimensions[2],
    };
  }

  *iterate(): IterableIterator<[Cell<[number, number, number]>, [number, number, number]]> {
    for (const [_, cell] of this.cells) {
      yield [cell, cell.coords as [number, number, number]];
    }
  }

  getAdjacencyType(_coords: [number, number, number]): string {
    // All cube cells have the same adjacency type
    return "cube";
  }

  getAdjacencyMap(coords: [number, number, number]): number[] {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }

  getNeighbors(coords: [number, number, number]): (Cell<[number, number, number]> | null)[] {
    const [x, y, z] = coords;

    // Order: +x, -x, +y, -y, +z, -z (right, left, up, down, forward, backward)
    const directions = [
      [x + 1, y, z], // +x (right)
      [x - 1, y, z], // -x (left)
      [x, y + 1, z], // +y (up)
      [x, y - 1, z], // -y (down)
      [x, y, z + 1], // +z (forward)
      [x, y, z - 1], // -z (backward)
    ];

    return directions.map((coord) => this.get(coord as [number, number, number]));
  }

  get(coords: [number, number, number]): Cell<[number, number, number]> | null {
    const key = this.coordToKey(coords);
    return this.cells.get(key) || null;
  }

  set(coords: [number, number, number], cell: Cell<[number, number, number]>) {
    const key = this.coordToKey(coords);
    this.cells.set(key, cell);
  }

  getCells(): Cell<[number, number, number]>[] {
    return Array.from(this.cells.values());
  }
}
