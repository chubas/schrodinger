/**
 * CubicHexagonalGrid - A third-party extension for Schrodinger WFC
 * 
 * This demonstrates how to create custom grids that work with the WFC library.
 * Uses cubic coordinates [x, y, z] where x + y + z = 0 for hexagonal grids.
 */

class CubicHexagonalGrid {
  constructor(radius, cells = null) {
    this.cells = new Map();
    this.radius = radius;
    
    // Define adjacency maps for hexagonal grids using cubic coordinates
    this.adjacencyMaps = {
      'hex': [3, 4, 5, 0, 1, 2]  // Each direction maps to its opposite (i+3)%6
    };
    
    if (cells) {
      // Initialize from existing cells
      for (const cell of cells) {
        const key = this.coordToKey(cell.coords);
        this.cells.set(key, {
          ...cell,
          choices: [...cell.choices],
          forbidden: [...cell.forbidden],
        });
      }
    } else {
      // Generate all valid cubic coordinates within radius
      for (let x = -radius; x <= radius; x++) {
        const minY = Math.max(-radius, -x - radius);
        const maxY = Math.min(radius, -x + radius);
        
        for (let y = minY; y <= maxY; y++) {
          const z = -x - y; // Cubic coordinate constraint: x + y + z = 0
          const key = this.coordToKey([x, y, z]);
          this.cells.set(key, {
            choices: [],
            collapsed: false,
            forbidden: [],
            coords: [x, y, z],
          });
        }
      }
    }
  }
  
  coordToKey(coords) {
    return `${coords[0]},${coords[1]},${coords[2]}`;
  }
  
  static fromSnapshot(snapshot) {
    // Calculate radius from the maximum coordinate value
    let maxRadius = 0;
    for (const cell of snapshot.cells) {
      const [x, y, z] = cell.coords;
      const radius = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
      maxRadius = Math.max(maxRadius, radius);
    }
    return new CubicHexagonalGrid(maxRadius, snapshot.cells);
  }
  
  clone() {
    return new CubicHexagonalGrid(this.radius, Array.from(this.cells.values()));
  }
  
  toSnapshot() {
    return {
      cells: Array.from(this.cells.values()).map((cell) => ({
        ...cell,
        choices: [...cell.choices],
        forbidden: [...cell.forbidden],
      })),
      width: this.radius * 2 + 1, // Store radius info in width field
      height: this.radius * 2 + 1,
      depth: this.radius * 2 + 1,
    };
  }
  
  *iterate() {
    for (const [_, cell] of this.cells) {
      yield [cell, cell.coords];
    }
  }
  
  getAdjacencyType(coords) {
    // All hexagonal tiles use the same adjacency type
    return 'hex';
  }
  
  getAdjacencyMap(coords) {
    return this.adjacencyMaps[this.getAdjacencyType(coords)];
  }
  
  getNeighbors(coords) {
    const [x, y, z] = coords;
    
    // Cubic coordinate directions for hexagonal grid
    // Order: +x, +x-y, -y, -x, -x+y, +y (clockwise from right)
    const directions = [
      [1, -1, 0],  // +x direction
      [1, 0, -1],  // +x-y direction  
      [0, 1, -1],  // -y direction
      [-1, 1, 0],  // -x direction
      [-1, 0, 1],  // -x+y direction
      [0, -1, 1]   // +y direction
    ];
    
    return directions.map(([dx, dy, dz]) => {
      const neighborCoords = [x + dx, y + dy, z + dz];
      return this.get(neighborCoords);
    });
  }
  
  get(coords) {
    const key = this.coordToKey(coords);
    return this.cells.get(key) || null;
  }
  
  set(coords, cell) {
    const key = this.coordToKey(coords);
    this.cells.set(key, cell);
  }
  
  getCells() {
    return Array.from(this.cells.values());
  }
}