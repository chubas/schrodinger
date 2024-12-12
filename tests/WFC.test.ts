import { TileDef } from "../src/TileDef";
import { WFC } from "../src/WFC";
import { SquareGrid } from "../dist/Grid";

describe("WFC", () => {
  it("should initialize with default options", () => {
    const tileDefs: TileDef[] = [];
    const wfc = new WFC(tileDefs, new SquareGrid(1, 1));

    expect(wfc).toBeInstanceOf(WFC);
  });
});
