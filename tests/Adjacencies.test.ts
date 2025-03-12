import { TileDef, TileDefFactory } from "../src/TileDef";
import { matchAdjacencies, matchAdjacenciesStandard } from "../src/Adjacencies";

describe("Adjacency Matching", () => {
  // Test standard implementation
  describe("Standard Implementation", () => {
    describe("Simple Adjacencies", () => {
      it("should match identical simple adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("ABC")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(true);
      });

      it("should not match different simple adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("DEF")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });

      it("should match token adjacencies in any order", () => {
        const adj1 = TileDefFactory.extractAdjacencies("(token1)(token2)")[0];
        const adj2 = TileDefFactory.extractAdjacencies("(token2)(token1)")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(true);
      });
    });

    describe("Directional Adjacencies", () => {
      it("should match complementary directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("B>W")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(true);
      });

      it("should not match same directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("W>B")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });

      it("should not match non-complementary directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R>G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });
    });

    describe("Compound Adjacencies", () => {
      it("should match compound adjacencies with matching parts", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[B>W]G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(true);
      });

      it("should not match compound adjacencies with different borders", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("B[W>B]G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });

      it("should not match compound adjacencies with non-matching directions", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>R]G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });
    });

    describe("Mixed Adjacency Types", () => {
      it("should not match simple with directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("W>B")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });

      it("should not match simple with compound adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });

      it("should not match directional with compound adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        expect(matchAdjacenciesStandard(adj1, adj2)).toBe(false);
      });
    });

    describe("Complex Scenarios", () => {
      it("should match chess pattern tiles", () => {
        const whiteTile = TileDefFactory.extractAdjacencies("W>B|W>B|W>B|W>B");
        const blackTile = TileDefFactory.extractAdjacencies("B>W|B>W|B>W|B>W");

        // Check all four directions match
        for (let i = 0; i < 4; i++) {
          expect(matchAdjacenciesStandard(whiteTile[i], blackTile[i])).toBe(true);
        }
      });

      it("should match complex border patterns", () => {
        const tile1 = TileDefFactory.extractAdjacencies("RG[W>B]BR|G[B>W]R|RB[W>B]GR|B[B>W]R")[0];
        const tile2 = TileDefFactory.extractAdjacencies("RG[B>W]BR|G[W>B]R|RB[B>W]GR|B[W>B]R")[0];
        expect(matchAdjacenciesStandard(tile1, tile2)).toBe(true);
      });
    });
  });

  // Test bitset implementation
  describe("Binary Bitset Implementation", () => {
    describe("Simple Adjacencies", () => {
      it("should match identical simple adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("ABC")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(true);
      });

      it("should not match different simple adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("DEF")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });

      it("should match token adjacencies in any order", () => {
        const adj1 = TileDefFactory.extractAdjacencies("(token1)(token2)")[0];
        const adj2 = TileDefFactory.extractAdjacencies("(token2)(token1)")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(true);
      });
    });

    describe("Directional Adjacencies", () => {
      it("should match complementary directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("B>W")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(true);
      });

      it("should not match same directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("W>B")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });

      it("should not match non-complementary directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R>G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });
    });

    describe("Compound Adjacencies", () => {
      it("should match compound adjacencies with matching parts", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[B>W]G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(true);
      });

      it("should not match compound adjacencies with different borders", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("B[W>B]G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });

      it("should not match compound adjacencies with non-matching directions", () => {
        const adj1 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>R]G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });
    });

    describe("Mixed Adjacency Types", () => {
      it("should not match simple with directional adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("W>B")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });

      it("should not match simple with compound adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("ABC")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });

      it("should not match directional with compound adjacencies", () => {
        const adj1 = TileDefFactory.extractAdjacencies("W>B")[0];
        const adj2 = TileDefFactory.extractAdjacencies("R[W>B]G")[0];
        expect(matchAdjacencies(adj1, adj2)).toBe(false);
      });
    });

    describe("Complex Scenarios", () => {
      it("should match chess pattern tiles", () => {
        const whiteTile = TileDefFactory.extractAdjacencies("W>B|W>B|W>B|W>B");
        const blackTile = TileDefFactory.extractAdjacencies("B>W|B>W|B>W|B>W");

        // Check all four directions match
        for (let i = 0; i < 4; i++) {
          expect(matchAdjacencies(whiteTile[i], blackTile[i])).toBe(true);
        }
      });

      it("should match complex border patterns", () => {
        const tile1 = TileDefFactory.extractAdjacencies("RG[W>B]BR|G[B>W]R|RB[W>B]GR|B[B>W]R")[0];
        const tile2 = TileDefFactory.extractAdjacencies("RG[B>W]BR|G[W>B]R|RB[B>W]GR|B[W>B]R")[0];
        expect(matchAdjacencies(tile1, tile2)).toBe(true);
      });
    });
  });

  // Ensure both implementations produce the same results
  describe("Implementation Consistency", () => {
    it("should produce consistent results for both implementations", () => {
      const testCases = [
        ["ABC", "ABC"],
        ["ABC", "DEF"],
        ["W>B", "B>W"],
        ["W>B", "W>B"],
        ["R[W>B]G", "R[B>W]G"],
        ["R[W>B]G", "B[W>B]G"]
      ];

      for (const [adj1, adj2] of testCases) {
        const standardResult = matchAdjacenciesStandard(adj1, adj2);
        const binaryResult = matchAdjacencies(adj1, adj2);
        
        expect(binaryResult).toBe(standardResult);
      }
    });
  });
});