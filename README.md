# Wave Function Collapse Algorithm Implementation

A flexible, engine-agnostic implementation of the Wave Function Collapse (WFC) algorithm for procedural content generation.

## Features

- **Engine Agnostic**: Can be used with any rendering engine (p5.js, Three.js) or even in command-line applications
- **Flexible Space Representation**:
  - Built-in support for 2D and 3D grids
  - Extensible to support irregular grids (hexagonal) or graph-based spaces
  - Custom neighborhood and adjacency rule definitions
- **Advanced Tile Management**:
  - Automatic tile variation generation (rotation, reflection)
  - Complex adjacency rules support (multi-adjacency, tile transformations)
- **Robust Error Handling**:
  - Configurable backtracking system
  - Multiple backtracking strategies (single step, multi-step)
- **Interactive Processing**:
  - Event-based system for state changes
  - Generator functions for step-by-step collapse visualization
  - Real-time debugging and visualization support