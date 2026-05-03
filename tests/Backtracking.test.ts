import { WFC, LogLevel } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { pickTiles, DeterministicRNG } from "./util";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";

// Create simple rules for testing
const createSimpleRule = (value: string): SimpleRule => ({
  type: RuleType.Simple,
  value,
});

const backtrackTiles = [
  {
    name: "A",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
    ],
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: [
      createSimpleRule("2"),
      createSimpleRule("2"),
      createSimpleRule("2"),
      createSimpleRule("2"),
    ],
    draw: () => {},
  },
  {
    name: "C",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("2"),
      createSimpleRule("1"),
      createSimpleRule("2"),
    ],
    draw: () => {},
  },
  {
    name: "DeadEnd",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("2"),
      createSimpleRule("1"),
      createSimpleRule("3"),
    ],
    draw: () => {},
  },
  {
    name: "NoMatch",
    adjacencies: [
      createSimpleRule("X"),
      createSimpleRule("X"),
      createSimpleRule("Y"),
      createSimpleRule("Y"),
    ],
    draw: () => {},
  },
];

describe("WFC Backtracking", () => {
  describe("Snapshot Management", () => {
    it("should throw an error if the initial seed is invalid, and not attempt backtracking", async () => {
      const grid = new SquareGrid(2, 2);
      const initialSeed = [
        {
          coords: [0, 0] as [number, number],
          value: backtrackTiles.find((tile) => tile.name === "A"),
        },
        {
          coords: [1, 0] as [number, number],
          value: backtrackTiles.find((tile) => tile.name === "B"),
        },
      ];

      const wfc = new WFC(pickTiles(backtrackTiles, ["A", "B", "C"]), grid, {
        logLevel: LogLevel.NONE,
      });
      let backtrackCalled = false;
      wfc.on("backtrack", () => {
        backtrackCalled = true; // This should not be called because the initial seed is invalid
      });

      let errorCalled = false;
      wfc.on("error", (error) => {
        expect(error).toBeDefined();
        errorCalled = true;
      });

      expect(() => wfc.start(initialSeed)).toThrow(
        "Initial seed creates an impossible state",
      );
      expect(errorCalled).toBe(true);
      expect(backtrackCalled).toBe(false);
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

      const wfc = new WFC(pickTiles(backtrackTiles, ["A", "NoMatch"]), grid, {
        random: rng,
      });

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

        wfc.on("complete", () => {
          expect(backtrackCount).toBeGreaterThan(0);
          expect(collapseCount).toBeGreaterThan(1);
          resolve();
        });

        wfc.start();
      });
    });

    it.todo("should retry many times up to the maxRetries limit");
  });

  describe("Multi-level Backtracking", () => {
    it.todo("should backtrack multiple levels when needed");
  });
});
