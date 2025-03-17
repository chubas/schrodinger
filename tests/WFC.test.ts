import { WFC, StepResult } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";
import { pickTiles, DeterministicRNG } from "./util";
import { Rule, RuleType, SimpleRule } from "../src/AdjacencyGrammar";

// Create simple rules for testing
const createSimpleRule = (value: string): SimpleRule => ({
  type: RuleType.Simple,
  value
});

// Mock tiles for testing
const mockTiles: TileDef[] = [
  {
    name: "A",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1")
    ], // All sides connect with "1"
    draw: () => {},
  },
  {
    name: "B",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1")
    ], // All sides connect with "1"
    draw: () => {},
  },
  {
    name: "C",
    adjacencies: [
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1"),
      createSimpleRule("1")
    ], // All sides connect with "1"
    draw: () => {},
  },
];


describe("WFC", () => {
  describe("Basic Functionality", () => {
    it("should initialize with correct grid dimensions", () => {
      const grid = new SquareGrid(3, 3);
      const wfc = new WFC(mockTiles, grid);

      let cellCount = 0;
      for (const [cell] of wfc.iterate()) {
        expect(cell.choices).toHaveLength(mockTiles.length);
        expect(cell.collapsed).toBe(false);
        cellCount++;
      }
      expect(cellCount).toBe(9); // 3x3 grid
    });

    it("should mark cells as collapsed when choices are reduced to one", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(mockTiles, grid);

      // Force collapse first cell
      const firstCell = grid.get([0, 0])!;
      firstCell.choices = [mockTiles[0]];
      firstCell.collapsed = true;

      expect(firstCell.collapsed).toBe(true);
      expect(firstCell.choices).toHaveLength(1);
    });
  });

  it('should throw an error if two tiles have the same name', () => {
    const grid = new SquareGrid(1, 1);
    const tiles = pickTiles(mockTiles, ['A', 'B', 'A']);
    expect(() => new WFC(tiles, grid)).toThrow('Duplicate tile name: A');
  });

  describe("RNG Integration", () => {
    it("should always pick first tile with zero-returning RNG", async () => {
      const grid = new SquareGrid(2, 2);
      const zeroRNG = new DeterministicRNG([0]);
      const wfc = new WFC(mockTiles, grid, { random: zeroRNG });

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          // Since RNG always returns 0, it should always pick the first tile
          expect(group.cells[0].value?.name).toBe(mockTiles[0].name);
          resolve();
        });

        wfc.start();
      });
    });

    it("should use provided RNG sequence", async () => {
      const grid = new SquareGrid(2, 2);
      const sequence = [0.5, 0.2, 0.8]; // Will pick different tiles based on these values
      const sequenceRNG = new DeterministicRNG(sequence);
      const wfc = new WFC(mockTiles, grid, { random: sequenceRNG });

      const collapses: any[] = [];

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          collapses.push(group);
        });

        wfc.on("complete", () => {
          // Verify that different tiles were picked based on the RNG sequence
          expect(collapses.length).toBeGreaterThan(0);
          expect(collapses.some(c => c.cells[0].value?.name === "B" || c.cells[0].value?.name === "C")).toBe(true);
          resolve();
        });

        wfc.start();
      });
    });
  });

  describe("Event Information", () => {
    it("should include value in collapse events", async () => {
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });

      await new Promise<void>((resolve) => {
        wfc.on("collapse", (group) => {
          expect(group.cells).toHaveLength(1);
          const cell = group.cells[0];

          // Verify cell has coords and value properties
          expect(cell).toHaveProperty('coords');
          expect(cell).toHaveProperty('value');

          // Value should be one of our mockTiles
          expect(mockTiles).toContainEqual(cell.value);

          resolve();
        });

        wfc.start();
      });
    });
  });

  describe("Generator Functionality", () => {
    it("should provide generator for step-by-step execution", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });
      const generator = wfc.execute();
      
      // Generator should be an object with next method
      expect(generator.next).toBeDefined();
      expect(typeof generator.next).toBe('function');
    });
    
    it("should yield collapse steps", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });
      const generator = wfc.execute();
      
      // Process a few steps
      const step1 = generator.next();
      
      // First step should be a collapse
      expect(step1.done).toBe(false);
      expect(step1.value).toBeDefined();
      const result = step1.value as StepResult;
      expect(result.type).toBe('collapse');
      expect(result.group).toBeDefined();
      expect(result.affectedCells).toBeDefined();
    });
    
    it("should yield complete step when finished", () => {
      const grid = new SquareGrid(1, 1);
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });
      const generator = wfc.execute();
      
      // Consume all steps until complete
      let lastStep: IteratorResult<StepResult, void> | undefined;
      let step: IteratorResult<StepResult, void>;
      do {
        step = generator.next();
        if (!step.done) {
          lastStep = step;
        }
      } while (!step.done);
      
      // Last non-done step should be a collapse
      expect(lastStep?.value?.type).toBe('complete');
      
      // Final step with done=true indicates completion
      expect(step.done).toBe(true);
    });
    
    it("should allow manual control of collapse process", () => {
      const grid = new SquareGrid(2, 2);
      const collapseEvents: string[] = [];
      const backtrackEvents: string[] = [];
      
      // Create WFC with event listeners
      const wfc = new WFC(mockTiles, grid, { random: new DeterministicRNG([0]) });
      wfc.on('collapse', () => collapseEvents.push('collapse'));
      wfc.on('backtrack', () => backtrackEvents.push('backtrack'));
      
      // Run the generator step by step
      const generator = wfc.execute();
      let steps = 0;
      let step = generator.next();
      
      while (!step.done && steps < 10) {
        steps++;
        // Each step should be a valid StepResult
        if (step.value) {
          expect(['collapse', 'backtrack', 'complete']).toContain(step.value.type);
        }
        
        // Move to next step
        step = generator.next();
      }
      
      // After running some steps, we should have seen some events
      expect(collapseEvents.length).toBeGreaterThan(0);
      
      // Grid should be at least partially collapsed
      let collapsedCount = 0;
      for (const [cell] of wfc.iterate()) {
        if (cell.collapsed) collapsedCount++;
      }
      expect(collapsedCount).toBeGreaterThan(0);
    });
    
    it("should handle initial seed in generator mode", () => {
      const grid = new SquareGrid(2, 2);
      const wfc = new WFC(mockTiles, grid);
      
      // Create initial seed forcing cell [0,0] to be tile A
      const initialSeed = [
        { 
          coords: [0, 0] as [number, number], 
          value: mockTiles.find(t => t.name === "A") 
        }
      ];
      
      const generator = wfc.execute(initialSeed);
      const firstStep = generator.next();
      
      // First step should be a collapse with our seed
      expect(firstStep.value).toBeDefined();
      const result = firstStep.value as StepResult;
      expect(result.type).toBe('collapse');
      expect(result.group?.cells).toEqual(initialSeed);
      
      // Cell [0,0] should be collapsed to tile A
      const cell = grid.get([0, 0])!;
      expect(cell.collapsed).toBe(true);
      expect(cell.choices[0].name).toBe("A");
    });
  });
});