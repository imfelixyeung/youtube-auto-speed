import { beforeEach, describe, expect, it } from "bun:test";
import { CacheStore } from "./store";

describe("CacheStore", () => {
    let cache: CacheStore<string>;

    beforeEach(() => {
        cache = new CacheStore<string>({ size: 3 });
    });

    describe("set() & get()", () => {
        it("should store and retrieve a value", () => {
            cache.set("a", "apple");
            expect(cache.get("a")).toBe("apple");
        });

        it("should return null for non-existent keys", () => {
            expect(cache.get("unknown")).toBeNull();
        });

        it("should update existing keys without duplicating items", () => {
            cache.set("a", "apple");
            cache.set("a", "apricot");

            expect(cache.get("a")).toBe("apricot");
        });
    });

    describe("LRU Eviction Policy", () => {
        it("should evict the oldest item when exceeding max capacity", () => {
            cache.set("a", "apple");
            cache.set("b", "banana");
            cache.set("c", "cherry");

            // Adding a 4th item exceeds size 3; 'a' should be evicted
            cache.set("d", "date");

            expect(cache.get("a")).toBeNull();
            expect(cache.get("b")).toBe("banana");
            expect(cache.get("c")).toBe("cherry");
            expect(cache.get("d")).toBe("date");
        });

        it("should refresh an entry order on set() so it is not evicted early", () => {
            cache.set("a", "apple");
            cache.set("b", "banana");
            cache.set("c", "cherry");

            // Re-setting 'a' moves it to the most-recently-used position
            cache.set("a", "apple-updated");

            // Adding a 4th item should now evict 'b' instead of 'a'
            cache.set("d", "date");

            expect(cache.get("a")).toBe("apple-updated");
            expect(cache.get("b")).toBeNull();
        });

        it("should refresh an entry order on get() so it is not evicted early", () => {
            cache.set("a", "apple");
            cache.set("b", "banana");
            cache.set("c", "cherry");

            // Accessing 'a' makes it the most-recently-used entry
            cache.get("a");

            // Adding a 4th item should now evict 'b' instead of 'a'
            cache.set("d", "date");

            expect(cache.get("a")).toBe("apple");
            expect(cache.get("b")).toBeNull();
            expect(cache.get("c")).toBe("cherry");
            expect(cache.get("d")).toBe("date");
        });
    });

    describe("delete()", () => {
        it("should remove a key from the cache", () => {
            cache.set("a", "apple");
            cache.delete("a");

            expect(cache.get("a")).toBeNull();
        });

        it("should handle deleting non-existent keys gracefully", () => {
            expect(() => cache.delete("non-existent")).not.toThrow();
        });

        it("should free up space when an item is deleted", () => {
            cache.set("a", "apple");
            cache.set("b", "banana");
            cache.set("c", "cherry");

            cache.delete("b");

            // Should be able to add a new item without evicting 'a' or 'c'
            cache.set("d", "date");

            expect(cache.get("a")).toBe("apple");
            expect(cache.get("b")).toBeNull();
            expect(cache.get("c")).toBe("cherry");
            expect(cache.get("d")).toBe("date");
        });
    });

    describe("Edge Cases & Data Types", () => {
        it("should work with complex object data types", () => {
            interface User {
                id: number;
                name: string;
            }

            const objectCache = new CacheStore<User>({ size: 2 });
            const user1 = { id: 1, name: "Alice" };

            objectCache.set("u1", user1);
            expect(objectCache.get("u1")).toEqual({ id: 1, name: "Alice" });
        });

        it("should support falsy values properly", () => {
            const booleanCache = new CacheStore<boolean>({ size: 2 });
            booleanCache.set("flag", false);

            expect(booleanCache.get("flag")).toBe(false);
        });
    });

    describe("Size Initialisation Validation", () => {
        it("should throw a RangeError when size is 0", () => {
            expect(() => new CacheStore({ size: 0 })).toThrowError(RangeError);
            expect(() => new CacheStore({ size: 0 })).toThrowError(
                "CacheStore size must be a positive integer.",
            );
        });

        it("should throw a RangeError when size is negative", () => {
            expect(() => new CacheStore({ size: -5 })).toThrowError(RangeError);
        });

        it("should throw a RangeError when size is a non-integer/fractional number", () => {
            expect(() => new CacheStore({ size: 1.5 })).toThrowError(
                RangeError,
            );
        });

        it("should instantiate successfully with a valid positive integer size", () => {
            expect(() => new CacheStore({ size: 1 })).not.toThrow();
            expect(() => new CacheStore({ size: 100 })).not.toThrow();
        });
    });
});
