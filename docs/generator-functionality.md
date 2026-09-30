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
    console.log('Backtrack: ruled out', result.group.cells[0].value.name, 'at', result.group.cells[0].coords);
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
  type: "collapse" | "backtrack" | "restart" | "complete";
  group?: CollapseGroup;
  affectedCells?: Cell[];
  depth?: number;
};
```

- `type`: what just happened: a cell was collapsed, a decision was undone (`backtrack`), the attempt was abandoned and started over from the initial cells (`restart`: every cell except the initial ones is uncollapsed again), or the run finished
- `group`: for `collapse`, the cell and the tile it was given (`group.cells[0].coords` / `.value`); for `backtrack`, the decision that was undone and ruled out. A seeded start yields one `collapse` with `cause: "initial"` covering all the seeded cells.
- `affectedCells`: for `collapse`, the cells that were collapsed
- `depth`: for `backtrack`, how many decisions the current backtrack has undone so far. It is 1 when ruling out the last decision was enough, and grows when that also led to a contradiction and earlier decisions had to be undone as well.

A failed run (no solution, or the backtrack budget ran out) throws from `generator.next()`; see "Errors" in the README.

The generator's second argument, `execute(initialSeed, emitEvents = true)`, turns the events off if you only want the yielded steps.

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

The WFC class also emits events (`collapse`, `backtrack`, `complete`, `error`) while you drive the generator, unless you pass `emitEvents = false`. You can listen for those, use the yielded step results, or both.

The generator approach gives you more control over the execution flow, while the event-based approach is more suitable for passive observation of the algorithm's progress.

## Performance Considerations

`start()` simply drives this same generator to completion, so there is no separate fast path: stepping costs only what you do between steps.

## Conclusion

The generator-based execution provides a powerful way to control and visualize the WFC algorithm's progress. It opens up new possibilities for interactive demonstrations, educational tools, and debugging complex patterns. 