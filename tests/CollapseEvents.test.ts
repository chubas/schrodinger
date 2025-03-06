import { WFC } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";
import { CellCollapse } from "../src/WFC";
import { LogLevel } from "../src/WFC";

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
    name: "White",
    adjacencies: ["W>B", "W>B", "W>B", "W>B"],
    draw: () => {},
  },
  {
    name: "Black",
    adjacencies: ["B>W", "B>W", "B>W", "B>W"],
    draw: () => {},
  },
];

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
    it("should emit one collapse event for 2x2 grid without seed CHESSTEST", async () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(chessTiles, grid, { random: new TestRNG(0), logLevel: LogLevel.DEBUG });

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(4);
          expect(group.cause).toBe("entropy");

          // Verify alternating pattern
          const pattern = new Map<string, string>();
          group.cells.forEach((cell: CellCollapse) => {
            const key = `${cell.coords[0]},${cell.coords[1]}`;
            pattern.set(key, cell.value!.name);
          });

          // Check that adjacent cells have different colors
          group.cells.forEach((cell: CellCollapse) => {
            const [x, y] = cell.coords;
            const cellColor = cell.value!.name;

            // Check right neighbor
            if (x < 1) {
              const rightKey = `${x + 1},${y}`;
              expect(pattern.get(rightKey)).not.toBe(cellColor);
            }

            // Check bottom neighbor
            if (y < 1) {
              const bottomKey = `${x},${y + 1}`;
              expect(pattern.get(bottomKey)).not.toBe(cellColor);
            }
          });
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

          // Verify alternating pattern
          const pattern = new Map<string, string>();
          group.cells.forEach((cell: CellCollapse) => {
            const key = `${cell.coords[0]},${cell.coords[1]}`;
            pattern.set(key, cell.value!.name);
          });

          // Check that adjacent cells have different colors
          group.cells.forEach((cell: CellCollapse) => {
            const [x, y] = cell.coords;
            const cellColor = cell.value!.name;

            // Check right neighbor
            if (x < 1) {
              const rightKey = `${x + 1},${y}`;
              expect(pattern.get(rightKey)).not.toBe(cellColor);
            }

            // Check bottom neighbor
            if (y < 1) {
              const bottomKey = `${x},${y + 1}`;
              expect(pattern.get(bottomKey)).not.toBe(cellColor);
            }
          });
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
      const wfc = new WFC(chessTiles, grid, { logLevel: LogLevel.DEBUG });

      let collapseCount = 0;
      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapseCount++;
          expect(group.cells).toHaveLength(4);
          expect(group.cause).toBe("initial");

          // Verify alternating pattern
          const pattern = new Map<string, string>();
          group.cells.forEach((cell: CellCollapse) => {
            const key = `${cell.coords[0]},${cell.coords[1]}`;
            pattern.set(key, cell.value!.name);
          });

          // Check that adjacent cells have different colors
          group.cells.forEach((cell: CellCollapse) => {
            const [x, y] = cell.coords;
            const cellColor = cell.value!.name;

            // Check right neighbor
            if (x < 1) {
              const rightKey = `${x + 1},${y}`;
              expect(pattern.get(rightKey)).not.toBe(cellColor);
            }

            // Check bottom neighbor
            if (y < 1) {
              const bottomKey = `${x},${y + 1}`;
              expect(pattern.get(bottomKey)).not.toBe(cellColor);
            }
          });
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