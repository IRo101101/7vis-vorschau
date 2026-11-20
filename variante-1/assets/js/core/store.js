/**
 * State store with events (IM 4 "Zustandsspeicher").
 *
 *   store.set(key, value)   stores the value and emits `key` when it changed (Object.is)
 *   store.get(key)
 *   store.emit(key, data)   pure event, nothing is stored (for things like 'layout:change')
 *   store.on(key, fn)       returns off(); fn(value, previous) for set, fn(data) for emit
 *   store.once(key, fn)     returns off()
 *   store.off(key, fn)
 *   store.when(key, test)   promise resolving with the value as soon as test(value) is true (default: truthy)
 *   store.state             proxy: store.state['motion:reduced'] reads, assignment calls set()
 *
 * Modules couple only through this store (PLAN 8, spike S2). Keys are listed in CONTRACT.md section 7.
 */

const values = new Map();
const listeners = new Map();

function callAll(key, a, b) {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(a, b);
    } catch (err) {
      console.error(`[v1:store] listener for "${key}" failed`, err);
    }
  }
}

export const store = {
  get(key) {
    return values.get(key);
  },

  has(key) {
    return values.has(key);
  },

  set(key, value) {
    const prev = values.get(key);
    if (values.has(key) && Object.is(prev, value)) return false;
    values.set(key, value);
    callAll(key, value, prev);
    return true;
  },

  emit(key, data) {
    callAll(key, data, undefined);
  },

  on(key, fn) {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(fn);
    return () => this.off(key, fn);
  },

  once(key, fn) {
    const off = this.on(key, (a, b) => {
      off();
      fn(a, b);
    });
    return off;
  },

  off(key, fn) {
    const set = listeners.get(key);
    if (!set) return;
    set.delete(fn);
    if (!set.size) listeners.delete(key);
  },

  when(key, test = Boolean) {
    if (values.has(key) && test(values.get(key))) return Promise.resolve(values.get(key));
    return new Promise((resolve) => {
      const off = this.on(key, (value) => {
        if (!test(value)) return;
        off();
        resolve(value);
      });
    });
  },

  /** Number of listeners (leak checks). */
  listenerCount() {
    let n = 0;
    for (const set of listeners.values()) n += set.size;
    return n;
  },

  keys() {
    return [...values.keys()];
  },
};

store.state = new Proxy(Object.create(null), {
  get: (_, key) => values.get(key),
  set: (_, key, value) => {
    store.set(key, value);
    return true;
  },
  has: (_, key) => values.has(key),
  ownKeys: () => [...values.keys()],
  getOwnPropertyDescriptor: (_, key) => (values.has(key) ? { enumerable: true, configurable: true, value: values.get(key) } : undefined),
});
