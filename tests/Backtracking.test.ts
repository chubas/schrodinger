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
  private onStep?: (step: number) => void;

  setSteps(steps: number[]) {
    this.steps = steps;
  }

  onNextStep(callback: (step: number) => void) {
    this.onStep = callback;
  }

  random(): number {
    const step = this.steps.shift() ?? 0;
    this.onStep?.(step);
    return step;
  }

  setSeed(_seed: string | number): void {
    // No-op for testing
  }
}

describe("WFC Backtracking", () => {
  describe("Snapshot Management", () => {
    it("should create and restore snapshots correctly", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      rng.setSteps([0, 0.5, 0.8]); // Force specific choices that will require backtracking
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      await new Promise<void>((resolve) => {
        let backtrackCount = 0;
        wfc.on("backtrack", () => {
          backtrackCount++;
        });

        wfc.on("complete", () => {
          expect(backtrackCount).toBeGreaterThan(0);
          resolve();
        });

        wfc.start();
      });
    });
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a situation where backtracking is needed
      rng.setSteps([0, 0.5]); // Values that will select A then B

      await new Promise<void>((resolve) => {
        let backtrackCalled = false;
        wfc.on("backtrack", () => {
          backtrackCalled = true;
        });

        wfc.on("error", () => {
          expect(backtrackCalled).toBe(true);
          resolve();
        });

        wfc.start();
      });
    });

    it("should successfully recover from backtracking", async () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a backtrack and then resolve
      rng.setSteps([0, 0.5, 0.9]);

      await new Promise<void>((resolve) => {
        let backtrackOccurred = false;
        wfc.on("backtrack", () => {
          backtrackOccurred = true;
        });

        wfc.on("complete", () => {
          expect(backtrackOccurred).toBe(true);
          // Verify final state is valid
          for (const [cell] of grid.iterate()) {
            expect(cell.collapsed).toBe(true);
            expect(cell.choices.length).toBe(1);
          }
          resolve();
        });

        wfc.start();
      });
    });
  });

  describe("Multi-level Backtracking", () => {
    it("should handle multiple levels of backtracking", async () => {
      const grid = new SquareGrid(3, 3);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Force a sequence that will require multiple backtracks
      rng.setSteps([0, 0.5, 0, 0.5, 0, 0.5]);

      await new Promise<void>((resolve) => {
        let maxBacktrackDepth = 0;
        let currentDepth = 0;

        wfc.on("backtrack", () => {
          currentDepth++;
          maxBacktrackDepth = Math.max(maxBacktrackDepth, currentDepth);
        });

        wfc.on("collapse", () => {
          currentDepth = 0; // Reset depth on successful collapse
        });

        wfc.on("error", () => {
          expect(maxBacktrackDepth).toBeGreaterThan(1);
          resolve();
        });

        wfc.start();
      });
    });
  });
});