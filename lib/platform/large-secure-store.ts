// Platform-agnostic chunked, serialized key/value store. The backing store is
// injected so this logic can be unit-tested with an in-memory fake, independent
// of expo-secure-store (which only exists on a device).
//
// SecureStore on iOS limits individual values to about 2048 bytes. Supabase
// session payloads can exceed that, so large values are split across multiple
// entries. Those chunked reads/writes span several backend calls and are NOT
// atomic, so every operation is funnelled through a single-writer promise chain
// to stop an interleaved read from observing a half-written payload.

export type SecureStoreBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const CHUNK_SIZE = 1800;
const VALID_KEY_RE = /^[A-Za-z0-9._-]+$/;
const EMPTY_KEY = "habbit.secure.empty";

export function secureStoreKey(key: string): string {
  if (!key) return EMPTY_KEY;
  if (VALID_KEY_RE.test(key)) return key;
  const sanitized = key.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized || EMPTY_KEY;
}

export function splitChunks(value: string): string[] {
  // Index-based slicing keeps every character (including newlines, which a
  // `.{1,N}` regex would drop) so reassembly is byte-for-byte exact.
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

export class LargeSecureStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly backend: SecureStoreBackend;

  constructor(backend: SecureStoreBackend) {
    this.backend = backend;
  }

  private chunkCountKey(key: string): string {
    return `${secureStoreKey(key)}.chunk-count`;
  }

  private chunkKey(key: string, index: number): string {
    return `${secureStoreKey(key)}.chunk.${index}`;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    // Run after the previous op regardless of whether it resolved or rejected.
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  getItem(key: string): Promise<string | null> {
    return this.run(() => this.getItemUnlocked(key));
  }

  setItem(key: string, value: string): Promise<void> {
    return this.run(() => this.setItemUnlocked(key, value));
  }

  removeItem(key: string): Promise<void> {
    return this.run(() => this.removeItemUnlocked(key));
  }

  private async getItemUnlocked(key: string): Promise<string | null> {
    const baseKey = secureStoreKey(key);
    const countValue = await this.backend.getItem(this.chunkCountKey(key));
    if (!countValue) {
      return this.backend.getItem(baseKey);
    }

    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return null;

    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await this.backend.getItem(this.chunkKey(key, i));
      if (chunk == null) return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  private async setItemUnlocked(key: string, value: string): Promise<void> {
    const baseKey = secureStoreKey(key);
    await this.removeItemUnlocked(key);

    if (value.length <= CHUNK_SIZE) {
      await this.backend.setItem(baseKey, value);
      return;
    }

    const chunks = splitChunks(value);
    // Write the chunks before the count so a reader never sees a count that
    // points at not-yet-written chunks.
    for (let i = 0; i < chunks.length; i++) {
      await this.backend.setItem(this.chunkKey(key, i), chunks[i]);
    }
    await this.backend.setItem(this.chunkCountKey(key), String(chunks.length));
  }

  private async removeItemUnlocked(key: string): Promise<void> {
    const baseKey = secureStoreKey(key);
    const countValue = await this.backend.getItem(this.chunkCountKey(key));
    // Delete the count first so a reader falls back to the (also-cleared) base
    // key rather than chasing partially-deleted chunks.
    await this.backend.removeItem(this.chunkCountKey(key));
    await this.backend.removeItem(baseKey);

    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return;
    for (let i = 0; i < count; i++) {
      await this.backend.removeItem(this.chunkKey(key, i));
    }
  }
}
