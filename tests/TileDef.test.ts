import { TileDef, TileDefFactory } from "../src/TileDef";
import { 
  RuleType, 
  SimpleRule, 
  CompoundRule, 
  DirectionalRule,
  Rule
} from "../src/AdjacencyGrammar";

describe("TileDefFactory", () => {
  describe("Basic Adjacency Parsing", () => {
    it("should parse single character adjacencies as simple rules", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("A|B|C|D");
      
      // Check that we have the expected number of adjacencies
      expect(adjacencies.length).toBe(4);
      
      // Check that all are simple rules
      adjacencies.forEach(adj => {
        expect(adj.type).toBe(RuleType.Simple);
      });
      
      // Check specific values
      expect((adjacencies[0] as any).value).toBe("A");
      expect((adjacencies[1] as any).value).toBe("B");
      expect((adjacencies[2] as any).value).toBe("C");
      expect((adjacencies[3] as any).value).toBe("D");
    });
    
    it("should parse multiple character adjacencies as compound rules", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("A+B|C+D");
      
      // Check that we have the expected number of adjacencies
      expect(adjacencies.length).toBe(2);
      
      // Check that each adjacency is a compound rule with the correct values
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(2);
      expect((adjacencies[0] as any).values[0].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[0] as any).value).toBe("A");
      expect((adjacencies[0] as any).values[1].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[1] as any).value).toBe("B");
      
      expect(adjacencies[1].type).toBe(RuleType.Compound);
      expect((adjacencies[1] as any).values.length).toBe(2);
      expect((adjacencies[1] as any).values[0].type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).values[0] as any).value).toBe("C");
      expect((adjacencies[1] as any).values[1].type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).values[1] as any).value).toBe("D");
    });
    
    it("should parse adjacencies with tokens as compound rules", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("(some)+(token)|(other)+(token)|CD|EF");
      
      // The new implementation parses this differently - token parentheses are treated as part of the parser
      expect(adjacencies.length).toBe(4);
      
      // Check the first rule (some+token)
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(2);
      expect((adjacencies[0] as any).values[0].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[0] as any).value).toBe("some");
      expect((adjacencies[0] as any).values[1].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[1] as any).value).toBe("token");
    });
    
    it("should parse mixed adjacencies with tokens as compound rules", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("A+B+(some)|C+D|(other)+(token)|G+H");
      
      expect(adjacencies.length).toBe(4);
      
      // Check the first compound rule - with the new implementation, parentheses are removed
      // and each part is a separate element in the compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(3);
      expect(((adjacencies[0] as any).values[0] as any).value).toBe("A");
      expect(((adjacencies[0] as any).values[1] as any).value).toBe("B");
      expect(((adjacencies[0] as any).values[2] as any).value).toBe("some");
    });
  });
  
  describe("Directional Adjacency Parsing", () => {
    it("should parse simple directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("[W>B]|[B>W]|[W>B]|[B>W]");
      
      expect(adjacencies.length).toBe(4);
      
      // Check that each adjacency is a directional rule
      expect(adjacencies[0].type).toBe(RuleType.Directional);
      expect((adjacencies[0] as any).origin.type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).origin as any).value).toBe("W");
      expect((adjacencies[0] as any).destination.type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).destination as any).value).toBe("B");
      
      expect(adjacencies[1].type).toBe(RuleType.Directional);
      expect((adjacencies[1] as any).origin.type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).origin as any).value).toBe("B");
      expect((adjacencies[1] as any).destination.type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).destination as any).value).toBe("W");
    });
    
    it("should parse compound directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("R+[W>B]+G|G+[B>W]+R");
      
      expect(adjacencies.length).toBe(2);
      
      // Check the first compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(3);
      
      // First part should be Simple
      expect((adjacencies[0] as any).values[0].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[0] as any).value).toBe("R");
      
      // Middle part should be Directional
      expect((adjacencies[0] as any).values[1].type).toBe(RuleType.Directional);
      expect(((adjacencies[0] as any).values[1] as any).origin.type).toBe(RuleType.Simple);
      expect((((adjacencies[0] as any).values[1] as any).origin as any).value).toBe("W");
      expect(((adjacencies[0] as any).values[1] as any).destination.type).toBe(RuleType.Simple);
      expect((((adjacencies[0] as any).values[1] as any).destination as any).value).toBe("B");
      
      // Last part should be Simple
      expect((adjacencies[0] as any).values[2].type).toBe(RuleType.Simple);
      expect(((adjacencies[0] as any).values[2] as any).value).toBe("G");
    });
    
    it("should parse mixed simple and directional adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("A+B|[W>B]|C+D|[B>W]");
      
      expect(adjacencies.length).toBe(4);
      
      // Check the compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(2);
      
      // Check the directional rule
      expect(adjacencies[1].type).toBe(RuleType.Directional);
      expect((adjacencies[1] as any).origin.type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).origin as any).value).toBe("W");
      expect((adjacencies[1] as any).destination.type).toBe(RuleType.Simple);
      expect(((adjacencies[1] as any).destination as any).value).toBe("B");
    });
    
    it("should parse complex mixed adjacencies", () => {
      const adjacencies = TileDefFactory.extractAdjacencies("R+[W>B]+G|(token)+A+B|[W>B]|C+D+[B>W]+E+F");
      
      // The new implementation parses this differently
      expect(adjacencies.length).toBe(4);
      
      // Check the first compound rule with embedded directional rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      expect((adjacencies[0] as any).values.length).toBe(3);
      expect((adjacencies[0] as any).values[1].type).toBe(RuleType.Directional);
    });
  });
  
  describe("Error Handling", () => {
    it("should handle unmatched brackets gracefully", () => {
      // The implementation actually returns a rule with the unmatched bracket
      const result = TileDefFactory.extractAdjacencies("R+[W>B|B>W");
      expect(result.length).toBe(0);
    });
    
    it("should handle invalid directional format gracefully", () => {
      expect(() => {
        TileDefFactory.parseAdjacencyRule("W>>B");
      }).toThrow();
    });
    
    it("should return empty array for invalid format", () => {
      const result = TileDefFactory.extractAdjacencies("W>>B");
      expect(result.length).toBe(0);
    });
    
    it("should handle invalid nested rules gracefully", () => {
      expect(() => {
        TileDefFactory.parseAdjacencyRule("R+[W>B>C]+G");
      }).toThrow();
    });
    
    it("should return empty array for invalid nested rules", () => {
      const result = TileDefFactory.extractAdjacencies("R+[W>B>C]+G");
      expect(result.length).toBe(0);
    });
  });
  
  describe("Empty Handling", () => {
    it("should handle empty adjacencies", () => {
      const result = TileDefFactory.extractAdjacencies("");
      expect(result.length).toBe(0);
    });
    
    it("should handle null adjacencies", () => {
      // @ts-ignore - Testing null input
      const result = TileDefFactory.extractAdjacencies(null);
      expect(result.length).toBe(0);
    });
    
    it("should filter out empty parts of pipe-separated adjacencies", () => {
      const result = TileDefFactory.extractAdjacencies("A||B");
      expect(result.length).toBe(2);
      expect((result[0] as any).value).toBe("A");
      expect((result[1] as any).value).toBe("B");
    });
  });
});
