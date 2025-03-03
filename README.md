# Wave Function Collapse Algorithm Implementation

A flexible, engine-agnostic implementation of the Wave Function Collapse (WFC) algorithm for procedural content generation.

## Features

- **Engine Agnostic**: Can be used with any rendering engine (p5.js, Three.js) or even in command-line applications
- **Flexible Space Representation**:
  - Built-in support for 2D and 3D grids
  - Extensible to support irregular grids (hexagonal) or graph-based spaces
  - Custom neighborhood and adjacency rule definitions
- **Advanced Tile Management**:
  - Automatic tile variation generation (rotation, reflection)
  - Complex adjacency rules support (multi-adjacency, tile transformations)
- **Robust Error Handling**:
  - Configurable backtracking system
  - Multiple backtracking strategies (single step, multi-step)
- **Interactive Processing**:
  - Event-based system for state changes
  - Generator functions for step-by-step collapse visualization
  - Real-time debugging and visualization support

## Installation

```bash
npm install @schrodinger/wfc
```

## Basic Usage

Here's a simple example of using the WFC algorithm:

```typescript
import { WFC, SquareGrid, TileDef } from '@schrodinger/wfc';

// Define your tiles with adjacency rules
const tiles: TileDef[] = [
  {
    name: "grass",
    adjacencies: ["grass", "grass", "grass", "grass"], // Can connect to grass on all sides
    draw: () => { /* Your drawing logic */ }
  },
  {
    name: "water",
    adjacencies: ["water", "water", "water", "water"], // Can connect to water on all sides
    draw: () => { /* Your drawing logic */ }
  },
  {
    name: "shore",
    adjacencies: ["grass", "water", "grass", "water"], // Connects grass and water
    draw: () => { /* Your drawing logic */ }
  }
];

// Create a 10x10 grid
const grid = new SquareGrid(10, 10);

// Initialize WFC with tiles and grid
const wfc = new WFC(tiles, grid);

// Optional: Configure WFC options
const options = {
  maxRetries: 100,        // Maximum retries before giving up
  backtrackStep: 1,       // How many steps to backtrack
  logLevel: LogLevel.INFO // Logging verbosity
};

// Listen to events
wfc.on('collapse', (group) => {
  console.log('Cell collapsed:', group.cells[0].coords);
  // Update your visualization here
});

wfc.on('complete', () => {
  console.log('Pattern generation completed!');
  // Final rendering or processing
});

// Start the algorithm
wfc.start();
```

## Events

The WFC implementation emits several events that you can listen to for monitoring and visualization:

### Event Timing and Behavior

The WFC algorithm has two main types of cell state changes:

1. **Direct Collapse**: When a cell is explicitly chosen to collapse (either by entropy selection or initial seed)
2. **Forced Collapse**: When a cell's neighbors constrain it to only one possible choice

These state changes trigger different events:

### `collapse`
Emitted when a cell or group of cells is explicitly chosen for collapse. This happens when:
- The algorithm picks a low-entropy cell to collapse
- An initial seed forces specific cells to collapse
- A backtracking operation selects new values

```typescript
wfc.on('collapse', (group: CollapseGroup) => {
  // group.cells: Array of cells being collapsed
  // - coords: [x, y] coordinates of the cell
  // - value: The TileDef chosen for this cell
  // group.cause: Why these cells were collapsed:
  //   - "initial": From initial seed
  //   - "entropy": Picked due to low entropy
  //   - "propagation": Forced by neighbor constraints
});
```

### `propagate`
Emitted after a collapse when the changes ripple through neighboring cells. This happens when:
- A cell's collapse forces its neighbors to update their possible choices
- Neighbor constraints force a cell to collapse to its only remaining choice

```typescript
wfc.on('propagate', (cells: Cell[]) => {
  // cells: Array of cells affected by propagation, each containing:
  // - coords: [x, y] coordinates
  // - choices: Array of remaining possible TileDefs
  // - collapsed: Whether the cell was forced to collapse
  //   (will be true if choices.length === 1)
});
```

For example, in a simple 2x2 grid:
1. First cell collapses → Triggers `collapse` event
2. Neighbors update possibilities → Triggers `propagate` event
3. If any neighbor is forced to one choice → Another `propagate` event
4. Process continues until no more changes

In a constrained scenario (like a 1xN grid with only horizontal/vertical tiles):
1. First cell collapses to horizontal → `collapse` event
2. Neighbors are forced to horizontal → `propagate` event(s)
3. No additional `collapse` events needed as all cells are forced

### `backtrack`
Emitted when the algorithm needs to backtrack due to an impossible configuration.

```typescript
wfc.on('backtrack', (from: CollapseGroup) => {
  // from: The collapse group that caused the need for backtracking
});
```

### `complete`
Emitted when the entire pattern has been successfully generated.

```typescript
wfc.on('complete', () => {
  // Pattern generation is complete
  // All cells have been collapsed
});
```

### `error`
Emitted when an unrecoverable error occurs during pattern generation.

```typescript
wfc.on('error', (error: Error) => {
  // Handle the error
  console.error('WFC error:', error.message);
});
```

## Advanced Usage

### Custom Initial State

You can seed the WFC with an initial state:

```typescript
const initialSeed = [
  {
    coords: [0, 0],
    value: tiles[0] // Force specific tile at coordinates
  }
];

wfc.start(initialSeed);
```

### Custom RNG

You can provide your own random number generator for deterministic results:

```typescript
class CustomRNG implements RandomLib {
  random(): number {
    // Your custom random implementation
    return Math.random();
  }

  setSeed(seed: string | number): void {
    // Optional seed implementation
  }
}

const wfc = new WFC(tiles, grid, {
  random: new CustomRNG()
});
```

### Visualization Example

Here's how to create a simple visualization using the events:

```typescript
const wfc = new WFC(tiles, grid);

// Track progress
let completedCells = 0;
const totalCells = grid.width * grid.height;

wfc.on('collapse', (group) => {
  completedCells += group.cells.length;
  const progress = (completedCells / totalCells) * 100;

  group.cells.forEach(cell => {
    const { coords, value } = cell;
    // Draw the tile at the coordinates
    value?.draw();
  });
});

wfc.on('backtrack', () => {
  console.log('Backtracking to find valid solution...');
});

wfc.on('complete', () => {
  console.log('Generation complete!');
});

wfc.on('error', (error) => {
  console.error('Failed to generate pattern:', error.message);
});

// Start generation
wfc.start();
```

## Error Handling

The WFC implementation includes robust error handling and backtracking:

```typescript
try {
  wfc.start();
} catch (error) {
  if (error.message.includes('uncollapsable')) {
    console.error('No valid solution exists for this configuration');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.