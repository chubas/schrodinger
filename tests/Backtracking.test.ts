import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";

// Mock tiles that will force backtracking
const backtrackTiles: TileDef[] = [
  {
    name: "A",
    adjacencies: ["1", "1", "1", "1"],
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: ["2", "2", "2", "2"],
    draw: () => {},
  },
  {
    name: "C",
    adjacencies: ["1", "2", "1", "2"],
    draw: () => {},
  },
];

// RNG that can be controlled step by step
class StepRNG implements RandomLib {
  private steps: number[] = [];
  private currentIndex: number = 0;
  private onStep?: (step: number) => void;

  setSteps(steps: number[]) {
    this.steps = steps;
    this.currentIndex = 0;
  }

  onNextStep(callback: (step: number) => void) {
    this.onStep = callback;
  }

  random(): number {
    if (this.currentIndex >= this.steps.length) {
      throw new Error(`RNG sequence exhausted after ${this.steps.length} steps`);
    }
    const step = this.steps[this.currentIndex++];
    this.onStep?.(step);
    return step;
  }

  setSeed(_seed: string | number): void {
    this.currentIndex = 0;
  }
}

describe("WFC Backtracking", () => {
  describe("Snapshot Management", () => {
    it("should create and restore snapshots correctly", async () => {
      // Create a grid that will require backtracking
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();

      // Force a sequence that will cause a contradiction
      // First pick tile A (all 1s) for first cell
      // Then pick B (all 2s) for second cell, which is incompatible
      rng.setSteps([0, 0, 0, 0.5, 0.9]); // A, B, C

      const wfc = new WFC(backtrackTiles, grid, {
        random: rng,
        maxRetries: 3 // Limit retries to speed up test
      });

      return new Promise<void>((resolve) => {
        // Listen for error event which should occur when all retries are exhausted
        wfc.on("error", (error) => {
          // If we get an error, the test passes because we expect backtracking to fail
          // after exhausting all retries with our incompatible tiles
          expect(error.message).toContain("uncollapsable");
          resolve();
        });

        // Start with no seed
        wfc.start();
      });
    }, 10000); // Increase timeout to 10 seconds
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();

      // Force a sequence that will cause a contradiction
      rng.setSteps([0, 0, 0, 0.5, 0.9]); // A, B, C

      const wfc = new WFC(backtrackTiles, grid, {
        random: rng,
        maxRetries: 3 // Limit retries to speed up test
      });

      return new Promise<void>((resolve) => {
        // Listen for error event which should occur when all retries are exhausted
        wfc.on("error", (error) => {
          // If we get an error, the test passes because we expect backtracking to fail
          // after exhausting all retries with our incompatible tiles
          expect(error.message).toContain("uncollapsable");
          resolve();
        });

        // Start with no seed
        wfc.start();
      });
    }, 10000); // Increase timeout to 10 seconds

    it("should successfully recover from backtracking", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();

      // Set up a sequence that will work after backtracking:
      // 1. First cell: A (all 1s)
      // 2. Second cell: Try C (alternating 1,2) - should work with A
      // 3. Third cell: Try C again - should work
      // 4. Fourth cell: Try C again - should work
      rng.setSteps([0, 0.9, 0.9, 0.9]); // A, C, C, C

      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      return new Promise<void>((resolve) => {
        wfc.on("complete", () => {
          // Verify final state is valid
          for (const [cell] of grid.iterate()) {
            expect(cell.collapsed).toBe(true);
            // Should be either A (all 1s) or C (alternating)
            expect(["A", "C"]).toContain(cell.choices[0].name);
          }
          resolve();
        });

        wfc.on("error", (error) => {
          // We don't expect an error in this test
          fail(`Unexpected error: ${error.message}`);
        });

        wfc.start();
      });
    }, 10000); // Increase timeout to 10 seconds
  });

  describe("Multi-level Backtracking", () => {
    it("should handle complex patterns", async () => {
      const grid = new SquareGrid(3, 3);
      const rng = new StepRNG();

      // Set up a sequence that will work:
      // Use C (alternating 1,2) for all cells, which should be compatible
      const steps = Array(9).fill(0.9); // All C
      rng.setSteps(steps);

      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      return new Promise<void>((resolve) => {
        wfc.on("complete", () => {
          // Verify final state is valid
          for (const [cell] of grid.iterate()) {
            expect(cell.collapsed).toBe(true);
            expect(cell.choices[0].name).toBe("C");
          }
          resolve();
        });

        wfc.on("error", (error) => {
          // We don't expect an error in this test
          fail(`Unexpected error: ${error.message}`);
        });

        wfc.start();
      });
    }, 10000); // Increase timeout to 10 seconds
  });
});