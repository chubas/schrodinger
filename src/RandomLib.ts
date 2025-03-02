export interface RandomLib {
  random(): number;
  setSeed(seed: string | number): void;
}

export class DefaultRandom implements RandomLib {
  random(): number {
    return Math.random();
  }

  setSeed(_seed: string | number): void {
    // Default implementation does nothing
  }
}
