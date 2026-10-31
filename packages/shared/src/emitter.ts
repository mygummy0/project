/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => {
      set!.delete(listener as (payload: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const l of [...set]) {
      try {
        (l as (p: Events[K]) => void)(payload);
      } catch (err) {
        // A faulty listener must never break the emitting engine.
        console.error("[emitter] listener failed", err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
