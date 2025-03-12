/**
 * AdjacencyBitset - Efficient binary representation of adjacencies
 * 
 * Uses a Uint32Array for compact storage and fast bitwise operations.
 * Each bit in the array represents the presence or absence of a specific adjacency type.
 */
export class AdjacencyBitset {
  private buffer: Uint32Array;
  private capacity: number;
  
  /**
   * Create a new AdjacencyBitset with the specified capacity
   * @param capacity Maximum number of adjacency types to support
   */
  constructor(capacity: number = 1024) {
    this.capacity = capacity;
    // Each 32-bit integer can store 32 adjacency types
    const bufferSize = Math.ceil(capacity / 32);
    this.buffer = new Uint32Array(bufferSize);
  }
  
  /**
   * Set the bit for a specific adjacency type
   * @param adjacencyType The numeric ID of the adjacency type
   */
  set(adjacencyType: number): void {
    if (adjacencyType >= this.capacity) {
      this.expandCapacity(adjacencyType + 1);
    }
    const index = Math.floor(adjacencyType / 32);
    const bitPosition = adjacencyType % 32;
    this.buffer[index] |= (1 << bitPosition);
  }
  
  /**
   * Clear the bit for a specific adjacency type
   * @param adjacencyType The numeric ID of the adjacency type
   */
  clear(adjacencyType: number): void {
    if (adjacencyType >= this.capacity) return;
    const index = Math.floor(adjacencyType / 32);
    const bitPosition = adjacencyType % 32;
    this.buffer[index] &= ~(1 << bitPosition);
  }
  
  /**
   * Check if an adjacency type is present
   * @param adjacencyType The numeric ID of the adjacency type
   * @returns True if the adjacency type is present
   */
  has(adjacencyType: number): boolean {
    if (adjacencyType >= this.capacity) return false;
    const index = Math.floor(adjacencyType / 32);
    const bitPosition = adjacencyType % 32;
    return (this.buffer[index] & (1 << bitPosition)) !== 0;
  }
  
  /**
   * Create a new bitset that is the union of this bitset and another (OR operation)
   * @param other Another AdjacencyBitset
   * @returns A new AdjacencyBitset containing the union
   */
  union(other: AdjacencyBitset): AdjacencyBitset {
    const result = new AdjacencyBitset(Math.max(this.capacity, other.capacity));
    const minLength = Math.min(this.buffer.length, other.buffer.length);
    
    // Perform OR on overlapping parts
    for (let i = 0; i < minLength; i++) {
      result.buffer[i] = this.buffer[i] | other.buffer[i];
    }
    
    // Copy remaining parts from the longer buffer
    const longerBuffer = this.buffer.length > other.buffer.length ? this.buffer : other.buffer;
    for (let i = minLength; i < longerBuffer.length; i++) {
      result.buffer[i] = longerBuffer[i];
    }
    
    return result;
  }
  
  /**
   * Create a new bitset that is the intersection of this bitset and another (AND operation)
   * @param other Another AdjacencyBitset
   * @returns A new AdjacencyBitset containing the intersection
   */
  intersection(other: AdjacencyBitset): AdjacencyBitset {
    const result = new AdjacencyBitset(Math.max(this.capacity, other.capacity));
    const minLength = Math.min(this.buffer.length, other.buffer.length);
    
    // Perform AND on overlapping parts
    for (let i = 0; i < minLength; i++) {
      result.buffer[i] = this.buffer[i] & other.buffer[i];
    }
    
    // Rest of the result buffer remains zeros
    
    return result;
  }
  
  /**
   * Check if this bitset has any bits in common with another (for compatibility checking)
   * @param other Another AdjacencyBitset
   * @returns True if there is at least one adjacency type in common
   */
  hasOverlap(other: AdjacencyBitset): boolean {
    const minLength = Math.min(this.buffer.length, other.buffer.length);
    
    for (let i = 0; i < minLength; i++) {
      if ((this.buffer[i] & other.buffer[i]) !== 0) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if this bitset is empty (no bits set)
   * @returns True if no adjacency types are present
   */
  isEmpty(): boolean {
    return this.buffer.every(value => value === 0);
  }
  
  /**
   * Count the number of adjacency types present in this bitset
   * @returns The number of bits set to 1
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      let value = this.buffer[i];
      // Count set bits in each 32-bit integer using Brian Kernighan's algorithm
      while (value) {
        value &= (value - 1);
        count++;
      }
    }
    return count;
  }
  
  /**
   * Create a new bitset with all bits set to 0
   * @returns A new empty AdjacencyBitset with the same capacity
   */
  clone(): AdjacencyBitset {
    const result = new AdjacencyBitset(this.capacity);
    result.buffer.set(this.buffer);
    return result;
  }
  
  /**
   * Get an array of the adjacency type IDs present in this bitset
   * @returns Array of adjacency type IDs
   */
  getAdjacencyTypes(): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < this.buffer.length; i++) {
      let value = this.buffer[i];
      let baseIndex = i * 32;
      
      // Find all set bits
      let bitPosition = 0;
      while (value) {
        if (value & 1) {
          result.push(baseIndex + bitPosition);
        }
        value >>>= 1;
        bitPosition++;
      }
    }
    
    return result;
  }
  
  /**
   * Convert to a readable string representation (for debugging)
   * @returns String representation of the bitset
   */
  toString(): string {
    const bits = this.getAdjacencyTypes();
    return `AdjacencyBitset(${bits.join(', ')})`;
  }
  
  /**
   * Expand the capacity of this bitset
   * @param newCapacity The new capacity
   */
  private expandCapacity(newCapacity: number): void {
    if (newCapacity <= this.capacity) return;
    
    const newBufferSize = Math.ceil(newCapacity / 32);
    const newBuffer = new Uint32Array(newBufferSize);
    
    // Copy existing values
    newBuffer.set(this.buffer);
    
    this.buffer = newBuffer;
    this.capacity = newCapacity;
  }
}

/**
 * Utility class for mapping between string adjacency names and numeric IDs
 */
export class AdjacencyRegistry {
  private adjacencyMap = new Map<string, number>();
  private reverseMap = new Map<number, string>();
  private nextId = 0;
  
  /**
   * Get the numeric ID for an adjacency string, assigning a new ID if not already mapped
   * @param adjacency The adjacency string
   * @returns The numeric ID
   */
  getOrCreateId(adjacency: string): number {
    if (!this.adjacencyMap.has(adjacency)) {
      const id = this.nextId++;
      this.adjacencyMap.set(adjacency, id);
      this.reverseMap.set(id, adjacency);
    }
    return this.adjacencyMap.get(adjacency)!;
  }
  
  /**
   * Get the string for an adjacency ID
   * @param id The numeric ID
   * @returns The adjacency string, or undefined if not found
   */
  getAdjacency(id: number): string | undefined {
    return this.reverseMap.get(id);
  }
  
  /**
   * Convert an array of adjacency strings to a bitset
   * @param adjacencies Array of adjacency strings
   * @returns A new AdjacencyBitset containing the specified adjacencies
   */
  createBitset(adjacencies: string[]): AdjacencyBitset {
    const bitset = new AdjacencyBitset();
    for (const adj of adjacencies) {
      bitset.set(this.getOrCreateId(adj));
    }
    return bitset;
  }
  
  /**
   * Convert an adjacency bitset back to an array of strings
   * @param bitset The AdjacencyBitset to convert
   * @returns Array of adjacency strings
   */
  getBitsetAdjacencies(bitset: AdjacencyBitset): string[] {
    const ids = bitset.getAdjacencyTypes();
    return ids.map(id => this.getAdjacency(id)!).filter(adj => adj !== undefined);
  }
} 