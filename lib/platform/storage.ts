// Type stub — Metro picks `storage.native.ts` (iOS/Android) or `storage.web.ts` (web)
// at bundle time based on platform extension. This file exists so TypeScript
// can resolve `import "@/lib/storage"`.
export declare function getItem(key: string): Promise<string | null>;
export declare function setItem(key: string, value: string): Promise<void>;
export declare function removeItem(key: string): Promise<void>;
