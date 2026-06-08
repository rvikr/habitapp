import * as SecureStore from "expo-secure-store";
import { LargeSecureStore, type SecureStoreBackend } from "./large-secure-store";

// Thin adapter over expo-secure-store. All chunking, key sanitization, and
// serialization live in LargeSecureStore (which is unit-tested with an
// in-memory backend).
const backend: SecureStoreBackend = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const secureStorage = new LargeSecureStore(backend);
