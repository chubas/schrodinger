import { AdjacencyBitset, AdjacencyRegistry } from './AdjacencyBitset.js';
import { 
  AdjacencyRule, 
  SimpleAdjacency,
  DirectionalAdjacency,
  CompoundAdjacency
} from './Adjacencies.js';
import { TileDefFactory } from './TileDef.js';

/**
 * Adapter class to integrate the binary AdjacencyBitset representation
 * with the existing adjacency system.
 */
export class AdjacencyBitsetAdapter {
  private static instance: AdjacencyBitsetAdapter;
  private registry: AdjacencyRegistry;
  
  // Cache for parsed rules to avoid repeated parsing
  private ruleCache: Map<string, AdjacencyRule> = new Map();
  
  // Cache for converted bitsets to avoid repeated conversion
  private bitsetCache: Map<AdjacencyRule, AdjacencyBitset> = new Map();
  
  // Cache for adjacency matching results to avoid repeated matching
  private matchCache: Map<string, boolean> = new Map();

  private constructor() {
    this.registry = new AdjacencyRegistry();
  }

  /**
   * Get the singleton instance of the adapter
   */
  public static getInstance(): AdjacencyBitsetAdapter {
    if (!AdjacencyBitsetAdapter.instance) {
      AdjacencyBitsetAdapter.instance = new AdjacencyBitsetAdapter();
    }
    return AdjacencyBitsetAdapter.instance;
  }

  /**
   * Get the AdjacencyRegistry used by this adapter
   */
  public getRegistry(): AdjacencyRegistry {
    return this.registry;
  }

  /**
   * Parse a string into an AdjacencyRule, with caching
   */
  private parseRule(rule: string): AdjacencyRule {
    // Check cache first
    if (this.ruleCache.has(rule)) {
      return this.ruleCache.get(rule)!;
    }
    
    // Parse and cache
    const parsedRule = TileDefFactory.parseAdjacencyRule(rule);
    this.ruleCache.set(rule, parsedRule);
    return parsedRule;
  }

  /**
   * Convert an AdjacencyRule to an AdjacencyBitset, with caching
   */
  public convertToBitset(rule: string | AdjacencyRule): AdjacencyBitset {
    // Parse string into AdjacencyRule if needed
    const adjacencyRule = typeof rule === 'string' 
      ? this.parseRule(rule) 
      : rule;
    
    // Check cache first
    if (this.bitsetCache.has(adjacencyRule)) {
      return this.bitsetCache.get(adjacencyRule)!;
    }
    
    // Convert different rule types to their bitset representation
    let bitset: AdjacencyBitset;
    
    if (this.isSimpleAdjacency(adjacencyRule)) {
      // For simple adjacencies, create a bitset with all tokens
      bitset = this.registry.createBitset(adjacencyRule);
    } 
    else if (this.isDirectionalAdjacency(adjacencyRule)) {
      // For directional adjacencies, create a special token that 
      // encodes the directional relationship
      const { from, to } = adjacencyRule;
      const dirToken = `${from}>${to}`;
      bitset = this.registry.createBitset([dirToken]);
    }
    else if (this.isCompoundAdjacency(adjacencyRule)) {
      // For compound adjacencies, process each item and combine them
      const adjacencyTokens: string[] = [];
      
      for (const item of adjacencyRule) {
        if (typeof item === 'string') {
          adjacencyTokens.push(item);
        } else {
          // Directional part
          const { from, to } = item;
          adjacencyTokens.push(`${from}>${to}`);
        }
      }
      
      bitset = this.registry.createBitset(adjacencyTokens);
    }
    else {
      // Should never reach here if all types are handled correctly
      throw new Error('Unknown adjacency rule type');
    }
    
    // Cache the result
    this.bitsetCache.set(adjacencyRule, bitset);
    return bitset;
  }

  /**
   * Generate a cache key for adjacency matching
   */
  private getMatchCacheKey(adj1: AdjacencyRule, adj2: AdjacencyRule): string {
    // For directional adjacencies, order doesn't matter for caching
    if (this.isDirectionalAdjacency(adj1) && this.isDirectionalAdjacency(adj2)) {
      // Sort by from value to ensure consistent cache keys
      const key1 = `${adj1.from}>${adj1.to}`;
      const key2 = `${adj2.from}>${adj2.to}`;
      return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
    }
    
    // For other types, we need to maintain order
    return `${JSON.stringify(adj1)}|${JSON.stringify(adj2)}`;
  }

  /**
   * Check if two adjacency rules match using binary representation
   */
  public matchAdjacencies(
    adj1: string | AdjacencyRule,
    adj2: string | AdjacencyRule
  ): boolean {
    try {
      // Convert both to AdjacencyRule
      const rule1 = typeof adj1 === 'string' 
        ? this.parseRule(adj1) 
        : adj1;
      
      const rule2 = typeof adj2 === 'string' 
        ? this.parseRule(adj2) 
        : adj2;
      
      // Check cache
      const cacheKey = this.getMatchCacheKey(rule1, rule2);
      if (this.matchCache.has(cacheKey)) {
        return this.matchCache.get(cacheKey)!;
      }

      // If they're different types, they don't match
      if (
        (this.isSimpleAdjacency(rule1) && !this.isSimpleAdjacency(rule2)) ||
        (this.isDirectionalAdjacency(rule1) && !this.isDirectionalAdjacency(rule2)) ||
        (this.isCompoundAdjacency(rule1) && !this.isCompoundAdjacency(rule2))
      ) {
        this.matchCache.set(cacheKey, false);
        return false;
      }

      // Handle special case for directional adjacencies (they need to be flipped)
      if (this.isDirectionalAdjacency(rule1) && this.isDirectionalAdjacency(rule2)) {
        // For directional adjacencies, they match if they are complementary
        const result = rule1.from === rule2.to && rule1.to === rule2.from;
        this.matchCache.set(cacheKey, result);
        return result;
      }

      let result = false;
      
      // For simple and compound adjacencies, convert to bitsets and check if they match
      if (this.isSimpleAdjacency(rule1) && this.isSimpleAdjacency(rule2)) {
        // For simple adjacencies, the bitsets should be identical
        const bitset1 = this.convertToBitset(rule1);
        const bitset2 = this.convertToBitset(rule2);
        
        result = bitset1.count() === bitset2.count() && 
                 bitset1.hasOverlap(bitset2) && 
                 bitset2.hasOverlap(bitset1);
      } 
      else if (this.isCompoundAdjacency(rule1) && this.isCompoundAdjacency(rule2)) {
        // For compound adjacencies, we need to match each item in order
        if (rule1.length !== rule2.length) {
          this.matchCache.set(cacheKey, false);
          return false;
        }
        
        // Check each position
        result = true;
        for (let i = 0; i < rule1.length; i++) {
          const item1 = rule1[i];
          const item2 = rule2[i];
          
          if (typeof item1 === 'string' && typeof item2 === 'string') {
            // Simple tokens must match exactly
            if (item1 !== item2) {
              result = false;
              break;
            }
          } 
          else if (
            typeof item1 === 'object' && 
            typeof item2 === 'object' && 
            'from' in item1 && 
            'to' in item1 && 
            'from' in item2 && 
            'to' in item2
          ) {
            // Directional parts must be complementary
            const dir1 = item1 as DirectionalAdjacency;
            const dir2 = item2 as DirectionalAdjacency;
            if (dir1.from !== dir2.to || dir1.to !== dir2.from) {
              result = false;
              break;
            }
          } 
          else {
            // Different types at same position
            result = false;
            break;
          }
        }
      }
      
      // Cache the result
      this.matchCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error matching adjacencies:', error);
      return false;
    }
  }

  /**
   * Clear all caches to free memory
   */
  public clearCaches(): void {
    this.ruleCache.clear();
    this.bitsetCache.clear();
    this.matchCache.clear();
  }

  // Type guards (copied from Adjacencies.ts)
  private isSimpleAdjacency(adj: AdjacencyRule): adj is SimpleAdjacency {
    return Array.isArray(adj) && adj.every((item) => typeof item === "string");
  }

  private isDirectionalAdjacency(
    adj: AdjacencyRule,
  ): adj is DirectionalAdjacency {
    return !Array.isArray(adj) && "from" in adj && "to" in adj;
  }

  private isCompoundAdjacency(adj: AdjacencyRule): adj is CompoundAdjacency {
    return Array.isArray(adj) && adj.some((item) => typeof item !== "string");
  }
} 