# WFC Algorithm Benchmarking

This directory contains utilities for benchmarking the Wave Function Collapse (WFC) algorithm implementation. The tools allow you to measure performance metrics and track improvements or regressions as you make changes to the algorithm.

## Benchmark Utilities

- `benchmark.js`: Core benchmarking script that simulates the WFC algorithm
- `compare.js`: Tool for comparing benchmark results over time

## Metrics Tracked

The benchmarking tools track several key metrics:

- **Execution Time**: How long the algorithm takes to run
- **Algorithm Operations**:
  - Number of cell collapses
  - Number of constraint propagations
  - Number of backtracking operations
- **Success Rate**: Percentage of runs that complete successfully

## Running Benchmarks

You can run benchmarks using the npm scripts:

```bash
# Run with default settings (20x20 grid, 8 tile types, 3 repetitions)
npm run benchmark:standard

# Run with custom settings
npm run benchmark -- --width 30 --height 30 --tiles 10 --repeat 5

# Run a small benchmark (5x5 grid, 3 tile types, 1 repetition)
npm run benchmark:basic
```

### Command Line Options

- `--width <number>`: Grid width (default: 20)
- `--height <number>`: Grid height (default: 20)
- `--tiles <number>`: Number of tile types (default: 8)
- `--repeat <number>`: Number of benchmark iterations (default: 3)
- `--output <file>`: Output file for results (default: benchmark-results.json)
- `--verbose`: Enable verbose logging
- `--help`: Show help

## Comparing Results

You can compare benchmark results to analyze performance trends:

```bash
# Compare all benchmark runs in the results file
npm run benchmark:compare

# Limit the number of runs shown for each configuration
npm run benchmark:compare -- --limit 5
```

The comparison tool displays:

1. A table of benchmark runs for each configuration
2. Trend analysis showing changes in key metrics
3. Warnings for significant performance degradations

## Example Workflow

1. Run baseline benchmarks:
   ```bash
   npm run benchmark:standard
   ```

2. Make optimizations to the WFC implementation

3. Run the benchmarks again with the same settings:
   ```bash
   npm run benchmark:standard
   ```

4. Compare the results:
   ```bash
   npm run benchmark:compare
   ```

5. Review the metrics to see if your changes improved performance

## Implementation Notes

The benchmark uses a simplified simulation of the WFC algorithm that:

1. Tracks the same key metrics as the real implementation
2. Simulates the core operations (collapse, propagation, backtracking)
3. Uses a similar entropy-based cell selection approach

This approach allows for consistent benchmarking without modifying the source code or creating additional files in the src directory.

## Tips for Effective Benchmarking

- Run benchmarks multiple times and average the results
- Use the same configuration for before/after comparisons
- Consider varying grid sizes and tile counts to test different scenarios
- Save benchmark results before and after major changes
- Look for patterns in the metrics that might indicate bottlenecks 