import { TileDef, TileDefFactory } from "../src/TileDef";

describe("TileDefFactory", () => {
  it("should parse single character adjacencies", () => {
    const adjacencies = TileDefFactory.extractAdjacencies("A|B|C");
    expect(adjacencies).toEqual([["A"], ["B"], ["C"]]);
  });

  it("should parse multiple character adjacencies", () => {
    const adjacencies = TileDefFactory.extractAdjacencies("AB|CD");
    expect(adjacencies).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("should parse adjacencies with tokens", () => {
    const adjacencies = TileDefFactory.extractAdjacencies(
      "(some)(token)|A|(other)(token)",
    );
    expect(adjacencies).toEqual([["some", "token"], ["A"], ["other", "token"]]);
  });

  it("should parse mixed adjacencies with tokens", () => {
    const adjacencies = TileDefFactory.extractAdjacencies(
      "AB(some)CD|(other)EF(token)",
    );
    expect(adjacencies).toEqual([
      ["A", "B", "some", "C", "D"],
      ["other", "E", "F", "token"],
    ]);
  });

  // TODO: Add error handling tests
});
