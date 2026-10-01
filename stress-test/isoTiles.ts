import { TileDef } from "../src/TileDef.js";

/**
 * Headless re-implementation of the tileset generated in iso.js.
 * Only the adjacency-relevant logic is kept (no p5/draw code), so the
 * WFC engine can be stress-tested against the exact same tile geometry
 * that produces the failures we're chasing, without pulling in the browser.
 */

// Adjacency transformation matrices (see iso.js for the geometric derivation)
const adjacenciesTransformA = ["AAaaaaaa", "BBDdbbDd", "CCDdccDd"].map((a) => a.split(""));

const adjacenciesTransformB = ["aaaaAAaa", "bbdDBBdD", "ccdDCCdD"].map((a) => a.split(""));

function getAdjacencies(config: number[], arr: number[], transform: string[][]): string[] {
  const result: string[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    const index1 = config[i];
    const index2 = config[i + 1];
    const v1 = arr[index1];
    const v2 = arr[index2];
    const t1 = transform[v1][i];
    const t2 = transform[v2][i + 1];
    result.push([t1, t2].join(""));
  }
  return result;
}

function iterateOverCombinations(elements: number[], places: number, fn: (c: number[]) => void): void {
  for (let i = 0; i < Math.pow(elements.length, places); i++) {
    const c = i
      .toString(elements.length)
      .padStart(places, "0")
      .split("")
      .map((e) => parseInt(e, 10));
    fn(c);
  }
}

const requiredPairsA = [
  [
    [0, 5],
    [2, 3],
  ],
  [
    [0, 1],
    [2, 6],
    [3, 4],
  ],
  [
    [1, 2],
    [4, 5],
    [3, 7],
  ],
];

const requiredPairsB = [
  [
    [1, 4],
    [6, 7],
  ],
  [
    [1, 2],
    [4, 5],
    [3, 7],
  ],
  [
    [0, 1],
    [2, 6],
    [3, 4],
  ],
];

function createTileA(types: number[]): TileDef {
  return {
    name: "A-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 1, 6, 7, 6, 4, 7], types, adjacenciesTransformA),
    weight: 1,
    draw: () => {},
  };
}

function createTileB(types: number[]): TileDef {
  return {
    name: "B-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 0, 2, 7, 6, 5, 3], types, adjacenciesTransformB),
    weight: 1,
    draw: () => {},
  };
}

function isValidArrangement(arrangement: number[], requiredPairs: number[][][]): boolean {
  for (let i = 0; i < 3; i++) {
    for (const pair of requiredPairs[i]) {
      if (
        (arrangement[pair[0]] === i || arrangement[pair[1]] === i) &&
        arrangement[pair[0]] !== arrangement[pair[1]]
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Regenerates the same triangular tileset used by iso.js. Tile count and
 * adjacency labels are fully deterministic (no RNG involved here), so this
 * always reproduces the exact tileset the graphical demo runs against.
 */
export function generateIsoTiles(): TileDef[] {
  const possibleTilesA: number[][] = [];
  const possibleTilesB: number[][] = [];

  iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
    if (isValidArrangement(arrangement, requiredPairsA)) {
      possibleTilesA.push(arrangement);
    }
  });

  iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
    if (isValidArrangement(arrangement, requiredPairsB)) {
      possibleTilesB.push(arrangement);
    }
  });

  const tiles: TileDef[] = [...possibleTilesA.map(createTileA), ...possibleTilesB.map(createTileB)];

  tiles.forEach((tile, i) => {
    tile.id = String(i);
  });

  return tiles;
}
