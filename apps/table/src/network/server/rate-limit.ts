/** Bounded fixed windows; never evict a live entry to admit a new key. */
export class RateLimit {
  private readonly entries = new Map<string, { until: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number,
    private readonly now: () => number, private readonly maxKeys = 1024) {}
  take(key: string): boolean {
    this.sweep();
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxKeys) return false;
      entry = { until: this.now() + this.windowMs, count: 0 };
      this.entries.set(key, entry);
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (now >= entry.until) this.entries.delete(key);
  }
}
