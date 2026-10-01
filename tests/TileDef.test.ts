import { TileDef, TileDefFactory } from "../src/TileDef";
import { 
  RuleType, 
  SimpleRule, 
  CompoundRule, 
  DirectionalRule,
  Rule,
  parseAdjacencyRule,
  ChoiceRule
} from "../src/AdjacencyGrammar";

describe("Adjacency Rule Parsing", () => {
  describe("Basic Adjacency Parsing", () => {
    it("should parse single character adjacencies as simple rules", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["A", "B", "C", "D"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      // Check that we have the expected number of adjacencies
      expect(adjacencies.length).toBe(4);
      
      // Check that all are simple rules
      adjacencies.forEach(adj => {
        expect(adj.type).toBe(RuleType.Simple);
      });
      
      // Check specific values
      expect((adjacencies[0] as SimpleRule).value).toBe("A");
      expect((adjacencies[1] as SimpleRule).value).toBe("B");
      expect((adjacencies[2] as SimpleRule).value).toBe("C");
      expect((adjacencies[3] as SimpleRule).value).toBe("D");
    });
    
    it("should parse multiple character adjacencies as compound rules", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["A+B", "C+D"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      // Check that we have the expected number of adjacencies
      expect(adjacencies.length).toBe(2);
      
      // Check that each adjacency is a compound rule with the correct values
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound1 = adjacencies[0] as CompoundRule;
      expect(compound1.values.length).toBe(2);
      expect(compound1.values[0].type).toBe(RuleType.Simple);
      expect((compound1.values[0] as SimpleRule).value).toBe("A");
      expect(compound1.values[1].type).toBe(RuleType.Simple);
      expect((compound1.values[1] as SimpleRule).value).toBe("B");
      
      expect(adjacencies[1].type).toBe(RuleType.Compound);
      const compound2 = adjacencies[1] as CompoundRule;
      expect(compound2.values.length).toBe(2);
      expect(compound2.values[0].type).toBe(RuleType.Simple);
      expect((compound2.values[0] as SimpleRule).value).toBe("C");
      expect(compound2.values[1].type).toBe(RuleType.Simple);
      expect((compound2.values[1] as SimpleRule).value).toBe("D");
    });
    
    it("should parse adjacencies with tokens as compound rules", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["(some)+(token)", "(other)+(token)", "CD", "EF"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(4);
      
      // Check the first rule (some+token)
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound = adjacencies[0] as CompoundRule;
      expect(compound.values.length).toBe(2);
      expect(compound.values[0].type).toBe(RuleType.Simple);
      expect((compound.values[0] as SimpleRule).value).toBe("some");
      expect(compound.values[1].type).toBe(RuleType.Simple);
      expect((compound.values[1] as SimpleRule).value).toBe("token");
    });
    
    it("should parse mixed adjacencies with tokens as compound rules", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["A+B+(some)", "C+D", "(other)+(token)", "G+H"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(4);
      
      // Check the first compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound = adjacencies[0] as CompoundRule;
      expect(compound.values.length).toBe(3);
      expect((compound.values[0] as SimpleRule).value).toBe("A");
      expect((compound.values[1] as SimpleRule).value).toBe("B");
      expect((compound.values[2] as SimpleRule).value).toBe("some");
    });
  });
  
  describe("Directional Adjacency Parsing", () => {
    it("should parse simple directional adjacencies", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["[W>B]", "[B>W]", "[W>B]", "[B>W]"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(4);
      
      // Check that each adjacency is a directional rule
      expect(adjacencies[0].type).toBe(RuleType.Directional);
      const dir1 = adjacencies[0] as DirectionalRule;
      expect(dir1.origin.type).toBe(RuleType.Simple);
      expect((dir1.origin as SimpleRule).value).toBe("W");
      expect(dir1.destination.type).toBe(RuleType.Simple);
      expect((dir1.destination as SimpleRule).value).toBe("B");
      
      expect(adjacencies[1].type).toBe(RuleType.Directional);
      const dir2 = adjacencies[1] as DirectionalRule;
      expect(dir2.origin.type).toBe(RuleType.Simple);
      expect((dir2.origin as SimpleRule).value).toBe("B");
      expect(dir2.destination.type).toBe(RuleType.Simple);
      expect((dir2.destination as SimpleRule).value).toBe("W");
    });
    
    it("should parse compound directional adjacencies", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["R+[W>B]+G", "G+[B>W]+R"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(2);
      
      // Check the first compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound = adjacencies[0] as CompoundRule;
      expect(compound.values.length).toBe(3);
      
      // First part should be Simple
      expect(compound.values[0].type).toBe(RuleType.Simple);
      expect((compound.values[0] as SimpleRule).value).toBe("R");
      
      // Middle part should be Directional
      expect(compound.values[1].type).toBe(RuleType.Directional);
      const dir = compound.values[1] as DirectionalRule;
      expect(dir.origin.type).toBe(RuleType.Simple);
      expect((dir.origin as SimpleRule).value).toBe("W");
      expect(dir.destination.type).toBe(RuleType.Simple);
      expect((dir.destination as SimpleRule).value).toBe("B");
      
      // Last part should be Simple
      expect(compound.values[2].type).toBe(RuleType.Simple);
      expect((compound.values[2] as SimpleRule).value).toBe("G");
    });
    
    it("should parse mixed simple and directional adjacencies", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["A+B", "[W>B]", "C+D", "[B>W]"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(4);
      
      // Check the compound rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound = adjacencies[0] as CompoundRule;
      expect(compound.values.length).toBe(2);
      
      // Check the directional rule
      expect(adjacencies[1].type).toBe(RuleType.Directional);
      const dir = adjacencies[1] as DirectionalRule;
      expect(dir.origin.type).toBe(RuleType.Simple);
      expect((dir.origin as SimpleRule).value).toBe("W");
      expect(dir.destination.type).toBe(RuleType.Simple);
      expect((dir.destination as SimpleRule).value).toBe("B");
    });
    
    it("should parse complex mixed adjacencies", () => {
      // Parse individual rules from an array of strings
      const adjacencyStrings = ["R+[W>B]+G", "(token)+A+B", "[W>B]", "C+D+[B>W]+E+F"];
      const adjacencies = adjacencyStrings
        .map(str => parseAdjacencyRule(str))
        .filter((rule): rule is Rule => !(rule instanceof Error));
      
      expect(adjacencies.length).toBe(4);
      
      // Check the first compound rule with embedded directional rule
      expect(adjacencies[0].type).toBe(RuleType.Compound);
      const compound = adjacencies[0] as CompoundRule;
      expect(compound.values.length).toBe(3);
      expect(compound.values[1].type).toBe(RuleType.Directional);
    });
  });
  
  describe("Error Handling", () => {
    it("should handle unmatched brackets gracefully", () => {
      // This should return an error
      const result = parseAdjacencyRule("R+[W>B|B>W");
      expect(result instanceof Error).toBe(true);
    });
    
    it("should handle invalid directional format gracefully", () => {
      expect(() => {
        const result = parseAdjacencyRule("W>>B");
        if (result instanceof Error) throw result;
      }).toThrow();
    });
    
    it("should handle invalid nested rules gracefully", () => {
      expect(() => {
        const result = parseAdjacencyRule("R+[W>B>C]+G");
        if (result instanceof Error) throw result;
      }).toThrow();
    });
  });
  
  describe("Empty Handling", () => {
    it("should handle empty adjacencies", () => {
      const result = parseAdjacencyRule("");
      expect(result instanceof Error).toBe(true);
    });
    
    it("should handle choice rules with pipes correctly", () => {
      // This tests that the pipe character is correctly handled as part of the choice rule syntax
      const result = parseAdjacencyRule("A|B");
      expect(result instanceof Error).toBe(false);
      if (!(result instanceof Error)) {
        expect(result.type).toBe(RuleType.Choice);
        const choice = result as ChoiceRule;
        expect(choice.values.length).toBe(2);
        expect((choice.values[0] as SimpleRule).value).toBe("A");
        expect((choice.values[1] as SimpleRule).value).toBe("B");
      }
    });
  });
});
