# Hexagonal Grid Test

This p5.js sketch demonstrates a hexagonal grid using **cubic coordinates** (x, y, z triplets).

## Coordinate System

The hexagonal grid uses cubic coordinates where:
- Each hexagon is represented by three coordinates: `(x, y, z)`
- **Constraint**: `x + y + z = 0` (always)
- The center hexagon is at `(0, 0, 0)`
- Moving in the 6 hex directions changes coordinates predictably

### Why Cubic Coordinates?

Cubic coordinates are ideal for hexagonal grids because:
1. **Symmetric**: All 6 directions are treated equally
2. **Distance calculation**: `distance = (|x1-x2| + |y1-y2| + |z1-z2|) / 2`
3. **Neighbor finding**: Add direction vectors easily
4. **No offset complications**: Unlike offset coordinates, no even/odd row adjustments

## Features

- **Visual Grid**: Each hexagon displays its cubic coordinates
- **Interactive**: Mouse movement shows coordinates in console
- **Keyboard Controls**:
  - `+` or `=`: Increase grid radius
  - `-` or `_`: Decrease grid radius  
  - `r` or `R`: Redraw grid

## Grid Layout

The grid is drawn with a **flat-top** orientation:
```
   _______
  /       \
 /  x,y,z  \
 \         /
  \_______/
```

## Coordinate Examples

For a radius-2 grid, some example coordinates:
- Center: `(0, 0, 0)`
- Right: `(1, -1, 0)`
- Upper-right: `(1, 0, -1)`
- Upper-left: `(0, 1, -1)`
- Left: `(-1, 1, 0)`
- Lower-left: `(-1, 0, 1)`
- Lower-right: `(0, -1, 1)`

## Files

- `hex-grid-test.html`: HTML wrapper
- `hex-grid-test.js`: p5.js sketch with hexagonal grid implementation

## Usage

1. Open `hex-grid-test.html` in a web browser
2. The grid will display automatically
3. Use keyboard controls to interact
4. Check browser console for mouse coordinate feedback

This provides a foundation for implementing hexagonal WFC with triplet coordinates. 