import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "Schrodinger",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
