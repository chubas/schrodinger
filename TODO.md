# Schrodinger WFC Library - TODO List

## Priority Improvements

### 1. Pre-Calculated Adjacency System
- [ ] Design a lookup table structure for storing pre-calculated adjacencies
- [ ] Implement initial calculation of all valid adjacency pairs during setup
- [ ] Create serialization/deserialization for adjacency tables
- [ ] Benchmark performance improvement vs. current approach
- [ ] Add option to switch between dynamic and pre-calculated adjacency checking

### 2. Formal Adjacency Grammar
- [x] Define formal specification for adjacency rules
- [x] Create parser for the adjacency grammar
- [x] Implement validation to ensure adjacency strings follow the specification
- [x] Document the grammar in detail for users
- [x] Add tests for parsing edge cases
- [x] Refactor current adjacency system to use the new grammar parser
- [x] Create adapter for backward compatibility 

### 3. Optimized Binary Representation Improvements
- [ ] Fix current issues with bitset adjacency matcher
- [ ] Ensure correct handling of multi-character adjacencies
- [ ] Add comprehensive tests for binary adjacency matching
- [ ] Create a hybrid approach combining pre-calculation with binary representation

### 4. Extended Functionality
- [ ] Consider 3D WFC implementation
- [ ] Add support for custom boundary conditions (wrapped, mirrored, etc.)
- [ ] Implement pattern analysis for automatic adjacency rule generation
- [ ] Create visualization tools for debugging adjacency issues

### 5. Developer Experience
- [ ] Add detailed logging options for tracking adjacency decisions
- [ ] Create developer documentation for extending the library
- [ ] Add profile benchmarking tools
- [ ] Create examples demonstrating different approaches

## Long-term Ideas

### Performance Optimization
- [ ] Consider WebAssembly implementation for core algorithm
- [ ] Explore parallel processing options for larger grids
- [ ] Implement progressive generation for real-time applications

### Integration Improvements
- [ ] Create adapters for popular game engines
- [ ] Add preset configurations for common use cases
- [ ] Build plug-and-play UI components for adjusting parameters

## Notes on Pre-Calculated Adjacency Approach

The pre-calculated adjacency approach would:
1. Calculate all valid tile adjacencies once at initialization
2. Store these in an efficient lookup structure
3. Use simple lookups during WFC execution instead of dynamic calculation
4. Potentially serialize the result to avoid recalculation

This would trade memory for significant performance improvements during execution.

## Adjacency Grammar Implementation Notes

The new adjacency grammar parser implemented in `src/AdjacencyGrammar.ts` supports:

- Simple rules (e.g., `Forest`)
- Negated rules (e.g., `^Forest`)
- Compound rules (e.g., `Forest+Mountain`)
- Choice rules (e.g., `Forest|Mountain`)
- Directional rules (e.g., `[Forest>Mountain]`)
- Nested rules with parentheses

The implementation is currently separate from the main adjacency system and needs to be integrated.
We should keep this implementation separate until it's fully tested and ready to replace
the current adjacency matching system. 