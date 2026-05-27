import * as ExpoCrypto from "expo-crypto";

// Supabase's PKCE flow needs both `crypto.getRandomValues` (to generate the
// verifier) and `crypto.subtle.digest("SHA-256", ...)` (to compute the S256
// code challenge). Hermes doesn't ship either, so we shim both via expo-crypto.
type DigestAlgorithmName = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

const ALGO_MAP: Record<DigestAlgorithmName, ExpoCrypto.CryptoDigestAlgorithm> = {
  "SHA-1": ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

function resolveAlgorithm(algorithm: AlgorithmIdentifier): ExpoCrypto.CryptoDigestAlgorithm {
  const name = typeof algorithm === "string" ? algorithm : algorithm.name;
  const mapped = ALGO_MAP[name as DigestAlgorithmName];
  if (!mapped) throw new Error(`Unsupported digest algorithm: ${name}`);
  return mapped;
}

function toUint8Array(data: BufferSource): Uint8Array<ArrayBuffer> {
  const source =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(
          (data as ArrayBufferView).buffer,
          (data as ArrayBufferView).byteOffset,
          (data as ArrayBufferView).byteLength,
        );
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function polyfillGetRandomValues<T extends ArrayBufferView>(typedArray: T): T {
  if (typedArray == null) throw new TypeError("getRandomValues requires a typed array");
  const bytes = ExpoCrypto.getRandomBytes(typedArray.byteLength);
  new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength).set(bytes);
  return typedArray;
}

const globalAny = globalThis as unknown as {
  crypto?: {
    subtle?: SubtleCrypto;
    getRandomValues?: <T extends ArrayBufferView>(typedArray: T) => T;
  };
};

if (!globalAny.crypto) {
  globalAny.crypto = {};
}

if (typeof globalAny.crypto.getRandomValues !== "function") {
  globalAny.crypto.getRandomValues = polyfillGetRandomValues;
}

if (!globalAny.crypto.subtle) {
  globalAny.crypto.subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      ExpoCrypto.digest(resolveAlgorithm(algorithm), toUint8Array(data)),
  } as SubtleCrypto;
}
