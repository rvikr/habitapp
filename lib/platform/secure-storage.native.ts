import * as SecureStore from "expo-secure-store";

// SecureStore on iOS limits individual values to about 2048 bytes. Supabase
// session payloads can exceed that, so large values are split across multiple
// SecureStore entries instead of being stored in AsyncStorage.
const CHUNK_SIZE = 1800;
const VALID_KEY_RE = /^[A-Za-z0-9._-]+$/;
const EMPTY_KEY = "habbit.secure.empty";
const chunkCountKey = (key: string) => `${secureStoreKey(key)}.chunk-count`;
const chunkKey = (key: string, index: number) => `${secureStoreKey(key)}.chunk.${index}`;

function secureStoreKey(key: string): string {
  if (!key) return EMPTY_KEY;
  if (VALID_KEY_RE.test(key)) return key;
  const sanitized = key.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized || EMPTY_KEY;
}

class LargeSecureStore {
  async getItem(key: string): Promise<string | null> {
    const baseKey = secureStoreKey(key);
    const countValue = await SecureStore.getItemAsync(chunkCountKey(key));
    if (!countValue) {
      return SecureStore.getItemAsync(baseKey);
    }

    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return null;

    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk == null) return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  async setItem(key: string, value: string): Promise<void> {
    const baseKey = secureStoreKey(key);
    await this.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(baseKey, value);
      return;
    }

    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [];
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
  }

  async removeItem(key: string): Promise<void> {
    const baseKey = secureStoreKey(key);
    const countValue = await SecureStore.getItemAsync(chunkCountKey(key));
    await SecureStore.deleteItemAsync(baseKey);
    await SecureStore.deleteItemAsync(chunkCountKey(key));

    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
  }
}

export const secureStorage = new LargeSecureStore();
