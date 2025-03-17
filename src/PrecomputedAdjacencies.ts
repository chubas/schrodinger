import { TileDef, TileDefFactory } from "./TileDef.js";
import { Grid } from "./Grid.js";
import { Rule } from "./AdjacencyGrammar.js";
import { matchAdjacencies } from "./Adjacencies.js";

/**
 * Type definition for precomputed adjacencies using the adjacency type approach
 */
export type PrecomputedAdjacencies = {
  [tileName: string]: {
    // Type-specific adjacency maps
    [adjacencyType: string]: {
      [direction: number]: string[];
    }
  };
};

/**
 * Utility class for precomputing adjacencies between tiles
 */
export class AdjacencyPrecomputer {
  /**
   * Precomputes valid adjacencies between tile definitions based on the adjacency types in the grid
   * 
   * @param tileDefs The tile definitions to precompute adjacencies for
   * @param grid The grid to use for determining adjacency types and maps
   * @returns An object mapping tile names to their valid adjacencies by type and direction
   */
  static precomputeAdjacencies(tileDefs: TileDef[], grid: Grid): PrecomputedAdjacencies {
    // Ensure all rules are parsed
    const parsedTileDefs = tileDefs.map(TileDefFactory.ensureParsedRules);
    
    const precomputed: PrecomputedAdjacencies = {};
    
    // Get all adjacency types from the grid
    const adjacencyTypes = Object.keys(grid.adjacencyMaps);
    
    console.log(`Precomputing adjacencies for ${parsedTileDefs.length} tiles with ${adjacencyTypes.length} adjacency types`);
    
    // For each tile
    for (const tile1 of parsedTileDefs) {
      precomputed[tile1.name] = {};
      
      // For each adjacency type
      for (const type of adjacencyTypes) {
        precomputed[tile1.name][type] = {};
        const adjacencyMap = grid.adjacencyMaps[type];
        
        // For each direction
        for (let direction = 0; direction < adjacencyMap.length; direction++) {
          precomputed[tile1.name][type][direction] = [];
          const oppositeDirection = adjacencyMap[direction];
          
          // Check compatibility with all other tiles
          for (const tile2 of parsedTileDefs) {
            try {
              if (matchAdjacencies(
                tile1.adjacencies[direction] as Rule, 
                tile2.adjacencies[oppositeDirection] as Rule
              )) {
                precomputed[tile1.name][type][direction].push(tile2.name);
              }
            } catch (error) {
              console.error(`Error matching adjacencies for tiles ${tile1.name} and ${tile2.name}: ${error}`);
            }
          }
        }
      }
    }
    
    return precomputed;
  }
  
  /**
   * Serializes precomputed adjacencies to a JSON string
   * 
   * @param precomputed The precomputed adjacencies object
   * @returns A JSON string representation of the precomputed adjacencies
   */
  static serialize(precomputed: PrecomputedAdjacencies): string {
    return JSON.stringify(precomputed);
  }
  
  /**
   * Deserializes precomputed adjacencies from a JSON string
   * 
   * @param serialized The JSON string representation of precomputed adjacencies
   * @returns The deserialized precomputed adjacencies object
   */
  static deserialize(serialized: string): PrecomputedAdjacencies {
    return JSON.parse(serialized);
  }
} 