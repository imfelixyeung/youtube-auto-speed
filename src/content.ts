import "./content.css";
import {
    cacheTimedText,
    captionsToIntervals,
    getCachedTimedText,
} from "./captions";
import { createChartOverlay } from "./chartOverlay";
import {
    BOOST_SPEED,
    DEFAULT_RAMP_DURATION,
    DEFAULT_SILENT_SPEED,
    DEFAULT_TALKING_SPEED,
    ENABLED_KEY,
    MAX_RAMP_DURATION,
    MAX_SILENT_SPEED,
    MAX_TALKING_SPEED,
    MIN_RAMP_DURATION,
    MIN_SILENT_SPEED,
    MIN_TALKING_SPEED,
    RAMP_DURATION_KEY,
    SILENT_SPEED_KEY,
    TALKING_SPEED_KEY,
} from "./config";
import { createSpeedControl } from "./speedControl";
import type { TimedInterval } from "./speedCurve";
import { formatTimeSavedRatio } from "./timeSaved";
import type {
    AutoSpeedCaptionsEvent,
    AutoSpeedConfig,
    AutoSpeedConfigChangedEvent,
    TimedText,
} from "./types";

(() => {
    const config: AutoSpeedConfig & {
        talkingSpeedConfig: number;
        talkingSpeedBoost: number;
    } = {
        enabled: true,
        rampDurationSeconds: DEFAULT_RAMP_DURATION,
        talkingSpeed: DEFAULT_TALKING_SPEED,
        talkingSpeedConfig: DEFAULT_TALKING_SPEED,
        talkingSpeedBoost: BOOST_SPEED,
        silentSpeed: DEFAULT_SILENT_SPEED,
    };
    let video: HTMLVideoElement | null = null;
    let captionIntervals: TimedInterval[] = [];
    let captionVersion = 0;
    let currentVideoId: string | null = null;

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    const overlay = createChartOverlay(log, {
        onBoostStart: () => {
            log(`Boosting speed to ${config.talkingSpeedBoost}`);
            setTalkingSpeed(config.talkingSpeedBoost, true);
        },
        onBoostEnd: () => {
            setTalkingSpeed(config.talkingSpeedConfig);
        },
    });

    const speed = createSpeedControl({
        getVideo: () => video,
        getConfig: () => config,
        getIntervals: () => captionIntervals,
        onRateApplied: (rate) => overlay.setBadgeText(`${rate.toFixed(2)}x`),
    });

    // Time saved is derived from the cached speed curve, so it only needs a
    // lookup per frame. The DOM only updates when the displayed text actually
    // changes.
    let lastShownTimeSaved: string | null = null;

    function findVideo() {
        return document.querySelector(
            "video.html5-main-video, video",
        ) as HTMLVideoElement;
    }

    function getCurrentVideoId() {
        try {
            const url = new URL(window.location.href);
            const queryId = url.searchParams.get("v");

            if (queryId) {
                return queryId;
            }

            const match = url.pathname.match(
                /^\/(?:shorts|embed|live|v)\/([^/]+)/,
            );

            return match?.[1] ?? null;
        } catch {
            return null;
        }
    }

    function updateSpeed() {
        speed.update();
    }

    /**
     * Attach a badge + chart overlay to YouTube's player container.
     */
    function attachOverlay() {
        const player = document.querySelector<HTMLElement>("#movie_player");

        overlay.attach(player, config.enabled);
        updateBadgeCaptionState();
    }

    function updateChart() {
        overlay.update({ video, captionIntervals, captionVersion, config });
    }

    function updateBadgeCaptionState() {
        // Gray out the badge when the extension is active but the current
        // video has no captions to drive the auto speed.
        overlay.setBadgeActive(config.enabled && captionIntervals.length > 0);
    }

    function refreshPlayhead() {
        if (video) {
            overlay.refreshPlayhead(video.currentTime);
        }
    }

    function tick() {
        updateSpeed();
        refreshPlayhead();

        if (video && !video.paused && !video.ended && config.enabled) {
            const text = formatTimeSavedRatio(
                overlay.getTimeSavedAt(video.currentTime),
                overlay.getExpectedTimeSaved(),
            );

            if (text !== lastShownTimeSaved) {
                lastShownTimeSaved = text;
                overlay.setTimeSavedText(text);
            }

            requestAnimationFrame(tick);
        } else {
            ticking = false;
        }
    }

    function requestTick() {
        if (!video || video.paused || video.ended || !config.enabled) {
            return;
        }

        if (!ticking) {
            ticking = true;

            requestAnimationFrame(tick);
        }
    }

    function handlePlay() {
        updateSpeed();
        requestTick();
    }

    function handlePlaying() {
        updateSpeed();
        requestTick();
    }

    function handlePause() {
        speed.set(1);
    }

    function handleEnded() {
        speed.set(1);
    }

    function detachVideo() {
        if (!video) {
            return;
        }

        video.removeEventListener("play", handlePlay);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("seeked", updateSpeed);
        video.removeEventListener("loadedmetadata", updateChart);
        video.removeEventListener("durationchange", updateChart);

        video = null;
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        detachVideo();
        log("Video attached");
        video = newVideo;
        speed.set(1);
        lastShownTimeSaved = null;
        overlay.setTimeSavedText(formatTimeSavedRatio(0, 0));

        video.addEventListener("play", handlePlay);
        video.addEventListener("playing", handlePlaying);
        video.addEventListener("pause", handlePause);
        video.addEventListener("ended", handleEnded);
        video.addEventListener("seeked", updateSpeed);
        video.addEventListener("loadedmetadata", updateChart);
        video.addEventListener("durationchange", updateChart);
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
        }

        attachOverlay();
    }

    function applyCaptions(data: TimedText, source: "cache" | "network") {
        captionIntervals = captionsToIntervals(data);
        captionVersion++;
        log(`Loaded ${captionIntervals.length} caption intervals (${source})`);
        log(captionIntervals.slice(0, 10));

        // Immediately recalculate because new captions probably mean a new
        // video or language.
        updateSpeed();
        updateChart();
        updateBadgeCaptionState();
    }

    /**
     * YouTube is an SPA, so a navigation can swap videos without any caption
     * request for the new one (e.g. it has no subtitles). Drop stale intervals
     * from the previous video and recompute the current video id.
     */
    function resetForNavigation() {
        const nextVideoId = getCurrentVideoId();

        if (nextVideoId === currentVideoId) {
            return;
        }

        currentVideoId = nextVideoId;
        captionIntervals = [];

        // Reuse previously-intercepted captions for this video: YouTube
        // sometimes skips the timedtext request for a video it has already
        // loaded because of its own caches, so the interceptor never fires.
        const cached = getCachedTimedText(currentVideoId ?? "");

        if (cached) {
            applyCaptions(cached, "cache");
            return;
        }

        captionVersion++;

        updateSpeed();
        updateChart();
        updateBadgeCaptionState();
        log(`Reset captions for video ${currentVideoId}`);
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
            requestTick();
        } else {
            // Restore normal playback speed when disabled.
            speed.set(1);
        }

        attachOverlay();
        updateBadgeCaptionState();
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
        updateChart();
        log(`Ramp duration: ${clamped}s`);
    }

    function setTalkingSpeed(speed: number, isBoost = false) {
        const clamped = Math.min(
            MAX_TALKING_SPEED,
            Math.max(MIN_TALKING_SPEED, speed),
        );

        if (clamped >= config.silentSpeed) {
            return;
        }

        if (clamped === config.talkingSpeed) {
            return;
        }

        config.talkingSpeed = clamped;
        if (!isBoost) {
            config.talkingSpeedConfig = clamped;
        }
        updateSpeed();
        updateChart();
        log(`Talking speed: ${clamped}x`);
    }

    function setSilentSpeed(speed: number) {
        const clamped = Math.min(
            MAX_SILENT_SPEED,
            Math.max(MIN_SILENT_SPEED, speed),
        );

        if (clamped <= config.talkingSpeed) {
            return;
        }

        if (clamped === config.silentSpeed) {
            return;
        }

        config.silentSpeed = clamped;
        updateSpeed();
        updateChart();
        log(`Silent speed: ${clamped}x`);
    }

    window.addEventListener("AUTO_SPEED_CAPTIONS", (event) => {
        const { videoId, data } = (event as AutoSpeedCaptionsEvent).detail;

        if (!data || !config.enabled) {
            return;
        }

        // Remember the raw data so a later visit to the same video still has
        // speed intervals even when YouTube serves the captions from its own
        // caches and never re-fetches timedtext.
        cacheTimedText(videoId, data);

        if (videoId !== currentVideoId) {
            return;
        }

        applyCaptions(data, "network");
    });

    let ticking = false;
    let observedTarget: Node | null = null;

    const pageObserver = new MutationObserver(() => {
        observePrimaryTarget();
        checkForVideo();
    });

    /**
     * Watch `#movie_player` (where the `<video>` lives) instead of the whole
     * page. YouTube's home/feed/ads mutate the document constantly, and a
     * body-wide observer would fire on every one of those changes.
     *
     * Falls back to `document.body` when the player is missing, so a newly
     * inserted player is still detected. The target is re-derived on the
     * YouTube SPA navigation event because the whole `#movie_player` element
     * can be replaced between pages.
     */
    function observePrimaryTarget() {
        const player = document.querySelector<HTMLElement>("#movie_player");
        const target = player ?? document.body;

        if (target === observedTarget) {
            return;
        }

        pageObserver.disconnect();
        pageObserver.observe(target, { subtree: true, childList: true });
        observedTarget = target;
    }

    observePrimaryTarget();
    document.addEventListener("yt-navigate-finish", () => {
        observePrimaryTarget();
        checkForVideo();
        resetForNavigation();
    });
    currentVideoId = getCurrentVideoId();
    checkForVideo();
    requestTick();

    chrome.storage.sync.get(
        [ENABLED_KEY, RAMP_DURATION_KEY, TALKING_SPEED_KEY, SILENT_SPEED_KEY],
        (result) => {
            if (typeof result[ENABLED_KEY] === "boolean") {
                setEnabled(result[ENABLED_KEY]);
            }

            if (typeof result[RAMP_DURATION_KEY] === "number") {
                setRampDuration(result[RAMP_DURATION_KEY]);
            }

            if (typeof result[TALKING_SPEED_KEY] === "number") {
                setTalkingSpeed(result[TALKING_SPEED_KEY]);
            }

            if (typeof result[SILENT_SPEED_KEY] === "number") {
                setSilentSpeed(result[SILENT_SPEED_KEY]);
            }
        },
    );

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

        const talkingChange = changes[TALKING_SPEED_KEY];

        if (talkingChange && typeof talkingChange.newValue === "number") {
            setTalkingSpeed(talkingChange.newValue);
        }

        const silentChange = changes[SILENT_SPEED_KEY];

        if (silentChange && typeof silentChange.newValue === "number") {
            setSilentSpeed(silentChange.newValue);
        }
    });

    log("Initialized");
})();
