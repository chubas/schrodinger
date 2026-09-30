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

// A seedable RNG is any object with random() and setSeed(). This is
// mulberry32, a tiny deterministic generator; any seedable PRNG works
// (for example the `seedrandom` package).
function seededRandom(seed) {
  let state = seed >>> 0;
  return {
    random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    setSeed(newSeed) {
      state = newSeed >>> 0;
    },
  };
}

const WIDTH = 16;
const HEIGHT = 4;
const create = (seed) => new WFC(tiles, new SquareGrid(WIDTH, HEIGHT), { random: seededRandom(seed) });
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
observed.on('collapse', () => collapses++);
observed.on('backtrack', () => backtracks++);
observed.on('complete', () => console.log(`complete: ${collapses} collapses, ${backtracks} backtracks`));
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
