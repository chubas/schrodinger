import { SquareGrid, TriangularGrid, HexagonalGrid, CubeGrid } from '../src/Grid.js';

describe('Grid Types', () => {
  describe('SquareGrid', () => {
    it('should initialize with correct dimensions', () => {
      const grid = new SquareGrid(3, 4);
      expect(grid.getCells().length).toBe(12);
    });

    it('should return correct adjacency type', () => {
      const grid = new SquareGrid(3, 3);
      expect(grid.getAdjacencyType([1, 1])).toBe('square');
    });

    it('should return correct adjacency map', () => {
      const grid = new SquareGrid(3, 3);
      const map = grid.getAdjacencyMap([1, 1]);
      expect(map).toEqual([2, 3, 0, 1]);
    });

    it('should get neighbors in correct order', () => {
      const grid = new SquareGrid(3, 3);
      const neighbors = grid.getNeighbors([1, 1]);
      
      // Check that we have 4 neighbors (top, right, bottom, left)
      expect(neighbors.length).toBe(4);
      
      // Set values to check neighbor order
      grid.set([1, 0], { choices: [], collapsed: true, forbidden: [], coords: [1, 0] }); // top
      grid.set([2, 1], { choices: [], collapsed: true, forbidden: [], coords: [2, 1] }); // right
      grid.set([1, 2], { choices: [], collapsed: true, forbidden: [], coords: [1, 2] }); // bottom
      grid.set([0, 1], { choices: [], collapsed: true, forbidden: [], coords: [0, 1] }); // left
      
      const newNeighbors = grid.getNeighbors([1, 1]);
      expect(newNeighbors[0]?.coords).toEqual([1, 0]); // top
      expect(newNeighbors[1]?.coords).toEqual([2, 1]); // right
      expect(newNeighbors[2]?.coords).toEqual([1, 2]); // bottom
      expect(newNeighbors[3]?.coords).toEqual([0, 1]); // left
    });
  });

  describe('TriangularGrid', () => {
    it('should initialize with correct dimensions', () => {
      const grid = new TriangularGrid(3, 4);
      expect(grid.getCells().length).toBe(12);
    });

    it('should return correct adjacency type based on coordinates', () => {
      const grid = new TriangularGrid(3, 3);
      // Up-pointing triangle
      expect(grid.getAdjacencyType([0, 0])).toBe('up');
      // Down-pointing triangle
      expect(grid.getAdjacencyType([0, 1])).toBe('down');
    });

    it('should return correct adjacency map for each type', () => {
      const grid = new TriangularGrid(3, 3);
      // Up-pointing triangle
      const upMap = grid.getAdjacencyMap([0, 0]);
      expect(upMap).toEqual([2, 2, 0]);
      
      // Down-pointing triangle
      const downMap = grid.getAdjacencyMap([0, 1]);
      expect(downMap).toEqual([0, 0, 2]);
    });

    it('should get neighbors in correct order for up-pointing triangles', () => {
      const grid = new TriangularGrid(5, 5);
      
      // Set values to check neighbor order for up-pointing triangle at [1, 1]
      grid.set([1, 1], { choices: [], collapsed: true, forbidden: [], coords: [1, 1] }); // center
      grid.set([0, 0], { choices: [], collapsed: true, forbidden: [], coords: [0, 0] }); // top-left
      grid.set([2, 0], { choices: [], collapsed: true, forbidden: [], coords: [2, 0] }); // top-right
      grid.set([1, 2], { choices: [], collapsed: true, forbidden: [], coords: [1, 2] }); // bottom
      
      const neighbors = grid.getNeighbors([1, 1]);
      expect(neighbors.length).toBe(3);
      expect(neighbors[0]?.coords).toEqual([0, 0]); // top-left
      expect(neighbors[1]?.coords).toEqual([2, 0]); // top-right
      expect(neighbors[2]?.coords).toEqual([1, 2]); // bottom
    });

    it('should get neighbors in correct order for down-pointing triangles', () => {
      const grid = new TriangularGrid(5, 5);
      
      // Use [1, 2] which should be a down-pointing triangle (odd sum)
      // For a down-pointing triangle, the neighbors are:
      // - bottomLeft: [x-1, y+1]
      // - bottomRight: [x+1, y+1]
      // - top: [x, y-1]
      grid.set([1, 2], { choices: [], collapsed: true, forbidden: [], coords: [1, 2] }); // center
      grid.set([0, 3], { choices: [], collapsed: true, forbidden: [], coords: [0, 3] }); // bottomLeft
      grid.set([2, 3], { choices: [], collapsed: true, forbidden: [], coords: [2, 3] }); // bottomRight
      grid.set([1, 1], { choices: [], collapsed: true, forbidden: [], coords: [1, 1] }); // top
      
      const neighbors = grid.getNeighbors([1, 2]);
      expect(neighbors.length).toBe(3);
      expect(neighbors[0]?.coords).toEqual([0, 3]); // bottomLeft
      expect(neighbors[1]?.coords).toEqual([2, 3]); // bottomRight
      expect(neighbors[2]?.coords).toEqual([1, 1]); // top
    });
  });

  describe('HexagonalGrid', () => {
    it('should initialize with correct dimensions', () => {
      const grid = new HexagonalGrid(3, 4);
      expect(grid.getCells().length).toBe(12);
    });

    it('should return correct adjacency type', () => {
      const grid = new HexagonalGrid(3, 3);
      expect(grid.getAdjacencyType([1, 1])).toBe('hex');
    });

    it('should return correct adjacency map', () => {
      const grid = new HexagonalGrid(3, 3);
      const map = grid.getAdjacencyMap([1, 1]);
      expect(map).toEqual([3, 4, 5, 0, 1, 2]);
    });

    it('should get neighbors in correct order', () => {
      const grid = new HexagonalGrid(3, 3);
      const neighbors = grid.getNeighbors([1, 1]);
      
      // Check that we have 6 neighbors
      expect(neighbors.length).toBe(6);
      
      // Set values to check neighbor order
      grid.set([1, 0], { choices: [], collapsed: true, forbidden: [], coords: [1, 0] }); // north
      grid.set([2, 0], { choices: [], collapsed: true, forbidden: [], coords: [2, 0] }); // northeast
      grid.set([2, 1], { choices: [], collapsed: true, forbidden: [], coords: [2, 1] }); // southeast
      grid.set([1, 2], { choices: [], collapsed: true, forbidden: [], coords: [1, 2] }); // south
      grid.set([0, 2], { choices: [], collapsed: true, forbidden: [], coords: [0, 2] }); // southwest
      grid.set([0, 1], { choices: [], collapsed: true, forbidden: [], coords: [0, 1] }); // northwest
      
      const newNeighbors = grid.getNeighbors([1, 1]);
      expect(newNeighbors[0]?.coords).toEqual([1, 0]); // north
      expect(newNeighbors[1]?.coords).toEqual([2, 0]); // northeast
      expect(newNeighbors[2]?.coords).toEqual([2, 1]); // southeast
      expect(newNeighbors[3]?.coords).toEqual([1, 2]); // south
      expect(newNeighbors[4]?.coords).toEqual([0, 2]); // southwest
      expect(newNeighbors[5]?.coords).toEqual([0, 1]); // northwest
    });
  });

  describe('CubeGrid', () => {
    it('should initialize with correct dimensions', () => {
      const grid = new CubeGrid(2, 2, 2);
      expect(grid.getCells().length).toBe(8);
    });

    it('should return correct adjacency type', () => {
      const grid = new CubeGrid(2, 2, 2);
      expect(grid.getAdjacencyType([1, 1, 1])).toBe('cube');
    });

    it('should return correct adjacency map', () => {
      const grid = new CubeGrid(2, 2, 2);
      const map = grid.getAdjacencyMap([1, 1, 1]);
      expect(map).toEqual([1, 0, 3, 2, 5, 4]);
    });

    it('should get neighbors in correct order', () => {
      const grid = new CubeGrid(3, 3, 3);
      const neighbors = grid.getNeighbors([1, 1, 1]);
      
      // Check that we have 6 neighbors
      expect(neighbors.length).toBe(6);
      
      // Set values to check neighbor order
      grid.set([2, 1, 1], { choices: [], collapsed: true, forbidden: [], coords: [2, 1, 1] }); // +x (right)
      grid.set([0, 1, 1], { choices: [], collapsed: true, forbidden: [], coords: [0, 1, 1] }); // -x (left)
      grid.set([1, 2, 1], { choices: [], collapsed: true, forbidden: [], coords: [1, 2, 1] }); // +y (up)
      grid.set([1, 0, 1], { choices: [], collapsed: true, forbidden: [], coords: [1, 0, 1] }); // -y (down)
      grid.set([1, 1, 2], { choices: [], collapsed: true, forbidden: [], coords: [1, 1, 2] }); // +z (forward)
      grid.set([1, 1, 0], { choices: [], collapsed: true, forbidden: [], coords: [1, 1, 0] }); // -z (backward)
      
      const newNeighbors = grid.getNeighbors([1, 1, 1]);
      expect(newNeighbors[0]?.coords).toEqual([2, 1, 1]); // +x (right)
      expect(newNeighbors[1]?.coords).toEqual([0, 1, 1]); // -x (left)
      expect(newNeighbors[2]?.coords).toEqual([1, 2, 1]); // +y (up)
      expect(newNeighbors[3]?.coords).toEqual([1, 0, 1]); // -y (down)
      expect(newNeighbors[4]?.coords).toEqual([1, 1, 2]); // +z (forward)
      expect(newNeighbors[5]?.coords).toEqual([1, 1, 0]); // -z (backward)
    });
  });
}); 