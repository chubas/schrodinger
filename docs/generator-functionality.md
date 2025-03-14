# Generator-Based Step-by-Step Execution

This document explains how to use the generator-based functionality in the Wave Function Collapse (WFC) algorithm implementation to control the execution flow step by step.

## Overview

The WFC algorithm implementation now provides a generator-based approach that allows you to:

1. Execute the algorithm step by step
2. Pause at each significant event (collapse or backtrack)
3. Inspect the state of the grid at each step
4. Control the flow of execution manually

This is particularly useful for:
- Visualizing the algorithm's progress in real-time
- Creating interactive demonstrations
- Debugging complex patterns
- Building animations of the collapse process

## Using the Generator

### Basic Usage

Instead of using the `start()` method which runs the algorithm to completion, you can use the `execute()` generator method:

```typescript
import { WFC } from 'schrodinger';
import { SquareGrid } from 'schrodinger';

// Create a WFC instance
const grid = new SquareGrid(10, 10);
const wfc = new WFC(tileDefs, grid);

// Get the generator
const generator = wfc.execute();

// Execute step by step
let step = generator.next();
while (!step.done) {
  // Process the current step
  const result = step.value;
  
  // Check the type of step
  if (result.type === 'collapse') {
    console.log('Collapse event:', result.group);
    // Visualize the collapse
  } else if (result.type === 'backtrack') {
    console.log('Backtrack event:', result.group);
    // Visualize the backtrack
  } else if (result.type === 'complete') {
    console.log('Algorithm completed!');
  }
  
  // Move to the next step
  step = generator.next();
}
```

### Step Result Structure

Each step yields a `StepResult` object with the following structure:

```typescript
type StepResult = {
  type: "collapse" | "backtrack" | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
};
```

- `type`: Indicates the type of step (collapse, backtrack, or complete)
- `group`: For collapse and backtrack steps, contains information about the cells involved
- `affectedCells`: For collapse steps, contains the cells that were affected by the collapse

### With Initial Seed

You can also provide an initial seed to the generator:

```typescript
// Create an initial seed
const initialSeed = [
  { 
    coords: [0, 0], 
    value: tileDefs.find(t => t.name === "Specific Tile") 
  }
];

// Get the generator with the initial seed
const generator = wfc.execute(initialSeed);

// Execute step by step as before
```

## Animation Example

Here's an example of how to use the generator to create an animated visualization:

```typescript
const grid = new SquareGrid(20, 20);
const wfc = new WFC(tileDefs, grid);
const generator = wfc.execute();

function animate() {
  // Process a single step
  const step = generator.next();
  
  if (!step.done) {
    // Render the current state
    renderGrid(wfc);
    
    // Highlight affected cells if it's a collapse step
    if (step.value.type === 'collapse' && step.value.affectedCells) {
      highlightCells(step.value.affectedCells);
    }
    
    // Schedule the next frame
    setTimeout(animate, 200); // 200ms delay between steps
  } else {
    // Algorithm completed
    renderFinalState(wfc);
  }
}

// Start the animation
animate();
```

## Controlling Execution Speed

You can control the execution speed by adding delays between steps:

```typescript
async function controlledExecution() {
  const generator = wfc.execute();
  let step = generator.next();
  
  while (!step.done) {
    // Process the current step
    processStep(step.value);
    
    // Wait for user input or a timer
    await waitForNextStep();
    
    // Move to the next step
    step = generator.next();
  }
}
```

## Events vs. Generator

The WFC class still emits events (`collapse`, `backtrack`, `complete`) for backward compatibility. When using the generator approach, you can choose to listen for these events or just use the yielded step results.

The generator approach gives you more control over the execution flow, while the event-based approach is more suitable for passive observation of the algorithm's progress.

## Performance Considerations

Using the generator approach may have a slight performance overhead compared to running the algorithm to completion with `start()`. If performance is critical and you don't need step-by-step control, consider using the traditional approach.

## Conclusion

The generator-based execution provides a powerful way to control and visualize the WFC algorithm's progress. It opens up new possibilities for interactive demonstrations, educational tools, and debugging complex patterns. 