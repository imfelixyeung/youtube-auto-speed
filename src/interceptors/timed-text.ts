import type { AutoSpeedConfigChangedEvent } from "../types";
import { Interceptor } from "./_interceptor";

const TIMEDTEXT_PATH = "/api/timedtext";

export class TimedTextInterceptor extends Interceptor {
    public name: string = "timed-text";

    constructor() {
        super();
        window.addEventListener("AUTO_SPEED_CONFIG_CHANGED", (event) => {
            const detail = (event as AutoSpeedConfigChangedEvent).detail;
            this.enabled = detail.enabled;
        });
    }

    public match(url: string): boolean {
        try {
            const absoluteUrl = new URL(url, window.location.href);
            return absoluteUrl.pathname === TIMEDTEXT_PATH;
        } catch {
            return false;
        }
    }

    public async handle(url: string, text: string): Promise<void> {
        if (!this.enabled) {
            return;
        }

        if (!text.trim()) {
            return;
        }

        // YouTube may return JSON, XML, etc.
        // For now we're interested in the JSON format.
        if (!text.trim().startsWith("{")) {
            return;
        }

        try {
            const data = JSON.parse(text);

            if (!data || !Array.isArray(data.events)) {
                return;
            }

            window.dispatchEvent(
                new CustomEvent("AUTO_SPEED_CAPTIONS", {
                    detail: {
                        videoId: this.extractVideoId(url),
                        url,
                        data,
                    },
                }),
            );

            this.log("Captions intercepted:", data.events.length, "events");
        } catch (error) {
            this.log("Could not parse timedtext response:", error);
        }
    }
}
