import { TileDefFactory } from "../src/TileDef";
import { 
  matchAdjacencies, 
  matchAdjacenciesStandard
} from "../src/Adjacencies";

describe("Adjacency Performance Comparison", () => {
  // Helper to measure execution time
  const measureExecutionTime = (fn: () => void): number => {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    // Convert to milliseconds
    return Number(end - start) / 1_000_000;
  };
  
  // Number of test cases to generate
  const NUM_TEST_CASES = 10000;
  
  // Number of times to run each test for more stable results
  const NUM_RUNS = 5;
  
  it("should compare performance for simple adjacencies", () => {
    // Generate a large number of simple adjacency pairs
    const testCases: [string, string][] = [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    for (let i = 0; i < NUM_TEST_CASES; i++) {
      const randomLetters1 = Array.from({ length: 3 }, () => 
        letters.charAt(Math.floor(Math.random() * letters.length))
      ).join("");
      
      const randomLetters2 = Array.from({ length: 3 }, () => 
        letters.charAt(Math.floor(Math.random() * letters.length))
      ).join("");
      
      testCases.push([randomLetters1, randomLetters2]);
    }
    
    let standardTotalTime = 0;
    let binaryTotalTime = 0;
    
    // Run multiple times and take average
    for (let run = 0; run < NUM_RUNS; run++) {
      // Warm up to avoid JIT compilation differences
      for (const [adj1, adj2] of testCases.slice(0, 100)) {
        matchAdjacenciesStandard(adj1, adj2);
        matchAdjacencies(adj1, adj2);
      }
      
      // Measure standard implementation
      const standardTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacenciesStandard(adj1, adj2);
        }
      });
      
      // Measure binary implementation
      const binaryTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacencies(adj1, adj2);
        }
      });
      
      standardTotalTime += standardTime;
      binaryTotalTime += binaryTime;
    }
    
    const standardAvgTime = standardTotalTime / NUM_RUNS;
    const binaryAvgTime = binaryTotalTime / NUM_RUNS;
    
    console.log(`Simple adjacencies - Standard: ${standardAvgTime.toFixed(2)}ms, Binary: ${binaryAvgTime.toFixed(2)}ms, Ratio: ${(standardAvgTime / binaryAvgTime).toFixed(2)}x`);
    
    // We don't actually make assertions here as performance will vary,
    // but we can visually inspect the results in the test output
  });
  
  it("should compare performance for directional adjacencies", () => {
    // Generate a large number of directional adjacency pairs
    const testCases: [string, string][] = [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    for (let i = 0; i < NUM_TEST_CASES; i++) {
      const from1 = letters.charAt(Math.floor(Math.random() * letters.length));
      const to1 = letters.charAt(Math.floor(Math.random() * letters.length));
      
      const from2 = to1; // For matching cases
      const to2 = from1;
      
      testCases.push([`${from1}>${to1}`, `${from2}>${to2}`]);
    }
    
    let standardTotalTime = 0;
    let binaryTotalTime = 0;
    
    // Run multiple times and take average
    for (let run = 0; run < NUM_RUNS; run++) {
      // Warm up
      for (const [adj1, adj2] of testCases.slice(0, 100)) {
        matchAdjacenciesStandard(adj1, adj2);
        matchAdjacencies(adj1, adj2);
      }
      
      // Measure standard implementation
      const standardTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacenciesStandard(adj1, adj2);
        }
      });
      
      // Measure binary implementation
      const binaryTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacencies(adj1, adj2);
        }
      });
      
      standardTotalTime += standardTime;
      binaryTotalTime += binaryTime;
    }
    
    const standardAvgTime = standardTotalTime / NUM_RUNS;
    const binaryAvgTime = binaryTotalTime / NUM_RUNS;
    
    console.log(`Directional adjacencies - Standard: ${standardAvgTime.toFixed(2)}ms, Binary: ${binaryAvgTime.toFixed(2)}ms, Ratio: ${(standardAvgTime / binaryAvgTime).toFixed(2)}x`);
  });
  
  it("should compare performance for compound adjacencies", () => {
    // Generate a large number of compound adjacency pairs
    const testCases: [string, string][] = [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    for (let i = 0; i < NUM_TEST_CASES; i++) {
      const prefix = letters.charAt(Math.floor(Math.random() * letters.length));
      const suffix = letters.charAt(Math.floor(Math.random() * letters.length));
      
      const from1 = letters.charAt(Math.floor(Math.random() * letters.length));
      const to1 = letters.charAt(Math.floor(Math.random() * letters.length));
      
      const from2 = to1; // For matching cases
      const to2 = from1;
      
      testCases.push([`${prefix}[${from1}>${to1}]${suffix}`, `${prefix}[${from2}>${to2}]${suffix}`]);
    }
    
    let standardTotalTime = 0;
    let binaryTotalTime = 0;
    
    // Run multiple times and take average
    for (let run = 0; run < NUM_RUNS; run++) {
      // Warm up
      for (const [adj1, adj2] of testCases.slice(0, 100)) {
        matchAdjacenciesStandard(adj1, adj2);
        matchAdjacencies(adj1, adj2);
      }
      
      // Measure standard implementation
      const standardTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacenciesStandard(adj1, adj2);
        }
      });
      
      // Measure binary implementation
      const binaryTime = measureExecutionTime(() => {
        for (const [adj1, adj2] of testCases) {
          matchAdjacencies(adj1, adj2);
        }
      });
      
      standardTotalTime += standardTime;
      binaryTotalTime += binaryTime;
    }
    
    const standardAvgTime = standardTotalTime / NUM_RUNS;
    const binaryAvgTime = binaryTotalTime / NUM_RUNS;
    
    console.log(`Compound adjacencies - Standard: ${standardAvgTime.toFixed(2)}ms, Binary: ${binaryAvgTime.toFixed(2)}ms, Ratio: ${(standardAvgTime / binaryAvgTime).toFixed(2)}x`);
  });
  
  it("should compare performance for repeated matching operations", () => {
    // This test simulates a real WFC scenario where we match the same adjacencies multiple times
    // In real scenarios, the adjacency strings are parsed once but matched many times
    
    // Create a small set of adjacencies
    const adjacencyStrings = [
      "A", "B", "C", "W>B", "B>W", "C>D", "D>C", "A[B>C]D", "D[C>B]A"
    ];
    
    // Pre-parse the adjacency rules (this happens once in real WFC)
    const adjacencyRules = adjacencyStrings.map(adj => TileDefFactory.parseAdjacencyRule(adj));
    
    // Create all possible pairs of parsed rules (n^2 combinations)
    const rulePairs: [number, number][] = [];
    for (let i = 0; i < adjacencyRules.length; i++) {
      for (let j = 0; j < adjacencyRules.length; j++) {
        rulePairs.push([i, j]);
      }
    }
    
    let standardTotalTime = 0;
    let binaryTotalTime = 0;
    
    // Run multiple times and take average
    for (let run = 0; run < NUM_RUNS; run++) {
      // Warm up
      for (let i = 0; i < 100; i++) {
        const [idx1, idx2] = rulePairs[i % rulePairs.length];
        matchAdjacenciesStandard(adjacencyRules[idx1], adjacencyRules[idx2]);
        matchAdjacencies(adjacencyRules[idx1], adjacencyRules[idx2]);
      }
      
      // For standard implementation, matching pre-parsed rules
      const standardTime = measureExecutionTime(() => {
        // Repeat many times to simulate actual WFC execution
        for (let repeat = 0; repeat < 1000; repeat++) {
          for (const [idx1, idx2] of rulePairs) {
            matchAdjacenciesStandard(adjacencyRules[idx1], adjacencyRules[idx2]);
          }
        }
      });
      
      // For binary implementation, matching pre-parsed rules
      const binaryTime = measureExecutionTime(() => {
        // Repeat many times to simulate actual WFC execution
        for (let repeat = 0; repeat < 1000; repeat++) {
          for (const [idx1, idx2] of rulePairs) {
            matchAdjacencies(adjacencyRules[idx1], adjacencyRules[idx2]);
          }
        }
      });
      
      standardTotalTime += standardTime;
      binaryTotalTime += binaryTime;
    }
    
    const standardAvgTime = standardTotalTime / NUM_RUNS;
    const binaryAvgTime = binaryTotalTime / NUM_RUNS;
    
    console.log(`Repeated matching (${rulePairs.length * 1000} operations) - Standard: ${standardAvgTime.toFixed(2)}ms, Binary: ${binaryAvgTime.toFixed(2)}ms, Ratio: ${(standardAvgTime / binaryAvgTime).toFixed(2)}x`);
  });
}); 