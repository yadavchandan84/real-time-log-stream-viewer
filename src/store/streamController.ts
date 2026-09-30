import type { LogSimulator } from '../domain/simulator';
import type { LogStore } from './logStore';

/**
 * Drives the simulator on a fixed tick and pushes batches into the store.
 *
 * Batching is the key performance lever: however high the event rate, React
 * sees at most one store update per tick (default 4/s), so render cost scales
 * with tick frequency rather than with event volume.
 */
export class StreamController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private carry = 0;
  private readonly store: LogStore;
  private readonly simulator: LogSimulator;
  private readonly tickMs: number;

  /** Upper bound per tick, protects against huge catch-up bursts after a tab sleeps. */
  static readonly MAX_BATCH = 5_000;

  constructor(store: LogStore, simulator: LogSimulator, tickMs = 250) {
    this.store = store;
    this.simulator = simulator;
    this.tickMs = tickMs;
  }

  start() {
    if (this.timer !== null) return;
    this.lastTick = Date.now();
    this.carry = 0;
    this.timer = setInterval(this.tick, this.tickMs);
    if (!this.store.getSnapshot().stream.running) this.store.setStream({ running: true });
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.store.getSnapshot().stream.running) this.store.setStream({ running: false });
  }

  toggle() {
    if (this.timer === null) this.start();
    else this.stop();
  }

  setRate(rate: number) {
    this.store.setStream({ rate });
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick = () => {
    const now = Date.now();
    const elapsed = now - this.lastTick;
    const from = this.lastTick;
    this.lastTick = now;

    const exact = (this.store.getSnapshot().stream.rate * elapsed) / 1000 + this.carry;
    const count = Math.min(Math.floor(exact), StreamController.MAX_BATCH);
    this.carry = count === StreamController.MAX_BATCH ? 0 : exact - count;
    if (count > 0) this.store.ingest(this.simulator.emit(count, from, now));
  };
}
