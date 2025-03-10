/**
 * Benchmark results comparison tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const historyFile = args[0] || path.join(__dirname, 'benchmark-results.json');
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 10;

if (args.includes('--help')) {
  console.log(`
WFC Benchmark Results Comparison

Usage:
  node benchmark/compare.js [benchmark-file] [options]

Options:
  --limit <number>   Maximum number of runs to display per configuration (default: 10)
  --help             Show this help

Example:
  node benchmark/compare.js benchmark-results.json --limit 5
`);
  process.exit(0);
}

// Format a timestamp to a readable string
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Format file size in a human-readable way
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
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
  console.log(`Collapses: ${run.results.collapses}`);
  console.log(`Propagations: ${run.results.propagations}`);
  console.log(`Backtracks: ${run.results.backtracks}`);
}

// Compare multiple benchmark runs
function displayRunComparison(runs) {
  const headers = [
    'Timestamp', 
    'Success', 
    'Exec Time (ms)', 
    'Collapses',
    'Propagations',
    'Backtracks'
  ];
  
  const rows = runs.map(run => [
    formatTimestamp(run.timestamp).split(',')[0], // Just date part
    run.results.success ? '✓' : '✗',
    run.results.executionTime.toFixed(2),
    run.results.collapses.toString(),
    run.results.propagations.toString(),
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
  
  console.log('\nTrends:');
  console.log(`Execution time: ${timeChange} (${first.results.executionTime.toFixed(2)}ms → ${last.results.executionTime.toFixed(2)}ms)`);
  console.log(`Collapses: ${collapsesChange} (${first.results.collapses} → ${last.results.collapses})`);
  console.log(`Backtracks: ${backtracksChange} (${first.results.backtracks} → ${last.results.backtracks})`);
  
  // Check for potential issues
  if (last.results.executionTime > first.results.executionTime * 1.2) {
    console.log('⚠️ Performance has degraded significantly');
  } else if (last.results.executionTime < first.results.executionTime * 0.8) {
    console.log('✅ Performance has improved significantly');
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
  
  if (!history.runs || history.runs.length === 0) {
    console.error('No benchmark data found in history file');
    return;
  }
  
  // Group runs by configuration
  const configurations = new Map();
  
  for (const run of history.runs) {
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
  
  // Display results for each configuration
  for (const [config, runs] of configurations) {
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
}

// Run the comparison
compareBenchmarks(historyFile, limit); 