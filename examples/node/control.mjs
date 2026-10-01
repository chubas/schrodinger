// Reproducible runs, initial seeds, events and step-by-step execution.
//
//   npm run build && node examples/node/control.mjs
import { WFC, LogLevel, SquareGrid } from '../../dist/index.js';

const tile = (name, adjacencies, weight = 1) => ({ name, adjacencies, weight });
const tiles = [
  tile(' ', ['0', '0', '0', '0'], 3),
  tile('─', ['0', '1', '0', '1']),
  tile('│', ['1', '0', '1', '0']),
  tile('┌', ['0', '1', '1', '0']),
  tile('┐', ['0', '0', '1', '1']),
  tile('└', ['1', '1', '0', '0']),
  tile('┘', ['1', '0', '0', '1']),
];

const WIDTH = 16;
const HEIGHT = 4;
// The `seed` option makes a run repeatable. (You can also pass your own `random` source.)
const create = (seed) => new WFC(tiles, new SquareGrid(WIDTH, HEIGHT), { seed });
const picture = (wfc) => {
  const rows = Array.from({ length: HEIGHT }, () => '');
  for (const [cell, [, y]] of wfc.iterate()) rows[y] += cell.value.name;
  return rows.join('\n');
};

// 1. The same seed always gives the same result.
const first = create(7);
first.start();
const second = create(7);
second.start();
console.log(picture(first));
console.log(picture(first) === picture(second) ? '(seed 7 again: identical)\n' : '(seed 7 again: DIFFERENT)\n');

// 2. Events describe the run as it happens.
const observed = create(7);
let collapses = 0;
let backtracks = 0;
let restarts = 0;
observed.on('collapse', () => collapses++);
observed.on('backtrack', () => backtracks++);
observed.on('restart', () => restarts++);
observed.on('complete', () => console.log(`complete: ${collapses} collapses, ${backtracks} backtracks, ${restarts} restarts`));
observed.start();

// 3. An initial seed pins cells before the search starts.
const pinned = create(7);
pinned.start([{ coords: [0, 0], value: tiles[3] }]); // top-left must be ┌
console.log('\ntop-left pinned to ┌:\n' + picture(pinned));

// 4. execute() is a generator: one step per collapse or backtrack, so you can
// render each step, pause, or stop early. (The second argument turns off
// events, which we don't need here.)
const stepped = create(7);
let steps = 0;
for (const step of stepped.execute(undefined, false)) {
  if (step.type === 'collapse') steps++;
}
console.log(`\nstepped through ${steps} collapse steps`);

// 5. Failures are errors. "No solution exists" is proven; "Gave up" means the
// backtrack budget (maxRetries) ran out first. Failures are also logged at the
// default log level, which we silence here.
const impossible = new WFC(tiles, new SquareGrid(2, 1), { logLevel: LogLevel.NONE });
try {
  // A pipe going right from the first cell can't meet an empty tile.
  impossible.start([
    { coords: [0, 0], value: tiles[1] },
    { coords: [1, 0], value: tiles[0] },
  ]);
} catch (error) {
  console.log('error:', error.message);
}
