import seedrandom from "seedrandom";
import { Cell, Grid, GridSnapshot, SquareGrid } from "../src/Grid.js";
import { TileDef } from "../src/TileDef.js";
import { AdjacencyTables } from "../src/AdjacencyTables.js";
import { SupportPropagator } from "../src/SupportPropagator.js";
import { WFC, LogLevel } from "../src/WFC.js";
import { generateRandomTiles } from "../stress-test/randomTiles.js";

const tile = (name: string, adjacencies: string[]): TileDef => ({ name, adjacencies, draw: () => {} });

function setup(tiles: TileDef[], grid: Grid) {
  for (const [cell] of grid.iterate()) {
    cell.choices = [...tiles];
    cell.collapsed = false;
    cell.value = undefined;
  }
  const tables = new AdjacencyTables(tiles, grid.adjacencyMaps);
  const propagator = new SupportPropagator(grid, tiles, tables);
  const cells = [...grid.iterate()].map(([cell]) => cell);
  return { tables, propagator, cells };
}

function cellStates(grid: Grid) {
  return [...grid.iterate()].map(([cell]) => ({
    choices: cell.choices.map((t) => t.name),
    collapsed: cell.collapsed,
    value: cell.value?.name,
  }));
}

/**
 * Straightforward reference: repeatedly drop any tile with no compatible tile
 * in some neighbor until nothing changes. Mutates `domains`; returns false if
 * a domain empties.
 */
function referenceArcConsistency(grid: Grid, tables: AdjacencyTables, domains: Map<Cell, Set<number>>): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [cell, coords] of grid.iterate()) {
      const type = tables.typeIndex(grid.getAdjacencyType(coords));
      const domain = domains.get(cell)!;
      grid.getNeighbors(coords).forEach((neighbor, d) => {
        if (!neighbor) return;
        const neighborDomain = domains.get(neighbor)!;
        for (const t of [...domain]) {
          if (![...neighborDomain].some((t2) => tables.isCompatible(type, d, t, t2))) {
            domain.delete(t);
            changed = true;
          }
        }
      });
      if (domain.size === 0) return false;
    }
  }
  return true;
}

// A line of cells where each cell only lists the next one as its neighbor.
class DirectedLineGrid implements Grid<[number]> {
  adjacencyMaps = { line: [0] };
  private cells: Cell<[number]>[];

  constructor(length: number) {
    this.cells = Array.from({ length }, (_, i) => ({ choices: [], collapsed: false, forbidden: [], coords: [i] }));
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
    return [this.get([i + 1])];
  }
  getCells() {
    return this.cells;
  }
  clone(): Grid<[number]> {
    return this;
  }
  toSnapshot(): GridSnapshot {
    return { cells: this.cells, width: this.cells.length, height: 1 };
  }
  getAdjacencyType() {
    return "line";
  }
  getAdjacencyMap() {
    return this.adjacencyMaps.line;
  }
}

describe("SupportPropagator", () => {
  it("matches a naive arc-consistency fixpoint after every collapse", () => {
    for (const tilesetSeed of [1, 2, 3]) {
      const tiles = generateRandomTiles(12, 3, tilesetSeed);
      const index = new Map(tiles.map((t, i) => [t.name, i]));

      for (const runSeed of [1, 2, 3, 4, 5]) {
        const grid = new SquareGrid(6, 6);
        const { tables, propagator, cells } = setup(tiles, grid);
        expect(propagator.load()).toBe(true);
        const rng = seedrandom(`run-${tilesetSeed}-${runSeed}`);

        for (;;) {
          const open = cells.filter((c) => !c.collapsed);
          if (open.length === 0) break;
          const cell = open[Math.floor(rng() * open.length)];
          const chosen = cell.choices[Math.floor(rng() * cell.choices.length)];

          const domains = new Map(cells.map((c) => [c, new Set(c.choices.map((t) => index.get(t.name)!))]));
          domains.set(cell, new Set([index.get(chosen.name)!]));
          const expectedConsistent = referenceArcConsistency(grid, tables, domains);

          propagator.collapse(cell, chosen);
          const consistent = propagator.propagate();
          expect(consistent).toBe(expectedConsistent);
          expect(propagator.checkInvariants()).toBeUndefined();
          if (!consistent) break;

          for (const c of cells) {
            expect(c.choices.map((t) => index.get(t.name))).toEqual([...domains.get(c)!].sort((a, b) => a - b));
          }
        }
      }
    }
  });

  it("restores the exact state for nested markers, in stack order", () => {
    // Two labels keep this sequence of collapses free of contradictions.
    const tiles = generateRandomTiles(12, 2, 1);
    const grid = new SquareGrid(5, 5);
    const { propagator, cells } = setup(tiles, grid);
    propagator.load();
    const rng = seedrandom("nested");

    const markers: number[] = [];
    const states: ReturnType<typeof cellStates>[] = [];
    for (let i = 0; i < 4; i++) {
      markers.push(propagator.mark());
      states.push(cellStates(grid));
      const open = cells.filter((c) => !c.collapsed);
      const cell = open[Math.floor(rng() * open.length)];
      propagator.collapse(cell, cell.choices[Math.floor(rng() * cell.choices.length)]);
      expect(propagator.propagate()).toBe(true);
    }

    for (let i = markers.length - 1; i >= 0; i--) {
      propagator.restore(markers[i]);
      expect(cellStates(grid)).toEqual(states[i]);
      expect(propagator.checkInvariants()).toBeUndefined();
    }
  });

  it("keeps support counts exact through a contradiction and restores from it", () => {
    const [a, b] = [tile("A", ["1", "1", "1", "1"]), tile("B", ["2", "2", "2", "2"])];
    const grid = new SquareGrid(3, 1);
    const { propagator, cells } = setup([a, b], grid);
    expect(propagator.load()).toBe(true);
    const before = cellStates(grid);
    const marker = propagator.mark();

    // The middle cell can't match both an A on its left and a B on its right.
    propagator.collapse(cells[0], a);
    propagator.collapse(cells[2], b);
    expect(propagator.propagate()).toBe(false);
    expect(propagator.checkInvariants()).toBeUndefined();

    propagator.restore(marker);
    expect(cellStates(grid)).toEqual(before);
    expect(propagator.checkInvariants()).toBeUndefined();
  });

  it("treats collapsing to a tile that is no longer possible as a contradiction", () => {
    const [a, b] = [tile("A", ["1", "1", "1", "1"]), tile("B", ["2", "2", "2", "2"])];
    const grid = new SquareGrid(2, 1);
    const { propagator, cells } = setup([a, b], grid);
    propagator.load();

    propagator.collapse(cells[0], a);
    expect(propagator.propagate()).toBe(true);
    expect(cells[1].choices.map((t) => t.name)).toEqual(["A"]);

    propagator.collapse(cells[1], b);
    expect(propagator.propagate()).toBe(false);
  });

  it("propagates to cells that list a changed cell as a neighbor, even when it doesn't list them back", () => {
    const [a, b] = [tile("A", ["a"]), tile("B", ["b"])];
    const grid = new DirectedLineGrid(3);
    const { propagator, cells } = setup([a, b], grid);
    propagator.load();

    // Cell 2 lists no neighbors; cells 0 and 1 are constrained only through
    // their own forward neighbor.
    propagator.collapse(cells[2], a);
    expect(propagator.propagate()).toBe(true);
    expect(cells.map((c) => c.choices.map((t) => t.name))).toEqual([["A"], ["A"], ["A"]]);
    expect(cells.every((c) => c.collapsed)).toBe(true);
  });

  it("rejects restoring to a position beyond the current trail", () => {
    const grid = new SquareGrid(2, 2);
    const { propagator } = setup(generateRandomTiles(6, 2, 1), grid);
    propagator.load();
    expect(() => propagator.restore(propagator.mark() + 1)).toThrow();
  });
});

describe("WFC with debugChecks", () => {
  it("backtracks with consistent state and produces only valid solutions", () => {
    const tiles = generateRandomTiles(32, 6, 1);
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    let solved = 0;
    let backtracked = 0;

    try {
      for (let seed = 1; seed <= 15; seed++) {
        const grid = new SquareGrid(8, 8);
        const rng = seedrandom(String(seed));
        const wfc = new WFC(tiles, grid, {
          random: { random: () => rng(), setSeed: () => {} },
          logLevel: LogLevel.NONE,
          debugChecks: true,
        });
        wfc.on("error", () => {});
        wfc.on("backtrack", () => backtracked++);

        try {
          wfc.start();
        } catch (e) {
          expect((e as Error).message).toMatch(/^(No solution exists|Gave up)/);
          continue;
        }

        solved++;
        for (const [cell, coords] of grid.iterate()) {
          expect(cell.collapsed).toBe(true);
          grid.getNeighbors(coords).forEach((neighbor, d) => {
            if (neighbor) expect(wfc.canBeAdjacent(cell.value!, coords, d, neighbor.value!)).toBe(true);
          });
        }
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
    }

    expect(solved).toBeGreaterThan(0);
    expect(backtracked).toBeGreaterThan(0);
  });
});
