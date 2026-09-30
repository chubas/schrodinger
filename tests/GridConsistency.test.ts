import { CubeGrid, Grid, HexagonalGrid, SquareGrid } from "../src/Grid";

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

  it("CubeGrid neighbours face each other", () => {
    expect(countNonReciprocalNeighbors(new CubeGrid(3, 3, 3))).toBe(0);
  });

  it("the check reports a wrong adjacency map", () => {
    const grid = new SquareGrid(3, 3);
    grid.adjacencyMaps.square = [0, 1, 2, 3];
    expect(countNonReciprocalNeighbors(grid)).toBeGreaterThan(0);
  });
});
