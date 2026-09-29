import seedrandom from "seedrandom";
import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { pickTiles } from "./util";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";
import { generateRandomTiles } from "../stress-test/randomTiles";

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
    it("should throw an error if the initial seed is invalid, and not attempt backtracking", () => {
      const grid = new SquareGrid(2, 2);
      // A and B can't be horizontal neighbors (their edges are "1" and "2").
      const initialSeed = [
        { coords: [0, 0] as [number, number], value: backtrackTiles.find((tile) => tile.name === 'A') },
        { coords: [1, 0] as [number, number], value: backtrackTiles.find((tile) => tile.name === 'B') },
      ];

      const wfc = new WFC(pickTiles(backtrackTiles, ['A', 'B', 'C']), grid);
      let backtrackCalled = false;
      wfc.on("backtrack", () => {
        backtrackCalled = true;
      });
      let emittedError: Error | undefined;
      wfc.on("error", (error) => {
        emittedError = error;
      });

      expect(() => wfc.start(initialSeed)).toThrow("Initial seed creates an impossible state");
      expect(emittedError?.message).toBe("Initial seed creates an impossible state");
      expect(backtrackCalled).toBe(false);
    });
  });

  describe("Backtracking Process", () => {
    it("should attempt backtracking when no valid choices remain backtracktest", () => {
      // A choice that is locally consistent but leads to a contradiction a few
      // collapses later. Found with:
      //   npm run stress-test -- --tileset random --random-tiles 8 --random-labels 3 --width 3 --height 3
      // (seed 21 needs one backtrack). If RNG usage changes, pick another
      // successful seed with backtracks from that command's summary.
      const tiles = generateRandomTiles(8, 3, 1);
      const grid = new SquareGrid(3, 3);
      const rng = seedrandom("21");
      const wfc = new WFC(tiles, grid, { random: { random: () => rng(), setSeed: () => {} } });

      let backtrackCount = 0;
      let completed = false;
      wfc.on("backtrack", () => {
        backtrackCount++;
      });
      wfc.on("complete", () => {
        completed = true;
      });

      wfc.start();

      expect(backtrackCount).toBeGreaterThan(0);
      expect(completed).toBe(true);
      for (const [cell, coords] of grid.iterate()) {
        expect(cell.collapsed).toBe(true);
        grid.getNeighbors(coords).forEach((neighbor, d) => {
          if (neighbor) expect(wfc.canBeAdjacent(cell.value!, coords, d, neighbor.value!)).toBe(true);
        });
      }
    });

    it.todo("should retry many times up to the maxRetries limit")
  });

  describe("Multi-level Backtracking", () => {
    it.todo("should backtrack multiple levels when needed")
  });
});