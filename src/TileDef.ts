import { Rule, parseAdjacencyRule } from "./AdjacencyGrammar.js";

/**
 * Represents an adjacency definition which can be either a string or a Rule object
 * Allows for flexible definition of adjacencies in both TypeScript and JavaScript
 */
export type AdjacencyValue = string | Rule;

/**
 * Represents the adjacencies for a tile
 * This can be an array of either strings or Rule objects (but all elements must be of the same type)
 */
export type AdjacencyDefinition = AdjacencyValue[];

/**
 * Tile definition with properties and adjacencies
 */
export type TileDef = {
  /**
   * Unique name for this tile
   */
  name: string;
  
  /**
   * List of adjacency definitions.
   * The adjacencies are ordered: top, right, bottom, left
   * Can be provided as strings (will be parsed) or as Rule objects
   */
  adjacencies: AdjacencyDefinition;
  
  /**
   * Rotation in degrees (0, 90, 180, 270)
   */
  rotation?: number;
  
  /**
   * Whether the tile is reflected/flipped
   */
  reflection?: boolean;
  
  /**
   * Weight for random selection (higher values = more likely to be selected)
   */
  weight?: number;
  
  /**
   * Function to draw the tile on a canvas context
   */
  draw: (ctx: any, x: number, y: number, w: number, h: number) => void;
  
  /**
   * Optional unique identifier
   */
  id?: string;
};

/**
 * Utility functions for working with tile definitions
 */
export class TileDefFactory {
  /**
   * Creates a TileDef with the provided properties
   * @param name - Tile name
   * @param adjacencies - Adjacency rules as strings or Rule objects
   * @param draw - Draw function
   * @param weight - Optional weight
   * @param rotation - Optional rotation
   * @param reflection - Optional reflection
   * @returns Complete TileDef object
   */
  static defineTile(
    name: string,
    adjacencies: AdjacencyDefinition,
    draw: (ctx: any, x: number, y: number, w: number, h: number) => void,
    weight = 1,
    rotation = 0,
    reflection = false
  ): TileDef {
    return {
      name,
      adjacencies,
      draw,
      weight,
      rotation,
      reflection,
    };
  }

  /**
   * Ensures that all adjacency rules in a TileDef are Rule objects
   * @param tileDef The tile definition to process
   * @returns A new TileDef with all adjacencies as Rule objects
   */
  static ensureParsedRules(tileDef: TileDef): TileDef {
    const parsedAdjacencies = tileDef.adjacencies.map((adj, i) => {
      if (typeof adj === 'string') {
        try {
          const result = parseAdjacencyRule(adj);
          if (result instanceof Error) {
            console.warn(`Failed to parse adjacency rule "${adj}" at index ${i}: ${result.message}`);
            return null;
          }
          return result;
        } catch (e) {
          console.warn(`Failed to parse adjacency rule "${adj}" at index ${i}: ${e}`);
          return null;
        }
      } else {
        // Already a Rule object
        return adj;
      }
    }).filter((adj): adj is Rule => adj !== null);

    return {
      ...tileDef,
      adjacencies: parsedAdjacencies
    };
  }

  /**
   * Parses a single adjacency rule string into a Rule object
   * @param rule - String representation of an adjacency rule
   * @returns Parsed Rule object or Error if parsing fails
   */
  static parseAdjacencyRule(adjacency: string): Rule | Error {
    if (!adjacency) {
      return new Error("Empty adjacency rule");
    }

    return parseAdjacencyRule(adjacency);
  }
}
