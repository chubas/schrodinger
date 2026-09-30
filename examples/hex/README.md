# Hexagonal grid demo

A p5.js demo running the engine on a hexagonal grid that is **not** one of the built-in grids: `CubicHexagonalGrid` in [`cubic-hex-grid.js`](cubic-hex-grid.js) is a complete custom grid, in about 130 lines, using cube coordinates. [`docs/custom-grids.md`](../../docs/custom-grids.md) explains what a grid has to provide.

See [`../README.md`](../README.md) for how to build and open it.

## Cube coordinates

Each hexagon is `[x, y, z]` with `x + y + z = 0`, and the centre is `[0, 0, 0]`. The six neighbours of a cell are found by adding one of these offsets, which is also the order of the six sides of a tile:

```
direction 0: [ 1, -1,  0]
direction 1: [ 0, -1,  1]
direction 2: [-1,  0,  1]
direction 3: [-1,  1,  0]
direction 4: [ 0,  1, -1]
direction 5: [ 1,  0, -1]
```

Opposite directions are three apart (`(d + 3) % 6`), so the adjacency map is `[3, 4, 5, 0, 1, 2]`.

Cube coordinates suit hexagonal grids because all six directions are treated alike, distances are `(|dx| + |dy| + |dz|) / 2`, and there are no odd/even row special cases. `new CubicHexagonalGrid(radius)` builds a hexagon-shaped region containing every cell within `radius` steps of the centre.
