/**
 * Browser-specific entry point for the Schrodinger WFC library
 * This file only exports the necessary classes without running any code
 */

// Export the core classes
export { SquareGrid } from "./Grid.js";
export { WFC, LogLevel } from "./WFC.js";
export { TileDef, TileDefFactory } from "./TileDef.js";
export { RandomLib, DefaultRandom } from "./RandomLib.js";
// TilesetImporter is removed for browser builds as it depends on Node.js fs module

// Export adjacency-related functionality
export { matchAdjacencies, matchAdjacenciesStandard } from "./Adjacencies.js";
export { AdjacencyBitset, AdjacencyRegistry } from "./AdjacencyBitset.js";
export { AdjacencyBitsetAdapter } from "./AdjacencyBitsetAdapter.js";

// Export types that might be useful for users
export type { Cell, Grid, GridSnapshot } from "./Grid.js";
export type {
  WFCOptions,
  CellCollapse,
  CollapseGroup,
  CollapseResult,
  WFCEvents,
  DeltaChange,
  CellDelta,
  DeltaSnapshot
} from "./WFC.js";

export type { 
  SimpleAdjacency, 
  DirectionalAdjacency, 
  CompoundAdjacency, 
  AdjacencyRule 
} from "./Adjacencies.js";