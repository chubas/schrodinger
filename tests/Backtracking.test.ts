import seedrandom from "seedrandom";
import { WFC, LogLevel, StepResult, luby } from "../src/WFC";
import { Cell, Grid, GridSnapshot, SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { AdjacencyTables } from "../src/AdjacencyTables";
import { RandomLib } from "../src/RandomLib";
import { pickTiles } from "./util";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";
import { generateRandomTiles } from "../stress-test/randomTiles";

const seeded = (seed: string | number): RandomLib => {
  const rng = seedrandom(String(seed));
  return { random: () => rng(), setSeed: () => {} };
};

function expectValidSolution(wfc: WFC, grid: Grid): void {
  for (const [cell, coords] of grid.iterate()) {
    expect(cell.collapsed).toBe(true);
    grid.getNeighbors(coords).forEach((neighbor, d) => {
      if (neighbor) expect(wfc.canBeAdjacent(cell.value!, coords, d, neighbor.value!)).toBe(true);
    });
  }
}

// Exhaustive search: does any assignment satisfy every neighbor constraint?
function solutionExists(tiles: TileDef[], grid: SquareGrid): boolean {
  const tables = new AdjacencyTables(tiles, grid.adjacencyMaps);
  const cells = [...grid.iterate()].map(([cell]) => cell);
  const neighbors = cells.map((c) => grid.getNeighbors(c.coords).map((n) => (n ? cells.indexOf(n) : -1)));
  const assignment: number[] = [];
  const consistent = (k: number) =>
    neighbors[k].every(
      (n, d) =>
        n < 0 ||
        n >= k ||
        (tables.isCompatible(0, d, assignment[k], assignment[n]) &&
          tables.isCompatible(0, (d + 2) % 4, assignment[n], assignment[k])),
    );
  const search = (k: number): boolean => {
    if (k === cells.length) return true;
    for (let t = 0; t < tiles.length; t++) {
      assignment[k] = t;
      if (consistent(k) && search(k + 1)) return true;
    }
    return false;
  };
  return search(0);
}

// Every cell is adjacent to every other cell; a cell's directions are the other
// cells in order. With n colours a complete graph needs at least n cells' worth
// of distinct colours, so n + 1 cells can't be coloured.
class CompleteGraphGrid implements Grid<[number]> {
  adjacencyMaps: Record<string, number[]> = {};
  private cells: Cell<[number]>[];

  constructor(private nodes: number) {
    this.cells = Array.from({ length: nodes }, (_, i) => ({ choices: [], collapsed: false, forbidden: [], coords: [i] as [number] }));
    for (let i = 0; i < nodes; i++) {
      // Direction d of node i is node j (skipping i); from j, node i is direction i if i < j, else i - 1.
      this.adjacencyMaps[`n${i}`] = Array.from({ length: nodes - 1 }, (_, d) => {
        const j = d < i ? d : d + 1;
        return i < j ? i : i - 1;
      });
    }
  }
  *iterate(): IterableIterator<[Cell<[number]>, [number]]> {
    for (const cell of this.cells) yield [cell, cell.coords];
  }
  get([i]: [number]) {
    return this.cells[i] ?? null;
  }
  set([i]: [number], cell: Cell<[number]>) {
    this.cells[i] = cell;
  }
  getNeighbors([i]: [number]) {
    return this.cells.filter((_, j) => j !== i);
  }
  getCells() {
    return this.cells;
  }
  clone(): Grid<[number]> {
    return this;
  }
  toSnapshot(): GridSnapshot {
    return { cells: this.cells, width: this.nodes, height: 1 };
  }
  getAdjacencyType([i]: [number]) {
    return `n${i}`;
  }
  getAdjacencyMap([i]: [number]) {
    return this.adjacencyMaps[`n${i}`];
  }
}

// Colour i may touch colour j exactly when i != j: [ci>cj] only matches [cj>ci].
const colourTiles = (colours: number): TileDef[] =>
  Array.from({ length: colours }, (_, i) => ({
    name: `c${i}`,
    adjacencies: Array.from({ length: colours }, () =>
      Array.from({ length: colours }, (_, j) => j)
        .filter((j) => j !== i)
        .map((j) => `[c${i}>c${j}]`)
        .join("|"),
    ),
    draw: () => {},
  }));

// Three mutually adjacent cells.
class TriangleCycleGrid implements Grid<[number]> {
  adjacencyMaps = { cycle: [1, 0] };
  private cells: Cell<[number]>[] = [0, 1, 2].map((i) => ({ choices: [], collapsed: false, forbidden: [], coords: [i] }));

  *iterate(): IterableIterator<[Cell<[number]>, [number]]> {
    for (const cell of this.cells) yield [cell, cell.coords];
  }
  get([i]: [number]) {
    return this.cells[i] ?? null;
  }
  set([i]: [number], cell: Cell<[number]>) {
    this.cells[i] = cell;
  }
  getNeighbors([i]: [number]) {
    return [this.cells[(i + 1) % 3], this.cells[(i + 2) % 3]];
  }
  getCells() {
    return this.cells;
  }
  clone(): Grid<[number]> {
    return this;
  }
  toSnapshot(): GridSnapshot {
    return { cells: this.cells, width: 3, height: 1 };
  }
  getAdjacencyType() {
    return "cycle";
  }
  getAdjacencyMap() {
    return this.adjacencyMaps.cycle;
  }
}

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

    it("should give up after maxRetries backtracks, reported differently from no solution", () => {
      // Same scenario as above, which needs one backtrack; allow none.
      const grid = new SquareGrid(3, 3);
      const wfc = new WFC(generateRandomTiles(8, 3, 1), grid, {
        random: seeded(21),
        maxRetries: 0,
        logLevel: LogLevel.NONE,
      });
      let emittedError: Error | undefined;
      wfc.on("error", (error) => {
        emittedError = error;
      });

      expect(() => wfc.start()).toThrow(/^Gave up after 0 backtracks/);
      expect(emittedError?.message).toMatch(/^Gave up after 0 backtracks/);
    });
  });

  describe("Multi-level Backtracking", () => {
    it("should backtrack multiple levels when needed", () => {
      // Found with:
      //   npm run stress-test -- --tileset random --random-tiles 32 --random-labels 6 --width 5 --height 5
      // (seed 4 undoes two decisions in one backtrack).
      const grid = new SquareGrid(5, 5);
      const wfc = new WFC(generateRandomTiles(32, 6, 1), grid, { random: seeded(4), logLevel: LogLevel.NONE });

      const steps: StepResult[] = [...wfc.execute(undefined, false)];

      const depths = steps.filter((s) => s.type === "backtrack").map((s) => s.depth!);
      expect(Math.max(...depths)).toBeGreaterThanOrEqual(2);
      expect(steps[steps.length - 1].type).toBe("complete");
      expectValidSolution(wfc, grid);
    });
  });

  describe("Depth-first search", () => {
    it("should find a solution exactly when one exists, and prove there is none otherwise", () => {
      let solvable = 0;
      let unsolvable = 0;

      for (const [tileCount, labels] of [[3, 2], [4, 3], [5, 3], [6, 4]]) {
        for (let tilesetSeed = 1; tilesetSeed <= 8; tilesetSeed++) {
          const tiles = generateRandomTiles(tileCount, labels, tilesetSeed);
          const exists = solutionExists(tiles, new SquareGrid(3, 3));
          exists ? solvable++ : unsolvable++;

          // Without restarts, and restarting as eagerly as possible: neither
          // may change whether a solution is found or proven not to exist.
          for (const restartAfter of [0, 1]) {
            for (const runSeed of [1, 2, 3]) {
              const grid = new SquareGrid(3, 3);
              const wfc = new WFC(tiles, grid, {
                random: seeded(`${tileCount}-${labels}-${tilesetSeed}-${runSeed}`),
                maxRetries: 1_000_000,
                restartAfter,
                logLevel: LogLevel.NONE,
                debugChecks: true,
              });
              wfc.on("error", () => {});

              if (exists) {
                wfc.start();
                expectValidSolution(wfc, grid);
              } else {
                expect(() => wfc.start()).toThrow(/^No solution exists/);
              }
            }
          }
        }
      }

      // Make sure both outcomes were actually exercised.
      expect(solvable).toBeGreaterThan(0);
      expect(unsolvable).toBeGreaterThan(0);
    });

    it("should terminate with no solution when every first choice leads to a contradiction", () => {
      // Three mutually adjacent cells that must all differ, with two tiles.
      // Every tile has a compatible neighbor, but any assignment fails.
      const tiles: TileDef[] = [
        { name: "Red", adjacencies: ["[r>b]", "[r>b]"], draw: () => {} },
        { name: "Blue", adjacencies: ["[b>r]", "[b>r]"], draw: () => {} },
      ];
      const wfc = new WFC(tiles, new TriangleCycleGrid(), { logLevel: LogLevel.NONE });
      wfc.on("error", () => {});

      expect(() => wfc.start()).toThrow(/^No solution exists/);
    });
  });

  describe("Restarts", () => {
    const tiles = generateRandomTiles(32, 6, 1);
    const run = (seed: number, options: ConstructorParameters<typeof WFC>[2] = {}, initialSeed?: Parameters<WFC["start"]>[0]) => {
      const grid = new SquareGrid(10, 10);
      const wfc = new WFC(tiles, grid, { random: seeded(seed), logLevel: LogLevel.NONE, ...options });
      const restarts: { restarts: number; backtracks: number }[] = [];
      wfc.on("restart", (info) => restarts.push(info));
      wfc.on("error", () => {});
      wfc.start(initialSeed);
      return { wfc, grid, restarts };
    };

    it("generates the Luby sequence", () => {
      expect(Array.from({ length: 15 }, (_, i) => luby(i + 1))).toEqual([1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8]);
    });

    it("starts over, keeps the initial seed, and still produces a valid solution", () => {
      let runsWithRestarts = 0;
      for (let seed = 1; seed <= 15; seed++) {
        const { wfc, grid, restarts } = run(seed, { restartAfter: 1, debugChecks: true }, [{ coords: [0, 0], value: tiles[0] }]);
        if (restarts.length > 0) runsWithRestarts++;

        // The pinned cell survives every restart.
        expect(grid.get([0, 0])!.value).toBe(tiles[0]);
        expectValidSolution(wfc, grid);
        // Events count restarts in order.
        expect(restarts.map((r) => r.restarts)).toEqual(restarts.map((_, i) => i + 1));
      }
      expect(runsWithRestarts).toBeGreaterThan(0);
    });

    it("yields a restart step", () => {
      const grid = new SquareGrid(10, 10);
      const wfc = new WFC(tiles, grid, { random: seeded(1), restartAfter: 1, logLevel: LogLevel.NONE });
      const types = new Set([...wfc.execute(undefined, false)].map((step) => step.type));
      expect(types).toContain("restart");
      expect(types).toContain("complete");
    });

    it("never restarts when restartAfter is 0", () => {
      for (let seed = 1; seed <= 15; seed++) {
        expect(run(seed, { restartAfter: 0 }).restarts).toEqual([]);
      }
    });

    it("can still prove that no solution exists while restarting", () => {
      // Six mutually adjacent cells can't be coloured with five colours.
      const wfc = new WFC(colourTiles(5), new CompleteGraphGrid(6), { random: seeded(1), restartAfter: 2, logLevel: LogLevel.NONE });
      let restarts = 0;
      wfc.on("restart", () => restarts++);
      wfc.on("error", () => {});

      expect(() => wfc.start()).toThrow(/^No solution exists/);
      expect(restarts).toBeGreaterThan(0);
    });

    it("solves the colourable complete graph while restarting", () => {
      const grid = new CompleteGraphGrid(5);
      const wfc = new WFC(colourTiles(5), grid, { random: seeded(1), restartAfter: 1, logLevel: LogLevel.NONE });
      wfc.start();
      const names = Array.from(grid.iterate(), ([cell]) => cell.value!.name);
      expect(new Set(names).size).toBe(5);
    });

    it("reports restarts when giving up", () => {
      const wfc = new WFC(colourTiles(5), new CompleteGraphGrid(6), {
        random: seeded(1),
        restartAfter: 2,
        maxRetries: 10,
        logLevel: LogLevel.NONE,
      });
      wfc.on("error", () => {});
      expect(() => wfc.start()).toThrow(/^Gave up after 10 backtracks \(\d+ restarts\)/);
    });

    it("rejects a negative restartAfter", () => {
      expect(() => new WFC(tiles, new SquareGrid(2, 2), { restartAfter: -1 })).toThrow("restartAfter");
    });
  });
});
