/**
 * Benchmark script for WFC algorithm using the actual implementation
 *
 * This script:
 * 1. Uses the real WFC implementation from source
 * 2. Measures execution time, memory usage, and operation counts
 * 3. Saves results to a file
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import os from 'os';

// Import actual WFC implementation from source
import { WFC, LogLevel } from '../src/WFC.js';
import { SquareGrid } from '../src/Grid.js';
import { TileDefFactory } from '../src/TileDef.js';
import { TileDef } from '../src/TileDef.js';
import { RuleType, SimpleRule } from '../src/AdjacencyGrammar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
let gridWidth = 20;
let gridHeight = 20;
let numTileTypes = 8;
let repeat = 3;
let outputFile = path.join(__dirname, '..', 'benchmark', 'benchmark-results.json');
let verbose = false;
let tilesFile = '';
let details = false;

// Parse command-line args
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--width' && i + 1 < args.length) {
    gridWidth = parseInt(args[++i], 10);
  } else if (arg === '--height' && i + 1 < args.length) {
    gridHeight = parseInt(args[++i], 10);
  } else if (arg === '--tiles' && i + 1 < args.length) {
    numTileTypes = parseInt(args[++i], 10);
  } else if (arg === '--tiles-file' && i + 1 < args.length) {
    tilesFile = args[++i];
  } else if (arg === '--repeat' && i + 1 < args.length) {
    repeat = parseInt(args[++i], 10);
  } else if (arg === '--output' && i + 1 < args.length) {
    outputFile = args[++i];
  } else if (arg === '--verbose') {
    verbose = true;
  } else if (arg === '--details') {
    details = true;
  } else if (arg === '--help') {
    console.log(`
WFC Algorithm Benchmark (TypeScript Version)

Usage:
  npm run benchmark -- [options]

Options:
  --width <number>         Grid width (default: 20)
  --height <number>        Grid height (default: 20)
  --tiles <number>         Number of tile types (default: 8)
  --tiles-file <path>      Path to JSON file containing tile definitions
  --repeat <number>        Number of benchmark iterations (default: 3)
  --output <file>          Output file for results (default: benchmark-results.json)
  --verbose                Enable verbose logging
  --details                Enable detailed results
  --help                   Show this help

Metrics measured:
  - Execution time (ms)
  - Memory usage (heap allocated)
  - Number of collapses, and backtracks

Example:
  # Run benchmark with a 30x30 grid and 10 tile types
  npm run benchmark -- --width 30 --height 30 --tiles 10

  # Run benchmark with tiles from a file
  npm run benchmark -- --width 30 --height 30 --tiles-file ./benchmark/tiles/complex-tiles.json
`);
    process.exit(0);
  }
}

// Print configuration
console.log('Benchmark Configuration:');
console.log(`Grid Size: ${gridWidth}x${gridHeight}`);
if (tilesFile) {
  console.log(`Tiles File: ${tilesFile}`);
} else {
  console.log(`Tile Types: ${numTileTypes}`);
}
console.log(`Repetitions: ${repeat}`);
console.log(`Output File: ${outputFile}`);
console.log('');

/**
 * Load tiles from a JSON file
 * @param filePath Path to the JSON file containing tile definitions
 * @returns Array of TileDef objects
 */
function loadTilesFromFile(filePath: string): TileDef[] {
  try {
    // Resolve the file path
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(__dirname, '..', filePath);

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const tileData = JSON.parse(fileContent);

    // Convert the loaded data to TileDef objects
    return tileData.map((tile: any) => {
      return {
        name: tile.name,
        adjacencies: tile.adjacencies,
        weight: tile.weight || 1,
        rotation: tile.rotation || 0,
        reflection: tile.reflection || 0,
        draw: () => {} // Empty draw function
      };
    });
  } catch (error) {
    console.error(`Error loading tiles from file: ${error}`);
    process.exit(1);
  }
}

/**
 * Format memory usage in a human-readable format
 * @param bytes The number of bytes
 * @returns Formatted string (e.g., "1.23 MB")
 */
function formatMemory(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Get detailed memory usage from Node.js process
 * @returns Object with memory usage metrics
 */
function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: memoryUsage.rss, // Resident Set Size - total memory allocated for the process execution
    heapTotal: memoryUsage.heapTotal, // V8's memory usage
    heapUsed: memoryUsage.heapUsed, // Actual memory used during execution
    external: memoryUsage.external, // Memory used by C++ objects bound to JavaScript objects
    arrayBuffers: memoryUsage.arrayBuffers || 0 // Memory used by ArrayBuffers and SharedArrayBuffers
  };
}

// Benchmark function
async function runBenchmark(): Promise<boolean> {
  const results: any[] = [];

  if (tilesFile) {
    console.log(`Running ${repeat} benchmarks with grid size ${gridWidth}x${gridHeight}, tiles from ${tilesFile}`);
  } else {
    console.log(`Running ${repeat} benchmarks with grid size ${gridWidth}x${gridHeight}, ${numTileTypes} tile types`);
  }

  for (let i = 0; i < repeat; i++) {
    console.log(`Run ${i + 1}/${repeat}`);

    // Create tile definitions
    let tileDefs: TileDef[] = [];

    if (tilesFile) {
      // Load tiles from file
      tileDefs = loadTilesFromFile(tilesFile);
      console.log(`Loaded ${tileDefs.length} tiles from ${tilesFile}`);
    } else {
      // Create generated tiles
      for (let t = 0; t < numTileTypes; t++) {
        // Create simple tile with connections to all other tiles
        const adjacencies = [];

        // Add adjacency rules for each side (top, right, bottom, left)
        for (let side = 0; side < 4; side++) {
          // Create rule objects directly instead of trying to parse comma-separated strings
          const rule: SimpleRule = {
            type: RuleType.Simple,
            value: Array.from({ length: numTileTypes }, (_, j) => `Tile${j}`).join(",")
          };
          adjacencies.push(rule);
        }

        // Create the tile definition
        const tileDef = TileDefFactory.defineTile(
          `Tile${t}`,
          adjacencies,
          () => {}, // Empty draw function
          1, // weight
          0, // rotation
          false // reflection
        );

        tileDefs.push(tileDef);
      }
    }

    // Create grid
    const grid = new SquareGrid(gridWidth, gridHeight);

    // Create WFC instance
    const wfc = new WFC(tileDefs, grid, {
      logLevel: verbose ? LogLevel.DEBUG : LogLevel.NONE,
      maxRetries: 5,
      backtrackStep: 3
    });

    // Track metrics
    let collapses = 0;
    let backtracks = 0;
    let snapshotCount = 0;

    // Initialize memory tracking
    const memoryBefore = getMemoryUsage();
    let peakRss = memoryBefore.rss;
    let peakHeapTotal = memoryBefore.heapTotal;
    let peakHeapUsed = memoryBefore.heapUsed;
    let peakExternal = memoryBefore.external;
    let peakArrayBuffers = memoryBefore.arrayBuffers;
    let memorySamplesCount = 0;

    // Track cumulative memory for calculating averages
    let cumulativeRss = 0;
    let cumulativeHeapUsed = 0;

    const trackMemory = () => {
      const memory = getMemoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakHeapTotal = Math.max(peakHeapTotal, memory.heapTotal);
      peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed);
      peakExternal = Math.max(peakExternal, memory.external);
      peakArrayBuffers = Math.max(peakArrayBuffers, memory.arrayBuffers);

      // Add to cumulative totals for average calculation
      cumulativeRss += memory.rss;
      cumulativeHeapUsed += memory.heapUsed;

      memorySamplesCount++;
    };

    // Start tracking memory at 1ms intervals
    const memoryTrackingInterval = setInterval(trackMemory, 1);

    // Add additional memory tracking hooks
    wfc.on('collapse', () => {
      collapses++;
      // Sample memory on each collapse operation
      trackMemory();
    });

    wfc.on('backtrack', () => {
      backtracks++;
      // Sample memory on each backtrack operation
      trackMemory();
    });

    // Add event listener for snapshots
    wfc.on('snapshot', () => {
      snapshotCount++;
      // Sample memory on each snapshot
      trackMemory();
      if (verbose && snapshotCount % 10 === 0) {
        console.log(`Snapshot count: ${snapshotCount}`);
      }
    });

    // Run the WFC algorithm and measure execution time
    const startTime = performance.now();
    let success = false;

    try {
      success = await new Promise<boolean>((resolve) => {
        wfc.on('complete', () => {
          // Sample memory at completion
          trackMemory();
          resolve(true);
        });

        wfc.on('error', () => {
          // Sample memory on error
          trackMemory();
          resolve(false);
        });

        // Sample memory before starting
        trackMemory();
        wfc.start();
      });
    } catch (error) {
      success = false;
      console.error('WFC failed:', error);
    }

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Stop memory tracking
    clearInterval(memoryTrackingInterval);

    // Take a final memory sample
    trackMemory();

    const memoryAfter = getMemoryUsage();

    // Calculate average memory usage
    const avgRss = memorySamplesCount > 0 ? cumulativeRss / memorySamplesCount : 0;
    const avgHeapUsed = memorySamplesCount > 0 ? cumulativeHeapUsed / memorySamplesCount : 0;

    if (verbose) {
      console.log(`Memory after execution: ${formatMemory(memoryAfter.rss)}`);
      console.log(`Peak RSS usage: ${formatMemory(peakRss)}`);
      console.log(`Peak heap usage: ${formatMemory(peakHeapUsed)}`);
      console.log(`Average RSS usage: ${formatMemory(avgRss)}`);
      console.log(`Average heap usage: ${formatMemory(avgHeapUsed)}`);
      console.log(`Memory increase (end RSS): ${formatMemory(memoryAfter.rss - memoryBefore.rss)}`);
      console.log(`Memory increase (peak RSS): ${formatMemory(peakRss - memoryBefore.rss)}`);
      console.log(`Memory increase (end heap): ${formatMemory(memoryAfter.heapUsed - memoryBefore.heapUsed)}`);
      console.log(`Memory increase (peak heap): ${formatMemory(peakHeapUsed - memoryBefore.heapUsed)}`);
      console.log(`Memory samples collected: ${memorySamplesCount}`);
      console.log(`Total snapshots created: ${snapshotCount}`);
    }

    // Store results
    results.push({
      timestamp: new Date().toISOString(),
      config: {
        gridWidth,
        gridHeight,
        numTileTypes: tileDefs.length,
        tilesSource: tilesFile || 'generated'
      },
      results: {
        executionTime,
        success,
        collapses,
        backtracks,
        snapshots: snapshotCount,
        memorySamples: memorySamplesCount,
        memory: {
          before: memoryBefore,
          after: memoryAfter,
          peak: {
            rss: peakRss,
            heapTotal: peakHeapTotal,
            heapUsed: peakHeapUsed,
            external: peakExternal,
            arrayBuffers: peakArrayBuffers
          },
          average: {
            rss: avgRss,
            heapUsed: avgHeapUsed
          },
          diff: {
            rss: memoryAfter.rss - memoryBefore.rss,
            heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
            heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
            external: memoryAfter.external - memoryBefore.external,
            arrayBuffers: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers
          },
          peakDiff: {
            rss: peakRss - memoryBefore.rss,
            heapTotal: peakHeapTotal - memoryBefore.heapTotal,
            heapUsed: peakHeapUsed - memoryBefore.heapUsed,
            external: peakExternal - memoryBefore.external,
            arrayBuffers: peakArrayBuffers - memoryBefore.arrayBuffers
          }
        }
      }
    });
  }

  // Calculate statistics
  const successfulRuns = results.filter(run => run.results.success);
  const successRate = (successfulRuns.length / results.length) * 100;

  const avgExecutionTime = results.reduce((sum, run) => sum + run.results.executionTime, 0) / results.length;
  const avgCollapses = results.reduce((sum, run) => sum + run.results.collapses, 0) / results.length;
  const avgBacktracks = results.reduce((sum, run) => sum + run.results.backtracks, 0) / results.length;
  const avgSnapshots = results.reduce((sum, run) => sum + (run.results.snapshots || 0), 0) / results.length;

  // Calculate average memory metrics
  const avgMemoryIncrease = {
    rss: results.reduce((sum, run) => sum + run.results.memory.diff.rss, 0) / results.length,
    heapUsed: results.reduce((sum, run) => sum + run.results.memory.diff.heapUsed, 0) / results.length
  };

  console.log('Results:');
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
  console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
  console.log(`Average memory increase: ${formatMemory(avgMemoryIncrease.heapUsed)}`);
  console.log(`Average collapses: ${avgCollapses.toFixed(2)}`);
  console.log(`Average backtracks: ${avgBacktracks.toFixed(2)}`);
  console.log(`Average snapshots: ${avgSnapshots.toFixed(2)}`);

  // Save results to file
  const existingResults = fs.existsSync(outputFile)
    ? JSON.parse(fs.readFileSync(outputFile, 'utf8'))
    : [];

  const allResults = [...existingResults, ...results];

  fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
  console.log(`Results saved to ${outputFile}`);

  // Return success status
  return successRate === 100;
}

// Run the benchmark
runBenchmark()
  .then(success => {
    console.log(`Benchmark completed ${success ? 'successfully' : 'with failures'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });