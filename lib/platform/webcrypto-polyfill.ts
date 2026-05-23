import * as ExpoCrypto from "expo-crypto";

// Supabase's PKCE flow calls `crypto.subtle.digest("SHA-256", ...)` to compute
// the S256 code challenge. Hermes doesn't ship `crypto.subtle`, so without this
// shim auth-js falls back to `plain` and warns at startup.
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

function toArrayBuffer(data: BufferSource): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view = data as ArrayBufferView;
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

const globalAny = globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } };

if (!globalAny.crypto) {
  globalAny.crypto = {} as { subtle?: SubtleCrypto };
}

if (!globalAny.crypto.subtle) {
  globalAny.crypto.subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      ExpoCrypto.digest(resolveAlgorithm(algorithm), toArrayBuffer(data)),
  } as SubtleCrypto;
}
