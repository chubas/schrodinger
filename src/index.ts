/**
 * Schrodinger - Wave Function Collapse implementation
 */

// Core components
export { WFC, LogLevel } from './WFC.js';
export { SquareGrid } from './Grid.js';
export { TileDef, TileDefFactory } from './TileDef.js';
export { RandomLib, DefaultRandom } from './RandomLib.js';
export { TilesetImporter } from './TilesetImporter.js';

// Adjacency components
export { matchAdjacencies, matchAdjacenciesStandard } from './Adjacencies.js';
export { AdjacencyBitset, AdjacencyRegistry } from './AdjacencyBitset.js';
export { AdjacencyBitsetAdapter } from './AdjacencyBitsetAdapter.js';

// Types
export type { SimpleAdjacency, DirectionalAdjacency, CompoundAdjacency, AdjacencyRule } from './Adjacencies.js';
export type { Cell, Grid, GridSnapshot } from './Grid.js';
export type { WFCOptions, CellCollapse, CollapseGroup, CollapseResult, WFCEvents, DeltaChange, CellDelta, DeltaSnapshot } from './WFC.js';