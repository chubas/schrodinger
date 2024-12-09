export type TileDef = {
  /** Name of the tile */
  name: string;

  /**
   * List of adjacency definitions.
   * The adjacency is an arbitrary string that must match the adjacency of another tile.
   * It can accept multiple adjacencies as strings joined by |
   * The adjacencies are ordered: top, right, bottom, left
   * Example: ["A", "B", "A|B", "C"]
  */
  adjacencies: string[];

  rotation?: number;
  reflection?: number;
  weight?: number;

  /**
   * Method to render the tile. Defaults to a no-operation method if not provided.
   */
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
    let result: string[][] = [];
    let adjacencyDefs = adjacency.split("|");
    for (let adjacencyDef of adjacencyDefs) {
      // Adjacencies can be a single character, or a sequence of characters between parentheses (except `(`, `)`, and `|`)
      let adjacencyDefParts = adjacencyDef.match(/\(([^)]+)\)|./g);
      if (adjacencyDefParts) {
        let adjacencyDefPartsCleaned = adjacencyDefParts.map(part => part.replace(/[()]/g, ""));
        result.push(adjacencyDefPartsCleaned);
      }
    }
    return result;
  }
}