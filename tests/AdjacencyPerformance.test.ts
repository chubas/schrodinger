import { matchAdjacencies, matchAdjacencyStrings } from "../src/Adjacencies";
import { parseAdjacencyRule, Rule, RuleType } from "../src/AdjacencyGrammar";

// Performance measurement helpers
function measureExecutionTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

describe("Adjacency Performance", () => {
  // Set iterations for performance tests
  const ITERATIONS = 10000;

  describe("Adjacency Matching Performance", () => {
    describe("Simple Rules", () => {
      it("should measure simple adjacency matching performance", () => {
        // Benchmark simple adjacency matching
        const simpleTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("A", "A");
          }
        };
        
        const simpleTime = measureExecutionTime(simpleTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Simple adjacency matching (${ITERATIONS} iterations): ${simpleTime.toFixed(2)}ms`);
      });

      it("should measure different simple adjacency matching performance", () => {
        // Benchmark simple adjacency matching with different values
        const differentTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("A", "B");
          }
        };
        
        const differentTime = measureExecutionTime(differentTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Different simple adjacency matching (${ITERATIONS} iterations): ${differentTime.toFixed(2)}ms`);
      });
    });

    describe("Directional Rules", () => {
      it("should measure directional adjacency matching performance", () => {
        // Benchmark directional adjacency matching
        const directionalTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("[W>B]", "[B>W]");
          }
        };
        
        const directionalTime = measureExecutionTime(directionalTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Directional adjacency matching (${ITERATIONS} iterations): ${directionalTime.toFixed(2)}ms`);
      });
    });

    describe("Compound Rules", () => {
      it("should measure compound adjacency matching performance", () => {
        // Benchmark compound adjacency matching
        const compoundTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("A+B", "A+B");
          }
        };
        
        const compoundTime = measureExecutionTime(compoundTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Compound adjacency matching (${ITERATIONS} iterations): ${compoundTime.toFixed(2)}ms`);
      });

      it("should measure different compound adjacency matching performance", () => {
        // Benchmark compound adjacency matching with different values
        const differentCompoundTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("A+B", "C+D");
          }
        };
        
        const differentCompoundTime = measureExecutionTime(differentCompoundTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Different compound adjacency matching (${ITERATIONS} iterations): ${differentCompoundTime.toFixed(2)}ms`);
      });
    });

    describe("Choice Rules", () => {
      it("should measure choice adjacency matching performance", () => {
        // Benchmark choice adjacency matching
        const choiceTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            matchAdjacencyStrings("A|B", "A");
          }
        };
        
        const choiceTime = measureExecutionTime(choiceTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Choice adjacency matching (${ITERATIONS} iterations): ${choiceTime.toFixed(2)}ms`);
      });
    });

    describe("Complex Rules", () => {
      it("should measure complex adjacency matching performance", () => {
        // Benchmark complex adjacency matching
        const complexTest = () => {
          for (let i = 0; i < ITERATIONS; i++) {
            const rule1 = parseAdjacencyRule("[W>B]+A|C");
            const rule2 = parseAdjacencyRule("[B>W]+A|D");
            
            // Only use matchAdjacencies with parsed Rule objects
            if (!(rule1 instanceof Error) && !(rule2 instanceof Error)) {
              matchAdjacencies(rule1, rule2);
            }
          }
        };
        
        const complexTime = measureExecutionTime(complexTest);
        
        // No strict assertions, just logging performance metrics
        console.log(`Complex adjacency matching (${ITERATIONS} iterations): ${complexTime.toFixed(2)}ms`);
      });
    });

    describe("String vs Parsed Comparison", () => {
      it("should compare direct string vs parsed rule performance (simple rules)", () => {
        console.log("Simple adjacency matching (1000 pairs):");
        
        // Generate 1000 pairs of simple adjacency rules
        const pairs: [string, string][] = [];
        for (let i = 0; i < 1000; i++) {
          pairs.push(["A", "A"]);
        }
        
        // Measure direct string matching
        const directStart = performance.now();
        for (const [adj1, adj2] of pairs) {
          matchAdjacencyStrings(adj1, adj2);
        }
        const directEnd = performance.now();
        console.log(`- Direct matching time: ${(directEnd - directStart).toFixed(2)}ms`);
        
        // Measure parsing time
        const parseStart = performance.now();
        const parsedPairs: [Rule, Rule][] = [];
        for (const [adj1, adj2] of pairs) {
          const rule1 = parseAdjacencyRule(adj1);
          const rule2 = parseAdjacencyRule(adj2);
          if (!(rule1 instanceof Error) && !(rule2 instanceof Error)) {
            parsedPairs.push([rule1, rule2]);
          }
        }
        const parseEnd = performance.now();
        console.log(`- Parsing time: ${(parseEnd - parseStart).toFixed(2)}ms`);
        
        // Measure pre-parsed matching
        const preparsedStart = performance.now();
        for (const [rule1, rule2] of parsedPairs) {
          matchAdjacencies(rule1, rule2);
        }
        const preparsedEnd = performance.now();
        console.log(`- Pre-parsed matching time: ${(preparsedEnd - preparsedStart).toFixed(2)}ms`);
      });

      it("should compare direct string vs parsed rule performance (complex rules)", () => {
        console.log("Complex adjacency matching (1000 pairs):");
        
        // Generate 1000 pairs of complex adjacency rules
        const pairs: [string, string][] = [];
        for (let i = 0; i < 1000; i++) {
          pairs.push(["[A>B]+C|^D", "[B>A]+C|^E"]);
        }
        
        // Measure direct string matching
        const directStart = performance.now();
        for (const [adj1, adj2] of pairs) {
          matchAdjacencyStrings(adj1, adj2);
        }
        const directEnd = performance.now();
        console.log(`- Direct matching time: ${(directEnd - directStart).toFixed(2)}ms`);
        
        // Measure parsing time
        const parseStart = performance.now();
        const parsedPairs: [Rule, Rule][] = [];
        for (const [adj1, adj2] of pairs) {
          const rule1 = parseAdjacencyRule(adj1);
          const rule2 = parseAdjacencyRule(adj2);
          if (!(rule1 instanceof Error) && !(rule2 instanceof Error)) {
            parsedPairs.push([rule1, rule2]);
          }
        }
        const parseEnd = performance.now();
        console.log(`- Parsing time: ${(parseEnd - parseStart).toFixed(2)}ms`);
        
        // Measure pre-parsed matching
        const preparsedStart = performance.now();
        for (const [rule1, rule2] of parsedPairs) {
          matchAdjacencies(rule1, rule2);
        }
        const preparsedEnd = performance.now();
        console.log(`- Pre-parsed matching time: ${(preparsedEnd - preparsedStart).toFixed(2)}ms`);
      });
    });
  });
});