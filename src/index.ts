import { SquareGrid } from "./Grid.js";
import { DeltaChange, WFC } from "./WFC.js";
import { TileDef } from "./TileDef.js";
import { RandomLib } from "./RandomLib.js";
import { debugDelta } from "./util.js";
import seedrandom from "seedrandom";

class SeedRandom implements RandomLib {
  private rng: any;

  constructor(seed?: string | number) {
    this.rng = seed === undefined ? seedrandom() : seedrandom(seed as string);
  }

  random(): number {
    const n = this.rng();
    // console.log('-> ',  n);
    rngs.push(n);
    return n;
  }

  setSeed(seed: string): void {
    this.rng = seedrandom(seed);
  }
}

const tiledefs: TileDef[] = [
  // {
  //   // name: "empty",
  //   name: ".",
  //   adjacencies: ["E", "E", "E", "E"],
  //   draw: () => { process.stdout.write("."); }
  // },
  {
    // name: "horizontal wall",
    name: "─",
    adjacencies: ["E", "W", "E", "W"],
    draw: () => {
      process.stdout.write("─");
    },
  },
  {
    // name: "vertical wall",
    name: "│",
    adjacencies: ["W", "E", "W", "E"],
    draw: () => {
      process.stdout.write("│");
    },
  },
  {
    // name: "topleft corner",
    name: "┌",
    adjacencies: ["E", "W", "W", "E"],
    draw: () => {
      process.stdout.write("┌");
    },
  },
  {
    // name: "topright corner",
    name: "┐",
    adjacencies: ["E", "E", "W", "W"],
    draw: () => {
      process.stdout.write("┐");
    },
  },
  {
    // name: "bottomleft corner",
    name: "└",
    adjacencies: ["W", "W", "E", "E"],
    draw: () => {
      process.stdout.write("└");
    },
  },
  {
    // name: "bottomright corner",
    name: "┘",
    adjacencies: ["W", "E", "E", "W"],
    draw: () => {
      process.stdout.write("┘");
    },
  },
];

const rngs: number[] = [];
const grid = new SquareGrid(3, 3);
// let r = Math.floor(Math.random() * 10000);
// const r = process.argv[2] || 100;
let r = "65"; // This seed fails with an uncollapsable error
// let r = "63"; // requires backtracking
// console.log('Initial seed:', r);

const random = new SeedRandom(r);

const debugQueue = (queue: DeltaChange<[number, number]>[]) => {
  console.log("Queue:");
  for (const delta of queue) {
    debugDelta(delta);
  }
};

const wfc = new WFC(tiledefs, grid, { random });
const debugWFC = (clean = false) => {
  // Iterate over all the tiles in the grid, and draw them
  const iterator = grid.iterate();
  let lastRow = 0;
  for (const [cell, [x, y]] of iterator) {
    if (y > lastRow) {
      process.stdout.write("\n");
      lastRow = y;
    }
    if (!clean) {
      process.stdout.write(cell.collapsed ? "(" : "[");
    }
    for (const choice of cell.choices) {
      choice.draw();
    }
    if (!clean) {
      process.stdout.write(cell.collapsed ? ")" : "]");
    }
  }
};

let maxTries = 10000;
while (!wfc.completed && maxTries > 0) {
  maxTries--;
  debugWFC();
  console.log('\n')
  const { collapsed, reverted } = wfc.generate();
  console.log(
    "Collapsed:",
    collapsed.map((c) => c.coords),
    "Reverted:",
    reverted.map((c) => c.coords),
  );
}

debugWFC(true);
// console.log('\n')
console.log("Seed:", r);
console.log(rngs.map((n) => n.toFixed(2)).join(","));

// Try with seeds from 0 to 100, until one fails, to find a seed that fails
// let seed = 0;
// let seedFound = false;
// while (!seedFound && seed < 100) {
//   // console.log('Trying seed:', seed);
//   random.setSeed('' + seed);
//   grid = new SquareGrid(4, 4);
//   wfc = new WFC(tiledefs, grid, { random });
//   try {
//     while (!wfc.completed && maxTries > 0) {
//       maxTries--;
//       let { collapsed, reverted } = wfc.generate();
//     }
//     console.log('Seed', seed, 'succeeded');
//   } catch (e) {
//     console.log('Backtracking needed on seed', seed);
//     debugWFC(true);
//     console.log("\n");
//   }
//   seed++
// }

// For testing, use this seed rng
// 0.22,0.56,0.90,0.98,0.39,0.03,0.99,0.99,0.25,0.80,0.16,0.21,0.19,0.51,0.51,0.66,0.91,0.79,0.61,0.16,0.09,0.03,0.08,0.54,0.89,0.79,0.17,0.80,0.56,0.69,0.89,0.74,0.90,0.51,0.75,0.15,0.19,0.71,0.57,0.75,0.67,0.60,0.70,0.11,0.03,0.93,0.12,0.11,0.52,0.54,0.80,0.93,0.27,0.72,0.95,0.97,0.32,0.77,0.18,0.02,0.59,0.84
// In a 6 by 6 grid
