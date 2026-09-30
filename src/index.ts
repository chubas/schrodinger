/**
 * Schrodinger - Wave Function Collapse implementation
 */

// Core components
export { WFC, LogLevel } from './WFC.js';
export { SquareGrid, HexagonalGrid, CubeGrid } from './Grid.js';
export { TileDef, TileDefFactory } from './TileDef.js';
export { RandomLib, DefaultRandom } from './RandomLib.js';
export { TilesetImporter } from './TilesetImporter.js';
export { AdjacencyPrecomputer } from './PrecomputedAdjacencies.js';

// Adjacency components
export { matchAdjacencies, matchRules } from './Adjacencies.js';
export { 
  parseAdjacencyRule, 
  RuleType, 
  Rule, 
  SimpleRule, 
  NegatedRule, 
  CompoundRule, 
  DirectionalRule, 
  ChoiceRule 
} from './AdjacencyGrammar.js';

// Types
export type { Cell, Grid, GridSnapshot } from './Grid.js';
export type { WFCOptions, CellCollapse, CollapseGroup, StepResult, WFCEvents } from './WFC.js';