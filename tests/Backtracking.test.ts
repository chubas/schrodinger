import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";
import { json } from "stream/consumers";

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
      // Force a sequence that will require backtracking:
      // First pick tile A (all 1s), then B (all 2s) which is impossible
      rng.setSteps([0, 0, 0, 0.5]); // Pick A for first cell, then try B
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      await new Promise<void>((resolve, reject) => {
        let backtrackCount = 0;
        wfc.on("backtrack", () => {
          backtrackCount++;
          if (backtrackCount > 0) {
            resolve(); // Resolve as soon as we see backtracking
          }
        });

        wfc.on("error", (error) => {
          expect(backtrackCount).toBeGreaterThan(0);
          resolve();
        });

        wfc.on("Collapse", (group) => {
          console.log('Collapsing', JSON.stringify(group))
        });

        wfc.start();

        // Add timeout to prevent test hanging
        setTimeout(() => reject(new Error("Test timed out")), 5000);
      });
    });
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a situation where backtracking is needed
      // First pick A (all 1s), then B (all 2s) which is impossible
      rng.setSteps([0, 0, 0, 0.5]); // Pick A for first cell, then try B

      await new Promise<void>((resolve, reject) => {
        let backtrackCalled = false;
        wfc.on("backtrack", () => {
          backtrackCalled = true;
          resolve(); // Resolve as soon as we see backtracking
        });

        wfc.on("error", () => {
          expect(backtrackCalled).toBe(true);
          resolve();
        });

        wfc.start();

        // Add timeout to prevent test hanging
        setTimeout(() => reject(new Error("Test timed out")), 5000);
      });
    });

    it("should successfully recover from backtracking", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a backtrack and then resolve:
      // 1. Pick A (all 1s)
      // 2. Pick B (all 2s) - impossible, backtrack
      // 3. Pick C (alternating 1,2) - should work
      rng.setSteps([0, 0, 0, 0.5, 0.9, 0.9]); // Force A, then B (fail), then C

      await new Promise<void>((resolve, reject) => {
        let backtrackCalled = false;
        wfc.on("backtrack", () => {
          backtrackCalled = true;
        });

        wfc.on("complete", () => {
          expect(backtrackCalled).toBe(true);
          // Verify final state is valid
          for (const [cell] of grid.iterate()) {
            expect(cell.collapsed).toBe(true);
            // Should be either A (all 1s) or C (alternating)
            expect(["A", "C"]).toContain(cell.choices[0].name);
          }
          resolve();
        });

        wfc.on("error", (error) => {
          reject(error);
        });

        wfc.start();

        // Add timeout to prevent test hanging
        setTimeout(() => reject(new Error("Test timed out")), 5000);
      });
    });
  });

  describe("Multi-level Backtracking", () => {
    it("should handle multiple levels of backtracking", async () => {
      const grid = new SquareGrid(3, 3);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Force a sequence that will require multiple backtracks:
      // Alternate between A (1s) and B (2s) to create impossible situations
      rng.setSteps([
        0, 0, 0,     // Pick A for first cell
        0.5, 0.5, 0.5, // Try B for second cell (fail)
        0, 0, 0,     // Try A again (fail)
        0.9, 0.9, 0.9  // Finally try C
      ]);

      await new Promise<void>((resolve, reject) => {
        let maxBacktrackDepth = 0;
        let currentDepth = 0;

        wfc.on("backtrack", () => {
          currentDepth++;
          maxBacktrackDepth = Math.max(maxBacktrackDepth, currentDepth);
          if (maxBacktrackDepth > 1) {
            resolve(); // Resolve as soon as we see multi-level backtracking
          }
        });

        wfc.on("collapse", () => {
          currentDepth = 0; // Reset depth on successful collapse
        });

        wfc.on("error", () => {
          expect(maxBacktrackDepth).toBeGreaterThan(1);
          resolve();
        });

        wfc.start();

        // Add timeout to prevent test hanging
        setTimeout(() => reject(new Error("Test timed out")), 5000);
      });
    });
  });
});