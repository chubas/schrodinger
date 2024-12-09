import { TileDef } from "../src/TileDef";
import { WFC } from "../src/WFC";

describe("WFC", () => {
  it("should initialize with default options", () => {
    const tileDefs:TileDef[] = [];
    const wfc = new WFC(tileDefs);

    expect(wfc).toBeInstanceOf(WFC);
  });
});
