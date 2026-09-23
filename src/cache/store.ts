export type CacheStoreOptions = {
    size: number;
};

export class CacheStore<T> {
    private cacheMap = new Map<string, T>();
    private readonly size: number;

    public constructor(options: CacheStoreOptions) {
        if (!Number.isInteger(options.size) || options.size < 1) {
            throw new RangeError("CacheStore size must be a positive integer.");
        }
        this.size = options.size;
    }

    /**
     * Stores or updates data for a given key.
     */
    public set(key: string, data: T): void {
        // Re-insert so the most-recently-used entry sits at the end.
        this.cacheMap.delete(key);
        this.cacheMap.set(key, data);

        if (this.cacheMap.size <= this.size) return;
        const oldest = this.cacheMap.keys().next().value;
        if (oldest === undefined) return;
        this.cacheMap.delete(oldest);
    }

    /**
     * Look up the cached value for a given key, or null if not found.
     * The entry is refreshed to the back of the cache on access.
     */
    public get(key: string): T | null {
        const data = this.cacheMap.get(key);
        if (data) {
            this.cacheMap.delete(key);
            this.cacheMap.set(key, data);
        }
        return data ?? null;
    }

    /**
     * Removes a cached value by key.
     */
    public delete(key: string): void {
        this.cacheMap.delete(key);
    }
}
