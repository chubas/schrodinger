# Examples

## Node

Runnable scripts, each a few dozen lines. They import the built package from `dist/`:

```bash
npm run build
node examples/node/quickstart.mjs      # random pipe layout; the README's first example
node examples/node/variants.mjs        # generating rotated/mirrored tiles yourself
node examples/node/control.mjs         # seeded RNG, initial seed, events, generator, errors
node examples/node/custom-graph.mjs    # a Grid that isn't a grid: a binary tree, two-coloured
```

In your own project you'd import from `schrodinger` instead of `../../dist/index.js`.

## Browser (p5.js)

Visual demos using [p5.js](https://p5js.org/) (loaded from a CDN). They need the browser build and a static web server (opening the files directly won't load the scripts):

```bash
npm run build:browser
python3 -m http.server 8000      # or any static file server, from the repository root
```

Then open:

| URL | What it shows |
|---|---|
| `http://localhost:8000/examples/iso/` | Isometric cube tiles on a square grid, collapsing one cell per frame. **R** restarts with a new seed, **P** previews the tileset, **C** steps manually. Add `?seed=12345` to reproduce a run. |
| `http://localhost:8000/examples/escher-march/` | Balls marching across a generated isometric surface. **R** regenerates, **Space** resets the marchers. |
| `http://localhost:8000/examples/hex/` | Isometric cubes on a hexagonal grid in cube coordinates, using the custom grid in `hex/cubic-hex-grid.js`. |

`shared/` holds a small `EventEmitter` and shim: the library extends Node's `events` module, which browsers don't have, so the demos load these before `dist/index.global.js`.
