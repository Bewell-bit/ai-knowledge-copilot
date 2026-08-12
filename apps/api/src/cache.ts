export class TtlCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  constructor(private ttlMs = 60_000, private maxSize = 200) {}
  get(key: string) {
    const hit = this.values.get(key);
    if (!hit || hit.expires < Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T) {
    if (this.values.size >= this.maxSize)
      this.values.delete(this.values.keys().next().value as string);
    this.values.set(key, { value, expires: Date.now() + this.ttlMs });
  }
  get size() {
    return this.values.size;
  }
}
