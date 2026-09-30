export interface RandomLib {
  random(): number;
  setSeed(seed: string | number): void;
}

/**
 * The default random source: `Math.random()` until it is seeded, then a
 * deterministic generator (mulberry32). Seeding makes runs repeatable, and the
 * same seed gives the same sequence on every platform.
 */
export class DefaultRandom implements RandomLib {
  private state?: number;

  random(): number {
    if (this.state === undefined) return Math.random();
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setSeed(seed: string | number): void {
    // FNV-1a over the seed's text: any number or string becomes a 32-bit state.
    let hash = 0x811c9dc5;
    for (const char of String(seed)) {
      hash ^= char.codePointAt(0)!;
      hash = Math.imul(hash, 0x01000193);
    }
    this.state = hash >>> 0;
  }
}
