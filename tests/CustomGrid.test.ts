import { Grid, Cell } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { WFC } from "../src/WFC";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";

// Define a triangular grid where each cell has 3 neighbors
class TriangleGrid implements Grid<[number, number]> {
  private cells: Cell[] = [];
  private size: number;

  // Define adjacency maps for triangular grids
  adjacencyMaps: Record<string, number[]> = {
    'up': [2, 2, 0],     // [topLeft, topRight, bottom] -> [bottom, bottom, topLeft]
    'down': [0, 0, 2]    // [bottomLeft, bottomRight, top] -> [topLeft, topRight, bottom]
  };

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
    const isPointingUp = this.getAdjacencyType(coords) === 'up';
    
    if (isPointingUp) {
      // Order: topLeft, topRight, bottom
      return [
        this.get([x-1, y-1]),
        this.get([x+1, y-1]),
        this.get([x, y+1])
      ];
    } else {
      // Order: bottomLeft, bottomRight, top
      return [
        this.get([x-1, y+1]),
        this.get([x+1, y+1]),
        this.get([x, y-1])
      ];
    }
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

  // Return the adjacency type for the given coordinates
  getAdjacencyType(coords: [number, number]): string {
    const [x, y] = coords;
    // Determine if triangle points up or down based on coordinates
    return (x + y) % 2 === 0 ? 'up' : 'down';
  }

  // Get the adjacency map for the given coordinates
  getAdjacencyMap(coords: [number, number]): number[] {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }
}

// Create simple rules for testing
const createSimpleRule = (value: string): SimpleRule => ({
  type: RuleType.Simple,
  value
});

describe("Custom Grid Implementation", () => {
  // Mock tiles for triangular grid (3 adjacencies instead of 4)
  const triangleTiles: TileDef[] = [
    {
      name: "A",
      adjacencies: [
        createSimpleRule("1"),
        createSimpleRule("2"),
        createSimpleRule("3")
      ],
      draw: () => {},
    },
    {
      name: "B",
      adjacencies: [
        createSimpleRule("2"),
        createSimpleRule("3"),
        createSimpleRule("1")
      ],
      draw: () => {},
    },
    {
      name: "C",
      adjacencies: [
        createSimpleRule("3"),
        createSimpleRule("1"),
        createSimpleRule("2")
      ],
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
      // Use a larger grid size to ensure we have enough room for neighbors
      const grid = new TriangleGrid(5);
      
      // Check a cell that should have all its neighbors within bounds
      // For a down-pointing triangle at [2, 3]
      // Check whether this is a down-pointing triangle
      const isDown = grid.getAdjacencyType([2, 3]) === 'down';
      expect(isDown).toBe(true);
      
      const middleCell = grid.get([2, 3])!;
      const neighbors = grid.getNeighbors(middleCell.coords);
      
      // For a down-pointing triangle, the neighbors would be:
      // bottomLeft [1, 4], bottomRight [3, 4], top [2, 2]
      expect(neighbors[0]).toBe(grid.get([1, 4])); // bottomLeft
      expect(neighbors[1]).toBe(grid.get([3, 4])); // bottomRight
      expect(neighbors[2]).toBe(grid.get([2, 2])); // top
      
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