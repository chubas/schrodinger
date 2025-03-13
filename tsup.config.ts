import { defineConfig } from "tsup";

export default defineConfig([
  // Main build for Node.js (ESM and CJS)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    outDir: "dist",
    clean: true,
    dts: true,
    sourcemap: true,
  },
  // Browser build (IIFE)
  {
    entry: ["src/browser-entry.ts"],
    format: ["iife"],
    globalName: "Schrodinger",
    outDir: "dist",
    outExtension: () => ({ js: ".global.js" }),
    clean: false, // Don't clean again
    dts: false, // Don't generate types again
    sourcemap: true,
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'process.env.NODE_ENV': '"production"',
      };
      // Add browser target
      options.target = 'es2015';
    },
    // Add events as an external dependency that will be provided by the browser
    external: ['events'],
    noExternal: ['seedrandom'],
  }
]);
