export abstract class Interceptor {
    public name: string = "unknown";
    public enabled: boolean = true;

    /**
     * Run any initialisation logic.
     */
    public init(): void {}

    /**
     * Should the interceptor intercept the URL.
     */
    public abstract match(url: string): boolean;

    /**
     * Handles the intercepted data (read-only).
     */
    public abstract handle(url: string, text: string): Promise<void>;

    /**
     * Helper function for logging.
     */
    public log(...args: unknown[]): void {
        console.debug(`[Auto Speed Interceptor]${this.name}`, ...args);
    }

    /**
     * Helper function to get the current YouTube Video ID from URL.
     */
    public extractVideoId(url: string): string | null {
        try {
            const videoId = new URL(url, window.location.href).searchParams.get(
                "v",
            );
            return videoId ?? null;
        } catch {
            return null;
        }
    }
}
