import { DefaultRandom, RandomLib } from "../src/RandomLib";
import { WFC, LogLevel } from "../src/WFC";
import { SquareGrid } from "../src/Grid";
import { TileDef } from "../src/TileDef";

const take = (random: RandomLib, count: number) => Array.from({ length: count }, () => random.random());

describe("DefaultRandom", () => {
  it("behaves like Math.random until it is seeded", () => {
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.25);
    try {
      expect(new DefaultRandom().random()).toBe(0.25);
    } finally {
      spy.mockRestore();
    }
  });

  it("is repeatable once seeded, and different seeds give different sequences", () => {
    const a = new DefaultRandom();
    const b = new DefaultRandom();
    a.setSeed(7);
    b.setSeed(7);
    expect(take(a, 20)).toEqual(take(b, 20));

    b.setSeed(8);
    a.setSeed(7);
    expect(take(a, 20)).not.toEqual(take(b, 20));
  });

  it("accepts string seeds", () => {
    const a = new DefaultRandom();
    const b = new DefaultRandom();
    a.setSeed("hello");
    b.setSeed("hello");
    expect(take(a, 5)).toEqual(take(b, 5));
  });

  it("resets when seeded again", () => {
    const random = new DefaultRandom();
    random.setSeed(1);
    const first = take(random, 5);
    random.setSeed(1);
    expect(take(random, 5)).toEqual(first);
  });

  it("produces the same numbers on every platform (pinned values)", () => {
    const random = new DefaultRandom();
    random.setSeed(42);
    expect(take(random, 4)).toEqual([0.3077305785845965, 0.3676118436269462, 0.23133554426021874, 0.01758907549083233]);
    random.setSeed("hello");
    expect(take(random, 2)).toEqual([0.6311965801287442, 0.7983490515034646]);
  });

  it("produces numbers in [0, 1) with a sensible spread", () => {
    const random = new DefaultRandom();
    random.setSeed(123);
    const values = take(random, 10000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe("WFCOptions.seed", () => {
  const pipes: TileDef[] = [
    { name: " ", adjacencies: ["0", "0", "0", "0"], weight: 3 },
    { name: "-", adjacencies: ["0", "1", "0", "1"] },
    { name: "|", adjacencies: ["1", "0", "1", "0"] },
    { name: "r", adjacencies: ["0", "1", "1", "0"] },
    { name: "7", adjacencies: ["0", "0", "1", "1"] },
    { name: "L", adjacencies: ["1", "1", "0", "0"] },
    { name: "J", adjacencies: ["1", "0", "0", "1"] },
  ];
  const generate = (seed?: string | number) => {
    const wfc = new WFC(pipes, new SquareGrid(12, 6), { seed, logLevel: LogLevel.NONE });
    wfc.start();
    return Array.from(wfc.iterate(), ([cell]) => cell.value!.name).join("");
  };

  it("makes runs repeatable without supplying a random source", () => {
    expect(generate(99)).toBe(generate(99));
    expect(generate("a seed")).toBe(generate("a seed"));
  });

  it("gives different results for different seeds", () => {
    expect(generate(1)).not.toBe(generate(2));
  });

  it("passes the seed to a custom random source", () => {
    const setSeed = jest.fn();
    new WFC(pipes, new SquareGrid(2, 2), { random: { random: () => 0.5, setSeed }, seed: "abc" });
    expect(setSeed).toHaveBeenCalledWith("abc");
  });

  it("does not seed when no seed is given", () => {
    const setSeed = jest.fn();
    new WFC(pipes, new SquareGrid(2, 2), { random: { random: () => 0.5, setSeed } });
    expect(setSeed).not.toHaveBeenCalled();
  });
});
