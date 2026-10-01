import { defineConfig } from "tsup";

// Cleaning is done by `npm run clean` before tsup runs: tsup builds these
// configs in parallel, so letting one of them clean the output folder could
// delete files another had already written.
export default defineConfig([
  // Node and bundlers: ESM and CJS with type declarations.
  {
    entry: { index: "src/index.ts", node: "src/node.ts" },
    format: ["esm", "cjs"],
    outDir: "dist",
    dts: true,
    sourcemap: true,
  },
  // Browsers (script tag or CDN): a self-contained IIFE exposing `Schrodinger`,
  // plus a minified copy. Everything is bundled, including the parser library.
  ...[false, true].map((minify) => ({
    entry: { index: "src/index.ts" },
    format: ["iife" as const],
    globalName: "Schrodinger",
    outDir: "dist",
    outExtension: () => ({ js: minify ? ".global.min.js" : ".global.js" }),
    minify,
    dts: false,
    sourcemap: true,
    platform: "browser" as const,
    noExternal: ["parsimmon"],
    esbuildOptions(options: { target?: string | string[]; define?: Record<string, string> }) {
      options.define = { ...options.define, "process.env.NODE_ENV": '"production"' };
      options.target = "es2015";
    },
  })),
]);
