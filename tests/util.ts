import { TileDef } from "../src/TileDef";
import { RandomLib } from "../src/RandomLib";

// Helper function to pick specific tiles
export const pickTiles = (tiles: TileDef[], names: string[]): TileDef[] => {
  let result: TileDef[] = [];
  for (const name of names) {
    const tile = tiles.find((tile) => tile.name === name);
    if (tile) {
      result.push(tile);
    }
  }
  return result;
};

// Custom RNG for deterministic tests
export class DeterministicRNG implements RandomLib {
  private sequence: number[];
  private currentIndex: number = 0;

  constructor(sequence: number[] = [0]) {
    this.sequence = sequence;
  }

  random(): number {
    const value = this.sequence[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.sequence.length;
    return value;
  }

  setSeed(_seed: string | number): void {
    this.currentIndex = 0;
  }
}