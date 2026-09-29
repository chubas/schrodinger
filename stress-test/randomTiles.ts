import seedrandom from "seedrandom";
import { TileDef } from "../src/TileDef.js";

// Square-grid direction order is top, right, bottom, left; opposite = (d + 2) % 4.
const DIRECTIONS = 4;
const opposite = (d: number) => (d + 2) % DIRECTIONS;

/**
 * Seeded random edge-label tileset for exercising backtracking. Two tiles are
 * compatible across an edge iff their facing labels are equal, so
 * compatibility is symmetric by construction; the set is regenerated until
 * every (tile, direction) has at least one compatible tile. Together that
 * keeps results comparable seed-by-seed across propagation implementations.
 */
export function generateRandomTiles(count: number, labels: number, seed: number): TileDef[] {
  const rng = seedrandom(`tileset-${seed}`);
  const pick = (n: number) => Math.floor(rng() * n);

  const everyEdgeSupported = (edges: number[][]) =>
    edges.every((e) =>
      e.every((label, d) => edges.some((other) => other[opposite(d)] === label)),
    );

  let edges: number[][];
  let attempts = 0;
  do {
    if (++attempts > 1000) {
      throw new Error(`Could not generate a fully supported tileset (${count} tiles, ${labels} labels)`);
    }
    edges = Array.from({ length: count }, () => Array.from({ length: DIRECTIONS }, () => pick(labels)));
  } while (!everyEdgeSupported(edges));

  return edges.map((e, t) => ({
    name: `R${t}`,
    adjacencies: e.map((label) => `L${label}`),
    weight: 1 + pick(3),
    draw: () => {},
  }));
}
