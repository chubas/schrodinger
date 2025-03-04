import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";
import { CellCollapse } from "../src/WFC";

// Simple tiles that can connect to anything
const simpleTiles: TileDef[] = [
  {
    name: "A",
    adjacencies: ["1", "1", "1", "1"],
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: ["1", "1", "1", "1"],
    draw: () => {},
  },
];

// Chess tiles that can only connect to their opposite
const chessTiles: TileDef[] = [
  {
    name: "A",
    adjacencies: ["a", "a", "a", "a"], // Can only connect to B
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: ["b", "b", "b", "b"], // Can only connect to A
    draw: () => {},
  },
];

// Add adjacency rules to force alternating pattern
chessTiles[0].adjacencies = ["b", "b", "b", "b"]; // A can only connect to B
chessTiles[1].adjacencies = ["a", "a", "a", "a"]; // B can only connect to A

// Controlled RNG for predictable tests
class TestRNG implements RandomLib {
  private value: number;

  constructor(value: number = 0) {
    this.value = value;
  }

  random(): number {
    return this.value;
  }

  setSeed(_seed: string | number): void {}
}

describe("WFC Collapse Events", () => {
  describe("Simple Grid Collapses", () => {
    it("should emit exactly one collapse event for 1x1 grid without seed", async () => {
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(simpleTiles, grid, { random: new TestRNG(0) });

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(1);
          expect(group.cause).toBe("entropy");
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(1);
          resolve();
        });

        wfc.start();
      });
    });

    it("should emit exactly one collapse event for 1x1 grid with seed", async () => {
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(simpleTiles, grid);

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(1);
          expect(group.cause).toBe("initial");
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(1);
          resolve();
        });

        wfc.start([{ coords: [0, 0], value: simpleTiles[0] }]);
      });
    });

    it("should emit four collapse events for 2x2 grid with independent tiles", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(simpleTiles, grid, { random: new TestRNG(0) });

      let collapseCount = 0;
      const collapsedCells = new Set<string>();

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(1);

          // Track collapsed cells to ensure no duplicates
          const cellKey = `${group.cells[0].coords[0]},${group.cells[0].coords[1]}`;
          expect(collapsedCells.has(cellKey)).toBe(false);
          collapsedCells.add(cellKey);
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(4);
          expect(collapsedCells.size).toBe(4);
          resolve();
        });

        wfc.start();
      });
    });

    it("should emit three collapse events for 2x2 grid with 2-cell seed", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(simpleTiles, grid, { random: new TestRNG(0) });

      let collapseCount = 0;
      const collapsedCells = new Set<string>();

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          if (collapseCount === 1) {
            expect(group.cells).toHaveLength(2);
            expect(group.cause).toBe("initial");
          } else {
            expect(group.cells).toHaveLength(1);
            expect(group.cause).toBe("entropy");
          }

          // Track collapsed cells
          group.cells.forEach((cell: CellCollapse) => {
            const cellKey = `${cell.coords[0]},${cell.coords[1]}`;
            expect(collapsedCells.has(cellKey)).toBe(false);
            collapsedCells.add(cellKey);
          });
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(3);
          expect(collapsedCells.size).toBe(4);
          resolve();
        });

        wfc.start([
          { coords: [0, 0], value: simpleTiles[0] },
          { coords: [0, 1], value: simpleTiles[0] }
        ]);
      });
    });
  });

  describe("Chess Pattern Collapses", () => {
    it("should emit one collapse event for 2x2 grid without seed", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(chessTiles, grid, { random: new TestRNG(0) });

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(4);
          expect(group.cause).toBe("entropy");
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(1);
          resolve();
        });

        wfc.start();
      });
    });

    it("should emit one collapse event for 2x2 grid with 1-cell seed", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(chessTiles, grid);

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(4);
          expect(group.cause).toBe("initial");
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(1);
          resolve();
        });

        wfc.start([{ coords: [0, 0], value: chessTiles[0] }]);
      });
    });

    it("should emit one collapse event for 2x2 grid with 2-cell seed", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(chessTiles, grid);

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(4);
          expect(group.cause).toBe("initial");
        });

        wfc.on("complete", () => {
          expect(collapseCount).toBe(1);
          resolve();
        });

        wfc.start([
          { coords: [0, 0], value: chessTiles[0] },
          { coords: [0, 1], value: chessTiles[1] }
        ]);
      });
    });
  });
});