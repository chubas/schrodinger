import { TileDef } from "./TileDef.js";
import { Rule, parseAdjacencyRule } from "./AdjacencyGrammar.js";
import { matchAdjacencies } from "./Adjacencies.js";
import { PrecomputedAdjacencies } from "./PrecomputedAdjacencies.js";

/**
 * Tile compatibility, indexed by tile position in the tileset, for every
 * (adjacency type, direction) the grid defines.
 *
 * compatible(type, d, t) lists the tiles allowed in the neighbor at direction
 * `d` of a cell of `type` holding tile `t`; supporters(type, d, t2) is the
 * transpose (the tiles `t` for which `t2` is allowed there).
 *
 * Rows come from precomputed adjacencies when present for that (tile, type,
 * direction), otherwise from matching the tiles' adjacency rules, each parsed
 * once. Built eagerly: cost is O(types · D · T²) rule matches without
 * precomputed adjacencies.
 */
export class AdjacencyTables {
  readonly tileCount: number;
  private readonly typeIndexByName = new Map<string, number>();
  private readonly directionCounts: number[] = [];
  private readonly compat: Int32Array[][][] = [];
  private readonly inverse: Int32Array[][][] = [];
  // Per (type, direction): a T x T bit matrix for O(1) pair checks.
  private readonly bits: Uint32Array[][] = [];
  private readonly wordsPerRow: number;

  constructor(
    tileDefs: TileDef[],
    adjacencyMaps: Record<string, number[]>,
    precomputed?: PrecomputedAdjacencies,
  ) {
    const T = tileDefs.length;
    this.tileCount = T;
    this.wordsPerRow = Math.ceil(T / 32);

    const indexByName = new Map<string, number>();
    tileDefs.forEach((tile, i) => indexByName.set(tile.name, i));

    let rules: (Rule | undefined)[][] | undefined;
    const ruleRow = (typeName: string, d: number, t: number): number[] => {
      rules ??= tileDefs.map((tile) => tile.adjacencies.map(toRule));
      const oppositeDirection = adjacencyMaps[typeName][d];
      const own = rules[t][d];
      const row: number[] = [];
      if (!own) return row;
      for (let t2 = 0; t2 < T; t2++) {
        const other = rules[t2][oppositeDirection];
        if (other && matchAdjacencies(own, other)) row.push(t2);
      }
      return row;
    };

    for (const [typeName, map] of Object.entries(adjacencyMaps)) {
      const type = this.directionCounts.length;
      const D = map.length;
      this.typeIndexByName.set(typeName, type);
      this.directionCounts.push(D);

      const compatByDir: Int32Array[][] = [];
      const bitsByDir: Uint32Array[] = [];
      for (let d = 0; d < D; d++) {
        const rows: Int32Array[] = [];
        const matrix = new Uint32Array(T * this.wordsPerRow);
        for (let t = 0; t < T; t++) {
          const names = precomputed?.[tileDefs[t].name]?.[typeName]?.[d];
          const row = names
            ? names.map((n) => indexByName.get(n)).filter((i): i is number => i !== undefined)
            : ruleRow(typeName, d, t);
          const sorted = Int32Array.from(new Set(row)).sort();
          rows.push(sorted);
          for (const t2 of sorted) matrix[t * this.wordsPerRow + (t2 >>> 5)] |= 1 << (t2 & 31);
        }
        compatByDir.push(rows);
        bitsByDir.push(matrix);
      }
      this.compat.push(compatByDir);
      this.bits.push(bitsByDir);
      this.inverse.push(compatByDir.map((rows) => transpose(rows, T)));
    }
  }

  typeIndex(typeName: string): number {
    const type = this.typeIndexByName.get(typeName);
    if (type === undefined) throw new Error(`Unknown adjacency type "${typeName}"`);
    return type;
  }

  directions(type: number): number {
    return this.directionCounts[type];
  }

  compatible(type: number, d: number, t: number): Int32Array {
    return this.compat[type][d]?.[t] ?? EMPTY;
  }

  supporters(type: number, d: number, t2: number): Int32Array {
    return this.inverse[type][d]?.[t2] ?? EMPTY;
  }

  isCompatible(type: number, d: number, t: number, t2: number): boolean {
    const matrix = this.bits[type][d];
    if (!matrix) return false;
    return ((matrix[t * this.wordsPerRow + (t2 >>> 5)] >>> (t2 & 31)) & 1) === 1;
  }
}

const EMPTY = new Int32Array(0);

function toRule(value: string | Rule | undefined): Rule | undefined {
  if (typeof value !== "string") return value;
  const parsed = parseAdjacencyRule(value);
  if (parsed instanceof Error) throw new Error(`Failed to parse adjacency rule: ${parsed.message}`);
  return parsed;
}

function transpose(rows: Int32Array[], T: number): Int32Array[] {
  const lists: number[][] = Array.from({ length: T }, () => []);
  rows.forEach((row, t) => {
    for (const t2 of row) lists[t2].push(t);
  });
  return lists.map((list) => Int32Array.from(list));
}
