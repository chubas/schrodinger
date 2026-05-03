import { WFC, StepResult } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { RuleType, SimpleRule } from "../src/AdjacencyGrammar";
import { DeterministicRNG } from "./util";

const createSimpleRule = (value: string): SimpleRule => ({
  type: RuleType.Simple,
  value,
});

const trailTiles = [
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

describe("WFC Trail Rollback", () => {
  it("should emit rollback deltas when a dead-end candidate fails", () => {
    const grid = new SquareGrid(2, 2);
    const wfc = new WFC(trailTiles, grid, {
      random: new DeterministicRNG([0, 0.6]),
    });
    const generator = wfc.execute();
    const steps: StepResult[] = [];

    let result = generator.next();
    while (!result.done) {
      steps.push(result.value);
      result = generator.next();
    }

    const contradiction = steps.find((step) => step.type === "contradiction");
    const rollback = steps.find((step) => step.type === "backtrack");
    const complete = steps.find((step) => step.type === "complete");

    expect(contradiction).toBeDefined();
    expect(rollback?.deltas?.length).toBeGreaterThan(0);
    expect(
      rollback?.deltas?.every((delta) => delta.reason === "rollback"),
    ).toBe(true);
    expect(complete).toBeDefined();

    for (const [cell] of wfc.iterate()) {
      expect(cell.collapsed).toBe(true);
      expect(cell.choices).toHaveLength(1);
      expect(cell.choices[0].name).toBe("A");
    }
  });

  it("should provide enough deltas to replay visible state", () => {
    const grid = new SquareGrid(2, 2);
    const wfc = new WFC(trailTiles, grid, {
      random: new DeterministicRNG([0, 0.6]),
    });
    const generator = wfc.execute();
    const visibleState = new Map<string, string[]>();

    for (const [cell, coords] of grid.iterate()) {
      visibleState.set(
        coords.join(","),
        cell.choices.map((tile) => tile.name),
      );
    }

    let result = generator.next();
    while (!result.done) {
      for (const delta of result.value.deltas || []) {
        visibleState.set(delta.coords.join(","), [...delta.after.choices]);
      }

      for (const [cell, coords] of wfc.iterate()) {
        expect(visibleState.get(coords.join(","))).toEqual(
          cell.choices.map((tile) => tile.name),
        );
      }

      result = generator.next();
    }
  });
});
