/**
 * Page lifecycle with four queues (IM 4):
 *   mount   runs as soon as all modules of a batch are created
 *   in      runs after 'intro:done' when the page enters (again after every re-entry)
 *   out     runs before the page is left; all entries in parallel, awaited; optionally only when the
 *           module's element is in the viewport
 *   destroy runs when the page (or a single module element) goes away
 * The shell (everything outside [data-view]) is a persistent page that is never left.
 */
import { store } from './store.js';
import { inViewport } from './dom.js';

function runAll(list, where) {
  for (const fn of list) {
    try {
      fn();
    } catch (err) {
      console.error(`[v1:page] ${where} failed`, err);
    }
  }
}

export class Page {
  constructor(root, { name = 'page', persistent = false } = {}) {
    this.root = root;
    this.name = name;
    this.persistent = persistent;
    this.instances = new Set();
    this.entered = false;
  }

  adopt(inst) {
    this.instances.add(inst);
    inst.page = this;
  }

  release(inst) {
    this.instances.delete(inst);
  }

  /** Mount queue of one instance; also runs its page-in queue when the page is already in. */
  mount(inst) {
    if (inst.mounted) return;
    inst.mounted = true;
    runAll(inst.q.mount, `mount of ${inst.name}`);
    if (this.entered) this.runIn(inst);
  }

  runIn(inst) {
    if (inst.entered || !inst.mounted) return;
    inst.entered = true;
    runAll(inst.q.in, `page-in of ${inst.name}`);
  }

  enter() {
    if (this.entered) return;
    this.entered = true;
    for (const inst of this.instances) this.runIn(inst);
    store.emit('page:in', { page: this.name });
  }

  /** Run the page-out queue (parallel, awaited) and mark the page as left. */
  async leave() {
    if (!this.entered) return;
    store.emit('page:out', { page: this.name });
    const jobs = [];
    for (const inst of this.instances) {
      for (const { fn, onlyIfVisible } of inst.q.out) {
        if (onlyIfVisible && !inViewport(inst.el)) continue;
        jobs.push(
          Promise.resolve()
            .then(fn)
            .catch((err) => console.error(`[v1:page] page-out of ${inst.name} failed`, err)),
        );
      }
    }
    await Promise.all(jobs);
    this.entered = false;
    for (const inst of this.instances) inst.entered = false;
  }
}
