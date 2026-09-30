// Packs the library exactly as `npm publish` would, installs the tarball into
// an empty project, and uses it the ways consumers will: ESM, CommonJS, the
// /node subpath, the browser bundle, TypeScript under each module resolution
// mode, and a browser bundler.
//
//   npm run check:package
//   CHECK_TS_VERSIONS="4.5 5.0 5.9" npm run check:package   # also other TypeScript versions
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = (name) => join(root, "node_modules", ".bin", name);
const work = mkdtempSync(join(tmpdir(), "wfc-package-"));
const app = join(work, "app");
mkdirSync(app);

let failures = 0;
const check = (label, fn) => {
  try {
    const detail = fn();
    console.log(`ok    ${label}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  ${label}\n      ${String(error.stderr ?? error.message).trim().split("\n").join("\n      ")}`);
  }
};
const run = (cmd, args, cwd = app) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  // `npm pack` runs the `prepare` script (which builds dist/) and prints that
  // script's output before its own JSON, so take the last top-level array.
  const packOutput = run("npm", ["pack", "--pack-destination", work, "--json"], root);
  const [{ filename, files }] = JSON.parse(packOutput.slice(packOutput.lastIndexOf("\n[\n") + 1));
  console.log(`packed ${filename}: ${files.length} files`);

  const names = files.map((f) => f.path);
  for (const required of ["LICENSE", "README.md", "THIRD-PARTY-LICENSES.md", "package.json", "dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts", "dist/node.js", "dist/node.cjs", "dist/node.d.ts", "dist/index.global.js", "dist/index.global.min.js"]) {
    check(`tarball contains ${required}`, () => { if (!names.includes(required)) throw new Error("missing"); });
  }
  check("tarball contains only dist/ and top-level docs", () => {
    const stray = names.filter((n) => !n.startsWith("dist/") && !["LICENSE", "README.md", "THIRD-PARTY-LICENSES.md", "package.json"].includes(n));
    if (stray.length) throw new Error(`unexpected files: ${stray.join(", ")}`);
  });

  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "consumer-test", version: "1.0.0", type: "module" }));
  run("npm", ["install", join(work, filename), "--no-audit", "--no-fund"]);
  copyFileSync(join(root, "tests", "fixtures", "sample-tileset.json"), join(app, "sample-tileset.json"));

  writeFileSync(join(app, "esm.mjs"), `
    import { WFC, SquareGrid, LogLevel } from "schrodinger-wfc";
    import { TilesetImporter } from "schrodinger-wfc/node";
    const wfc = new WFC([{ name: "a", adjacencies: ["x", "x", "x", "x"] }], new SquareGrid(6, 3), { seed: 1, logLevel: LogLevel.NONE });
    let collapses = 0; wfc.on("collapse", () => collapses++); wfc.start();
    const main = await import("schrodinger-wfc");
    if (collapses === 0) throw new Error("no collapse events");
    if ("TilesetImporter" in main) throw new Error("the main entry must not expose TilesetImporter");
    console.log(collapses + " collapses, " + TilesetImporter.loadFromFile("sample-tileset.json").length + " tiles loaded");
  `);
  check("ESM: main entry and /node subpath", () => run("node", ["esm.mjs"]).trim());

  writeFileSync(join(app, "cjs.cjs"), `
    const { WFC, SquareGrid } = require("schrodinger-wfc");
    const { TilesetImporter } = require("schrodinger-wfc/node");
    const wfc = new WFC([{ name: "a", adjacencies: ["x", "x", "x", "x"] }], new SquareGrid(4, 4), { seed: 2 });
    wfc.start();
    if (![...wfc.iterate()].every(([cell]) => cell.collapsed)) throw new Error("not collapsed");
    if (typeof TilesetImporter.loadFromFile !== "function") throw new Error("no TilesetImporter");
  `);
  check("CommonJS: main entry and /node subpath", () => run("node", ["cjs.cjs"]));

  check("browser bundle runs with no Node globals", () => {
    const context = vm.createContext({ console, Math });
    vm.runInContext(readFileSync(join(app, "node_modules", "schrodinger-wfc", "dist", "index.global.min.js"), "utf8"), context);
    const wfc = new context.Schrodinger.WFC([{ name: "a", adjacencies: ["x", "x", "x", "x"] }], new context.Schrodinger.SquareGrid(5, 5), { seed: 3 });
    wfc.start();
    if (![...wfc.iterate()].every(([cell]) => cell.collapsed)) throw new Error("not collapsed");
  });

  writeFileSync(join(app, "consumer.ts"), `
    import { WFC, SquareGrid, CubeGrid, TileDef, StepResult } from "schrodinger-wfc";
    import { TilesetImporter } from "schrodinger-wfc/node";
    const tiles: TileDef[] = [{ name: "a", adjacencies: ["x", "x", "x", "x"] }];
    const wfc = new WFC(tiles, new SquareGrid(3, 3), { seed: 1 });
    wfc.on("collapse", (group) => { const [x, y]: [number, number] = group.cells[0].coords; void (x + y); });
    wfc.start([{ coords: [0, 0] }]);
    const cube = new WFC([{ name: "c", adjacencies: ["x", "x", "x", "x", "x", "x"] }], new CubeGrid(2, 2, 2));
    // @ts-expect-error a cube grid's coordinates have three parts
    cube.start([{ coords: [0, 0] }]);
    const step: StepResult | undefined = undefined;
    void step; void TilesetImporter;
  `);
  // Strict, without skipLibCheck and without @types/node installed: the
  // published declarations must stand on their own.
  for (const [resolution, module] of [["node16", "node16"], ["nodenext", "nodenext"], ["bundler", "esnext"], ["node10", "commonjs"]]) {
    check(`TypeScript, moduleResolution ${resolution}`, () =>
      run(bin("tsc"), ["--noEmit", "--strict", "--target", "es2020", "--module", module, "--moduleResolution", resolution, "consumer.ts"]));
  }

  // Other TypeScript versions, e.g. CHECK_TS_VERSIONS="4.5 4.9 5.0 5.9". Each
  // version is tried with the module resolution modes it supports: the legacy
  // mode (called "node" before 5.0), node16/nodenext from 4.7, bundler from 5.0.
  for (const version of (process.env.CHECK_TS_VERSIONS ?? "").split(/\s+/).filter(Boolean)) {
    const [major, minor] = version.split(".").map(Number);
    const at = (maj, min) => major > maj || (major === maj && minor >= min);
    const modes = [[major >= 5 ? "node10" : "node", "commonjs"]];
    if (at(4, 7)) modes.push(["node16", "node16"], ["nodenext", "nodenext"]);
    if (at(5, 0)) modes.push(["bundler", "esnext"]);
    for (const [resolution, module] of modes) {
      check(`TypeScript ${version}, moduleResolution ${resolution}`, () =>
        run("npx", ["-y", "-p", `typescript@${version}`, "tsc", "--noEmit", "--strict", "--target", "es2020", "--module", module, "--moduleResolution", resolution, "consumer.ts"]));
    }
  }

  writeFileSync(join(app, "browser-app.js"), `import { WFC, SquareGrid } from "schrodinger-wfc"; new WFC([{ name: "a", adjacencies: ["x"] }], new SquareGrid(1, 1)).start();`);
  check("a browser bundler can bundle the main entry (no fs/path)", () =>
    run(bin("esbuild"), ["browser-app.js", "--bundle", "--platform=browser", "--format=esm", "--outfile=out.js", "--log-level=error"]));
  writeFileSync(join(app, "node-app.js"), `import { TilesetImporter } from "schrodinger-wfc/node"; console.log(typeof TilesetImporter);`);
  check("a browser bundler rejects the /node subpath", () => {
    try {
      run(bin("esbuild"), ["node-app.js", "--bundle", "--platform=browser", "--format=esm", "--outfile=out2.js", "--log-level=error"]);
    } catch {
      return;
    }
    throw new Error("expected the bundler to fail on Node's fs");
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failures === 0 ? "\npackage OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
