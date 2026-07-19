import { describe, it, expect } from "vitest";
import { persistentStorageAvailable } from "./storageHealth";

function fakeStorage(over: Partial<Pick<Storage, "setItem" | "getItem" | "removeItem">> = {}) {
  const data = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => void data.set(k, v),
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
    ...over,
  };
}

describe("persistentStorageAvailable", () => {
  it("is true for a working storage (jsdom's real localStorage included)", () => {
    expect(persistentStorageAvailable(fakeStorage())).toBe(true);
    expect(persistentStorageAvailable()).toBe(true);
  });

  it("cleans its probe key up", () => {
    const s = fakeStorage();
    persistentStorageAvailable(s);
    expect(s.getItem("bb-storage-probe")).toBeNull();
  });

  it("is false when writes throw (Safari 'Block all cookies', quota errors)", () => {
    const s = fakeStorage({
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(persistentStorageAvailable(s)).toBe(false);
  });

  it("is false when writes are silently dropped (read-back mismatch)", () => {
    const s = fakeStorage({ setItem: () => {} });
    expect(persistentStorageAvailable(s)).toBe(false);
  });
});
