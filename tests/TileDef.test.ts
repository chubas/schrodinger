import { TileDef, TileDefFactory } from "../src/TileDef";

describe("TileDefFactory", () => {
  describe("Basic Adjacency Parsing", () => {
    it("should parse single character adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("A|B|C|D");
      expect(adjacencies).toEqual([["A"], ["B"], ["C"], ["D"]]);
    });

    it("should parse multiple character adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("AB|CD|EF|GH");
      expect(adjacencies).toEqual([
        ["A", "B"],
        ["C", "D"],
        ["E", "F"],
        ["G", "H"]
      ]);
    });

    it("should parse adjacencies with tokens", () => {
      const adjacencies = TileDefFactory.extractAdjacencies(
        "(some)(token)|A|(other)(token)|B"
      );
      expect(adjacencies).toEqual([
        ["some", "token"],
        ["A"],
        ["other", "token"],
        ["B"]
      ]);
    });

    it("should parse mixed adjacencies with tokens", () => {
      const adjacencies = TileDefFactory.extractAdjacencies(
        "AB(some)CD|(other)EF(token)|GH|IJ"
      );
      expect(adjacencies).toEqual([
        ["A", "B", "some", "C", "D"],
        ["other", "E", "F", "token"],
        ["G", "H"],
        ["I", "J"]
      ]);
    });
  });

  describe("Directional Adjacency Parsing", () => {
    it("should parse simple directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("W>B|B>W|W>B|B>W");
      expect(adjacencies).toEqual([
        [{ from: "W", to: "B" }],
        [{ from: "B", to: "W" }],
        [{ from: "W", to: "B" }],
        [{ from: "B", to: "W" }]
      ]);
    });

    it("should parse compound directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("R[W>B]G|G[B>W]R");
      expect(adjacencies).toEqual([
        [
          "R",
          { from: "W", to: "B" },
          "G"
        ],
        [
          "G",
          { from: "B", to: "W" },
          "R"
        ]
      ]);
    });

    it("should parse mixed simple and directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("AB|W>B|CD|B>W");
      expect(adjacencies).toEqual([
        ["A", "B"],
        [{ from: "W", to: "B" }],
        ["C", "D"],
        [{ from: "B", to: "W" }]
      ]);
    });

    it("should parse complex mixed adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies(
        "R[W>B]G|(token)AB|W>B|CD[B>W]EF"
      );
      expect(adjacencies).toEqual([
        ["R", { from: "W", to: "B" }, "G"],
        ["token", "A", "B"],
        [{ from: "W", to: "B" }],
        ["C", "D", { from: "B", to: "W" }, "E", "F"]
      ]);
    });
  });

  describe("Error Handling", () => {
    it("should throw error on unmatched brackets", () => {
      expect(() => {
        TileDefFactory.extractAdjacencies("R[W>B|B>W");
      }).toThrow("Unmatched brackets in adjacency definition");
    });

    it("should throw error on invalid directional format", () => {
      expect(() => {
        TileDefFactory.extractAdjacencies("W>>B");
      }).toThrow("Invalid directional adjacency format");
    });

    it("should throw error on empty adjacency", () => {
      expect(() => {
        TileDefFactory.extractAdjacencies("||");
      }).toThrow("Empty adjacency definition");
    });

    it("should throw error on invalid compound format", () => {
      expect(() => {
        TileDefFactory.extractAdjacencies("R[W>B>C]G");
      }).toThrow("Invalid compound adjacency format");
    });
  });
});
