/**
 * Benchmark results comparison tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
let historyFile = path.join(__dirname, 'benchmark-results.json');
let limit = 10;

// Process arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--limit' && i + 1 < args.length) {
    limit = parseInt(args[++i], 10);
  } else if (arg === '--help') {
    printHelp();
    process.exit(0);
  } else if (!arg.startsWith('--') && i === 0) {
    // First non-flag argument is assumed to be the history file
    historyFile = arg;
  }
}

function printHelp() {
  console.log(`
WFC Benchmark Results Comparison

Usage:
  node benchmark/compare.js [benchmark-file] [options]

Options:
  --limit <number>   Maximum number of runs to display per configuration (default: 10)
  --help             Show this help

Metrics compared:
  - Execution time (ms)
  - Memory usage (heap size)
  - Collapses, and backtracks
  
Example:
  node benchmark/compare.js benchmark-results.json --limit 5
`);
}

// Format a timestamp to a readable string
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Format file size in a human-readable way
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return 'N/A';
  
  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  let formattedValue;
  
  if (absBytes < 1024) formattedValue = absBytes.toFixed(2) + ' B';
  else if (absBytes < 1024 * 1024) formattedValue = (absBytes / 1024).toFixed(2) + ' KB';
  else formattedValue = (absBytes / (1024 * 1024)).toFixed(2) + ' MB';
  
  return isNegative ? '-' + formattedValue : formattedValue;
}

// Calculate percentage change between two values
function percentChange(oldValue, newValue) {
  if (oldValue === 0) return 'N/A';
  const change = ((newValue - oldValue) / oldValue) * 100;
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${change.toFixed(2)}%`;
}

// Simple table formatter for console output
function formatTable(headers, rows) {
  const columnWidths = headers.map((header, i) => {
    const maxDataWidth = Math.max(...rows.map(row => (row[i]?.toString() || '').length));
    return Math.max(header.length, maxDataWidth);
  });
  
  // Format header
  const headerRow = headers.map((header, i) => header.padEnd(columnWidths[i])).join(' | ');
  const divider = columnWidths.map(width => '-'.repeat(width)).join('-+-');
  
  // Format data rows
  const dataRows = rows.map(row => 
    row.map((cell, i) => (cell || '').toString().padEnd(columnWidths[i])).join(' | ')
  );
  
  return [headerRow, divider, ...dataRows].join('\n');
}

// Display a single benchmark run
function displaySingleRun(run) {
  console.log(`Run timestamp: ${formatTimestamp(run.timestamp)}`);
  console.log(`Success: ${run.results.success ? 'Yes' : 'No'}`);
  console.log(`Execution time: ${run.results.executionTime.toFixed(2)}ms`);
  
  // Display memory usage if available
  console.log(`Memory increase: ${formatBytes(run.results.memory.diff.heapUsed)}`);
  console.log(`Total heap: ${formatBytes(run.results.memory.after.heapUsed)}`);
  
  console.log(`Collapses: ${run.results.collapses}`);
  console.log(`Backtracks: ${run.results.backtracks}`);
}

// Compare multiple benchmark runs
function displayRunComparison(runs) {
  // Check if memory metrics are available in ANY of the runs
  const headers = [
    'Timestamp', 
    'Success', 
    'Exec Time (ms)',
    'Memory Increase',
    'Collapses',
    'Backtracks'
  ];
  
  const rows = runs.map(run => [
    formatTimestamp(run.timestamp).split(',')[0], // Just date part
    run.results.success ? '✓' : '✗',
    run.results.executionTime.toFixed(2),
    formatBytes(run.results.memory.diff.heapUsed),
    run.results.collapses.toString(),
    run.results.backtracks.toString()
  ]);
  
  console.log(formatTable(headers, rows));
}

// Analyze trends in benchmark results
function displayTrends(runs) {
  const first = runs[0];
  const last = runs[runs.length - 1];
  
  // Calculate changes from first to last
  const timeChange = percentChange(first.results.executionTime, last.results.executionTime);
  const collapsesChange = percentChange(first.results.collapses, last.results.collapses);
  const backtracksChange = percentChange(first.results.backtracks, last.results.backtracks);
  const memoryChange = percentChange(first.results.memory.diff.heapUsed, last.results.memory.diff.heapUsed);
  const memoryDetails = ` (${formatBytes(first.results.memory.diff.heapUsed)} → ${formatBytes(last.results.memory.diff.heapUsed)})`;
  
  console.log('\nTrends:');
  console.log(`Execution time: ${timeChange} (${first.results.executionTime.toFixed(2)}ms → ${last.results.executionTime.toFixed(2)}ms)`);
  console.log(`Memory usage: ${memoryChange}${memoryDetails}`);
  console.log(`Collapses: ${collapsesChange} (${first.results.collapses} → ${last.results.collapses})`);
  console.log(`Backtracks: ${backtracksChange} (${first.results.backtracks} → ${last.results.backtracks})`);
  
  // Check for potential issues
  if (last.results.executionTime > first.results.executionTime * 1.2) {
    console.log('⚠️ Performance has degraded significantly');
  } else if (last.results.executionTime < first.results.executionTime * 0.8) {
    console.log('✅ Performance has improved significantly');
  }
  
  // Check memory trends if available
  if (last.results.memory.diff.heapUsed > first.results.memory.diff.heapUsed * 1.2) {
    console.log('⚠️ Memory usage has increased significantly');
  } else if (last.results.memory.diff.heapUsed < first.results.memory.diff.heapUsed * 0.8) {
    console.log('✅ Memory usage has decreased significantly');
  }
  
  if (last.results.backtracks > first.results.backtracks * 1.2) {
    console.log('⚠️ Backtracking has increased significantly');
  } else if (last.results.backtracks < first.results.backtracks * 0.8) {
    console.log('✅ Backtracking has decreased significantly');
  }
}

// Compare benchmark results and display trends
function compareBenchmarks(historyFile, limit = 10) {
  // Load benchmark history
  if (!fs.existsSync(historyFile)) {
    console.error(`Benchmark history file not found: ${historyFile}`);
    return;
  }
  
  const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  
  if (!history || history.length === 0) {
    console.error('No benchmark data found in history file');
    return;
  }
  
  // Group runs by configuration
  const configurations = new Map();
  
  for (const run of history) {
    const config = `${run.config.gridWidth}x${run.config.gridHeight}x${run.config.numTileTypes}`;
    if (!configurations.has(config)) {
      configurations.set(config, []);
    }
    configurations.get(config).push(run);
  }
  
  // Sort runs in each configuration by timestamp
  for (const [_, runs] of configurations) {
    runs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
  
  // Filter configurations to only those with memory metrics if requested
  const configsToShow = [...configurations.entries()];
  let filteredConfigs = configsToShow;
  
  let configCount = 0;
  
  // Display results for each configuration
  for (const [config, runs] of filteredConfigs) {
    configCount++;
    const [width, height, tiles] = config.split('x').map(Number);
    console.log(`\n========== Configuration: ${width}x${height} grid with ${tiles} tile types ==========`);
    
    if (runs.length === 1) {
      console.log('Only one run available for this configuration, no comparison possible.\n');
      displaySingleRun(runs[0]);
      continue;
    }
    
    // Limit the number of runs to compare
    const runsToShow = runs.slice(-Math.min(limit, runs.length));
    displayRunComparison(runsToShow);
    
    // Show trends if there are at least 3 runs
    if (runsToShow.length >= 3) {
      displayTrends(runsToShow);
    }
  }
  
  if (configCount === 0) {
    console.log('No configurations found that match the criteria.');
  }
}

// Run the comparison
compareBenchmarks(historyFile, limit); 