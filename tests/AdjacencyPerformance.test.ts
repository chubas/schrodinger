import { TileDefFactory } from "../src/TileDef";
import { matchAdjacencies } from "../src/Adjacencies";
import { parseAdjacencyRule, Rule, RuleType } from "../src/AdjacencyGrammar";

// Number of iterations for performance tests
const ITERATIONS = 10000;
// Number of test cases for complex tests
const NUM_TEST_CASES = 1000;

describe("Adjacency Performance", () => {
  /**
   * Helper function to measure execution time
   * @param callback Function to measure
   * @returns Time taken in milliseconds
   */
  function measureExecutionTime(callback: () => void): number {
    const start = performance.now();
    callback();
    const end = performance.now();
    return end - start;
  }

  // Add this helper function after the measureExecutionTime function
  /**
   * Helper function to convert a Rule to a string representation
   * that can be parsed back into a Rule
   */
  function ruleToString(rule: Rule): string {
    switch (rule.type) {
      case RuleType.Simple:
        return (rule as any).value;
      case RuleType.Negated:
        return `^${ruleToString((rule as any).value)}`;
      case RuleType.Directional:
        return `[${ruleToString((rule as any).origin)}>${ruleToString((rule as any).destination)}]`;
      case RuleType.Compound:
        return (rule as any).values.map(ruleToString).join('+');
      case RuleType.Choice:
        return (rule as any).values.map(ruleToString).join('|');
      default:
        return rule.toString();
    }
  }

  describe("Simple Rules", () => {
    it("should match simple adjacencies efficiently", () => {
      // Simple adjacencies like "A" matching "A"
      const simpleTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("A", "A");
        }
      };

      const simpleTime = measureExecutionTime(simpleTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Simple adjacency matching (${ITERATIONS} iterations): ${simpleTime.toFixed(2)}ms`);
    });

    it("should match different simple adjacencies efficiently", () => {
      // Different simple adjacencies like "A" not matching "B"
      const differentTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("A", "B");
        }
      };

      const differentTime = measureExecutionTime(differentTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Different simple adjacency matching (${ITERATIONS} iterations): ${differentTime.toFixed(2)}ms`);
    });
  });

  describe("Directional Rules", () => {
    it("should match directional adjacencies efficiently", () => {
      // Directional adjacencies like "[W>B]" matching "[B>W]"
      const directionalTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("[W>B]", "[B>W]");
        }
      };

      const directionalTime = measureExecutionTime(directionalTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Directional adjacency matching (${ITERATIONS} iterations): ${directionalTime.toFixed(2)}ms`);
    });
  });

  describe("Compound Rules", () => {
    it("should match compound adjacencies efficiently", () => {
      // Compound adjacencies like "A+B" matching "A+B"
      const compoundTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("A+B", "A+B");
        }
      };

      const compoundTime = measureExecutionTime(compoundTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Compound adjacency matching (${ITERATIONS} iterations): ${compoundTime.toFixed(2)}ms`);
    });

    it("should match different compound adjacencies efficiently", () => {
      // Different compound adjacencies like "A+B" not matching "C+D"
      const differentCompoundTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("A+B", "C+D");
        }
      };

      const differentCompoundTime = measureExecutionTime(differentCompoundTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Different compound adjacency matching (${ITERATIONS} iterations): ${differentCompoundTime.toFixed(2)}ms`);
    });
  });

  describe("Choice Rules", () => {
    it("should match choice adjacencies efficiently", () => {
      // Choice adjacencies like "A|B" matching "A"
      const choiceTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies("A|B", "A");
        }
      };

      const choiceTime = measureExecutionTime(choiceTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Choice adjacency matching (${ITERATIONS} iterations): ${choiceTime.toFixed(2)}ms`);
    });
  });

  describe("Complex Rules", () => {
    it("should match complex adjacencies efficiently", () => {
      // Complex adjacencies with nested rules
      const rule1 = "A+[W>B]+C|D";
      const rule2 = "D";
      
      const complexTest = () => {
        for (let i = 0; i < ITERATIONS; i++) {
          matchAdjacencies(rule1, rule2);
        }
      };

      const complexTime = measureExecutionTime(complexTest);
      
      // No strict assertions, just logging performance metrics
      console.log(`Complex adjacency matching (${ITERATIONS} iterations): ${complexTime.toFixed(2)}ms`);
    });
  });

  describe("Performance Comparison", () => {
    it("should compare performance of direct matching vs pre-parsed matching", () => {
      // Generate test cases
      const testCases: [string, string][] = [];
      for (let i = 0; i < NUM_TEST_CASES; i++) {
        testCases.push(["A", "A"]);
      }
      
      // Measure direct matching performance
      const directMatchingTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacencies(adj1, adj2);
        }
      });
      
      // Measure parsing time
      let parsedRules: [Rule, Rule][] = [];
      const parsingTime = measureExecutionTime(() => {
        parsedRules = [];
        for (const [adj1, adj2] of testCases) {
          try {
            const rule1 = parseAdjacencyRule(adj1);
            const rule2 = parseAdjacencyRule(adj2);
            if (!(rule1 instanceof Error) && !(rule2 instanceof Error)) {
              parsedRules.push([rule1, rule2]);
            }
          } catch (e) {
            // Skip invalid rules
          }
        }
      });
      
      // Measure pre-parsed matching performance
      const preParsedMatchingTime = measureExecutionTime(() => {
        for (const [rule1, rule2] of parsedRules) {
          matchAdjacencies(
            ruleToString(rule1),
            ruleToString(rule2)
          );
        }
      });
      
      console.log(`Simple adjacency matching (${NUM_TEST_CASES} pairs):`);
      console.log(`- Direct matching time: ${directMatchingTime.toFixed(2)}ms`);
      console.log(`- Parsing time: ${parsingTime.toFixed(2)}ms`);
      console.log(`- Pre-parsed matching time: ${preParsedMatchingTime.toFixed(2)}ms`);
      
      // We're not making assertions, just logging performance
    });
    
    it("should compare performance with complex adjacencies", () => {
      // Generate test cases with more complex adjacencies
      const testCases: [string, string][] = [];
      for (let i = 0; i < NUM_TEST_CASES; i++) {
        testCases.push(["A+B", "A+B"]);
      }
      
      // Measure direct matching performance
      const directMatchingTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacencies(adj1, adj2);
        }
      });
      
      // Measure parsing time
      let parsedRules: [Rule, Rule][] = [];
      const parsingTime = measureExecutionTime(() => {
        parsedRules = [];
        for (const [adj1, adj2] of testCases) {
          try {
            const rule1 = parseAdjacencyRule(adj1);
            const rule2 = parseAdjacencyRule(adj2);
            if (!(rule1 instanceof Error) && !(rule2 instanceof Error)) {
              parsedRules.push([rule1, rule2]);
            }
          } catch (e) {
            // Skip invalid rules
          }
        }
      });
      
      // Measure pre-parsed matching performance
      const preParsedMatchingTime = measureExecutionTime(() => {
        for (const [rule1, rule2] of parsedRules) {
          matchAdjacencies(
            ruleToString(rule1),
            ruleToString(rule2)
          );
        }
      });
      
      console.log(`Complex adjacency matching (${NUM_TEST_CASES} pairs):`);
      console.log(`- Direct matching time: ${directMatchingTime.toFixed(2)}ms`);
      console.log(`- Parsing time: ${parsingTime.toFixed(2)}ms`);
      console.log(`- Pre-parsed matching time: ${preParsedMatchingTime.toFixed(2)}ms`);
      
      // We're not making assertions, just logging performance
    });
  });
});