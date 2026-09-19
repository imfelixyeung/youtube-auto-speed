import { TimedTextInterceptor } from "./interceptors/timed-text";

(() => {
    const interceptors = [new TimedTextInterceptor()];

    // ============================================================
    // FETCH
    // ============================================================

    const originalFetch = window.fetch;

    window.fetch = async function (this: typeof globalThis, ...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const request = args[0];

            const url =
                typeof request === "string"
                    ? request
                    : request instanceof Request
                      ? request.url
                      : "";

            for (const interceptor of interceptors) {
                if (!interceptor.match(url)) {
                    continue;
                }

                const clone = response.clone();
                await clone
                    .text()
                    .then((text) => interceptor.handle(url, text))
                    .catch((error) => {
                        interceptor.log(
                            "Failed to read fetch response:",
                            error,
                        );
                    });
            }
        } catch (error) {
            console.debug("[Auto Speed] Fetch interception error:", error);
        }

        return response;
    } as typeof fetch;

    // ============================================================
    // XMLHttpRequest
    // ============================================================

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    type AutoSpeedXHR = XMLHttpRequest & {
        __autoSpeedUrl?: string;
    };

    XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: [boolean, string, string]
    ) {
        // Store the URL on this particular XHR instance.
        (this as AutoSpeedXHR).__autoSpeedUrl = String(url);

        return originalOpen.call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args) {
        const xhr = this as AutoSpeedXHR;
        const url = xhr.__autoSpeedUrl;

        if (typeof url !== "string") {
            return originalSend.apply(this, args);
        }

        for (const interceptor of interceptors) {
            if (!interceptor.match(url)) {
                continue;
            }

            xhr.addEventListener("load", () => {
                try {
                    if (
                        xhr.responseType === "" ||
                        xhr.responseType === "text"
                    ) {
                        interceptor.handle(url, xhr.responseText);
                    }
                } catch (error) {
                    console.debug(
                        "[Auto Speed] Failed to read XHR response:",
                        error,
                    );
                }
            });
        }

        return originalSend.apply(this, args);
    };

    console.debug("[Auto Speed] Network interceptor installed");
})();
