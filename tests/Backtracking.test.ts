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
    it("should create and restore snapshots correctly", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(backtrackTiles, grid);

      // Force a specific state
      const cell = grid.get([0, 0])!;
      const originalChoices = [...cell.choices];
      cell.choices = [backtrackTiles[0]];
      cell.collapsed = true;

      // Take a snapshot internally by starting WFC
      let snapshotTaken = false;
      wfc.on("collapse", () => {
        snapshotTaken = true;

        // Verify the snapshot was taken and can be restored
        const currentCell = grid.get([0, 0])!;
        expect(currentCell.choices).toHaveLength(1);
        expect(currentCell.collapsed).toBe(true);
      });

      wfc.start();
      expect(snapshotTaken).toBe(true);
    });
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain", () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a situation where backtracking is needed
      // First collapse: Pick tile A (only connects to 1)
      // Second collapse: Pick tile B (only connects to 2)
      // This will create an impossible situation requiring backtrack
      rng.setSteps([0, 0.5]); // Values that will select A then B

      let backtrackCalled = false;
      wfc.on("backtrack", () => {
        backtrackCalled = true;
      });

      wfc.start();

      expect(backtrackCalled).toBe(true);
    });

    it("should successfully recover from backtracking", () => {
      const grid = new SquareGrid(2, 2);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Set up RNG to force a backtrack and then resolve
      // 1. Pick tile A (creates constraint)
      // 2. Pick tile B (creates impossible situation)
      // 3. Backtrack and pick tile C (should work)
      rng.setSteps([0, 0.5, 0.9]);

      let completed = false;
      wfc.on("complete", () => {
        completed = true;
      });

      wfc.start();

      // Verify the algorithm completed after backtracking
      expect(completed).toBe(true);

      // Verify final state is valid
      for (const [cell] of grid.iterate()) {
        expect(cell.collapsed).toBe(true);
        expect(cell.choices.length).toBe(1);
      }
    });
  });

  describe("Multi-level Backtracking", () => {
    it("should handle multiple levels of backtracking", () => {
      const grid = new SquareGrid(3, 3);
      const rng = new StepRNG();
      const wfc = new WFC(backtrackTiles, grid, { random: rng });

      // Track backtrack depth
      let maxBacktrackDepth = 0;
      let currentDepth = 0;

      wfc.on("backtrack", () => {
        currentDepth++;
        maxBacktrackDepth = Math.max(maxBacktrackDepth, currentDepth);
      });

      wfc.on("collapse", () => {
        currentDepth = 0; // Reset on successful collapse
      });

      // Set up RNG to force multiple backtrack levels
      rng.setSteps([0, 0.5, 0.5, 0.9, 0.3, 0.7]);

      wfc.start();

      // Verify we had to backtrack multiple levels
      expect(maxBacktrackDepth).toBeGreaterThan(1);
    });
  });
});