// Bus de eventos minimalista (pub/sub) compartido por todos los sistemas.
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, fn) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear() {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
