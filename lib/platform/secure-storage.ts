// Type stub — Metro picks `secure-storage.native.ts` or `secure-storage.web.ts` at bundle time.
export declare const secureStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
