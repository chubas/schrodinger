// Compile-time checks: ts-jest type-checks this file, so a line that must not
// compile carries an expect-error marker, and the suite fails if the type
// system stops rejecting it.
import { CubeGrid, Grid, SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { WFC, CollapseGroup, StepResult, WFCOptions } from "../src/WFC";
import { Cell } from "../src/Grid";

describe("Public types", () => {
  it("TileDef does not need a draw function", () => {
    const tile: TileDef = { name: "a", adjacencies: ["x", "x", "x", "x"] };
    expect(tile.draw).toBeUndefined();
  });

  it("a Grid only needs the five members the engine uses", () => {
    class Pair implements Grid<number> {
      adjacencyMaps = { pair: [0] };
      private cells: Cell<number>[] = [0, 1].map((coords) => ({ coords, choices: [], collapsed: false }));
      *iterate(): IterableIterator<[Cell<number>, number]> {
        for (const cell of this.cells) yield [cell, cell.coords];
      }
      get(coords: number) {
        return this.cells[coords] ?? null;
      }
      getNeighbors(coords: number) {
        return [this.cells[1 - coords]];
      }
      getAdjacencyType() {
        return "pair";
      }
    }
    const tiles: TileDef[] = [{ name: "a", adjacencies: ["x"] }];
    const wfc = new WFC(tiles, new Pair());
    wfc.start();
    expect(Array.from(wfc.iterate(), ([cell]) => cell.value?.name)).toEqual(["a", "a"]);
  });

  it("coordinates follow the grid's coordinate type", () => {
    const tiles: TileDef[] = [{ name: "a", adjacencies: ["x", "x", "x", "x", "x", "x"] }];
    const cube = new WFC(tiles, new CubeGrid(2, 2, 2));
    cube.start([{ coords: [0, 0, 0], value: tiles[0] }]);

    // @ts-expect-error a cube grid's coordinates have three parts
    cube.start([{ coords: [0, 0] }]);

    const square = new WFC(tiles.map((t) => ({ ...t, adjacencies: ["x", "x", "x", "x"] })), new SquareGrid(2, 2));
    // @ts-expect-error a square grid's coordinates have two parts
    square.start([{ coords: [0, 0, 0] }]);

    const seen: [number, number][] = [];
    for (const [, coords] of square.iterate()) seen.push(coords);
    expect(seen).toHaveLength(4);
  });

  it("event listeners are typed", () => {
    const tiles: TileDef[] = [{ name: "a", adjacencies: ["x", "x", "x", "x"] }];
    const wfc = new WFC(tiles, new SquareGrid(2, 2));
    const coordsSeen: [number, number][] = [];

    wfc.on("collapse", (group) => {
      const typed: CollapseGroup<[number, number]> = group;
      coordsSeen.push(typed.cells[0].coords);
    });
    wfc.on("restart", (info) => void (info.restarts + info.backtracks));
    // @ts-expect-error "collapse" listeners receive a group, not a number
    wfc.on("collapse", (group: number) => group);
    // @ts-expect-error the engine has no such event
    wfc.on("custom", () => {});

    wfc.start();
    expect(coordsSeen.length).toBeGreaterThan(0);
  });

  it("step results and options are exported", () => {
    const step: StepResult = { type: "restart" };
    const options: WFCOptions = { seed: 1, restartAfter: 10, maxRetries: 5 };
    expect(step.type).toBe("restart");
    expect(options.seed).toBe(1);
  });
});
