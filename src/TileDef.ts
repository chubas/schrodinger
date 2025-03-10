import {
  AdjacencyRule,
  DirectionalAdjacency,
} from "./Adjacencies";

export type TileDef = {
  /**
   * List of adjacency definitions.
   * Can be either:
   * 1. A string that will be parsed into an AdjacencyRule (e.g. "A", "B>C", "A[B>C]D")
   * 2. An AdjacencyRule object directly
   * The adjacencies are ordered: top, right, bottom, left
   */
  adjacencies: (string | AdjacencyRule)[];
  name: string;
  rotation?: number;
  reflection?: number;
  weight?: number;
  draw: () => void;
};

export class TileDefFactory {
  /**
   * Creates a TileDef with the provided properties. Adds a noop `draw` method if not specified.
   * @param tile - Partial tile definition
   * @returns Complete TileDef object
   */
  static defineTile(tile: Partial<TileDef>): TileDef {
    return {
      name: tile.name ?? "",
      adjacencies: (tile.adjacencies ?? []).map((adj) =>
        typeof adj === "string" ? this.parseAdjacencyRule(adj) : adj,
      ),
      rotation: tile.rotation ?? 0,
      reflection: tile.reflection ?? 0,
      draw: tile.draw ?? (() => {}),
    };
  }

  static extractAdjacencies(adjacencyString: string): AdjacencyRule[] {
    if (!adjacencyString) {
      throw new Error("Empty adjacency definition");
    }

    // Split by | to get each side's adjacency
    const sides = adjacencyString.split("|");
    if (sides.some((s) => !s)) {
      throw new Error("Empty adjacency definition");
    }

    return sides.map((side) => this.parseAdjacencyRule(side.trim()));
  }

  static parseAdjacencyRule(rule: string): AdjacencyRule {
    // Check for compound adjacency with brackets
    if (rule.includes("[") || rule.includes("]")) {
      const openCount = (rule.match(/\[/g) || []).length;
      const closeCount = (rule.match(/\]/g) || []).length;

      if (openCount !== closeCount) {
        throw new Error("Unmatched brackets in adjacency definition");
      }

      const compoundMatch = rule.match(/^([^[]*)\[([^>]+)>([^\]]+)\](.*)$/);
      if (!compoundMatch) {
        throw new Error("Invalid compound adjacency format");
      }

      const [_, left, from, to, right] = compoundMatch;
      if (from.includes(">") || to.includes(">")) {
        throw new Error("Invalid compound adjacency format");
      }

      return [
        ...(left ? this.tokenizeSimpleAdjacency(left) : []),
        { from: from.trim(), to: to.trim() } as DirectionalAdjacency,
        ...(right ? this.tokenizeSimpleAdjacency(right) : []),
      ];
    }

    // Check for simple directional adjacency
    if (rule.includes(">")) {
      const directionalMatch = rule.match(/^([^>]+)>([^>]+)$/);
      if (!directionalMatch || rule.match(/>/g)!.length > 1) {
        throw new Error("Invalid directional adjacency format");
      }
      const [_, from, to] = directionalMatch;
      return [{ from: from.trim(), to: to.trim() }];
    }

    // Must be a simple adjacency
    return this.tokenizeSimpleAdjacency(rule);
  }

  private static tokenizeSimpleAdjacency(rule: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";
    let inParens = false;

    for (let i = 0; i < rule.length; i++) {
      const char = rule[i];
      if (char === "(") {
        if (inParens) {
          throw new Error("Nested parentheses not allowed");
        }
        if (currentToken) {
          // Split current token into individual characters
          tokens.push(...currentToken.split(""));
          currentToken = "";
        }
        inParens = true;
      } else if (char === ")") {
        if (!inParens) {
          throw new Error("Unmatched closing parenthesis");
        }
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = "";
        }
        inParens = false;
      } else {
        currentToken += char;
      }
    }

    if (inParens) {
      throw new Error("Unmatched opening parenthesis");
    }

    if (currentToken) {
      if (!inParens) {
        // Split non-parenthesized content into individual characters
        tokens.push(...currentToken.split(""));
      } else {
        tokens.push(currentToken);
      }
    }

    return tokens.map((t) => t.trim()).filter((t) => t);
  }
}
