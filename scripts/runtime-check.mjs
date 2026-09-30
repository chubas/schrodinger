// Smoke test for the built package on the Node version running it: loads the
// ESM and CommonJS builds from dist/, generates a seeded layout with each, and
// checks that both give the same, expected result. Needs only a built dist/
// and `parsimmon` (no dev tools), so CI can run it on every supported Node.
//
//   npm run build && node scripts/runtime-check.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const require = createRequire(import.meta.url);

const esm = await import(join(dist, "index.js"));
const cjs = require(join(dist, "index.cjs"));
const esmNode = await import(join(dist, "node.js"));
const cjsNode = require(join(dist, "node.cjs"));

const tiles = [
  { name: "a", adjacencies: ["x", "x", "x", "x"] },
  { name: "b", adjacencies: ["x", "x", "x", "x"] },
];
const generate = ({ WFC, SquareGrid }) => {
  const wfc = new WFC(tiles, new SquareGrid(8, 8), { seed: 5 });
  wfc.start();
  return Array.from(wfc.iterate(), ([cell]) => cell.value.name).join("");
};

const fromEsm = generate(esm);
const fromCjs = generate(cjs);
// A seeded run must give the same result on every Node version and platform.
const expected = "aaabababbabbbbbbaabaababbbabbaabbaababbabaaabbabbaaabababaabbaab";

const problems = [];
if (fromEsm !== fromCjs) problems.push("ESM and CommonJS builds gave different results");
if (fromEsm !== expected) problems.push(`seeded result changed: ${fromEsm}`);
if (typeof esmNode.TilesetImporter?.loadFromFile !== "function") problems.push("ESM /node entry is missing TilesetImporter");
if (typeof cjsNode.TilesetImporter?.loadFromFile !== "function") problems.push("CommonJS /node entry is missing TilesetImporter");

if (problems.length > 0) {
  console.error(`node ${process.version}: FAILED\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`node ${process.version}: ok`);
