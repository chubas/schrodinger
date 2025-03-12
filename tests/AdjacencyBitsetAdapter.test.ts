import { TileDefFactory } from "../src/TileDef";
import { matchAdjacencies } from "../src/Adjacencies";
import { AdjacencyBitsetAdapter } from "../src/AdjacencyBitsetAdapter";
import { AdjacencyBitset } from "../src/AdjacencyBitset";

describe("AdjacencyBitsetAdapter", () => {
  const adapter = AdjacencyBitsetAdapter.getInstance();

  describe("Conversion to Bitset", () => {
    it("should convert simple adjacencies to bitsets", () => {
      const rule = TileDefFactory.parseAdjacencyRule("ABC");
      const bitset = adapter.convertToBitset(rule);
      
      expect(bitset).toBeInstanceOf(AdjacencyBitset);
      expect(bitset.count()).toBe(3);
    });

    it("should convert directional adjacencies to bitsets", () => {
      const rule = TileDefFactory.parseAdjacencyRule("W>B");
      const bitset = adapter.convertToBitset(rule);
      
      expect(bitset).toBeInstanceOf(AdjacencyBitset);
      expect(bitset.count()).toBe(1);
    });

    it("should convert compound adjacencies to bitsets", () => {
      const rule = TileDefFactory.parseAdjacencyRule("R[W>B]G");
      const bitset = adapter.convertToBitset(rule);
      
      expect(bitset).toBeInstanceOf(AdjacencyBitset);
      expect(bitset.count()).toBe(3); // R, W>B, G
    });
  });

  describe("Matching with Binary Representation", () => {
    it("should match identical simple adjacencies", () => {
      const adj1 = "ABC";
      const adj2 = "ABC";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(true);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should not match different simple adjacencies", () => {
      const adj1 = "ABC";
      const adj2 = "DEF";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(false);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should match complementary directional adjacencies", () => {
      const adj1 = "W>B";
      const adj2 = "B>W";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(true);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should not match same directional adjacencies", () => {
      const adj1 = "W>B";
      const adj2 = "W>B";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(false);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should match compound adjacencies with matching parts", () => {
      const adj1 = "R[W>B]G";
      const adj2 = "R[B>W]G";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(true);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should not match compound adjacencies with different borders", () => {
      const adj1 = "R[W>B]G";
      const adj2 = "B[W>B]G";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(false);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });

    it("should not match different types of adjacencies", () => {
      const adj1 = "ABC";
      const adj2 = "W>B";
      
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(false);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(adj1, adj2)).toBe(matchAdjacencies(adj1, adj2));
    });
  });

  describe("Complex Matching Scenarios", () => {
    it("should match chess pattern tiles", () => {
      const whiteTile = TileDefFactory.extractAdjacencies("W>B|W>B|W>B|W>B");
      const blackTile = TileDefFactory.extractAdjacencies("B>W|B>W|B>W|B>W");

      // Check all four directions match
      for (let i = 0; i < 4; i++) {
        expect(adapter.matchAdjacencies(whiteTile[i], blackTile[i])).toBe(true);
        
        // Compare with original implementation
        expect(adapter.matchAdjacencies(whiteTile[i], blackTile[i])).toBe(
          matchAdjacencies(whiteTile[i], blackTile[i])
        );
      }
    });

    it("should match complex border patterns", () => {
      const tile1 = "RG[W>B]BR";
      const tile2 = "RG[B>W]BR";
      
      expect(adapter.matchAdjacencies(tile1, tile2)).toBe(true);
      
      // Compare with original implementation
      expect(adapter.matchAdjacencies(tile1, tile2)).toBe(matchAdjacencies(tile1, tile2));
    });
  });

  describe("Registry Reuse", () => {
    it("should reuse the registry across multiple conversions", () => {
      // Get the initial registry
      const registry = adapter.getRegistry();
      
      // Convert a rule to a bitset
      const rule1 = "ABC";
      adapter.convertToBitset(rule1);
      
      // Convert another rule to a bitset
      const rule2 = "DEF";
      adapter.convertToBitset(rule2);
      
      // Get the registry again
      const registry2 = adapter.getRegistry();
      
      // Should be the same registry
      expect(registry).toBe(registry2);
    });
  });
}); 