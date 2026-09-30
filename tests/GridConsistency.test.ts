import { CubeGrid, Grid, HexagonalGrid, SquareGrid, TriangularGrid } from "../src/Grid";
import { WFC, LogLevel } from "../src/WFC";

// The contract documented in docs/custom-grids.md: looking at a neighbour in
// direction d, the direction adjacencyMaps[type][d] of that neighbour must
// point back at this cell.
function countNonReciprocalNeighbors(grid: Grid): number {
  let problems = 0;
  for (const [cell, coords] of grid.iterate()) {
    const map = grid.adjacencyMaps[grid.getAdjacencyType(coords)];
    grid.getNeighbors(coords).forEach((neighbor, d) => {
      if (!neighbor) return;
      if (grid.getNeighbors(neighbor.coords)[map[d]] !== cell) problems++;
    });
  }
  return problems;
}

describe("Built-in grids", () => {
  it("SquareGrid neighbours face each other", () => {
    expect(countNonReciprocalNeighbors(new SquareGrid(5, 4))).toBe(0);
  });

  it("HexagonalGrid neighbours face each other", () => {
    expect(countNonReciprocalNeighbors(new HexagonalGrid(5, 4))).toBe(0);
  });

  it("TriangularGrid neighbours face each other", () => {
    expect(countNonReciprocalNeighbors(new TriangularGrid(6, 5))).toBe(0);
  });

  it("CubeGrid neighbours face each other", () => {
    expect(countNonReciprocalNeighbors(new CubeGrid(3, 3, 3))).toBe(0);
  });

  it("a run on a TriangularGrid produces a valid tiling", () => {
    // Stripes: each triangle's left side must match its left neighbour's right
    // side, and the vertical sides must match across rows.
    const tiles = [
      { name: "A", adjacencies: ["a", "a", "v"] },
      { name: "B", adjacencies: ["b", "b", "v"] },
    ];
    const grid = new TriangularGrid(8, 6);
    const wfc = new WFC(tiles, grid, { seed: 3, logLevel: LogLevel.NONE });
    wfc.start();
    for (const [cell, coords] of grid.iterate()) {
      expect(cell.collapsed).toBe(true);
      grid.getNeighbors(coords).forEach((neighbor, d) => {
        if (neighbor) expect(wfc.canBeAdjacent(cell.value!, coords, d, neighbor.value!)).toBe(true);
      });
      // Left/right sides force whole rows to share one tile.
      const right = grid.get([coords[0] + 1, coords[1]]);
      if (right) expect(right.value).toBe(cell.value);
    }
  });

  it("the check reports a wrong adjacency map", () => {
    const grid = new SquareGrid(3, 3);
    grid.adjacencyMaps.square = [0, 1, 2, 3];
    expect(countNonReciprocalNeighbors(grid)).toBeGreaterThan(0);
  });
});
