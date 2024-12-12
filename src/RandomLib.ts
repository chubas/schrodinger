export interface RandomLib {
  random(): number;
  setSeed(seed: number | string): void;
}

export class DefaultRandom implements RandomLib {
  random(): number {
    return Math.random();
  }

  setSeed(seed: number): void {
    // Do nothing
  }
}
