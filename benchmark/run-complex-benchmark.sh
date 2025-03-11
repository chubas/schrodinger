#!/bin/bash

# Run the benchmark with complex tiles
echo "Running benchmark with complex tiles..."
npm run benchmark -- --width 60 --height 60 --tiles-file ../benchmark/tiles/complex-tiles.json --repeat 3 --output ./benchmark/complex-benchmark-results.json

# Display the results
echo "Benchmark completed. Results saved to ./benchmark/complex-benchmark-results.json"