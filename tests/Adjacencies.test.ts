import { matchAdjacencies } from "../src/Adjacencies";

describe("Adjacencies", () => {
  describe("Simple Adjacencies", () => {
    it("should match identical adjacencies", () => {
      expect(matchAdjacencies("A", "A")).toBe(true);
      expect(matchAdjacencies("B", "B")).toBe(true);
      expect(matchAdjacencies("C", "C")).toBe(true);
    });

    it("should not match different adjacencies", () => {
      expect(matchAdjacencies("A", "B")).toBe(false);
      expect(matchAdjacencies("B", "C")).toBe(false);
      expect(matchAdjacencies("C", "A")).toBe(false);
    });
  });

  describe("Directional Adjacencies", () => {
    it("should match complementary directional adjacencies", () => {
      expect(matchAdjacencies("[W>B]", "[B>W]")).toBe(true);
      expect(matchAdjacencies("[B>W]", "[W>B]")).toBe(true);
    });

    it("should not match non-complementary directional adjacencies", () => {
      expect(matchAdjacencies("[W>B]", "[W>B]")).toBe(false);
      expect(matchAdjacencies("[B>W]", "[B>W]")).toBe(false);
    });

    it("should not match directional with simple adjacencies", () => {
      expect(matchAdjacencies("[W>B]", "W")).toBe(false);
      expect(matchAdjacencies("[B>W]", "B")).toBe(false);
    });
  });

  describe("Compound Adjacencies", () => {
    it("should match identical compound adjacencies", () => {
      expect(matchAdjacencies("A+B", "A+B")).toBe(true);
      expect(matchAdjacencies("B+C", "B+C")).toBe(true);
      expect(matchAdjacencies("C+A", "C+A")).toBe(true);
    });

    it("should not match different compound adjacencies", () => {
      expect(matchAdjacencies("A+B", "B+C")).toBe(false);
      expect(matchAdjacencies("B+C", "C+A")).toBe(false);
      expect(matchAdjacencies("C+A", "A+B")).toBe(false);
    });

    it("should not match if order is different", () => {
      // Order matters for compound adjacencies
      expect(matchAdjacencies("A+B", "B+A")).toBe(false);
      expect(matchAdjacencies("B+C", "C+B")).toBe(false);
      expect(matchAdjacencies("C+A", "A+C")).toBe(false);
    });
  });

  describe("Choice Adjacencies", () => {
    it("should match if any choice matches", () => {
      expect(matchAdjacencies("A|B", "A")).toBe(true);
      expect(matchAdjacencies("A|B", "B")).toBe(true);
      expect(matchAdjacencies("A", "A|B")).toBe(true);
      expect(matchAdjacencies("B", "A|B")).toBe(true);
    });

    it("should not match if no choice matches", () => {
      expect(matchAdjacencies("A|B", "C")).toBe(false);
      expect(matchAdjacencies("C", "A|B")).toBe(false);
    });
  });

  describe("Negated Adjacencies", () => {
    it("should match if negated rule doesn't match", () => {
      expect(matchAdjacencies("^A", "B")).toBe(true);
      expect(matchAdjacencies("B", "^A")).toBe(true);
    });

    it("should not match if negated rule matches", () => {
      expect(matchAdjacencies("^A", "A")).toBe(false);
      expect(matchAdjacencies("A", "^A")).toBe(false);
    });
  });

  describe("Complex Adjacencies", () => {
    it("should handle complex nested rules correctly", () => {
      // Compound rule with choice
      expect(matchAdjacencies("A+B|C", "A+B")).toBe(true);
      expect(matchAdjacencies("A+B", "A+B|C")).toBe(true);
      
      // Negated compound rule
      expect(matchAdjacencies("^(A+B)", "A+C")).toBe(true);
      expect(matchAdjacencies("A+C", "^(A+B)")).toBe(true);
      
      // Compound with negated part
      expect(matchAdjacencies("A+^B", "A+C")).toBe(true);
      expect(matchAdjacencies("A+C", "A+^B")).toBe(true);
    });

    // Mixed compound and directional adjacencies test
    it("should handle mixed compound and directional adjacencies", () => {
      // Using parsed rules directly to more clearly show the test behavior
      
      // For directional rules, the order of directional parts matters
      // These should match because the directional parts complement each other and are in the same position
      expect(matchAdjacencies("A+[W>B]", "A+[B>W]")).toBe(true);
      
      // These should not match because the compound parts are in a different order
      expect(matchAdjacencies("A+[W>B]", "[B>W]+A")).toBe(false);
      
      // These should not match because directional parts must be in complementary positions
      expect(matchAdjacencies("A+[W>B]", "A+[W>B]")).toBe(false);
    });
  });

  // Test integration with TileDef
  describe("Integration with TileDef", () => {
    it("should handle adjacencies extracted from TileDef", () => {
      // Create a chess pattern with white and black tiles
      const whiteTiles = ["[W>B]", "[W>B]", "[W>B]", "[W>B]"];
      const blackTiles = ["[B>W]", "[B>W]", "[B>W]", "[B>W]"];
      
      // White should connect to black on all sides
      for (let i = 0; i < 4; i++) {
        expect(matchAdjacencies(whiteTiles[i], blackTiles[i])).toBe(true);
      }
    });

    it("should handle compound adjacencies from TileDef", () => {
      // Create tiles with compound adjacencies
      const tile1 = "A+B";
      const tile2 = "A+B";
      
      expect(matchAdjacencies(tile1, tile2)).toBe(true);
    });

    it("should handle choice adjacencies from TileDef", () => {
      // Create tiles with choice adjacencies
      const tile1 = "A|B";
      const tile2 = "A|B";
      
      expect(matchAdjacencies(tile1, tile2)).toBe(true);
    });

    it("should handle negated adjacencies from TileDef", () => {
      // Create tiles with negated adjacencies
      const tile1 = "^A";
      const tile2 = "^A";
      
      expect(matchAdjacencies(tile1, tile2)).toBe(true);
    });
  });
});