---
name: Bug report
about: Something produced a wrong result, an error, or a crash
labels: bug
---

## What happened

<!-- What did you expect, and what did you get? -->

## Minimal reproduction

<!-- Wave Function Collapse runs are deterministic once seeded, so this is the most useful thing you can give us:
     the smallest tiles, grid, options and seed that show the problem. -->

```js
import { WFC, SquareGrid } from 'schrodinger-wfc';

const tiles = [/* ... */];
const wfc = new WFC(tiles, new SquareGrid(10, 10), { seed: 1 });
wfc.start();
```

## Environment

- schrodinger-wfc version:
- Node version or browser:
- TypeScript version (if relevant):
