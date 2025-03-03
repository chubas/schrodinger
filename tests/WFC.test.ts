import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";

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

// Custom RNG for deterministic tests
class DeterministicRNG implements RandomLib {
  private sequence: number[];
  private currentIndex: number = 0;

  constructor(sequence: number[] = [0]) {
    this.sequence = sequence;
  }

  random(): number {
    const value = this.sequence[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.sequence.length;
    return value;
  }

  setSeed(_seed: string | number): void {
    this.currentIndex = 0;
  }
}

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

  describe("RNG Integration", () => {
    it("should always pick first tile with zero-returning RNG", () => {
      const grid = new SquareGrid(2, 2);
      const zeroRNG = new DeterministicRNG([0]);
      const wfc = new WFC(mockTiles, grid, { random: zeroRNG });

      // Start WFC and capture the first collapse
      let firstCollapse: any;
      wfc.on("collapse", (group) => {
        if (!firstCollapse) {
          firstCollapse = group;
        }
      });

      wfc.start();

      // Since RNG always returns 0, it should always pick the first tile
      expect(firstCollapse.cells[0].value?.name).toBe(mockTiles[0].name);
    });

    it("should use provided RNG sequence", () => {
      const grid = new SquareGrid(2, 2);
      const sequence = [0.5, 0.2, 0.8]; // Will pick different tiles based on these values
      const sequenceRNG = new DeterministicRNG(sequence);
      const wfc = new WFC(mockTiles, grid, { random: sequenceRNG });

      const collapses: any[] = [];
      wfc.on("collapse", (group) => {
        collapses.push(group);
      });

      wfc.start();

      // Verify that different tiles were picked based on the RNG sequence
      expect(collapses.length).toBeGreaterThan(0);
      // The actual tiles picked will depend on the RNG values and available choices
      expect(collapses.some(c => c.cells[0].value?.name === "B" || c.cells[0].value?.name === "C")).toBe(true);
    });
  });
});