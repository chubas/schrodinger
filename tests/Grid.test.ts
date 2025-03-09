import { SquareGrid, Cell } from "../src/Grid";

describe("SquareGrid", () => {
  let grid: SquareGrid;

  beforeEach(() => {
    grid = new SquareGrid(3, 3); // 3x3 grid
  });

  test("initialize with correct dimensions", () => {
    expect(grid).toBeDefined();
    expect(grid.getCells()).toHaveLength(9);
  });

  test("get() should return the correct cell", () => {
    const cell = grid.get([1, 1]);
    expect(cell).not.toBeNull();
    expect(cell?.coords).toEqual([1, 1]);
  });

  test("get() should return null for out-of-bounds coordinates", () => {
    expect(grid.get([-1, 0])).toBeNull();
    expect(grid.get([3, 3])).toBeNull();
  });

  test("set() should update the correct cell", () => {
    const newCell: Cell = {
      choices: [],
      collapsed: true,
      forbidden: [],
      coords: [1, 1],
    };
    grid.set([1, 1], newCell);
    const cell = grid.get([1, 1]);
    expect(cell).toEqual(newCell);
  });

  test("getNeighbors() should return valid neighbors", () => {
    const neighbors = grid.getNeighbors([1, 1]);
    expect(neighbors).toHaveLength(4); // Top, Right, Bottom, Left
    expect(neighbors[0]?.coords).toEqual([1, 0]); // Top
    expect(neighbors[1]?.coords).toEqual([2, 1]); // Right
    expect(neighbors[2]?.coords).toEqual([1, 2]); // Bottom
    expect(neighbors[3]?.coords).toEqual([0, 1]); // Left
  });

  test("getNeighbors() should handle edge cells", () => {
    const neighbors = grid.getNeighbors([0, 0]);
    expect(neighbors).toHaveLength(4);
    expect(neighbors[0]).toBeNull(); // Top
    expect(neighbors[1]?.coords).toEqual([1, 0]); // Right
    expect(neighbors[2]?.coords).toEqual([0, 1]); // Bottom
    expect(neighbors[3]).toBeNull(); // Left
  });

  test("iterate() should iterate over all cells with their coordinates", () => {
    const cells = Array.from(grid.iterate());
    expect(cells).toHaveLength(9);

    const expectedCoords = [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];

    expectedCoords.forEach(([x, y], index) => {
      const [cell, coords] = cells[index];
      expect(coords).toEqual([x, y]);
      expect(cell).toBeDefined();
    });
  });

  test("getCells() should return all cells", () => {
    const cells = grid.getCells();
    expect(cells).toHaveLength(9);
    cells.forEach((cell, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      expect(cell.coords).toEqual([x, y]);
    });
  });

  test("adjacencyMap should map directions correctly", () => {
    expect(grid.adjacencyMap).toEqual([2, 3, 0, 1]); // Bottom, Left, Top, Right
  });

  describe("getNeighbors", () => {
    it("should return correct neighbors for center cell", () => {
      const grid = new SquareGrid(3, 3);
      const neighbors = grid.getNeighbors([1, 1]);

      // Should have 4 neighbors: top, right, bottom, left
      expect(neighbors).toHaveLength(4);

      // Check each neighbor's coordinates
      expect(neighbors[0]?.coords).toEqual([1, 0]); // Top
      expect(neighbors[1]?.coords).toEqual([2, 1]); // Right
      expect(neighbors[2]?.coords).toEqual([1, 2]); // Bottom
      expect(neighbors[3]?.coords).toEqual([0, 1]); // Left
    });

    it("should return nulls for out-of-bounds neighbors on corner", () => {
      const grid = new SquareGrid(3, 3);
      const neighbors = grid.getNeighbors([0, 0]);

      // Should have 4 positions: top, right, bottom, left
      expect(neighbors).toHaveLength(4);

      // Check each neighbor
      expect(neighbors[0]).toBeNull(); // Top (out of bounds)
      expect(neighbors[1]?.coords).toEqual([1, 0]); // Right
      expect(neighbors[2]?.coords).toEqual([0, 1]); // Bottom
      expect(neighbors[3]).toBeNull(); // Left (out of bounds)
    });

    it("should return nulls for out-of-bounds neighbors on edge", () => {
      const grid = new SquareGrid(3, 3);
      const neighbors = grid.getNeighbors([0, 1]);

      // Should have 4 positions: top, right, bottom, left
      expect(neighbors).toHaveLength(4);

      // Check each neighbor
      expect(neighbors[0]?.coords).toEqual([0, 0]); // Top
      expect(neighbors[1]?.coords).toEqual([1, 1]); // Right
      expect(neighbors[2]?.coords).toEqual([0, 2]); // Bottom
      expect(neighbors[3]).toBeNull(); // Left (out of bounds)
    });

    it("should return correct neighbors for bottom-right corner", () => {
      const grid = new SquareGrid(3, 3);
      const neighbors = grid.getNeighbors([2, 2]);

      // Should have 4 positions: top, right, bottom, left
      expect(neighbors).toHaveLength(4);

      // Check each neighbor
      expect(neighbors[0]?.coords).toEqual([2, 1]); // Top
      expect(neighbors[1]).toBeNull(); // Right (out of bounds)
      expect(neighbors[2]).toBeNull(); // Bottom (out of bounds)
      expect(neighbors[3]?.coords).toEqual([1, 2]); // Left
    });

    it("should handle 1x1 grid correctly", () => {
      const grid = new SquareGrid(1, 1);
      const neighbors = grid.getNeighbors([0, 0]);

      // Should have 4 positions: top, right, bottom, left
      expect(neighbors).toHaveLength(4);

      // All neighbors should be null (out of bounds)
      expect(neighbors[0]).toBeNull(); // Top
      expect(neighbors[1]).toBeNull(); // Right
      expect(neighbors[2]).toBeNull(); // Bottom
      expect(neighbors[3]).toBeNull(); // Left
    });
  });
});
