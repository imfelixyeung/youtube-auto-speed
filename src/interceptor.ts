(() => {
    const TIMEDTEXT_PATH = "/api/timedtext";

    function isTimedTextUrl(url: string) {
        try {
            const absoluteUrl = new URL(url, window.location.href);
            return absoluteUrl.pathname === TIMEDTEXT_PATH;
        } catch {
            return false;
        }
    }

    function sendCaptionData(url: string, text: string) {
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
                        url,
                        data,
                    },
                }),
            );

            console.debug(
                "[Auto Speed] Captions intercepted:",
                data.events.length,
                "events",
            );
        } catch (error) {
            console.debug(
                "[Auto Speed] Could not parse timedtext response:",
                error,
            );
        }
    }

    // ============================================================
    // FETCH
    // ============================================================

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const request = args[0];

            const url =
                typeof request === "string"
                    ? request
                    : request instanceof Request
                      ? request.url
                      : "";

            if (isTimedTextUrl(url)) {
                const clone = response.clone();

                clone
                    .text()
                    .then((text) => {
                        sendCaptionData(url, text);
                    })
                    .catch((error) => {
                        console.debug(
                            "[Auto Speed] Failed to read fetch response:",
                            error,
                        );
                    });
            }
        } catch (error) {
            console.debug("[Auto Speed] Fetch interception error:", error);
        }

        return response;
    };

    // ============================================================
    // XMLHttpRequest
    // ============================================================

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
        method,
        url,
        ...rest: [boolean, string, string]
    ) {
        // Store the URL on this particular XHR instance.
        this.__autoSpeedUrl = url;

        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        const xhr = this;
        const url = xhr.__autoSpeedUrl;

        if (isTimedTextUrl(url)) {
            xhr.addEventListener("load", () => {
                try {
                    if (
                        xhr.responseType === "" ||
                        xhr.responseType === "text"
                    ) {
                        sendCaptionData(url, xhr.responseText);
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
