// Generates a random layout of pipes.
//
//   npm run build && node examples/node/quickstart.mjs
//
// (In your own project, import from 'schrodinger' instead of the dist path.)
import { WFC, SquareGrid } from '../../dist/index.js';

// A tile is a name plus one adjacency rule per side, in the grid's direction
// order. For SquareGrid that's top, right, bottom, left. Two tiles can sit next
// to each other when the rules on their touching sides match; here the rules
// are just labels: "1" means a pipe crosses that edge, "0" means it doesn't.
const tile = (name, adjacencies, weight = 1) => ({ name, adjacencies, weight });

const tiles = [
  tile(' ', ['0', '0', '0', '0'], 3), // empty tiles are more likely
  tile('─', ['0', '1', '0', '1']),
  tile('│', ['1', '0', '1', '0']),
  tile('┌', ['0', '1', '1', '0']),
  tile('┐', ['0', '0', '1', '1']),
  tile('└', ['1', '1', '0', '0']),
  tile('┘', ['1', '0', '0', '1']),
];

const width = 40;
const height = 12;
const grid = new SquareGrid(width, height);
const wfc = new WFC(tiles, grid);

wfc.start(); // throws if no solution is found; see "Errors" in the README

// wfc.iterate() yields [cell, coords] pairs, row by row for a SquareGrid.
const rows = Array.from({ length: height }, () => '');
for (const [cell, [, y]] of wfc.iterate()) {
  rows[y] += cell.value.name;
}
console.log(rows.join('\n'));
