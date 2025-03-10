/**
 * Simple benchmark script for WFC algorithm
 * 
 * This script:
 * 1. Builds a simple benchmark that simulates the WFC algorithm
 * 2. Measures execution time and operation counts
 * 3. Saves results to a file
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
let gridWidth = 20;
let gridHeight = 20;
let numTileTypes = 8;
let repeat = 3;
let outputFile = path.join(__dirname, 'benchmark-results.json');
let verbose = false;

// Parse command-line args
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--width' && i + 1 < args.length) {
    gridWidth = parseInt(args[++i], 10);
  } else if (arg === '--height' && i + 1 < args.length) {
    gridHeight = parseInt(args[++i], 10);
  } else if (arg === '--tiles' && i + 1 < args.length) {
    numTileTypes = parseInt(args[++i], 10);
  } else if (arg === '--repeat' && i + 1 < args.length) {
    repeat = parseInt(args[++i], 10);
  } else if (arg === '--output' && i + 1 < args.length) {
    outputFile = args[++i];
  } else if (arg === '--verbose') {
    verbose = true;
  } else if (arg === '--help') {
    console.log(`
WFC Algorithm Benchmark

Usage:
  node benchmark/benchmark.js [options]

Options:
  --width <number>         Grid width (default: 20)
  --height <number>        Grid height (default: 20)
  --tiles <number>         Number of tile types (default: 8)
  --repeat <number>        Number of benchmark iterations (default: 3)
  --output <file>          Output file for results (default: benchmark-results.json)
  --verbose                Enable verbose logging
  --help                   Show this help

Example:
  # Run benchmark with a 30x30 grid and 10 tile types
  node benchmark/benchmark.js --width 30 --height 30 --tiles 10
`);
    process.exit(0);
  }
}

// Print configuration
console.log('Benchmark Configuration:');
console.log(`Grid Size: ${gridWidth}x${gridHeight}`);
console.log(`Tile Types: ${numTileTypes}`);
console.log(`Repetitions: ${repeat}`);
console.log(`Output File: ${outputFile}`);
console.log('');

// Simple grid implementation
class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(null).map((_, i) => ({
      x: i % width,
      y: Math.floor(i / width),
      collapsed: false,
      options: []
    }));
  }
  
  getCell(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.cells[y * this.width + x];
  }
  
  getNeighbors(x, y) {
    const neighbors = [];
    const directions = [
      [0, -1], // up
      [1, 0],  // right
      [0, 1],  // down
      [-1, 0]  // left
    ];
    
    for (const [dx, dy] of directions) {
      const cell = this.getCell(x + dx, y + dy);
      if (cell) {
        neighbors.push(cell);
      }
    }
    
    return neighbors;
  }
}

// Simple WFC implementation for benchmarking
class WFC {
  constructor(grid, numTileTypes) {
    this.grid = grid;
    this.numTileTypes = numTileTypes;
    this.collapses = 0;
    this.propagations = 0;
    this.backtracks = 0;
    
    // Initialize all cells with all possible options
    for (const cell of this.grid.cells) {
      cell.options = Array.from({ length: numTileTypes }, (_, i) => i);
    }
  }
  
  // Find cell with lowest entropy
  findLowestEntropyCell() {
    let minEntropy = Infinity;
    let candidates = [];
    
    for (const cell of this.grid.cells) {
      if (cell.collapsed) continue;
      
      const entropy = cell.options.length;
      if (entropy === 0) continue;
      
      if (entropy < minEntropy) {
        minEntropy = entropy;
        candidates = [cell];
      } else if (entropy === minEntropy) {
        candidates.push(cell);
      }
    }
    
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  
  // Collapse a cell to a single option
  collapseCell(cell) {
    if (cell.options.length === 0) {
      throw new Error('Cannot collapse cell with no options');
    }
    
    const option = cell.options[Math.floor(Math.random() * cell.options.length)];
    cell.options = [option];
    cell.collapsed = true;
    this.collapses++;
    
    return this.propagate(cell);
  }
  
  // Propagate constraints to neighbors
  propagate(cell) {
    const stack = [cell];
    
    while (stack.length > 0) {
      const current = stack.pop();
      const neighbors = this.grid.getNeighbors(current.x, current.y);
      
      for (const neighbor of neighbors) {
        if (neighbor.collapsed) continue;
        
        const originalLength = neighbor.options.length;
        
        // Simulate constraint propagation by randomly removing some options
        // In a real implementation, this would use adjacency rules
        neighbor.options = neighbor.options.filter(() => Math.random() > 0.3);
        
        if (neighbor.options.length === 0) {
          // Contradiction - need to backtrack
          return false;
        }
        
        if (neighbor.options.length !== originalLength) {
          this.propagations++;
          
          if (neighbor.options.length === 1) {
            neighbor.collapsed = true;
            this.collapses++;
            stack.push(neighbor);
          } else {
            stack.push(neighbor);
          }
        }
      }
    }
    
    return true;
  }
  
  // Run the algorithm
  run() {
    let iterations = 0;
    const maxIterations = this.grid.width * this.grid.height * 2; // Reasonable limit
    
    while (iterations < maxIterations) {
      iterations++;
      
      // Find cell with lowest entropy
      const cell = this.findLowestEntropyCell();
      
      // If all cells are collapsed, we're done
      if (!cell) {
        return true;
      }
      
      // Try to collapse the cell
      const success = this.collapseCell(cell);
      
      // If propagation failed, backtrack
      if (!success) {
        this.backtracks++;
        
        // In a real implementation, we would restore from a snapshot
        // For benchmarking, we'll just reset some random cells
        for (let i = 0; i < 3; i++) {
          const randomCell = this.grid.cells[Math.floor(Math.random() * this.grid.cells.length)];
          if (randomCell.collapsed) {
            randomCell.collapsed = false;
            randomCell.options = Array.from({ length: this.numTileTypes }, (_, i) => i);
          }
        }
      }
    }
    
    return false; // Failed to complete within iteration limit
  }
}

// Run the benchmark
async function runBenchmark() {
  const results = [];
  
  console.log(`Running ${repeat} benchmarks with grid size ${gridWidth}x${gridHeight}, ${numTileTypes} tile types`);
  
  for (let i = 0; i < repeat; i++) {
    console.log(`Run ${i + 1}/${repeat}`);
    
    // Create a fresh grid for each run
    const grid = new Grid(gridWidth, gridHeight);
    
    // Create a new WFC instance
    const wfc = new WFC(grid, numTileTypes);
    
    // Start timer
    const startTime = performance.now();
    
    // Run the algorithm
    let success = true;
    try {
      success = wfc.run();
    } catch (error) {
      success = false;
      console.error('WFC failed:', error);
    }
    
    // Record time
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    
    // Save results
    results.push({
      timestamp: new Date().toISOString(),
      config: {
        gridWidth,
        gridHeight,
        numTileTypes
      },
      results: {
        executionTime,
        success,
        collapses: wfc.collapses,
        propagations: wfc.propagations,
        backtracks: wfc.backtracks
      }
    });
  }
  
  // Calculate statistics
  const successfulRuns = results.filter(run => run.results.success);
  const successRate = (successfulRuns.length / results.length) * 100;
  
  const avgExecutionTime = results.reduce((sum, run) => sum + run.results.executionTime, 0) / results.length;
  const avgCollapses = results.reduce((sum, run) => sum + run.results.collapses, 0) / results.length;
  const avgBacktracks = results.reduce((sum, run) => sum + run.results.backtracks, 0) / results.length;
  
  console.log('Results:');
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
  console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
  console.log(`Average collapses: ${avgCollapses.toFixed(2)}`);
  console.log(`Average backtracks: ${avgBacktracks.toFixed(2)}`);
  
  // Save results to file
  try {
    let history = { runs: [] };
    
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf8');
      history = JSON.parse(content);
    }
    
    history.runs.push(...results);
    fs.writeFileSync(outputFile, JSON.stringify(history, null, 2));
    
    console.log(`Results saved to ${outputFile}`);
  } catch (error) {
    console.error('Failed to save results:', error);
  }
}

// Run the benchmark
runBenchmark().catch(console.error); 