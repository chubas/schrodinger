#!/bin/bash

# Run the benchmark with complex tiles
echo "Running benchmark with complex tiles..."
# Get a timestamp that we can use to name the output file
timestamp=$(date +%Y%m%d%H%M%S)
npm run benchmark -- \
  --width 60 \
  --height 60 \
  --tiles-file ../benchmark/tiles/complex-tiles.json \
  --repeat 10 \
  --output ./benchmark/complex-benchmark-results-${timestamp}.json

# Display the results
echo "Benchmark completed. Results saved to ./benchmark/complex-benchmark-results-${timestamp}.json"

# Now run the compare npm script
npm run benchmark:compare ./benchmark/complex-benchmark-results-${timestamp}.json
