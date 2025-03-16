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
export { matchAdjacencies } from './Adjacencies.js';
export { 
  parseAdjacencyRule, 
  matchRules, 
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
export type { WFCOptions, CellCollapse, CollapseGroup, CollapseResult, WFCEvents, DeltaChange, CellDelta, DeltaSnapshot } from './WFC.js';