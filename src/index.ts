import { SquareGrid } from "./Grid.js";
import { DeltaChange, WFC, CellCollapse } from "./WFC.js";
import { TileDef } from "./TileDef.js";
import { RandomLib } from "./RandomLib.js";
import { Cell } from "./Grid.js";
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
// let r = "1"; // This seed fails with an uncollapsable error
let r = "321"; // requires backtracking
console.log('Initial seed:', r);

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

// Set up event listeners
wfc.on('collapse', (group) => {
  debugWFC();
  console.log('\nCollapsed:', group.cells.map((c: CellCollapse) => c.coords), ' due to ', group.cause);
});

wfc.on('propagate', (cells) => {
  console.log('Propagated to:', cells.map((c: Cell) => c.coords));
});

wfc.on('backtrack', (from) => {
  console.log('Backtracking from:', from.cells.map((c: CellCollapse) => c.coords));
  console.log('RNG sequence:', rngs.map((n) => n.toFixed(2)).join(","));
});

wfc.on('complete', () => {
  console.log('\nWFC completed successfully!\n');
  debugWFC(true);
  console.log('\nRNG sequence:', rngs.map((n) => n.toFixed(2)).join(","));
  // Print manually the grid
  let str = '';
  let lastRow = 0;
  for (const [cell, [x, y]] of grid.iterate()) {
    console.log(x, y, cell.choices);
    if (y > lastRow) {
      str += '\n';
      lastRow = y;
    }
    let value = cell.choices[0]?.name;
    str += value;
  }
  console.log(str);

});

wfc.on('error', (error) => {
  console.error('Error during WFC:', error);
  debugWFC(true);
  console.log('\nRNG sequence:', rngs.map((n) => n.toFixed(2)).join(","));
  // exit with error code
  process.exit(1);
});

// Start the WFC process
wfc.start();