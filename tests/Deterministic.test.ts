import { WFC, CellCollapse } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { RandomLib } from "../src/RandomLib";

// Simple seeded random number generator using Linear Congruential Generator (LCG)
class SeededRNG implements RandomLib {
  private seed: number;
  private current: number;

  constructor(seed: number = 1) {
    this.seed = seed;
    this.current = seed;
  }

  random(): number {
    // LCG parameters (same as used in many standard libraries)
    // a = 1664525, c = 1013904223, m = 2^32
    this.current = (1664525 * this.current + 1013904223) % (2 ** 32);
    return this.current / (2 ** 32);
  }

  setSeed(seed: string | number): void {
    this.seed = typeof seed === 'string' ? parseInt(seed, 10) : seed;
    this.current = this.seed;
  }
}

// Test tiles that should create a solvable scenario
const deterministicTestTiles = [
  {
    name: "A",
    adjacencies: ['1', '1', '1', '1'],
    draw: () => { },
    weight: 1,
  },
  {
    name: "B",
    adjacencies: ['2', '2', '2', '2'],
    draw: () => { },
    weight: 1,
  },
  {
    name: "C",
    adjacencies: ['1', '2', '1', '2'],
    draw: () => { },
    weight: 2, // Different weight to test weighted selection
  },
];

// Counting RNG class to track number of calls
class CountingRNG implements RandomLib {
  private current: number;
  private callCount: number = 0;

  constructor(seed: number = 1) {
    this.current = seed;
  }

  random(): number {
    this.callCount++;
    this.current = (1664525 * this.current + 1013904223) % Math.pow(2, 32);
    return this.current / Math.pow(2, 32);
  }

  setSeed(seed: number | string): void {
    this.current = typeof seed === 'string' ? this.stringToSeed(seed) : seed;
    this.callCount = 0;
  }

  private stringToSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }
}

describe("WFC Deterministic Behavior", () => {
  describe("Seed Reproducibility", () => {
    it("should produce identical results with the same seed", () => {
      const seed = 12345;
      const gridSize = 3;
      
      // Function to run WFC and capture the final grid state
      const runWFC = () => {
        const grid = new SquareGrid(gridSize, gridSize);
        const rng = new SeededRNG(seed);
        const wfc = new WFC(deterministicTestTiles, grid, { random: rng });
        
        // Run WFC to completion
        wfc.start();
        
        // Capture the final state
        const finalState: string[][] = [];
        for (let y = 0; y < gridSize; y++) {
          finalState[y] = [];
          for (let x = 0; x < gridSize; x++) {
            const cell = grid.get([x, y]);
            finalState[y][x] = cell?.value?.name || 'undefined';
          }
        }
        
        return finalState;
      };

      // Run WFC multiple times with the same seed
      const result1 = runWFC();
      const result2 = runWFC();
      const result3 = runWFC();

      // All results should be identical
      expect(result2).toEqual(result1);
      expect(result3).toEqual(result1);
    });

    it("should produce different results with different seeds", () => {
      const gridSize = 3;
      
      const runWFCWithSeed = (seed: number) => {
        const grid = new SquareGrid(gridSize, gridSize);
        const rng = new SeededRNG(seed);
        const wfc = new WFC(deterministicTestTiles, grid, { random: rng });
        
        wfc.start();
        
        const finalState: string[][] = [];
        for (let y = 0; y < gridSize; y++) {
          finalState[y] = [];
          for (let x = 0; x < gridSize; x++) {
            const cell = grid.get([x, y]);
            finalState[y][x] = cell?.value?.name || 'undefined';
          }
        }
        
        return finalState;
      };

      const result1 = runWFCWithSeed(12345);
      const result2 = runWFCWithSeed(54321);
      const result3 = runWFCWithSeed(99999);

      // Results with different seeds should likely be different
      // (though there's a small chance they could be the same by coincidence)
      const allResultsIdentical = JSON.stringify(result1) === JSON.stringify(result2) && 
                                  JSON.stringify(result2) === JSON.stringify(result3);
      
      expect(allResultsIdentical).toBe(false);
    });

    it("should produce identical weighted choices with the same seed", () => {
      const seed = 42;
      
      const runAndCaptureChoices = () => {
        const grid = new SquareGrid(2, 2);
        const rng = new SeededRNG(seed);
        const wfc = new WFC(deterministicTestTiles, grid, { random: rng });
        
        const choicesMade: string[] = [];
        
        wfc.on("collapse", (group) => {
          group.cells.forEach((cell: CellCollapse) => {
            if (cell.value) {
              choicesMade.push(`${cell.coords[0]},${cell.coords[1]}:${cell.value.name}`);
            }
          });
        });
        
        wfc.start();
        return choicesMade;
      };

      const choices1 = runAndCaptureChoices();
      const choices2 = runAndCaptureChoices();
      const choices3 = runAndCaptureChoices();

      expect(choices2).toEqual(choices1);
      expect(choices3).toEqual(choices1);
    });

    it("should maintain determinism with backtracking scenarios", () => {
      const seed = 777;
      
      // Create a scenario that's likely to require backtracking
      const constrainedTiles = [
        {
          name: "Corner",
          adjacencies: ['edge', 'edge', 'empty', 'empty'],
          draw: () => { },
          weight: 1,
        },
        {
          name: "Edge",
          adjacencies: ['edge', 'empty', 'edge', 'empty'],
          draw: () => { },
          weight: 1,
        },
        {
          name: "Empty",
          adjacencies: ['empty', 'empty', 'empty', 'empty'],
          draw: () => { },
          weight: 3,
        },
      ];

      const runConstrainedWFC = () => {
        const grid = new SquareGrid(4, 4);
        const rng = new SeededRNG(seed);
        const wfc = new WFC(constrainedTiles, grid, { 
          random: rng,
          backtrackStrategy: { 
            name: 'test', 
            maxLevels: 3, 
            exhaustionPolicy: 'deferred' as const, 
            cleanupFrequency: 10 
          }
        });
        
        let backtrackCount = 0;
        wfc.on("backtrack", () => backtrackCount++);
        
        wfc.start();
        
        // Capture final state and metadata
        const finalState: string[][] = [];
        for (let y = 0; y < 4; y++) {
          finalState[y] = [];
          for (let x = 0; x < 4; x++) {
            const cell = grid.get([x, y]);
            finalState[y][x] = cell?.value?.name || 'undefined';
          }
        }
        
        return { finalState, backtrackCount };
      };

      const result1 = runConstrainedWFC();
      const result2 = runConstrainedWFC();
      const result3 = runConstrainedWFC();

      // Final states should be identical
      expect(result2.finalState).toEqual(result1.finalState);
      expect(result3.finalState).toEqual(result1.finalState);
      
      // Backtrack counts should also be identical
      expect(result2.backtrackCount).toBe(result1.backtrackCount);
      expect(result3.backtrackCount).toBe(result1.backtrackCount);
    });
  });

  describe("RNG Integration", () => {
    it("should correctly reset RNG state with setSeed", () => {
      const rng = new SeededRNG(100);
      
      // Generate some numbers
      const firstSequence = [rng.random(), rng.random(), rng.random()];
      
      // Reset seed
      rng.setSeed(100);
      
      // Generate the same sequence again
      const secondSequence = [rng.random(), rng.random(), rng.random()];
      
      expect(secondSequence).toEqual(firstSequence);
    });

    it("should handle string seeds correctly", () => {
      const rng1 = new SeededRNG();
      const rng2 = new SeededRNG();
      
      rng1.setSeed("12345");
      rng2.setSeed(12345);
      
      const sequence1 = [rng1.random(), rng1.random(), rng1.random()];
      const sequence2 = [rng2.random(), rng2.random(), rng2.random()];
      
      expect(sequence2).toEqual(sequence1);
    });
  });

  describe("Predictable RNG Consumption", () => {
    it("should consume exactly 2 RNG calls per collapse step", () => {
      const countingRNG = new CountingRNG(123);
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(deterministicTestTiles, grid, { random: countingRNG });

      const collapseSteps: number[] = [];

      wfc.on("collapse", () => {
        collapseSteps.push(countingRNG.getCallCount());
        countingRNG.resetCallCount();
      });

      wfc.start();

      // Each collapse step should consume exactly 2 RNG calls:
      // 1 for cell selection + 1 for tile selection
      for (const callCount of collapseSteps) {
        expect(callCount).toBe(2);
      }

      // Should have at least 1 collapse event (some cells may auto-collapse via propagation)
      expect(collapseSteps.length).toBeGreaterThan(0);
      
      // Verify all collapse events used exactly 2 RNG calls
      expect(collapseSteps.every(count => count === 2)).toBe(true);
    });

    it("should consume exactly 2 RNG calls even with only one choice", () => {
      // Create tiles where some cells will have only one choice after propagation
      const singleChoiceTiles = [
        {
          name: "Only",
          adjacencies: ['only', 'only', 'only', 'only'],
          draw: () => { },
          weight: 1,
        }
      ];

      const countingRNG = new CountingRNG(456);
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(singleChoiceTiles, grid, { random: countingRNG });

      wfc.on("collapse", () => {
        // Even with only one possible tile, should still consume 2 RNG calls
        expect(countingRNG.getCallCount()).toBe(2);
      });

      wfc.start();
    });

    it("should consume exactly 2 RNG calls even with weighted selection", () => {
      const weightedTiles = [
        {
          name: "Heavy",
          adjacencies: ['any', 'any', 'any', 'any'],
          draw: () => { },
          weight: 10,
        },
        {
          name: "Light", 
          adjacencies: ['any', 'any', 'any', 'any'],
          draw: () => { },
          weight: 1,
        }
      ];

      const countingRNG = new CountingRNG(789);
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(weightedTiles, grid, { random: countingRNG });

      wfc.on("collapse", () => {
        expect(countingRNG.getCallCount()).toBe(2);
      });

      wfc.start();
    });
  });
}); 