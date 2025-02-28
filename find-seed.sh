#!/bin/bash
for i in {1..1000}; do
    echo "> $i"
    ts-node src/WFC.ts $i >/dev/null 2>&1 # Run the program and suppress output
    if [ $? -ne 0 ]; then # Check the exit code
        echo "Program failed for argument: $i"
        exit 0
    fi
done

echo "Program succeeded for all arguments from 1 to 1000"
