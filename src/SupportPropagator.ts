import { Cell, Grid } from "./Grid.js";
import { TileDef } from "./TileDef.js";
import { AdjacencyTables } from "./AdjacencyTables.js";

/**
 * Incremental arc consistency (AC-4 style) over the grid's cells.
 *
 * For every cell c, tile t and direction d, `support` counts how many tiles
 * still possible in c's neighbor at d are compatible with t in c. Removing a
 * tile from a cell decrements exactly the counts that depended on it, and a
 * tile is removed once any of its counts reaches zero.
 *
 * Decrements are applied for every processed removal, including to tiles
 * that are already gone, and the queue is always drained (even after a
 * contradiction, when no further removals are triggered). So `support` is
 * always the exact count for the current domains, which is what lets a
 * removal be undone by the exact inverse increments.
 *
 * Neighborhoods are read through explicit "incoming" lists, so grids whose
 * neighbor relation isn't symmetric (custom graphs) are handled correctly.
 *
 * Every removal and every collapse is recorded on a trail (undo log). A
 * snapshot is just the trail length (mark()), and restore(marker) undoes
 * entries back to it. Restores must follow stack discipline: only markers
 * taken on the current path, which the backtrack tree guarantees.
 *
 * Cell objects (choices / collapsed / value) are the public view; they are
 * brought up to date at the end of load(), propagate() and restore().
 */
export class SupportPropagator {
  private readonly tileCount: number;
  private readonly cellCount: number;
  private readonly maxDirections: number;
  private readonly cells: Cell[] = [];
  private readonly cellIndex = new Map<Cell, number>();
  private readonly tileIndexByName = new Map<string, number>();

  private readonly cellType: Int32Array;
  private readonly neighbor: Int32Array;
  private readonly incomingStart: Int32Array;
  private readonly incomingCell: Int32Array;
  private readonly incomingDirection: Int32Array;

  private readonly domain: Uint8Array;
  private readonly size: Int32Array;
  private readonly support: Uint16Array | Uint32Array;

  // Each (cell, tile) is removed at most once between loads, so C·T bounds the queue.
  private readonly queue: Int32Array;
  private queueLength = 0;
  private readonly dirty: Int32Array;
  private dirtyLength = 0;
  private readonly isDirty: Uint8Array;
  private contradiction = false;

  // Entries: c·T + t for a removal, -(c + 1) for a collapse. Each (cell, tile)
  // is removed at most once per path and each cell collapses at most once,
  // so C·T + C bounds the trail.
  private readonly trail: Int32Array;
  private trailLength = 0;

  constructor(
    grid: Grid,
    private readonly tileDefs: TileDef[],
    private readonly tables: AdjacencyTables,
  ) {
    const T = tileDefs.length;
    this.tileCount = T;
    tileDefs.forEach((tile, i) => this.tileIndexByName.set(tile.name, i));

    const coordsList: unknown[] = [];
    for (const [cell, coords] of grid.iterate()) {
      this.cellIndex.set(cell, this.cells.length);
      this.cells.push(cell);
      coordsList.push(coords);
    }
    const C = this.cells.length;
    this.cellCount = C;

    const neighborLists = coordsList.map((coords) => grid.getNeighbors(coords));
    let D = 0;
    for (const list of neighborLists) D = Math.max(D, list.length);
    this.maxDirections = D;

    this.cellType = Int32Array.from(coordsList, (coords) => tables.typeIndex(grid.getAdjacencyType(coords)));
    this.neighbor = new Int32Array(C * D).fill(-1);
    const incomingCount = new Int32Array(C);
    for (let c = 0; c < C; c++) {
      neighborLists[c].forEach((neighborCell, d) => {
        const n = neighborCell ? this.cellIndex.get(neighborCell) ?? -1 : -1;
        this.neighbor[c * D + d] = n;
        if (n >= 0) incomingCount[n]++;
      });
    }

    this.incomingStart = new Int32Array(C + 1);
    for (let n = 0; n < C; n++) this.incomingStart[n + 1] = this.incomingStart[n] + incomingCount[n];
    this.incomingCell = new Int32Array(this.incomingStart[C]);
    this.incomingDirection = new Int32Array(this.incomingStart[C]);
    const cursor = this.incomingStart.slice(0, C);
    for (let c = 0; c < C; c++) {
      for (let d = 0; d < D; d++) {
        const n = this.neighbor[c * D + d];
        if (n < 0) continue;
        this.incomingCell[cursor[n]] = c;
        this.incomingDirection[cursor[n]] = d;
        cursor[n]++;
      }
    }

    this.domain = new Uint8Array(C * T);
    this.size = new Int32Array(C);
    this.support = T <= 0xffff ? new Uint16Array(C * T * D) : new Uint32Array(C * T * D);
    this.queue = new Int32Array(C * T);
    this.dirty = new Int32Array(C);
    this.isDirty = new Uint8Array(C);
    this.trail = new Int32Array(C * T + C);
  }

  /**
   * Rebuilds domains from the cells' current choices, recomputes every
   * support count from scratch, removes tiles with no support in some
   * direction, and propagates. Clears the trail: markers taken before a
   * load are invalid. Returns false on contradiction.
   */
  load(): boolean {
    const T = this.tileCount;
    const D = this.maxDirections;
    this.domain.fill(0);
    this.size.fill(0);
    this.queueLength = 0;
    this.trailLength = 0;
    this.contradiction = false;

    for (let c = 0; c < this.cellCount; c++) {
      for (const tile of this.cells[c].choices) {
        const t = this.tileIndexByName.get(tile.name);
        if (t === undefined || this.domain[c * T + t]) continue;
        this.domain[c * T + t] = 1;
        this.size[c]++;
      }
      if (this.size[c] === 0) this.contradiction = true;
    }

    this.computeSupports(this.support);

    for (let c = 0; c < this.cellCount && !this.contradiction; c++) {
      for (let t = 0; t < T; t++) {
        if (!this.domain[c * T + t]) continue;
        for (let d = 0; d < D; d++) {
          if (this.neighbor[c * D + d] >= 0 && this.support[(c * T + t) * D + d] === 0) {
            this.remove(c, t);
            break;
          }
        }
      }
    }

    return this.propagate();
  }

  /**
   * Removes every tile but `tile` from the cell and marks it collapsed.
   * Call propagate() afterwards. Collapsing to a tile that is no longer
   * possible is a contradiction.
   */
  collapse(cell: Cell, tile: TileDef): void {
    const T = this.tileCount;
    const c = this.indexOf(cell);
    const t = this.tileIndexByName.get(tile.name);
    if (t === undefined || !this.domain[c * T + t]) {
      this.contradiction = true;
      return;
    }
    for (let other = 0; other < T; other++) {
      if (other !== t) this.remove(c, other);
    }
    this.markCollapsed(c, this.tileDefs[t]);
  }

  /** Current trail position; pass it to restore() to return to this state. */
  mark(): number {
    return this.trailLength;
  }

  /**
   * Undoes every removal and collapse recorded after `marker`, in reverse
   * order. Each removal's decrements were all applied when it was
   * propagated (the queue is always drained), so re-incrementing the same
   * counts restores them exactly.
   */
  restore(marker: number): void {
    if (this.queueLength !== 0) throw new Error("Cannot restore while removals are pending");
    if (marker > this.trailLength) {
      throw new Error(`Cannot restore to trail position ${marker}; the trail is only ${this.trailLength} long`);
    }

    const T = this.tileCount;
    const D = this.maxDirections;
    const support = this.support;

    while (this.trailLength > marker) {
      const entry = this.trail[--this.trailLength];
      if (entry < 0) {
        const c = -entry - 1;
        this.cells[c].collapsed = false;
        this.cells[c].value = undefined;
        this.markDirty(c);
        continue;
      }

      const n = (entry / T) | 0;
      const t2 = entry - n * T;
      this.domain[entry] = 1;
      this.size[n]++;
      this.markDirty(n);
      for (let k = this.incomingStart[n], end = this.incomingStart[n + 1]; k < end; k++) {
        const c = this.incomingCell[k];
        const d = this.incomingDirection[k];
        const supporters = this.tables.supporters(this.cellType[c], d, t2);
        const base = c * T;
        for (let s = 0; s < supporters.length; s++) {
          support[(base + supporters[s]) * D + d]++;
        }
      }
    }

    this.contradiction = false;
    this.materialize(false);
  }

  /** Processes queued removals to a fixpoint. Returns false on contradiction. */
  propagate(): boolean {
    const T = this.tileCount;
    const D = this.maxDirections;
    const support = this.support;
    const domain = this.domain;

    while (this.queueLength > 0) {
      const removed = this.queue[--this.queueLength];
      const n = (removed / T) | 0;
      const t2 = removed - n * T;

      for (let k = this.incomingStart[n], end = this.incomingStart[n + 1]; k < end; k++) {
        const c = this.incomingCell[k];
        const d = this.incomingDirection[k];
        const supporters = this.tables.supporters(this.cellType[c], d, t2);
        const base = c * T;
        for (let s = 0; s < supporters.length; s++) {
          const t = supporters[s];
          if (--support[(base + t) * D + d] === 0 && domain[base + t] && !this.contradiction) {
            this.remove(c, t);
          }
        }
      }
    }

    const ok = !this.contradiction;
    this.materialize(ok);
    return ok;
  }

  /**
   * Recomputes everything from scratch and compares against the incremental
   * state. Returns a description of the first inconsistency, if any.
   * Expensive; meant for tests and WFCOptions.debugChecks.
   */
  checkInvariants(): string | undefined {
    const T = this.tileCount;
    const D = this.maxDirections;
    if (this.queueLength !== 0) return `removal queue not drained (${this.queueLength} left)`;

    for (let c = 0; c < this.cellCount; c++) {
      let count = 0;
      for (let t = 0; t < T; t++) count += this.domain[c * T + t];
      if (count !== this.size[c]) return `cell ${c}: size ${this.size[c]} but ${count} tiles in domain`;

      const cell = this.cells[c];
      const choices = cell.choices;
      const expected = this.tileDefs.filter((_, t) => this.domain[c * T + t]);
      if (choices.length !== expected.length || choices.some((tile, i) => tile.name !== expected[i].name)) {
        return `cell ${c}: choices [${choices.map((x) => x.name)}] don't mirror domain [${expected.map((x) => x.name)}]`;
      }
      if (!this.contradiction && cell.collapsed && (this.size[c] !== 1 || cell.value?.name !== expected[0]?.name)) {
        return `cell ${c}: collapsed to ${cell.value?.name} but domain is [${expected.map((x) => x.name)}]`;
      }
    }

    const recomputed = new Uint32Array(this.support.length);
    this.computeSupports(recomputed);
    for (let i = 0; i < recomputed.length; i++) {
      if (recomputed[i] !== this.support[i]) {
        const d = i % D;
        const t = ((i - d) / D) % T;
        const c = Math.floor(i / (D * T));
        return `support(cell ${c}, tile ${t}, dir ${d}) is ${this.support[i]}, expected ${recomputed[i]}`;
      }
    }
    return undefined;
  }

  private remove(c: number, t: number): void {
    const i = c * this.tileCount + t;
    if (!this.domain[i]) return;
    this.domain[i] = 0;
    if (--this.size[c] === 0) this.contradiction = true;
    this.queue[this.queueLength++] = i;
    this.trail[this.trailLength++] = i;
    this.markDirty(c);
  }

  private markCollapsed(c: number, tile: TileDef): void {
    const cell = this.cells[c];
    cell.collapsed = true;
    cell.value = tile;
    this.trail[this.trailLength++] = -(c + 1);
    this.markDirty(c);
  }

  private computeSupports(target: Uint16Array | Uint32Array): void {
    const T = this.tileCount;
    const D = this.maxDirections;
    for (let c = 0; c < this.cellCount; c++) {
      const type = this.cellType[c];
      for (let d = 0; d < D; d++) {
        const n = this.neighbor[c * D + d];
        for (let t = 0; t < T; t++) {
          let count = 0;
          if (n >= 0) {
            const compatible = this.tables.compatible(type, d, t);
            for (let s = 0; s < compatible.length; s++) count += this.domain[n * T + compatible[s]];
          }
          target[(c * T + t) * D + d] = count;
        }
      }
    }
  }

  private materialize(autoCollapse: boolean): void {
    const T = this.tileCount;
    for (let k = 0; k < this.dirtyLength; k++) {
      const c = this.dirty[k];
      this.isDirty[c] = 0;
      const cell = this.cells[c];
      const choices: TileDef[] = [];
      for (let t = 0; t < T; t++) {
        if (this.domain[c * T + t]) choices.push(this.tileDefs[t]);
      }
      cell.choices = choices;
      if (autoCollapse && !cell.collapsed && choices.length === 1) {
        cell.collapsed = true;
        cell.value = choices[0];
        this.trail[this.trailLength++] = -(c + 1);
      }
    }
    this.dirtyLength = 0;
  }

  private markDirty(c: number): void {
    if (this.isDirty[c]) return;
    this.isDirty[c] = 1;
    this.dirty[this.dirtyLength++] = c;
  }

  private indexOf(cell: Cell): number {
    const c = this.cellIndex.get(cell);
    if (c === undefined) throw new Error(`Cell at ${cell.coords} is not part of this grid`);
    return c;
  }
}
