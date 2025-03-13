import { WFC, LogLevel } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { DeterministicRNG, pickTiles } from "./util";

// Mock tiles for testing with specific adjacency rules
const backtrackTiles = [
  {
    name: "A",
    adjacencies: ["1", "1", "1", "1"],
    draw: () => { },
  },
  {
    name: "B",
    adjacencies: ["2", "2", "2", "2"],
    draw: () => { },
  },
  {
    name: "C",
    adjacencies: ["1", "2", "1", "2"],
    draw: () => { },
  },
  {
    name: "DeadEnd",
    adjacencies: ["1", "2", "1", "3"],
    draw: () => { },
  },
  {
    name: "NoMatch",
    adjacencies: ["X", "X", "Y", "Y"],
    draw: () => { },
  }
];

describe("WFC Delta Snapshots", () => {
  it("should track changes between snapshots", () => {
    // Create a large grid to amplify memory differences
    const grid = new SquareGrid(20, 20);
    const wfc = new WFC(backtrackTiles, grid);

    // Access the private snapshots map using any type assertion
    const snapshots = (wfc as any).snapshots;

    // Take a snapshot
    const snapshotId = (wfc as any).takeSnapshot();

    // Get the snapshot
    const snapshot = snapshots.get(snapshotId);

    // For the first snapshot, all cells are considered changed
    expect(snapshot.changedCellIds.size).toBe(400); // 20x20 grid has 400 cells

    // Make a change to one cell
    const cell = grid.get([0, 0]);
    if (cell) {
      const originalChoices = [...cell.choices];
      cell.choices = [backtrackTiles[0]]; // Set to only tile A

      // Take another snapshot
      const newSnapshotId = (wfc as any).takeSnapshot();
      const newSnapshot = snapshots.get(newSnapshotId);

      // Verify that only the changed cell is in the changedCellIds
      expect(newSnapshot.changedCellIds.size).toBe(1);
      expect(newSnapshot.changedCellIds.has("0,0")).toBe(true);

      // Restore the first snapshot
      (wfc as any).restoreSnapshot(snapshotId);

      // Verify that the cell was restored
      expect(cell.choices).toEqual(originalChoices);
    }
  });

  it("should restore multiple cell changes correctly", () => {
    const grid = new SquareGrid(5, 5);
    const wfc = new WFC(backtrackTiles, grid);

    // Access the private snapshots map
    const snapshots = (wfc as any).snapshots;

    // Take an initial snapshot
    const initialSnapshotId = (wfc as any).takeSnapshot();

    // Make changes to multiple cells
    const changedCells = [
      { coords: [0, 0], value: backtrackTiles[0] },
      { coords: [1, 1], value: backtrackTiles[1] },
      { coords: [2, 2], value: backtrackTiles[2] }
    ];

    // Store original states
    const originalStates = changedCells.map(({ coords }) => {
      const cell = grid.get(coords as [number, number])!;
      return {
        coords,
        choices: [...cell.choices],
        collapsed: cell.collapsed
      };
    });

    // Apply changes
    changedCells.forEach(({ coords, value }) => {
      const cell = grid.get(coords as [number, number])!;
      cell.choices = [value];
      cell.collapsed = true;
    });

    // Take another snapshot
    const changedSnapshotId = (wfc as any).takeSnapshot();
    const changedSnapshot = snapshots.get(changedSnapshotId);

    // Verify that only the changed cells are in the changedCellIds
    expect(changedSnapshot.changedCellIds.size).toBe(changedCells.length);
    changedCells.forEach(({ coords }) => {
      const cellId = `${coords[0]},${coords[1]}`;
      expect(changedSnapshot.changedCellIds.has(cellId)).toBe(true);
    });

    // Restore the initial snapshot
    (wfc as any).restoreSnapshot(initialSnapshotId);

    // Verify that all cells were restored correctly
    originalStates.forEach(({ coords, choices, collapsed }) => {
      const cell = grid.get(coords as [number, number])!;
      expect(cell.choices).toEqual(choices);
      expect(cell.collapsed).toBe(collapsed);
    });
  });

  it("should handle nested snapshots and restorations", () => {
    const grid = new SquareGrid(3, 3);
    const wfc = new WFC(backtrackTiles, grid);

    // Access the private snapshots map
    const snapshots = (wfc as any).snapshots;

    // Take snapshot 1 - initial state
    const snapshot1Id = (wfc as any).takeSnapshot();

    // Change cell [0,0]
    const cell1 = grid.get([0, 0])!;
    const cell1Original = [...cell1.choices];
    cell1.choices = [backtrackTiles[0]];
    cell1.collapsed = true;

    // Take snapshot 2 - after changing cell1
    const snapshot2Id = (wfc as any).takeSnapshot();

    // Change cell [1,1]
    const cell2 = grid.get([1, 1])!;
    const cell2Original = [...cell2.choices];
    cell2.choices = [backtrackTiles[1]];
    cell2.collapsed = true;

    // Take snapshot 3 - after changing cell2
    const snapshot3Id = (wfc as any).takeSnapshot();

    // Change cell [2,2]
    const cell3 = grid.get([2, 2])!;
    const cell3Original = [...cell3.choices];
    cell3.choices = [backtrackTiles[2]];
    cell3.collapsed = true;

    // Verify current state
    expect(cell1.choices.length).toBe(1);
    expect(cell1.choices[0].name).toBe("A");
    expect(cell2.choices.length).toBe(1);
    expect(cell2.choices[0].name).toBe("B");
    expect(cell3.choices.length).toBe(1);
    expect(cell3.choices[0].name).toBe("C");

    // Restore to snapshot 1 - should restore all cells to initial state
    (wfc as any).restoreSnapshot(snapshot1Id);

    // Verify state after restoring to snapshot 1
    expect(cell1.choices.length).toBe(cell1Original.length);
    expect(cell2.choices.length).toBe(cell2Original.length);
    expect(cell3.choices.length).toBe(cell3Original.length);
  });
});