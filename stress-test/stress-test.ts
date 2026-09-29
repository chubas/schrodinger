/**
 * Headless WFC stress test.
 *
 * Runs the engine (no graphics, no p5) across many seeds, looking for seeds
 * that fail, collecting statistics (entropy, collapses, backtrack
 * count/size/depth), validating every produced solution, and fingerprinting
 * each run so results can be compared exactly against a recorded baseline.
 *
 * Usage:
 *   npm run stress-test -- [options]
 *
 * See --help for options.
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { performance } from "perf_hooks";
import seedrandom from "seedrandom";

import { WFC, LogLevel, BACKTRACK_STRATEGIES, StepResult } from "../src/WFC.js";
import { SquareGrid } from "../src/Grid.js";
import { TileDef } from "../src/TileDef.js";
import { RandomLib } from "../src/RandomLib.js";
import { AdjacencyPrecomputer, PrecomputedAdjacencies } from "../src/PrecomputedAdjacencies.js";
import { generateIsoTiles } from "./isoTiles.js";
import { generateRandomTiles } from "./randomTiles.js";

type StrategyName = keyof typeof BACKTRACK_STRATEGIES;
type TilesetName = "iso" | "random";

interface Options {
  runs: number;
  startSeed: number;
  seed?: number;
  width: number;
  height: number;
  strategy: StrategyName;
  maxRetries: number;
  tileset: TilesetName;
  randomTiles: number;
  randomLabels: number;
  tilesetSeed: number;
  verbose: boolean;
  quiet: boolean;
  fast: boolean;
  stopOnFailure: boolean;
  checkInvariants: boolean;
  maxFailures: number;
  allowFailures: boolean;
  compare?: string;
  output: string;
}

interface RunResult {
  seed: number;
  success: boolean;
  error?: string;
  // Hash of the full step trace (every collapse/backtrack) plus the final
  // grid on success, or the error on failure. Identical fingerprints mean
  // the engine made exactly the same decisions for this seed.
  fingerprint: string;
  // Independent check of the produced solution; null when the run failed.
  valid: boolean | null;
  validationError?: string;
  durationMs: number;
  steps: number;
  collapses: number;
  backtracks: number;
  backtrackDepths: number[];
  backtrackSizes: number[];
  avgEntropy: number;
  suspectedSnapshotBug: boolean;
  consoleErrors: string[];
  consoleWarns: string[];
}

// Config keys that must match for a baseline comparison to be meaningful.
const COMPARABLE_KEYS: (keyof Options)[] = [
  "tileset",
  "width",
  "height",
  "strategy",
  "randomTiles",
  "randomLabels",
  "tilesetSeed",
];

// ---------------------------------------------------------------------------
// Seedable RNG (RandomLib backed by the `seedrandom` package, already a
// project dependency) so every run is independently reproducible by seed.
// ---------------------------------------------------------------------------
class SeedRandom implements RandomLib {
  private rng: seedrandom.PRNG;

  constructor(seed: number | string) {
    this.rng = seedrandom(String(seed));
  }

  random(): number {
    return this.rng();
  }

  setSeed(seed: string | number): void {
    this.rng = seedrandom(String(seed));
  }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function printHelp(): void {
  console.log(`
WFC Headless Stress Test

Usage:
  npm run stress-test -- [options]

Options:
  --runs <n>             Number of seeds to try (default: 1000)
  --start-seed <n>       First seed to use; seeds run start-seed..start-seed+runs-1 (default: 1)
  --seed <n>             Run exactly one specific seed (overrides --runs/--start-seed)
  --width <n>            Grid width in tiles (default: 10, matches iso.js)
  --height <n>           Grid height in tiles (default: 15, matches iso.js)
  --strategy <name>      Backtrack strategy: conservative | aggressive | deep (default: conservative)
  --max-retries <n>      Passed through as WFCOptions.maxRetries (default: 10)
  --tileset <name>       iso (the iso.js tileset, default) | random (seeded edge-label tileset)
  --random-tiles <n>     Tile count for --tileset random (default: 24)
  --random-labels <n>    Distinct edge labels for --tileset random (default: 4)
  --tileset-seed <n>     Seed for generating --tileset random (default: 1)
  --verbose              Enable LogLevel.DEBUG on the WFC instance (best with --seed)
  --quiet                Only print the final summary, no per-run lines
  --fast                 Skip per-step grid introspection (entropy/backtrack-size); fingerprints are unaffected
  --stop-on-failure      Stop at the first failing seed
  --check-invariants     Enable WFCOptions.debugChecks (recompute propagation state after every step; slow)
  --max-failures <n>     Stop after collecting this many failures (0 = unlimited, default)
  --allow-failures       Don't exit non-zero just because some seeds had no solution
  --compare <file>       Compare fingerprints against a previous results file; exits non-zero on any mismatch
  --output <file>        Where to write the full JSON results (default: stress-test/results/run-<timestamp>.json)
  --help                 Show this help

The process exits non-zero if any produced solution is invalid, if --compare
finds a mismatch, or if any seed failed (unless --allow-failures).

Examples:
  # Stress test with defaults (1000 seeds, iso.js grid size)
  npm run stress-test

  # Reproduce a specific failing seed with full debug logging
  npm run stress-test -- --seed 126985 --verbose

  # Record a baseline, then compare a later engine version against it
  npm run stress-test -- --output stress-test/baselines/iso.json
  npm run stress-test -- --compare stress-test/baselines/iso.json
`);
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    runs: 1000,
    startSeed: 1,
    width: 10,
    height: 15,
    strategy: "conservative",
    maxRetries: 10,
    tileset: "iso",
    randomTiles: 24,
    randomLabels: 4,
    tilesetSeed: 1,
    verbose: false,
    quiet: false,
    fast: false,
    stopOnFailure: false,
    checkInvariants: false,
    maxFailures: 0,
    allowFailures: false,
    output: path.join(process.cwd(), "stress-test", "results", `run-${Date.now()}.json`),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--runs":
        opts.runs = parseInt(args[++i], 10);
        break;
      case "--start-seed":
        opts.startSeed = parseInt(args[++i], 10);
        break;
      case "--seed":
        opts.seed = parseInt(args[++i], 10);
        break;
      case "--width":
        opts.width = parseInt(args[++i], 10);
        break;
      case "--height":
        opts.height = parseInt(args[++i], 10);
        break;
      case "--strategy":
        opts.strategy = args[++i] as StrategyName;
        break;
      case "--max-retries":
        opts.maxRetries = parseInt(args[++i], 10);
        break;
      case "--tileset":
        opts.tileset = args[++i] as TilesetName;
        break;
      case "--random-tiles":
        opts.randomTiles = parseInt(args[++i], 10);
        break;
      case "--random-labels":
        opts.randomLabels = parseInt(args[++i], 10);
        break;
      case "--tileset-seed":
        opts.tilesetSeed = parseInt(args[++i], 10);
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--fast":
        opts.fast = true;
        break;
      case "--check-invariants":
        opts.checkInvariants = true;
        break;
      case "--stop-on-failure":
        opts.stopOnFailure = true;
        break;
      case "--max-failures":
        opts.maxFailures = parseInt(args[++i], 10);
        break;
      case "--allow-failures":
        opts.allowFailures = true;
        break;
      case "--compare":
        opts.compare = args[++i];
        break;
      case "--output":
        opts.output = args[++i];
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  if (!BACKTRACK_STRATEGIES[opts.strategy]) {
    console.error(`Unknown strategy "${opts.strategy}". Valid: ${Object.keys(BACKTRACK_STRATEGIES).join(", ")}`);
    process.exit(1);
  }
  if (opts.tileset !== "iso" && opts.tileset !== "random") {
    console.error(`Unknown tileset "${opts.tileset}". Valid: iso, random`);
    process.exit(1);
  }

  return opts;
}

function tilesetArgs(opts: Options): string {
  return opts.tileset === "random"
    ? `--tileset random --random-tiles ${opts.randomTiles} --random-labels ${opts.randomLabels} --tileset-seed ${opts.tilesetSeed}`
    : "--tileset iso";
}

function buildTileset(opts: Options): TileDef[] {
  return opts.tileset === "random"
    ? generateRandomTiles(opts.randomTiles, opts.randomLabels, opts.tilesetSeed)
    : generateIsoTiles();
}

// ---------------------------------------------------------------------------
// Grid introspection helpers
// ---------------------------------------------------------------------------
function gridStats(wfc: WFC): { avgEntropy: number; collapsedCount: number } {
  let sumChoices = 0;
  let uncollapsed = 0;
  let collapsedCount = 0;

  for (const [cell] of wfc.iterate()) {
    if (cell.collapsed) {
      collapsedCount++;
    } else {
      uncollapsed++;
      sumChoices += cell.choices.length;
    }
  }

  return {
    avgEntropy: uncollapsed > 0 ? sumChoices / uncollapsed : 0,
    collapsedCount,
  };
}

/**
 * Checks a finished grid against the adjacency table directly, independently
 * of how the engine propagated: every cell collapsed, and every neighboring
 * pair compatible. Returns a description of the first problem, if any.
 */
function validateSolution(grid: SquareGrid, precomputed: PrecomputedAdjacencies): string | undefined {
  for (const [cell, coords] of grid.iterate()) {
    if (!cell.collapsed || !cell.value) return `cell ${coords} is not collapsed`;

    const type = grid.getAdjacencyType(coords);
    const neighbors = grid.getNeighbors(coords);
    for (let d = 0; d < neighbors.length; d++) {
      const neighbor = neighbors[d];
      if (!neighbor) continue;
      if (!neighbor.value) return `neighbor of ${coords} in direction ${d} has no value`;
      if (!precomputed[cell.value.name][type][d].includes(neighbor.value.name)) {
        return `${cell.value.name}@${coords} is incompatible with ${neighbor.value.name} in direction ${d}`;
      }
    }
  }
  return undefined;
}

function traceEntry(step: StepResult): string {
  if (step.type === "collapse") {
    const cells = step.group?.cells ?? [];
    return "C:" + cells.map((c) => `${c.coords.join(",")}=${c.value?.name}`).join(";");
  }
  if (step.type === "backtrack") return `B:${step.depth}`;
  return "done";
}

// ---------------------------------------------------------------------------
// Single-seed run
// ---------------------------------------------------------------------------
function runOnce(seed: number, tiles: TileDef[], precomputed: PrecomputedAdjacencies, opts: Options): RunResult {
  const grid = new SquareGrid(opts.width, opts.height);
  const rng = new SeedRandom(seed);
  const strategy = BACKTRACK_STRATEGIES[opts.strategy];

  const wfc = new WFC(tiles, grid, {
    random: rng,
    maxRetries: opts.maxRetries,
    backtrackStrategy: strategy,
    logLevel: opts.verbose ? LogLevel.DEBUG : LogLevel.NONE,
    debugChecks: opts.checkInvariants,
  });
  wfc.setPrecomputedAdjacencies(precomputed);

  let collapses = 0;
  const backtrackDepths: number[] = [];
  const backtrackSizes: number[] = [];
  const entropySamples: number[] = [];
  const trace = createHash("sha1");
  let steps = 0;
  let success = false;
  let error: string | undefined;

  // The engine's SnapshotManager logs restoration failures directly via
  // console.error/warn regardless of logLevel - that's our best signal for
  // "backtrack didn't behave as expected" bugs (e.g. trying to restore a
  // snapshot that was never created). Capture it per run.
  const consoleErrors: string[] = [];
  const consoleWarns: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...a: unknown[]) => {
    consoleErrors.push(a.map(String).join(" "));
  };
  console.warn = (...a: unknown[]) => {
    consoleWarns.push(a.map(String).join(" "));
  };

  const startTime = performance.now();
  try {
    // emitEvents=false: we don't listen for events, so skip that overhead;
    // the generator still yields a StepResult per collapse/backtrack/complete.
    const generator = wfc.execute(undefined, false);
    let prevCollapsedCount = 0;

    for (;;) {
      steps++;

      if (!opts.fast) {
        const pre = gridStats(wfc);
        entropySamples.push(pre.avgEntropy);
        prevCollapsedCount = pre.collapsedCount;
      }

      const stepResult = generator.next();
      if (stepResult.done) {
        success = true;
        break;
      }

      const value: StepResult = stepResult.value;
      trace.update(traceEntry(value) + "\n");
      if (value.type === "collapse") {
        collapses++;
      } else if (value.type === "backtrack") {
        backtrackDepths.push(value.depth ?? -1);
        if (!opts.fast) {
          const after = gridStats(wfc);
          backtrackSizes.push(Math.max(0, prevCollapsedCount - after.collapsedCount));
        }
      }
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  const durationMs = performance.now() - startTime;

  // A failed run's grid is a mid-propagation contradiction whose exact
  // contents depend on propagation order, so only the trace and error are
  // fingerprinted in that case.
  let valid: boolean | null = null;
  let validationError: string | undefined;
  if (success) {
    validationError = validateSolution(grid, precomputed);
    valid = validationError === undefined;
    const finalGrid: string[] = [];
    for (const [cell] of grid.iterate()) finalGrid.push(cell.value?.name ?? "?");
    trace.update("OK:" + finalGrid.join(","));
  } else {
    trace.update("ERR:" + error);
  }

  const avgEntropy = entropySamples.length
    ? entropySamples.reduce((a, b) => a + b, 0) / entropySamples.length
    : 0;
  const suspectedSnapshotBug = consoleErrors.some((m) => /Snapshot .* not found/.test(m));

  return {
    seed,
    success,
    error,
    fingerprint: trace.digest("hex").slice(0, 16),
    valid,
    validationError,
    durationMs,
    steps,
    collapses,
    backtracks: backtrackDepths.length,
    backtrackDepths,
    backtrackSizes,
    avgEntropy,
    suspectedSnapshotBug,
    consoleErrors: Array.from(new Set(consoleErrors)),
    consoleWarns: Array.from(new Set(consoleWarns)),
  };
}

// ---------------------------------------------------------------------------
// Aggregation / reporting
// ---------------------------------------------------------------------------
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Math.min/max(...arr) overflows the call stack on large arrays.
function minMax(arr: number[]): string {
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return `${min}/${avg(arr).toFixed(2)}/${max}`;
}

function printSummary(results: RunResult[], overallDurationMs: number, opts: Options): void {
  const n = results.length;
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const invalid = results.filter((r) => r.valid === false);
  const bugHits = results.filter((r) => r.suspectedSnapshotBug);

  console.log("\n========== Stress Test Summary ==========");
  console.log(
    `Tileset: ${opts.tileset}  Grid: ${opts.width}x${opts.height}  Strategy: ${opts.strategy}  MaxRetries option: ${opts.maxRetries}`,
  );
  console.log(`Runs: ${n}  Success: ${successes.length} (${((successes.length / n) * 100).toFixed(1)}%)  Failures: ${failures.length}`);
  console.log(`Invalid solutions: ${invalid.length}`);
  console.log(`Total time: ${(overallDurationMs / 1000).toFixed(2)}s  Avg/run: ${(overallDurationMs / n).toFixed(2)}ms`);
  console.log(`Avg collapses/run: ${avg(results.map((r) => r.collapses)).toFixed(2)}`);
  console.log(`Avg backtracks/run: ${avg(results.map((r) => r.backtracks)).toFixed(2)}`);

  if (!opts.fast) {
    console.log(`Avg entropy (mean of per-run averages): ${avg(results.map((r) => r.avgEntropy)).toFixed(3)}`);

    const allBacktrackSizes = results.flatMap((r) => r.backtrackSizes);
    if (allBacktrackSizes.length) {
      console.log(`Backtrack size (#cells reverted) - min/avg/max: ${minMax(allBacktrackSizes)}`);
    }
  }

  const allDepths = results.flatMap((r) => r.backtrackDepths);
  if (allDepths.length) {
    console.log(`Backtrack depth - min/avg/max: ${minMax(allDepths)}`);
  }

  const topBacktracking = [...results].sort((a, b) => b.backtracks - a.backtracks).slice(0, 10);
  if (topBacktracking.some((r) => r.backtracks > 0)) {
    console.log("\nTop seeds by backtrack count:");
    for (const r of topBacktracking) {
      if (r.backtracks === 0) break;
      console.log(`  seed=${r.seed}  backtracks=${r.backtracks}  collapses=${r.collapses}  success=${r.success}`);
    }
  }

  if (invalid.length) {
    console.log(`\nINVALID solutions (${invalid.length}):`);
    for (const r of invalid.slice(0, 20)) {
      console.log(`  seed=${r.seed}  ${r.validationError}`);
    }
  }

  if (failures.length) {
    console.log(`\nFailing seeds (${failures.length}):`);
    for (const r of failures.slice(0, 50)) {
      console.log(`  seed=${r.seed}  error="${r.error}"  suspectedSnapshotBug=${r.suspectedSnapshotBug}  backtracks=${r.backtracks}`);
    }
    if (failures.length > 50) {
      console.log(`  ... and ${failures.length - 50} more (see output file)`);
    }
    console.log("\nReproduce a failing seed with full debug logging:");
    console.log(
      `  npm run stress-test -- --seed ${failures[0].seed} ${tilesetArgs(opts)} --width ${opts.width} --height ${opts.height} --strategy ${opts.strategy} --verbose`,
    );
  }

  if (bugHits.length) {
    console.log(
      `\nWARNING: ${bugHits.length} run(s) hit a "Snapshot not found" restoration failure inside the backtracking system ` +
        `(seeds: ${bugHits.slice(0, 20).map((r) => r.seed).join(", ")}${bugHits.length > 20 ? ", ..." : ""}). ` +
        "This means the backtrack tree offered an ancestor node with no matching snapshot (e.g. the root) as viable - a likely root cause for the 'backtrack behaved unexpectedly' reports.",
    );
  }

  console.log("==========================================\n");
}

/**
 * Compares fingerprints seed-by-seed against a previous results file and
 * returns the number of mismatching seeds.
 */
function compareWithBaseline(results: RunResult[], opts: Options): number {
  const file = opts.compare!;
  const baseline = JSON.parse(fs.readFileSync(file, "utf8")) as { config: Partial<Options>; results: RunResult[] };

  for (const key of COMPARABLE_KEYS) {
    if (baseline.config[key] !== undefined && baseline.config[key] !== opts[key]) {
      console.log(`WARNING: baseline ${key}=${baseline.config[key]} but this run has ${key}=${opts[key]}`);
    }
  }

  const bySeed = new Map(baseline.results.map((r) => [r.seed, r]));
  const mismatches: { current: RunResult; expected: RunResult }[] = [];
  let missing = 0;

  for (const current of results) {
    const expected = bySeed.get(current.seed);
    if (!expected) {
      missing++;
    } else if (expected.fingerprint !== current.fingerprint) {
      mismatches.push({ current, expected });
    }
  }

  const compared = results.length - missing;
  console.log(
    `Compare vs ${file}: ${compared - mismatches.length}/${compared} identical, ${mismatches.length} mismatched, ${missing} not in baseline`,
  );
  for (const { current, expected } of mismatches.slice(0, 10)) {
    console.log(
      `  seed=${current.seed}  expected success=${expected.success} collapses=${expected.collapses} backtracks=${expected.backtracks}` +
        `  got success=${current.success} collapses=${current.collapses} backtracks=${current.backtracks}`,
    );
  }

  return mismatches.length;
}

function saveResults(results: RunResult[], overallDurationMs: number, opts: Options): void {
  const outDir = path.dirname(opts.output);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    opts.output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: opts,
        overallDurationMs,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Full results written to ${opts.output}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const opts = parseArgs();

  console.log(`Generating ${opts.tileset} tileset...`);
  const tiles = buildTileset(opts);
  console.log(`Generated ${tiles.length} tiles`);

  const grid = new SquareGrid(opts.width, opts.height);
  console.log("Precomputing adjacencies (shared across all runs)...");
  const precomputed = AdjacencyPrecomputer.precomputeAdjacencies(tiles, grid);

  const seeds: number[] = [];
  if (opts.seed !== undefined) {
    seeds.push(opts.seed);
  } else {
    for (let i = 0; i < opts.runs; i++) seeds.push(opts.startSeed + i);
  }

  const results: RunResult[] = [];
  const progressStep = Math.max(1, Math.floor(seeds.length / 20));

  const overallStart = performance.now();
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const result = runOnce(seed, tiles, precomputed, opts);
    results.push(result);

    if (!opts.quiet && (i % progressStep === 0 || !result.success || result.valid === false)) {
      console.log(
        `[${i + 1}/${seeds.length}] seed=${seed} ${result.success ? "OK" : "FAIL"} ` +
          `collapses=${result.collapses} backtracks=${result.backtracks}` +
          (result.error ? ` error="${result.error}"` : "") +
          (result.valid === false ? ` INVALID: ${result.validationError}` : "") +
          (result.suspectedSnapshotBug ? " (snapshot-restore bug)" : ""),
      );
    }

    const failuresSoFar = results.filter((r) => !r.success).length;
    if (!result.success && opts.stopOnFailure) break;
    if (opts.maxFailures > 0 && failuresSoFar >= opts.maxFailures) break;
  }
  const overallDuration = performance.now() - overallStart;

  printSummary(results, overallDuration, opts);
  const mismatches = opts.compare ? compareWithBaseline(results, opts) : 0;
  saveResults(results, overallDuration, opts);

  const anyInvalid = results.some((r) => r.valid === false);
  const anyFailure = results.some((r) => !r.success);
  process.exit(anyInvalid || mismatches > 0 || (anyFailure && !opts.allowFailures) ? 1 : 0);
}

main();
