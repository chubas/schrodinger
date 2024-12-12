export type TileDef = {
  /**
   * List of adjacency definitions.
   * The adjacency is an arbitrary string that must match the adjacency of another tile.
   * It can accept multiple adjacencies as strings joined by |
   * The adjacencies are ordered: top, right, bottom, left
   * Example: ["A", "B", "A|B", "C"]
   */
  adjacencies: string[];
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
      adjacencies: tile.adjacencies ?? [],
      rotation: tile.rotation ?? 0,
      reflection: tile.reflection ?? 0,
      draw: tile.draw ?? (() => {}),
    };
  }

  static extractAdjacencies = (adjacency: string): string[][] => {
    const result: string[][] = [];
    const adjacencyDefs = adjacency.split("|");
    for (const adjacencyDef of adjacencyDefs) {
      // Adjacencies can be a single character, or a sequence of characters between parentheses (except `(`, `)`, and `|`)
      const adjacencyDefParts = adjacencyDef.match(/\(([^)]+)\)|./g);
      if (adjacencyDefParts) {
        const adjacencyDefPartsCleaned = adjacencyDefParts.map((part) =>
          part.replace(/[()]/g, ""),
        );
        result.push(adjacencyDefPartsCleaned);
      }
    }
    return result;
  };
}
