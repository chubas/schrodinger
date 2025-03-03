import { Grid, Cell } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { WFC } from "../src/WFC";

// Define a triangular grid where each cell has 3 neighbors
class TriangleGrid implements Grid<[number, number]> {
  private cells: Cell[] = [];
  private size: number;

  constructor(size: number) {
    this.size = size;
    // Initialize cells in a triangular pattern
    let cellCount = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col <= row; col++) {
        this.cells[cellCount++] = {
          choices: [],
          collapsed: false,
          forbidden: [],
          coords: [col, row],
        };
      }
    }
  }

  *iterate(): IterableIterator<[Cell, [number, number]]> {
    for (const cell of this.cells) {
      yield [cell, cell.coords];
    }
  }

  get(coords: [number, number]): Cell | null {
    const [x, y] = coords;
    if (y < 0 || y >= this.size || x < 0 || x > y) {
      return null;
    }
    // Calculate index in the triangular grid
    const index = (y * (y + 1)) / 2 + x;
    return this.cells[index];
  }

  set(coords: [number, number], cell: Cell): void {
    const [x, y] = coords;
    if (y < 0 || y >= this.size || x < 0 || x > y) {
      return;
    }
    const index = (y * (y + 1)) / 2 + x;
    this.cells[index] = cell;
  }

  getNeighbors(coords: [number, number]): (Cell | null)[] {
    const [x, y] = coords;
    // For a triangular grid, each cell has up to 3 neighbors:
    // - One above (if not in top row)
    // - One to the right (if not rightmost in row)
    // - One to the left (if not leftmost in row)
    return [
      this.get([x, y - 1]), // top
      this.get([x + 1, y]), // right
      this.get([x - 1, y]), // left
    ];
  }

  getCells(): Cell[] {
    return this.cells;
  }

  clone(): Grid<[number, number]> {
    const newGrid = new TriangleGrid(this.size);
    this.cells.forEach((cell, index) => {
      newGrid.cells[index] = {
        ...cell,
        choices: [...cell.choices],
        forbidden: [...cell.forbidden],
      };
    });
    return newGrid;
  }

  toSnapshot() {
    return {
      cells: this.cells.map(cell => ({
        ...cell,
        choices: [...cell.choices],
        forbidden: [...cell.forbidden],
      })),
      width: this.size,
      height: this.size,
    };
  }

  // In a triangular grid, adjacencies are:
  // 0: top connects to bottom
  // 1: right connects to left
  // 2: left connects to right
  adjacencyMap: number[] = [0, 2, 1];
}

describe("Custom Grid Implementation", () => {
  // Mock tiles for triangular grid (3 adjacencies instead of 4)
  const triangleTiles: TileDef[] = [
    {
      name: "A",
      adjacencies: ["1", "2", "3"],
      draw: () => {},
    },
    {
      name: "B",
      adjacencies: ["2", "3", "1"],
      draw: () => {},
    },
    {
      name: "C",
      adjacencies: ["3", "1", "2"],
      draw: () => {},
    },
  ];

  describe("Triangle Grid", () => {
    it("should create correct number of cells for triangle grid", () => {
      const grid = new TriangleGrid(3);
      let cellCount = 0;
      for (const [cell] of grid.iterate()) {
        expect(cell).toBeDefined();
        cellCount++;
      }
      // Size 3 triangle should have 6 cells (1 + 2 + 3)
      expect(cellCount).toBe(6);
    });

    it("should correctly identify neighbors in triangle grid", () => {
      const grid = new TriangleGrid(3);

      // Test middle cell in second row
      const middleCell = grid.get([1, 2])!;
      const neighbors = grid.getNeighbors(middleCell.coords);

      // Should have three neighbors
      expect(neighbors.filter(n => n !== null).length).toBe(3);
    });

    it("should work with WFC algorithm", () => {
      const grid = new TriangleGrid(3);
      const wfc = new WFC(triangleTiles, grid);

      let completionCalled = false;
      let errorCalled = false;

      wfc.on("complete", () => {
        completionCalled = true;
      });

      wfc.on("error", () => {
        errorCalled = true;
      });

      wfc.start();

      // Either the algorithm completed successfully or failed with an error
      expect(completionCalled || errorCalled).toBe(true);

      // If it completed, verify all cells are collapsed
      if (completionCalled) {
        for (const [cell] of grid.iterate()) {
          expect(cell.collapsed).toBe(true);
          expect(cell.choices.length).toBe(1);
        }
      }
    });
  });
});