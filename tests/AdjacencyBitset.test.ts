import { AdjacencyBitset, AdjacencyRegistry } from '../src/AdjacencyBitset';

describe('AdjacencyBitset', () => {
  describe('Basic operations', () => {
    it('should initialize with empty buffer', () => {
      const bitset = new AdjacencyBitset();
      expect(bitset.isEmpty()).toBe(true);
      expect(bitset.count()).toBe(0);
    });

    it('should set and check bits correctly', () => {
      const bitset = new AdjacencyBitset();
      
      bitset.set(0);
      expect(bitset.has(0)).toBe(true);
      expect(bitset.has(1)).toBe(false);
      expect(bitset.count()).toBe(1);
      
      bitset.set(31); // End of first 32-bit integer
      expect(bitset.has(31)).toBe(true);
      expect(bitset.count()).toBe(2);
      
      bitset.set(32); // Start of second 32-bit integer
      expect(bitset.has(32)).toBe(true);
      expect(bitset.count()).toBe(3);
    });
    
    it('should clear bits correctly', () => {
      const bitset = new AdjacencyBitset();
      
      bitset.set(5);
      bitset.set(10);
      expect(bitset.count()).toBe(2);
      
      bitset.clear(5);
      expect(bitset.has(5)).toBe(false);
      expect(bitset.has(10)).toBe(true);
      expect(bitset.count()).toBe(1);
    });
    
    it('should handle capacity expansion', () => {
      // Default capacity is 1024
      const bitset = new AdjacencyBitset();
      
      // Set a bit beyond the initial capacity
      bitset.set(1500);
      expect(bitset.has(1500)).toBe(true);
      expect(bitset.count()).toBe(1);
    });
  });
  
  describe('Set operations', () => {
    it('should perform union operation correctly', () => {
      const bitset1 = new AdjacencyBitset();
      bitset1.set(1);
      bitset1.set(3);
      bitset1.set(5);
      
      const bitset2 = new AdjacencyBitset();
      bitset2.set(2);
      bitset2.set(3);
      bitset2.set(4);
      
      const union = bitset1.union(bitset2);
      expect(union.has(1)).toBe(true);
      expect(union.has(2)).toBe(true);
      expect(union.has(3)).toBe(true);
      expect(union.has(4)).toBe(true);
      expect(union.has(5)).toBe(true);
      expect(union.count()).toBe(5);
    });
    
    it('should perform intersection operation correctly', () => {
      const bitset1 = new AdjacencyBitset();
      bitset1.set(1);
      bitset1.set(3);
      bitset1.set(5);
      
      const bitset2 = new AdjacencyBitset();
      bitset2.set(2);
      bitset2.set(3);
      bitset2.set(4);
      
      const intersection = bitset1.intersection(bitset2);
      expect(intersection.has(1)).toBe(false);
      expect(intersection.has(2)).toBe(false);
      expect(intersection.has(3)).toBe(true);
      expect(intersection.has(4)).toBe(false);
      expect(intersection.has(5)).toBe(false);
      expect(intersection.count()).toBe(1);
    });
    
    it('should correctly check for overlap', () => {
      const bitset1 = new AdjacencyBitset();
      bitset1.set(1);
      bitset1.set(3);
      
      const bitset2 = new AdjacencyBitset();
      bitset2.set(2);
      bitset2.set(4);
      
      expect(bitset1.hasOverlap(bitset2)).toBe(false);
      
      bitset2.set(3);
      expect(bitset1.hasOverlap(bitset2)).toBe(true);
    });
    
    it('should handle operations with different capacities', () => {
      const bitset1 = new AdjacencyBitset(100);
      bitset1.set(50);
      
      const bitset2 = new AdjacencyBitset(200);
      bitset2.set(150);
      
      const union = bitset1.union(bitset2);
      expect(union.has(50)).toBe(true);
      expect(union.has(150)).toBe(true);
      
      const intersection = bitset1.intersection(bitset2);
      expect(intersection.isEmpty()).toBe(true);
    });
  });
  
  describe('Utility methods', () => {
    it('should clone a bitset correctly', () => {
      const original = new AdjacencyBitset();
      original.set(1);
      original.set(100);
      
      const clone = original.clone();
      expect(clone.has(1)).toBe(true);
      expect(clone.has(100)).toBe(true);
      expect(clone.count()).toBe(2);
      
      // Verify that changes to the clone don't affect the original
      clone.set(200);
      expect(clone.count()).toBe(3);
      expect(original.count()).toBe(2);
      expect(original.has(200)).toBe(false);
    });
    
    it('should get adjacency types correctly', () => {
      const bitset = new AdjacencyBitset();
      bitset.set(5);
      bitset.set(10);
      bitset.set(15);
      
      const types = bitset.getAdjacencyTypes();
      expect(types).toContain(5);
      expect(types).toContain(10);
      expect(types).toContain(15);
      expect(types.length).toBe(3);
    });
    
    it('should convert to string correctly', () => {
      const bitset = new AdjacencyBitset();
      bitset.set(1);
      bitset.set(3);
      
      expect(bitset.toString()).toBe('AdjacencyBitset(1, 3)');
    });
  });
  
  describe('Performance tests', () => {
    it('should handle a large number of operations efficiently', () => {
      const bitset = new AdjacencyBitset();
      
      // Set a large number of bits
      for (let i = 0; i < 1000; i += 2) {
        bitset.set(i);
      }
      
      expect(bitset.count()).toBe(500);
      
      // Check a large number of bits
      for (let i = 0; i < 1000; i++) {
        expect(bitset.has(i)).toBe(i % 2 === 0);
      }
    });
  });
});

describe('AdjacencyRegistry', () => {
  it('should map adjacency strings to numeric IDs', () => {
    const registry = new AdjacencyRegistry();
    
    const id1 = registry.getOrCreateId('A');
    const id2 = registry.getOrCreateId('B');
    const id3 = registry.getOrCreateId('C');
    
    expect(id1).toBe(0);
    expect(id2).toBe(1);
    expect(id3).toBe(2);
    
    // Should return the same ID for the same string
    expect(registry.getOrCreateId('A')).toBe(id1);
    expect(registry.getOrCreateId('B')).toBe(id2);
  });
  
  it('should convert from string to IDs and back', () => {
    const registry = new AdjacencyRegistry();
    
    const id1 = registry.getOrCreateId('Red');
    const id2 = registry.getOrCreateId('Green');
    const id3 = registry.getOrCreateId('Blue');
    
    expect(registry.getAdjacency(id1)).toBe('Red');
    expect(registry.getAdjacency(id2)).toBe('Green');
    expect(registry.getAdjacency(id3)).toBe('Blue');
  });
  
  it('should create bitsets from adjacency strings', () => {
    const registry = new AdjacencyRegistry();
    const adjacencies = ['A', 'B', 'C'];
    
    const bitset = registry.createBitset(adjacencies);
    
    expect(bitset.has(registry.getOrCreateId('A'))).toBe(true);
    expect(bitset.has(registry.getOrCreateId('B'))).toBe(true);
    expect(bitset.has(registry.getOrCreateId('C'))).toBe(true);
    expect(bitset.has(registry.getOrCreateId('D'))).toBe(false);
    expect(bitset.count()).toBe(3);
  });
  
  it('should convert bitsets back to adjacency strings', () => {
    const registry = new AdjacencyRegistry();
    
    // Create IDs
    registry.getOrCreateId('A');
    registry.getOrCreateId('B');
    registry.getOrCreateId('C');
    
    const bitset = new AdjacencyBitset();
    bitset.set(0); // 'A'
    bitset.set(2); // 'C'
    
    const adjacencies = registry.getBitsetAdjacencies(bitset);
    
    expect(adjacencies).toContain('A');
    expect(adjacencies).toContain('C');
    expect(adjacencies).not.toContain('B');
    expect(adjacencies.length).toBe(2);
  });
  
  it('should handle complex adjacency strings', () => {
    const registry = new AdjacencyRegistry();
    
    // Directional adjacencies
    const adjacencies = ['A>B', 'C>D', 'E>F'];
    const bitset = registry.createBitset(adjacencies);
    
    expect(bitset.count()).toBe(3);
    
    const result = registry.getBitsetAdjacencies(bitset);
    expect(result).toEqual(expect.arrayContaining(adjacencies));
    expect(result.length).toBe(3);
  });
});

describe('Integration tests', () => {
  it('should work with a simple tile adjacency example', () => {
    const registry = new AdjacencyRegistry();
    
    // Define tile adjacencies
    const tileA = {
      top: registry.createBitset(['A', 'B']),
      right: registry.createBitset(['C']),
      bottom: registry.createBitset(['D']),
      left: registry.createBitset(['E', 'F'])
    };
    
    const tileB = {
      top: registry.createBitset(['G']),
      right: registry.createBitset(['H']),
      bottom: registry.createBitset(['A', 'B']), // Can connect to top of tileA
      left: registry.createBitset(['I'])
    };
    
    // Check compatibility
    expect(tileA.top.hasOverlap(tileB.bottom)).toBe(true);
    expect(tileA.right.hasOverlap(tileB.left)).toBe(false);
  });
  
  it('should correctly handle directional adjacencies', () => {
    const registry = new AdjacencyRegistry();
    
    // Create virtual adjacency types for directional pairs
    const TOP_TO_BOTTOM_1 = 'v1'; // For A>B on top and B>A on bottom
    const LEFT_TO_RIGHT_1 = 'v2'; // For C>D on left and D>C on right
    
    // Define tile adjacencies
    const tileA = {
      top: registry.createBitset([TOP_TO_BOTTOM_1]),
      right: registry.createBitset([LEFT_TO_RIGHT_1]),
      bottom: registry.createBitset(['x']),
      left: registry.createBitset(['y'])
    };
    
    const tileB = {
      top: registry.createBitset(['z']),
      right: registry.createBitset(['w']),
      bottom: registry.createBitset([TOP_TO_BOTTOM_1]), // Can connect to top of tileA
      left: registry.createBitset([LEFT_TO_RIGHT_1])    // Can connect to right of tileA
    };
    
    // Check compatibility
    expect(tileA.top.hasOverlap(tileB.bottom)).toBe(true);
    expect(tileA.right.hasOverlap(tileB.left)).toBe(true);
    expect(tileA.bottom.hasOverlap(tileB.top)).toBe(false);
  });
}); 