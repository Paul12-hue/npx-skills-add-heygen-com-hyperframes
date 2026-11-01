import { sculpt, type SculptJob, type SculptResult } from './sculpt';

type Callback = (r: SculptResult) => void;

/**
 * Builds character meshes in the background: in two Web Workers when the
 * browser allows it, otherwise one job per frame on the main thread.
 * Results are cached by key, so a shape is only ever sculpted once.
 */
class Service {
  private cache = new Map<string, SculptResult>();
  private waiting = new Map<string, Callback[]>();
  private queue: { job: SculptJob; priority: number }[] = [];
  private workers: { w: Worker; busy: string | null }[] = [];
  private workerFailed = false;
  /** jobs finished so far (for the loading indicator / tests) */
  done = 0;

  constructor() {
    if (typeof Worker === 'undefined' || (typeof location !== 'undefined' && location.search.includes('noworker'))) {
      this.workerFailed = true;
      return;
    }
    try {
      for (let i = 0; i < 2; i++) {
        const w = new Worker(new URL('./sculpt.worker.ts', import.meta.url), { type: 'module' });
        const slot = { w, busy: null as string | null };
        w.onmessage = (ev: MessageEvent<SculptResult>) => {
          slot.busy = null;
          this.finish(ev.data);
          this.pump();
        };
        w.onerror = () => this.fallback();
        this.workers.push(slot);
      }
    } catch {
      this.fallback();
    }
  }

  private fallback(): void {
    if (this.workerFailed) return;
    this.workerFailed = true;
    // re-queue whatever the workers were doing; the main thread takes over
    for (const s of this.workers) {
      s.w.terminate();
      if (s.busy) {
        const job = this.inFlight.get(s.busy);
        if (job) this.queue.unshift({ job, priority: -10 });
      }
    }
    this.workers = [];
  }

  private inFlight = new Map<string, SculptJob>();
  private firstPost = 0;

  get(key: string): SculptResult | undefined {
    return this.cache.get(key);
  }

  /** Ask for a shape; the callback runs once it exists (maybe right away). Lower priority runs first. */
  request(job: SculptJob, priority: number, cb: Callback): void {
    const hit = this.cache.get(job.key);
    if (hit) {
      cb(hit);
      return;
    }
    const list = this.waiting.get(job.key);
    if (list) {
      list.push(cb);
      // raise the priority if someone needs it sooner
      const q = this.queue.find((e) => e.job.key === job.key);
      if (q && priority < q.priority) q.priority = priority;
      return;
    }
    this.waiting.set(job.key, [cb]);
    this.queue.push({ job, priority });
    this.pump();
  }

  /** Build something right now on the main thread (only for what must exist at once). */
  now(job: SculptJob): SculptResult {
    const hit = this.cache.get(job.key);
    if (hit) return hit;
    const r = sculpt(job);
    this.finish(r);
    this.queue = this.queue.filter((e) => e.job.key !== job.key);
    return r;
  }

  private next(): SculptJob | null {
    if (!this.queue.length) return null;
    let bi = 0;
    for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority < this.queue[bi].priority) bi = i;
    return this.queue.splice(bi, 1)[0].job;
  }

  private pump(): void {
    if (this.workerFailed) return;
    for (const s of this.workers) {
      if (s.busy) continue;
      const job = this.next();
      if (!job) return;
      s.busy = job.key;
      if (!this.firstPost) this.firstPost = performance.now();
      this.inFlight.set(job.key, job);
      s.w.postMessage(job);
    }
  }

  /** Call once per frame: without workers, sculpt one shape on the main thread. */
  tick(): void {
    // a worker that never answers (blocked by the page's security rules) counts as failed
    if (!this.workerFailed && this.done === 0 && this.firstPost && performance.now() - this.firstPost > 8000) this.fallback();
    if (!this.workerFailed) return;
    const job = this.next();
    if (job) this.finish(sculpt(job));
  }

  get pending(): number {
    return this.queue.length + this.workers.filter((s) => s.busy).length;
  }

  private finish(r: SculptResult): void {
    this.inFlight.delete(r.key);
    if (this.cache.has(r.key)) return;
    this.cache.set(r.key, r);
    this.done++;
    const cbs = this.waiting.get(r.key) ?? [];
    this.waiting.delete(r.key);
    for (const cb of cbs) cb(r);
  }
}

export const sculptService = new Service();
