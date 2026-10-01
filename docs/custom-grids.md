# Custom grids

The engine doesn't know what a grid is. It only needs to know, for every cell, **who its neighbours are** and **how the two of them face each other**. Anything that can answer that works: square, hex, triangular, 3D, a graph, a tree.

A complete, runnable example that isn't a grid at all is in [`examples/node/custom-graph.mjs`](../examples/node/custom-graph.mjs) (a binary tree), and a cube-coordinate hex grid is in [`examples/hex/cubic-hex-grid.js`](../examples/hex/cubic-hex-grid.js). The built-in grids (`SquareGrid`, `HexagonalGrid`, `CubeGrid`) are in [`src/Grid.ts`](../src/Grid.ts).

## Directions

Each cell has a fixed, ordered list of **directions** (slots). A tile has one adjacency rule per direction, in the same order:

```js
{ name: 'shore', adjacencies: [/* direction 0 */ 'grass', /* 1 */ 'water', /* 2 */ 'grass', /* 3 */ 'water'] }
```

What "direction 0" means is entirely up to the grid. The built-in grids use:

| Grid | Directions, in order | Coordinates |
|---|---|---|
| `SquareGrid(width, height)` | top, right, bottom, left (y grows downwards) | `[x, y]` |
| `HexagonalGrid(width, height)` | north, north-east, south-east, south, south-west, north-west | axial `[q, r]` |
| `CubeGrid(width, height, depth)` | +x, -x, +y, -y, +z, -z | `[x, y, z]` |
| `TriangularGrid(width, height)` | left, right, below (up-pointing) or above (down-pointing) | `[x, y]` |

## The contract

The `Grid<Coords>` interface has exactly these five members:

```ts
interface Grid<Coords> {
  iterate(): IterableIterator<[Cell<Coords>, Coords]>;   // every cell, with its coordinates
  get(coords: Coords): Cell<Coords> | null;              // one cell, or null
  getNeighbors(coords: Coords): (Cell<Coords> | null)[]; // one entry per direction, null if none
  getAdjacencyType(coords: Coords): string;              // which adjacency map this cell uses
  adjacencyMaps: Record<string, number[]>;               // the maps themselves, by type
}
```

### Cells

A cell is a plain object; the engine stores its state on it and **mutates it in place**:

```ts
{ coords, choices: TileDef[], collapsed: boolean, value?: TileDef }
```

- `iterate()`, `get()` and `getNeighbors()` must all return **the same cell objects**, every time. Don't create cells lazily or replace them (`set`) while a run is in progress.
- `cell.coords` should be the coordinates `iterate()` yields for it: events report `cell.coords`.
- After a run, each cell has `collapsed === true` and `value` set to its tile. `choices` holds what is still possible (during a run).

### `getNeighbors(coords)`

Returns an array with **one entry per direction**, in the direction order above, with `null` where there is no neighbour (the edge of the grid). Its length must equal the length of the cell's adjacency map (below). Cells without a neighbour in some direction are simply unconstrained there.

The neighbour relation does **not** have to be symmetric, but in a normal grid it is: if `b` is `a`'s neighbour in direction `d`, then `a` is `b`'s neighbour in the direction that faces back.

### `adjacencyMaps` and `getAdjacencyType`

This is the part that needs thought. `adjacencyMaps[type][d]` answers:

> "If I look at my neighbour in direction `d`, which of **its** directions points back at me?"

The engine uses it to decide which two rules to compare: my rule in direction `d`, and my neighbour's rule in direction `adjacencyMaps[type][d]`.

For a square grid that's easy: top faces bottom, right faces left, so the map is `[2, 3, 0, 1]`. For hex it's `[3, 4, 5, 0, 1, 2]` (north faces south, and so on).

`getAdjacencyType(coords)` names the map a cell uses. Every cell of a plain grid can share one type. Use more than one type when different cells have different answers. The binary tree example needs three: a node looks at its parent through direction 2, but the parent sees it as direction 0 or 1 depending on whether it's a left or right child, so left and right children have different maps.

A consequence: **the answer may only depend on the cell's type and the direction**, not on which particular neighbour it is. Graphs where that can't be arranged cheaply (every cell needing its own type) still work, but each type costs (directions × tiles²) rule comparisons at start-up, so keep the number of types small.

### Checking your grid

The easiest mistakes are a wrong direction order and a wrong map. This check should report zero problems for a correct grid; every neighbour must see you again at the direction the map names:

```js
function checkGrid(grid) {
  let problems = 0;
  for (const [cell, coords] of grid.iterate()) {
    const map = grid.adjacencyMaps[grid.getAdjacencyType(coords)];
    grid.getNeighbors(coords).forEach((neighbor, d) => {
      if (!neighbor) return;
      const back = grid.getNeighbors(neighbor.coords)[map[d]];
      if (back !== cell) problems++;
    });
  }
  return problems;
}
```

(`tests/GridConsistency.test.ts` runs this check on every built-in grid.)

## Tiles for your grid

Give every tile one rule per direction of every cell type it can occupy. If a cell has three directions and a tile lists only two rules, the missing rule can never match, so the tile can't be placed in a cell that has a neighbour in that direction.

## Using it

```js
const grid = new MyGrid(/* ... */);
const wfc = new WFC(tiles, grid);
wfc.start();
for (const [cell, coords] of wfc.iterate()) { /* cell.value is the chosen tile */ }
```

The initial-seed argument of `start()`/`execute()` takes `{ coords, value }`, where `coords` is whatever your `get()` accepts. In TypeScript, `new WFC(tiles, grid)` takes its coordinate type from the grid (`Grid<Coords>`), so seeds and events are typed to match.
