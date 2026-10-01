import { Emitter } from "../src/Emitter";

type Events = {
  greet: (name: string, times: number) => void;
  done: () => void;
  error: (error: Error) => void;
};

describe("Emitter", () => {
  it("calls listeners in order with the emitted arguments", () => {
    const emitter = new Emitter<Events>();
    const calls: string[] = [];
    emitter.on("greet", (name, times) => calls.push(`a:${name}:${times}`));
    emitter.on("greet", (name) => calls.push(`b:${name}`));

    expect(emitter.emit("greet", "ada", 2)).toBe(true);
    expect(calls).toEqual(["a:ada:2", "b:ada"]);
  });

  it("emit returns false when nobody is listening", () => {
    expect(new Emitter<Events>().emit("done")).toBe(false);
  });

  it("once runs a listener a single time", () => {
    const emitter = new Emitter<Events>();
    let count = 0;
    emitter.once("done", () => count++);
    emitter.emit("done");
    emitter.emit("done");
    expect(count).toBe(1);
    expect(emitter.listenerCount("done")).toBe(0);
  });

  it("off removes a listener, including a once listener by its original function", () => {
    const emitter = new Emitter<Events>();
    const calls: string[] = [];
    const listener = () => calls.push("x");
    emitter.on("done", listener);
    emitter.off("done", listener);
    emitter.once("done", listener);
    emitter.removeListener("done", listener);
    emitter.emit("done");
    expect(calls).toEqual([]);
  });

  it("off removes only the most recently added copy of a listener, like Node", () => {
    const emitter = new Emitter<Events>();
    let count = 0;
    const listener = () => count++;
    emitter.on("done", listener);
    emitter.on("done", listener);
    emitter.off("done", listener);
    emitter.emit("done");
    expect(count).toBe(1);
  });

  it("lets listeners remove themselves or add listeners while an event is being emitted", () => {
    const emitter = new Emitter<Events>();
    const calls: string[] = [];
    const first = () => {
      calls.push("first");
      emitter.off("done", first);
      emitter.on("done", () => calls.push("added"));
    };
    emitter.on("done", first);
    emitter.on("done", () => calls.push("second"));

    emitter.emit("done");
    expect(calls).toEqual(["first", "second"]);
    emitter.emit("done");
    expect(calls).toEqual(["first", "second", "second", "added"]);
  });

  it("removeAllListeners clears one event or everything", () => {
    const emitter = new Emitter<Events>();
    emitter.on("done", () => {});
    emitter.on("greet", () => {});
    emitter.removeAllListeners("done");
    expect(emitter.listenerCount("done")).toBe(0);
    expect(emitter.listenerCount("greet")).toBe(1);
    emitter.removeAllListeners();
    expect(emitter.listenerCount("greet")).toBe(0);
  });

  it("throws an emitted error when there is no error listener, as Node does", () => {
    const emitter = new Emitter<Events>();
    const error = new Error("boom");
    expect(() => emitter.emit("error", error)).toThrow(error);

    const seen: Error[] = [];
    emitter.on("error", (e) => seen.push(e));
    expect(emitter.emit("error", error)).toBe(true);
    expect(seen).toEqual([error]);
  });

  it("chains", () => {
    const emitter = new Emitter<Events>();
    expect(emitter.on("done", () => {}).once("done", () => {}).addListener("done", () => {})).toBe(emitter);
  });

  it("type-checks events and listeners", () => {
    const emitter = new Emitter<Events>();
    // @ts-expect-error not an event of this emitter
    emitter.on("missing", () => {});
    // @ts-expect-error listener parameters must match the event
    emitter.on("greet", (name: number) => name);
    // @ts-expect-error emit arguments must match the event
    emitter.emit("greet", 1, 2);
    // (These calls are rejected at compile time only; they still run.)
    expect(emitter).toBeInstanceOf(Emitter);
  });
});
