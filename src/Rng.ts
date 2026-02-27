/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Deterministic per seed – useful for reproducible runs.
 */
export class Rng {
  private state: number;
  readonly seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 0xffffffff);
    this.state = this.seed;
  }

  /** Returns float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns true with probability p (0–1) */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  getSeedHex(): string {
    return (this.seed >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
}
