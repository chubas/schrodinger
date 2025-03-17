import { Rule, parseAdjacencyRule } from "./AdjacencyGrammar.js";

export type TileDef = {
  /**
   * List of adjacency definitions.
   * Can be either:
   * 1. A string that will be parsed into a Rule (e.g. "A", "[B>C]", "A+B")
   * 2. A Rule object directly
   * The adjacencies are ordered: top, right, bottom, left
   */
  adjacencies: (string | Rule)[];
  name: string;
  rotation?: number;
  reflection?: boolean;
  weight?: number;
  draw: (ctx: any, x: number, y: number, w: number, h: number) => void;
  id?: string;
};

export class TileDefFactory {
  /**
   * Creates a TileDef with the provided properties. Adds a noop `draw` method if not specified.
   * @param tile - Partial tile definition
   * @returns Complete TileDef object
   */
  static defineTile(
    name: string,
    adjacencies: string[],
    draw: (ctx: any, x: number, y: number, w: number, h: number) => void,
    weight = 1,
    rotation = 0,
    reflection = false
  ): TileDef {
    try {
      // Parse adjacencies using the new grammar
      const parsedAdjacencies = adjacencies
        .map((adj, i) => {
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
        })
        .filter((adj): adj is Rule => adj !== null);

      return {
        name,
        adjacencies: parsedAdjacencies.length > 0 ? parsedAdjacencies : [],
        draw,
        weight,
        rotation,
        reflection,
      };
    } catch (e) {
      console.error(`Error defining tile "${name}": ${e}`);
      throw e;
    }
  }

  /**
   * Extracts adjacency rules from a pipe-separated string
   * @param adjacencyString - String with pipe-separated adjacency rules
   * @returns Array of parsed adjacency rules
   */
  static extractAdjacencies(adjacenciesStr: string): Rule[] {
    if (!adjacenciesStr) {
      return [];
    }

    const adjacencies = adjacenciesStr.split("|");
    return adjacencies
      .filter((adj) => adj.trim().length > 0)
      .map((adj, i) => {
        try {
          const result = parseAdjacencyRule(adj.trim());
          if (result instanceof Error) {
            console.warn(`Failed to parse adjacency rule "${adj}" at index ${i}: ${result.message}`);
            return null;
          }
          return result;
        } catch (e) {
          console.warn(`Failed to parse adjacency rule "${adj}" at index ${i}: ${e}`);
          return null;
        }
      })
      .filter((adj): adj is Rule => adj !== null);
  }

  /**
   * Parses a single adjacency rule string into a Rule object
   * @param rule - String representation of an adjacency rule
   * @returns Parsed Rule object or Error if parsing fails
   */
  static parseAdjacencyRule(adjacency: string): Rule {
    if (!adjacency) {
      throw new Error("Empty adjacency rule");
    }

    const result = parseAdjacencyRule(adjacency);
    if (result instanceof Error) {
      throw result; // Just throw the error directly
    }
    return result;
  }
}
