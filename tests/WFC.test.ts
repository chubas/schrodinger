import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { pickTiles, DeterministicRNG } from "./util";

// Mock tiles for testing
const mockTiles: TileDef[] = [
  {
    name: "A",
    adjacencies: ["1", "1", "1", "1"], // All sides connect with "1"
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: ["1", "1", "1", "1"], // All sides connect with "1"
    draw: () => {},
  },
  {
    name: "C",
    adjacencies: ["1", "1", "1", "1"], // All sides connect with "1"
    draw: () => {},
  },
];


describe("WFC", () => {
  describe("Basic Functionality", () => {
    it("should initialize with correct grid dimensions", () => {
      const grid = new SquareGrid(3, 3);
      const wfc = new WFC(mockTiles, grid);

      let cellCount = 0;
      for (const [cell] of wfc.iterate()) {
        expect(cell.choices).toHaveLength(mockTiles.length);
        expect(cell.collapsed).toBe(false);
        cellCount++;
      }
      expect(cellCount).toBe(9); // 3x3 grid
    });

    it("should mark cells as collapsed when choices are reduced to one", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(mockTiles, grid);

      // Force collapse first cell
      const firstCell = grid.get([0, 0])!;
      firstCell.choices = [mockTiles[0]];
      firstCell.collapsed = true;

      expect(firstCell.collapsed).toBe(true);
      expect(firstCell.choices).toHaveLength(1);
    });
  });

  it('should throw an error if two tiles have the same name', () => {
    const grid = new SquareGrid(1, 1);
    const tiles = pickTiles(mockTiles, ['A', 'B', 'A']);
    expect(() => new WFC(tiles, grid)).toThrow('Duplicate tile name: A');
  });

  describe("RNG Integration", () => {
    it("should always pick first tile with zero-returning RNG", async () => {
      const grid = new SquareGrid(2, 2);
      const zeroRNG = new DeterministicRNG([0]);
      const wfc = new WFC(mockTiles, grid, { random: zeroRNG });

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          // Since RNG always returns 0, it should always pick the first tile
          expect(group.cells[0].value?.name).toBe(mockTiles[0].name);
          resolve();
        });

        wfc.start();
      });
    });

    it("should use provided RNG sequence", async () => {
      const grid = new SquareGrid(2, 2);
      const sequence = [0.5, 0.2, 0.8]; // Will pick different tiles based on these values
      const sequenceRNG = new DeterministicRNG(sequence);
      const wfc = new WFC(mockTiles, grid, { random: sequenceRNG });

      const collapses: any[] = [];

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapses.push(group);
        });

        wfc.on("complete", () => {
          // Verify that different tiles were picked based on the RNG sequence
          expect(collapses.length).toBeGreaterThan(0);
          expect(collapses.some(c => c.cells[0].value?.name === "B" || c.cells[0].value?.name === "C")).toBe(true);
          resolve();
        });

        wfc.start();
      });
    });
  });

  describe("Event Information", () => {
    it("should include value in collapse events", async () => {
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          expect(group.cells).toHaveLength(1);
          const cell = group.cells[0];

          // Verify cell has coords and value properties
          expect(cell).toHaveProperty('coords');
          expect(cell).toHaveProperty('value');

          // Value should be one of our mockTiles
          expect(mockTiles).toContainEqual(cell.value);

          resolve();
        });

        wfc.start();
      });
    });
  });
});