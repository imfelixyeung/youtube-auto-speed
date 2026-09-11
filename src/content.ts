import {
    DEFAULT_RAMP_DURATION,
    ENABLED_KEY,
    MAX_RAMP_DURATION,
    MIN_RAMP_DURATION,
    RAMP_DURATION_KEY,
} from "./config";
import {
    computeSpeedAtTime,
    easeInOutCubic,
    type TimedInterval,
} from "./speedCurve";
import type {
    AutoSpeedCaptionsEvent,
    AutoSpeedConfigChangedEvent,
    TimedText,
} from "./types";

type AutoSpeedConfig = {
    enabled: boolean;
    rampDurationSeconds: number;
};

(() => {
    const config: AutoSpeedConfig = {
        enabled: true,
        rampDurationSeconds: DEFAULT_RAMP_DURATION,
    };

    let video: HTMLVideoElement | null = null;

    let captionIntervals: TimedInterval[] = [];

    let badge: HTMLElement | null = null;

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    function findVideo() {
        return document.querySelector(
            "video.html5-main-video, video",
        ) as HTMLVideoElement;
    }

    function roundToNearest05(value: number) {
        return Math.round(Math.round(value / 0.05) * 0.05 * 100) / 100;
    }

    function setSpeed(speed: number) {
        if (!video) {
            return;
        }

        const rounded = roundToNearest05(speed);

        if (video.playbackRate === rounded) {
            return;
        }

        video.playbackRate = rounded;

        if (badge) {
            badge.textContent = `${rounded.toFixed(2)}x`;
        }

        log(`Playback speed: ${rounded}x`);
    }

    function createBadge(): HTMLElement {
        const badgeEl = document.createElement("div");

        badgeEl.setAttribute("data-auto-speed-badge", "");

        badgeEl.textContent = "1.00x";

        const style = badgeEl.style;

        style.position = "absolute";
        style.top = "0.5rem";
        style.right = "0.5rem";
        style.zIndex = "2147483647";
        style.padding = "0.5rem 1rem";
        style.borderRadius = "16rem";
        style.background = "rgba(0, 0, 0, 0.7)";
        style.color = "#fff";
        style.fontFamily = "'Roboto', 'Arial', sans-serif";
        style.fontSize = "1rem";
        style.fontWeight = "500";
        style.lineHeight = "normal";
        style.pointerEvents = "none";
        style.userSelect = "none";
        style.display = "none";

        return badgeEl;
    }

    /**
     * Attach the badge to YouTube's player container.
     *
     * The player (`#movie_player`) is the element that goes fullscreen, so a
     * badge appended to it stays pinned to the video in all display modes.
     */
    function attachBadge() {
        const player = document.querySelector<HTMLElement>("#movie_player");

        if (!player) {
            return;
        }

        if (!badge) {
            badge = createBadge();
        }

        if (badge.parentElement !== player) {
            badge.remove();

            player.appendChild(badge);
        }

        badge.style.display = config.enabled ? "block" : "none";
    }

    function processCaptionData(data: TimedText | null) {
        if (!data || !Array.isArray(data.events)) {
            return;
        }

        const intervals = [];

        for (const event of data.events) {
            if (!Array.isArray(event.segs)) {
                continue;
            }

            if (!Number.isFinite(event.tStartMs)) {
                continue;
            }

            if (!Number.isFinite(event.dDurationMs)) {
                continue;
            }

            const start = event.tStartMs / 1000;

            const end = (event.tStartMs + event.dDurationMs) / 1000;

            // Ignore empty caption events.
            const text = event.segs
                .map((seg) => seg.utf8 || "")
                .join("")
                .trim();

            if (!text) {
                continue;
            }

            intervals.push({
                start,
                end,
            });
        }

        // Sort by start time.
        intervals.sort((a, b) => a.start - b.start);

        captionIntervals = mergeIntervals(intervals);

        log(`Loaded ${captionIntervals.length} caption intervals`);

        log(captionIntervals.slice(0, 10));
    }

    /**
     * Merge overlapping / very-near caption intervals.
     *
     * This prevents:
     *
     * 10.0 - 10.5
     * 10.5 - 11.2
     *
     * becoming two separate speech periods.
     */
    function mergeIntervals(intervals: TimedInterval[]) {
        if (intervals.length === 0) {
            return [];
        }

        const merged = [];

        const GAP_TO_MERGE = 0.05;

        for (const interval of intervals) {
            const previous = merged[merged.length - 1];

            if (previous && interval.start <= previous.end + GAP_TO_MERGE) {
                previous.end = Math.max(previous.end, interval.end);
            } else {
                merged.push({
                    start: interval.start,
                    end: interval.end,
                });
            }
        }

        return merged;
    }

    function updateSpeed() {
        if (!config.enabled || !video) {
            return;
        }

        if (video.paused || video.ended) {
            setSpeed(1);

            return;
        }

        const desired = computeSpeedAtTime(
            video.currentTime,
            captionIntervals,
            {
                talkingSpeed: 1,
                silentSpeed: 2,
                rampDurationSeconds: config.rampDurationSeconds,
                easing: easeInOutCubic,
            },
        );

        setSpeed(desired);
    }

    function tick() {
        updateSpeed();

        requestAnimationFrame(tick);
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        log("Video attached");

        video = newVideo;

        setSpeed(1);

        video.addEventListener("play", updateSpeed);
        video.addEventListener("playing", updateSpeed);

        video.addEventListener("pause", () => {
            setSpeed(1);
        });

        video.addEventListener("ended", () => {
            setSpeed(1);
        });

        video.addEventListener("seeked", updateSpeed);
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
        }

        attachBadge();
    }

    function propagateConfig() {
        const event = new CustomEvent<AutoSpeedConfigChangedEvent["detail"]>(
            "AUTO_SPEED_CONFIG_CHANGED",
            {
                detail: {
                    enabled: config.enabled,
                },
            },
        );

        window.dispatchEvent(event);
    }

    function setEnabled(value: boolean) {
        if (value === config.enabled) {
            return;
        }

        config.enabled = value;

        propagateConfig();

        if (config.enabled) {
            updateSpeed();
        } else {
            // Restore normal playback speed when disabled.
            setSpeed(1);
        }

        attachBadge();

        log(`Auto speed ${config.enabled ? "enabled" : "disabled"}`);
    }

    function setRampDuration(seconds: number) {
        const clamped = Math.min(
            MAX_RAMP_DURATION,
            Math.max(MIN_RAMP_DURATION, seconds),
        );

        if (clamped === config.rampDurationSeconds) {
            return;
        }

        config.rampDurationSeconds = clamped;

        updateSpeed();

        log(`Ramp duration: ${clamped}s`);
    }

    window.addEventListener("AUTO_SPEED_CAPTIONS", (event) => {
        const data = (event as AutoSpeedCaptionsEvent).detail?.data;

        if (!data || !config.enabled) {
            return;
        }

        processCaptionData(data);

        // Immediately recalculate because a new caption track
        // probably means a new video or language.
        updateSpeed();
    });

    const pageObserver = new MutationObserver(() => {
        checkForVideo();
    });

    pageObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    checkForVideo();

    requestAnimationFrame(tick);

    chrome.storage.sync.get([ENABLED_KEY, RAMP_DURATION_KEY], (result) => {
        if (typeof result[ENABLED_KEY] === "boolean") {
            setEnabled(result[ENABLED_KEY]);
        }

        if (typeof result[RAMP_DURATION_KEY] === "number") {
            setRampDuration(result[RAMP_DURATION_KEY]);
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
            return;
        }

        const enabledChange = changes[ENABLED_KEY];

        if (enabledChange && typeof enabledChange.newValue === "boolean") {
            setEnabled(enabledChange.newValue);
        }

        const rampChange = changes[RAMP_DURATION_KEY];

        if (rampChange && typeof rampChange.newValue === "number") {
            setRampDuration(rampChange.newValue);
        }
    });

    log("Initialized");
})();
