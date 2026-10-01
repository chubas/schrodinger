// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

/**
 * A small typed event emitter with the core of Node's EventEmitter API (`on`,
 * `once`, `off`, `emit`, ...). The engine uses this instead of Node's so it has
 * no dependency on Node's `events` module: the same code runs in browsers,
 * bundlers and Node, and its type declarations need no Node types.
 *
 * As in Node, emitting "error" with no listener throws the error.
 */
export class Emitter<Events extends { [E in keyof Events]: Listener }> {
  private readonly handlers = new Map<keyof Events, Listener[]>();

  on<E extends keyof Events>(event: E, listener: Events[E]): this {
    const list = this.handlers.get(event);
    if (list) list.push(listener);
    else this.handlers.set(event, [listener]);
    return this;
  }

  addListener<E extends keyof Events>(event: E, listener: Events[E]): this {
    return this.on(event, listener);
  }

  /** Like `on`, but the listener is removed after it first runs. */
  once<E extends keyof Events>(event: E, listener: Events[E]): this {
    const wrapper = ((...args: Parameters<Events[E]>) => {
      this.off(event, wrapper as Events[E]);
      return listener(...args);
    }) as Events[E];
    // Remember the original so `off(event, listener)` still finds it.
    (wrapper as unknown as { listener: Listener }).listener = listener;
    return this.on(event, wrapper);
  }

  /** Removes the most recently added matching listener, as Node does. */
  off<E extends keyof Events>(event: E, listener: Events[E]): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === listener || (list[i] as unknown as { listener?: Listener }).listener === listener) {
        list.splice(i, 1);
        break;
      }
    }
    if (list.length === 0) this.handlers.delete(event);
    return this;
  }

  removeListener<E extends keyof Events>(event: E, listener: Events[E]): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: keyof Events): this {
    if (event === undefined) this.handlers.clear();
    else this.handlers.delete(event);
    return this;
  }

  listenerCount(event: keyof Events): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** Returns true if any listener ran. */
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): boolean {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) {
      if (event === "error") throw args[0];
      return false;
    }
    // Copy, so listeners may add or remove listeners while we run.
    for (const listener of [...list]) listener(...args);
    return true;
  }
}
