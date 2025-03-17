import { SquareGrid, TriangularGrid, HexagonalGrid } from '../src/Grid.js';
import { TileDef, TileDefFactory } from '../src/TileDef.js';
import { AdjacencyPrecomputer, PrecomputedAdjacencies } from '../src/PrecomputedAdjacencies.js';
import { WFC } from '../src/WFC.js';

describe('PrecomputedAdjacencies', () => {
  // Helper function to create simple tiles
  function createTiles(): TileDef[] {
    // Create tiles with simple adjacency rules
    const tileA = TileDefFactory.defineTile(
      'A',
      ['A', 'A', 'A', 'A'], // Can connect to itself in all directions
    );
    
    const tileB = TileDefFactory.defineTile(
      'B',
      ['B', 'B', 'B', 'B'], // Can connect to itself in all directions
    );
    
    const tileC = TileDefFactory.defineTile(
      'C',
      ['A', 'B', 'C', 'A'], // Mixed connections
    );
    
    return [tileA, tileB, tileC];
  }
  
  describe('SquareGrid Precomputed Adjacencies', () => {
    it('should correctly precompute adjacencies for square grid', () => {
      const grid = new SquareGrid(3, 3);
      const tiles = createTiles();
      
      const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);
      
      // Check structure
      expect(precomputed).toHaveProperty('A');
      expect(precomputed.A).toHaveProperty('square');
      expect(precomputed.A.square).toHaveProperty('0'); // Top direction
      
      // Check specific adjacencies
      // Tile A can connect to itself in all directions
      expect(precomputed.A.square[0]).toContain('A');
      expect(precomputed.A.square[1]).toContain('A');
      expect(precomputed.A.square[2]).toContain('A');
      expect(precomputed.A.square[3]).toContain('A');
      
      // Tile C can connect to A in top direction
      expect(precomputed.C.square[0]).toContain('A');
      
      // Tile C can connect to B in right direction
      expect(precomputed.C.square[1]).toContain('B');
    });
    
    it('should correctly serialize and deserialize precomputed adjacencies', () => {
      const grid = new SquareGrid(3, 3);
      const tiles = createTiles();
      
      const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);
      const serialized = AdjacencyPrecomputer.serialize(precomputed);
      const deserialized = AdjacencyPrecomputer.deserialize(serialized);
      
      // Check that deserialized matches original
      expect(deserialized).toEqual(precomputed);
    });
    
    it('should use precomputed adjacencies in WFC', () => {
      const grid = new SquareGrid(3, 3);
      const tiles = createTiles();
      
      const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);
      
      const wfc = new WFC(tiles, grid);
      wfc.setPrecomputedAdjacencies(precomputed);
      
      // Test canBeAdjacent method with precomputed adjacencies
      expect(wfc.canBeAdjacent(tiles[0], [1, 1], 0, tiles[0])).toBe(true); // A can connect to A in top direction
      expect(wfc.canBeAdjacent(tiles[2], [1, 1], 0, tiles[0])).toBe(true); // C can connect to A in top direction
      expect(wfc.canBeAdjacent(tiles[2], [1, 1], 0, tiles[1])).toBe(false); // C cannot connect to B in top direction
    });
  });
  
  describe('TriangularGrid Precomputed Adjacencies', () => {
    it('should correctly precompute adjacencies for triangular grid', () => {
      const grid = new TriangularGrid(3, 3);
      
      // Create tiles with 3 adjacency rules for triangular grid
      const tileA = TileDefFactory.defineTile(
        'A',
        ['A', 'A', 'A'], // Can connect to itself in all directions
        () => {},
        1
      );
      
      const tileB = TileDefFactory.defineTile(
        'B',
        ['B', 'B', 'B'], // Can connect to itself in all directions
        () => {},
        1
      );
      
      const tiles = [tileA, tileB];
      
      const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);
      
      // Check structure - should have both 'up' and 'down' types
      expect(precomputed).toHaveProperty('A');
      expect(precomputed.A).toHaveProperty('up');
      expect(precomputed.A).toHaveProperty('down');
      
      // Check specific adjacencies for up triangles
      expect(precomputed.A.up[0]).toContain('A'); // topLeft
      expect(precomputed.A.up[1]).toContain('A'); // topRight
      expect(precomputed.A.up[2]).toContain('A'); // bottom
      
      // Check specific adjacencies for down triangles
      expect(precomputed.A.down[0]).toContain('A'); // bottomLeft
      expect(precomputed.A.down[1]).toContain('A'); // bottomRight
      expect(precomputed.A.down[2]).toContain('A'); // top
    });
  });
  
  describe('HexagonalGrid Precomputed Adjacencies', () => {
    it('should correctly precompute adjacencies for hexagonal grid', () => {
      const grid = new HexagonalGrid(3, 3);
      
      // Create tiles with 6 adjacency rules for hexagonal grid
      const tileA = TileDefFactory.defineTile(
        'A',
        ['A', 'A', 'A', 'A', 'A', 'A'], // Can connect to itself in all directions
        () => {},
        1
      );
      
      const tileB = TileDefFactory.defineTile(
        'B',
        ['B', 'B', 'B', 'B', 'B', 'B'], // Can connect to itself in all directions
        () => {},
        1
      );
      
      const tiles = [tileA, tileB];
      
      const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);
      
      // Check structure
      expect(precomputed).toHaveProperty('A');
      expect(precomputed.A).toHaveProperty('hex');
      
      // Check specific adjacencies
      for (let i = 0; i < 6; i++) {
        expect(precomputed.A.hex[i]).toContain('A');
        expect(precomputed.B.hex[i]).toContain('B');
      }
    });
  });
}); 