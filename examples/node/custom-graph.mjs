// A Grid doesn't have to be a grid. This one is a complete binary tree, and
// the rule is a two-colouring: neighbours must have different colours.
//
//   npm run build && node examples/node/custom-graph.mjs
import { WFC } from '../../dist/index.js';

const DEPTH = 4;
const NODE_COUNT = 2 ** DEPTH - 1;

// Each node has three "directions" (the slots its tiles' adjacencies refer to):
//   0 = left child, 1 = right child, 2 = parent
// Nodes are numbered in heap order: children of i are 2i+1 and 2i+2.
class BinaryTreeGrid {
  constructor() {
    this.cells = Array.from({ length: NODE_COUNT }, (_, i) => ({
      coords: [i], // coordinates can be any value; here, [node index]
      choices: [],
      collapsed: false,
    }));

    // adjacencyMaps[type][d] answers: "if I look at my neighbour in direction d,
    // which of ITS directions points back at me?" The answer may only depend on
    // the cell's type and d, so cells that need different answers need different
    // types. My children always see me as their parent (slot 2), but I see
    // myself as slot 0 of my parent if I'm a left child and slot 1 if I'm a right
    // child, so left and right children are different types.
    this.adjacencyMaps = {
      root: [2, 2, 0], // (no parent, so the last entry is never used)
      leftChild: [2, 2, 0],
      rightChild: [2, 2, 1],
    };
  }

  // What the engine calls:
  *iterate() {
    for (const cell of this.cells) yield [cell, cell.coords];
  }
  get([i]) {
    return this.cells[i] ?? null;
  }
  getNeighbors([i]) {
    // One entry per direction, in the same order as the tiles' adjacencies;
    // null where there is no neighbour.
    const parent = i === 0 ? null : this.cells[Math.floor((i - 1) / 2)];
    return [this.cells[2 * i + 1] ?? null, this.cells[2 * i + 2] ?? null, parent];
  }
  getAdjacencyType([i]) {
    return i === 0 ? 'root' : i % 2 === 1 ? 'leftChild' : 'rightChild';
  }
}

// [b>w] only matches [w>b] (see the grammar docs), so Black can only touch
// White and vice versa, in every direction.
const tiles = [
  { name: 'Black', adjacencies: ['[b>w]', '[b>w]', '[b>w]'] },
  { name: 'White', adjacencies: ['[w>b]', '[w>b]', '[w>b]'] },
];

const grid = new BinaryTreeGrid();
new WFC(tiles, grid).start();

// Print level by level.
for (let level = 0, first = 0; level < DEPTH; level++, first = 2 * first + 1) {
  const nodes = grid.cells.slice(first, first + 2 ** level);
  console.log(' '.repeat(2 ** (DEPTH - level) - 2) + nodes.map((c) => c.value.name[0]).join(' '.repeat(2 ** (DEPTH - level + 1) - 1)));
}
