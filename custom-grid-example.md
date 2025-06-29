# Creating Custom Grids for Schrodinger WFC

This example demonstrates how to extend the Schrodinger WFC library with custom grid implementations as **third-party extensions**.

## 🎯 Why Third-Party Grids?

Instead of modifying the core library, you can create custom grid classes that:
- Follow the `Grid` interface specification
- Work seamlessly with the existing WFC system  
- Keep the core library clean and focused
- Allow for specialized coordinate systems and neighbor logic

## 📁 Files in This Example

- **`cubic-hex-grid.js`** - Custom grid implementation using cubic coordinates
- **`hex-wfc-demo.html`** - Interactive demo showing integration with WFC
- **`custom-grid-example.md`** - This documentation

## 🔧 Grid Interface Requirements

To create a custom grid that works with Schrodinger WFC, your class must implement:

### Required Methods
```javascript
class YourCustomGrid {
  // Core iteration and access
  *iterate()                    // Yields [cell, coords] pairs
  get(coords)                   // Returns cell at coordinates or null
  set(coords, cell)            // Sets cell at coordinates
  getCells()                   // Returns array of all cells
  
  // Neighbor relationships  
  getNeighbors(coords)         // Returns array of neighbor cells (or null)
  
  // Adjacency system
  getAdjacencyType(coords)     // Returns string identifying adjacency type
  getAdjacencyMap(coords)      // Returns array mapping directions to opposites
  adjacencyMaps               // Object containing adjacency type mappings
  
  // Serialization (for snapshots/saves)
  clone()                     // Returns deep copy of grid
  toSnapshot()                // Returns serializable snapshot
  static fromSnapshot(data)   // Recreates grid from snapshot
}
```

### Required Properties
```javascript
class YourCustomGrid {
  adjacencyMaps = {
    'your-type': [/* direction mappings */]
  };
}
```

## 🔍 CubicHexagonalGrid Example

Our example implements a hexagonal grid using **cubic coordinates** `[x, y, z]` where `x + y + z = 0`.

### Key Features
- **Cubic coordinate system**: Natural for hexagonal grids
- **6-directional neighbors**: Proper hexagonal adjacency
- **Radius-based generation**: Creates circular hex regions
- **Adjacency mapping**: `'hex'` type with opposite direction mapping

### Coordinate System
```
Cubic coordinates maintain: x + y + z = 0

   +y
    |
+z --+-- -z  
    |
   -y
   
Center: [0, 0, 0]
Neighbors: [1,-1,0], [1,0,-1], [0,1,-1], [-1,1,0], [-1,0,1], [0,-1,1]
```

### Usage with WFC
```javascript
// 1. Create custom grid
const grid = new CubicHexagonalGrid(radius);

// 2. Define tiles with 6-sided adjacencies  
const tiles = [
  new Schrodinger.TileDef('tile-a', ['adj0', 'adj1', 'adj2', 'adj3', 'adj4', 'adj5']),
  // ... more tiles
];

// 3. Initialize WFC with custom grid
const wfc = new Schrodinger.WFC(tiles, grid, options);

// 4. WFC works normally!
wfc.collapse();
```

## 🚀 Testing Your Custom Grid

The demo file `hex-wfc-demo.html` provides an interactive way to:
1. Create and inspect your custom grid
2. Set up simple tiles
3. Initialize WFC with the custom grid
4. Verify all functionality works correctly

## 📋 Implementation Checklist

When creating your own custom grid:

- [ ] Implement all required interface methods
- [ ] Define proper adjacency mappings  
- [ ] Handle coordinate-to-key conversion consistently
- [ ] Implement proper neighbor logic for your coordinate system
- [ ] Test serialization (clone/toSnapshot/fromSnapshot)
- [ ] Ensure adjacency directions map to their opposites correctly
- [ ] Test with WFC to verify everything works

## 🎨 Beyond Hexagonal Grids

This approach works for any coordinate system:
- **Triangular grids** with 3-coordinate systems
- **3D cubic grids** with volumetric coordinates  
- **Irregular grids** with custom neighbor relationships
- **Multi-layered grids** with z-axis or layer coordinates
- **Non-euclidean grids** with curved or twisted topologies

The key is following the interface and providing proper neighbor/adjacency logic for your specific coordinate system. 