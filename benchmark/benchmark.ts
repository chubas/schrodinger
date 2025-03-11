/**
 * Benchmark script for WFC algorithm using the actual implementation
 *
 * This script:
 * 1. Uses the real WFC implementation from source
 * 2. Measures execution time and operation counts
 * 3. Saves results to a file
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

// Import actual WFC implementation from source
import { WFC, LogLevel } from '../src/WFC.js';
import { SquareGrid } from '../src/Grid.js';
import { TileDefFactory } from '../src/TileDef.js';
import { TileDef } from '../src/TileDef.js';

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
  } else if (arg === '--help') {
    console.log(`
WFC Algorithm Benchmark (TypeScript Version)

Usage:
  npm run benchmark:ts -- [options]

Options:
  --width <number>         Grid width (default: 20)
  --height <number>        Grid height (default: 20)
  --tiles <number>         Number of tile types (default: 8)
  --tiles-file <path>      Path to JSON file containing tile definitions
  --repeat <number>        Number of benchmark iterations (default: 3)
  --output <file>          Output file for results (default: benchmark-results.json)
  --verbose                Enable verbose logging
  --help                   Show this help

Example:
  # Run benchmark with a 30x30 grid and 10 tile types
  npm run benchmark:ts -- --width 30 --height 30 --tiles 10

  # Run benchmark with tiles from a file
  npm run benchmark:ts -- --width 30 --height 30 --tiles-file ./benchmark/tiles/complex-tiles.json
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

// Benchmark function
async function runBenchmark() {
  const results = [];

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
          // All tiles can connect to all other tiles
          const connections = [];
          for (let j = 0; j < numTileTypes; j++) {
            connections.push(`Tile${j}`);
          }
          adjacencies.push(connections.join(","));
        }

        // Create the tile definition
        const tileDef = TileDefFactory.defineTile({
          name: `Tile${t}`,
          weight: 1,
          adjacencies,
          draw: () => {} // Empty draw function
        });

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
    let propagations = 0;
    let backtracks = 0;

    wfc.on('collapse', () => {
      collapses++;
    });

    wfc.on('propagate', () => {
      propagations++;
      if (verbose) {
        console.log('Propagation event received');
      }
    });

    wfc.on('backtrack', () => {
      backtracks++;
    });

    wfc.on('complete', () => {
      for (let [cell, coords] of wfc.iterate()) {
        console.log(`${coords}: ${cell.choices.map(c => c.name).join(', ')}`);
      }
    });

    // Run the WFC algorithm and measure execution time
    const startTime = performance.now();
    let success = false;

    try {
      success = await new Promise<boolean>((resolve) => {
        wfc.on('complete', () => {
          resolve(true);
        });

        wfc.on('error', () => {
          resolve(false);
        });

        wfc.start();
      });
    } catch (error) {
      success = false;
      console.error('WFC failed:', error);
    }

    const endTime = performance.now();
    const executionTime = endTime - startTime;

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
        propagations,
        backtracks
      }
    });
  }

  // Calculate statistics
  const successfulRuns = results.filter(run => run.results.success);
  const successRate = (successfulRuns.length / results.length) * 100;

  const avgExecutionTime = results.reduce((sum, run) => sum + run.results.executionTime, 0) / results.length;
  const avgCollapses = results.reduce((sum, run) => sum + run.results.collapses, 0) / results.length;
  const avgPropagations = results.reduce((sum, run) => sum + run.results.propagations, 0) / results.length;
  const avgBacktracks = results.reduce((sum, run) => sum + run.results.backtracks, 0) / results.length;

  console.log('Results:');
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
  console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
  console.log(`Average collapses: ${avgCollapses.toFixed(2)}`);
  console.log(`Average propagations: ${avgPropagations.toFixed(2)}`);
  console.log(`Average backtracks: ${avgBacktracks.toFixed(2)}`);

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