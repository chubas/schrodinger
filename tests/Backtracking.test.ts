import { WFC, LogLevel } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { pickTiles, DeterministicRNG } from "./util";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";

// Create simple rules for testing
const createSimpleRule = (value: string): SimpleRule => ({
  type: RuleType.Simple,
  value
});

const backtrackTiles = [
  {
    name: "A",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1")
    ],
    draw: () => { },
  },
  {
    name: "B",
    adjacencies: [
      createSimpleRule("2"),
      createSimpleRule("2"),
      createSimpleRule("2"),
      createSimpleRule("2")
    ],
    draw: () => { },
  },
  {
    name: "C",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("2"),
      createSimpleRule("1"),
      createSimpleRule("2")
    ],
    draw: () => { },
  },
  {
    name: "DeadEnd",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("2"),
      createSimpleRule("1"),
      createSimpleRule("3")
    ],
    draw: () => { },
  },
  {
    name: "NoMatch",
    adjacencies: [
      createSimpleRule("X"),
      createSimpleRule("X"),
      createSimpleRule("Y"),
      createSimpleRule("Y")
    ],
    draw: () => { },
  }
];

describe("WFC Backtracking", () => {
  describe("Snapshot Management", () => {
    it("should throw an error if the initial seed is invalid, and not attempt backtracking", async () => {
      const grid = new SquareGrid(2, 2);
      const initialSeed = [
        { coords: [0, 0] as [number, number], value: backtrackTiles.find((tile) => tile.name === 'A') },
        { coords: [1, 0] as [number, number], value: backtrackTiles.find((tile) => tile.name === 'B') },
      ];

      const wfc = new WFC(pickTiles(backtrackTiles, ['A', 'B', 'C']), grid);
      let backtrackCalled = false;
      wfc.on("backtrack", () => {
        backtrackCalled = true; // This should not be called because the initial seed is invalid
      });

      const test = new Promise<void>((resolve) => {
        wfc.on("error", (error) => {
          // It should throw an error because the initial seed is invalid and there is no snapshot to backtrack to
          expect(error).toBeDefined();
          expect(backtrackCalled).toBe(false);
          resolve();
        });
      });

      wfc.start(initialSeed);
      await test;
    });
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain backtracktest", async () => {
      const grid = new SquareGrid(2, 2);

      // Set up RNG to force a situation where backtracking is needed
      const rng = new DeterministicRNG([
        0, // Pick cell [0, 0]
        0.6, // Pick tile 'A
      ]);

      const wfc = new WFC(pickTiles(backtrackTiles, ['A', 'NoMatch']), grid, { random: rng });

      await new Promise<void>((resolve, reject) => {
        let backtrackCount = 0;
        let collapseCount = 0;
        wfc.on("backtrack", () => {
          backtrackCount++;
        });

        // It should have collapsed only once, for the forced collapse of the whole grid after picking the A tile
        wfc.on("collapse", (group) => {
          collapseCount++;
        });

        // It should finish with one backtrack
        wfc.on("complete", () => {
          expect(backtrackCount).toBe(1);
          // With the new implementation, we get 2 collapse events
          expect(collapseCount).toBe(2);
          resolve();
        });

        wfc.start();
      });
    });

    it.todo("should retry many times up to the maxRetries limit")
  });

  describe("Multi-level Backtracking", () => {
    it.todo("should backtrack multiple levels when needed")
  });
});