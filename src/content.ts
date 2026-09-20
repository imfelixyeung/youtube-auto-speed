import "./content.css";
import {
    cacheTimedText,
    captionsToRedactedIntervals,
    captionsToSilentIntervals,
    getCachedTimedText,
} from "./captions";
import { createChartOverlay } from "./chart-overlay";
import {
    ALWAYS_SHOW_CHART,
    BOOST_SPEED,
    EASING_FUNCTION,
    ENABLED,
    FILTER_PARENTHESES,
    FILTER_SQUARE_BRACKETS,
    RAMP_DURATION,
    SILENT_SPEED,
    SMART_SKIP_SPEED,
    TALKING_SPEED,
} from "./config";
import { createSpeedControl } from "./controllers/speed";
import {
    cacheSmartSkips,
    getCachedSmartSkips,
    parseFromVideoData,
    type SmartSkipIntervals,
} from "./smart-skip";
import { Track, Tracks } from "./speed/tracks";
import { formatTimeSavedRatio } from "./time-saved";
import type {
    AutoSpeedCaptionsEvent,
    AutoSpeedConfig,
    AutoSpeedConfigChangedEvent,
    AutoSpeedVideoDataEvent,
    EasingFunction,
    TimedText,
} from "./types";

(() => {
    const config: AutoSpeedConfig & {
        talkingSpeedConfig: number;
        talkingSpeedBoost: number;
    } = {
        enabled: true,
        alwaysShowChart: ALWAYS_SHOW_CHART.defaultValue,
        rampDurationSeconds: RAMP_DURATION.defaultValue,
        talkingSpeed: TALKING_SPEED.defaultValue,
        talkingSpeedConfig: TALKING_SPEED.defaultValue,
        talkingSpeedBoost: BOOST_SPEED,
        silentSpeed: SILENT_SPEED.defaultValue,
        filterSquareBrackets: FILTER_SQUARE_BRACKETS.defaultValue,
        filterParentheses: FILTER_PARENTHESES.defaultValue,
        smartSkipSpeed: SMART_SKIP_SPEED.defaultValue,
        easingFunction: {
            value: EASING_FUNCTION.defaultValue,
            fn: EASING_FUNCTION.defaultMappedValue,
        },
    };
    let video: HTMLVideoElement | null = null;
    const speedTracks = new Tracks([
        {
            name: "normal",
            track: new Track("normal", TALKING_SPEED.defaultValue, []),
        },
        {
            name: "silent",
            track: new Track("silent", SILENT_SPEED.defaultValue, []),
        },
        {
            name: "smartSkip",
            track: new Track("smartSkip", SMART_SKIP_SPEED.defaultValue, []),
        },
    ]);
    const volumeTracks = new Tracks([
        {
            name: "normal",
            track: new Track("normal", 1, [
                { start: -Infinity, end: Infinity },
            ]),
        },
        {
            name: "redact",
            track: new Track("redact", 0, []),
        },
    ]);
    let captionVersion = 0;
    let currentVideoId: string | null = null;
    let x2speed: {
        overlay: HTMLElement;
        observer: MutationObserver;
    } | null = null;

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    const onBoostStart = () => {
        log(`Boosting speed to ${config.talkingSpeedBoost}x`);
        setTalkingSpeed(config.talkingSpeedBoost, true);
    };
    const onBoostEnd = () => {
        log(`Un-boosting speed to ${config.talkingSpeedConfig}x`);
        setTalkingSpeed(config.talkingSpeedConfig);
    };

    const overlay = createChartOverlay(log, {
        onBoostStart,
        onBoostEnd,
    });

    const speed = createSpeedControl({
        getVideo: () => video,
        getConfig: () => config,
        getIntervals: () => speedTracks.flatten().intervals,
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
        applyAlwaysShowChart();
        updateBadgeCaptionState();
    }

    /**
     * Mirror the "always show chart" setting onto `#movie_player` so the
     * overlay CSS can force the chart visible regardless of player state.
     */
    function applyAlwaysShowChart() {
        const player = document.querySelector<HTMLElement>("#movie_player");

        if (player) {
            player.classList.toggle(
                "auto-speed-always-chart",
                config.alwaysShowChart,
            );
        }
    }

    function updateChart() {
        overlay.update({
            video,
            intervals: speedTracks.flatten().intervals,
            captionVersion,
            config,
        });
    }

    function updateBadgeCaptionState() {
        // Gray out the badge when the extension is active but the current
        // video has no captions to drive the auto speed.
        overlay.setBadgeActive(
            config.enabled && speedTracks.get("silent").intervals.length > 0,
        );
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

    function handleDurationChange() {
        if (!video) {
            return;
        }
        speedTracks.get("normal").intervals = [
            { start: 0, end: video.duration },
        ];
        updateChart();
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
        video.removeEventListener("durationchange", handleDurationChange);

        video = null;
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        detachVideo();
        unlistenX2Speed();

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
        video.addEventListener("durationchange", handleDurationChange);
        handleDurationChange();
    }

    function unlistenX2Speed() {
        if (x2speed === null) {
            return;
        }
        x2speed.observer.disconnect();
        x2speed = null;
    }

    /**
     * This is to respect YouTube's hold to x2 speed feature.
     */
    function listenX2Speed() {
        const overlay = document.querySelector(
            ".ytp-overlay.ytp-speedmaster-overlay",
        );
        if (overlay === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const observer = new MutationObserver((mutationList) => {
            for (const mutation of mutationList) {
                if (mutation.type !== "attributes" || x2speed === null) {
                    continue;
                }

                if (x2speed.overlay.style.display === "none") {
                    onBoostEnd();
                } else {
                    onBoostStart();
                }
            }
        });
        observer.observe(overlay, { attributeFilter: ["style"] });
        x2speed = {
            overlay,
            observer,
        };
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
            listenX2Speed();
        }

        attachOverlay();
    }

    function applyCaptions(data: TimedText, source: "cache" | "network") {
        speedTracks.get("silent").intervals = captionsToSilentIntervals(
            data,
            video?.duration ?? 0,
            {
                filterSquareBrackets: config.filterSquareBrackets,
                filterParentheses: config.filterParentheses,
            },
        );
        volumeTracks.get("redact").intervals =
            captionsToRedactedIntervals(data);
        speedTracks.flatten(true);
        captionVersion++;
        log(
            `Loaded ${speedTracks.get("silent").intervals.length} caption intervals (${source})`,
        );
        log(speedTracks.get("silent").intervals.slice(0, 10));

        // Immediately recalculate because new captions probably mean a new
        // video or language.
        updateSpeed();
        updateChart();
        updateBadgeCaptionState();
    }

    function applySmartSkips(data: SmartSkipIntervals) {
        speedTracks.get("smartSkip").intervals = data;
        speedTracks.flatten(true);
        log(`Loaded ${data.length} smart skip intervals`, data);
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
        speedTracks.get("smartSkip").intervals = [];
        speedTracks.flatten(true);

        const smartSkips = getCachedSmartSkips(currentVideoId ?? "");
        if (smartSkips) {
            applySmartSkips(smartSkips);
        }

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

    function setAlwaysShowChart(value: boolean) {
        if (value === config.alwaysShowChart) {
            return;
        }

        config.alwaysShowChart = value;
        applyAlwaysShowChart();
        log(`Always show chart ${config.alwaysShowChart ? "on" : "off"}`);
    }

    function setRampDuration(seconds: number) {
        if (seconds === config.rampDurationSeconds) {
            return;
        }

        config.rampDurationSeconds = seconds;
        updateSpeed();
        updateChart();
        log(`Ramp duration: ${seconds}s`);
    }

    function setTalkingSpeed(speed: number, isBoost = false) {
        config.talkingSpeed = speed;
        if (!isBoost) {
            config.talkingSpeedConfig = speed;
        }
        speedTracks.get("normal").speed = speed;
        speedTracks.flatten(true);
        updateSpeed();
        updateChart();
        log(`Talking speed: ${speed}x`);
    }

    function setSilentSpeed(speed: number) {
        config.silentSpeed = speed;
        speedTracks.get("silent").speed = speed;
        speedTracks.flatten(true);
        updateSpeed();
        updateChart();
        log(`Silent speed: ${speed}x`);
    }

    function setSmartSkipSpeed(speed: number) {
        config.smartSkipSpeed = speed;
        speedTracks.get("smartSkip").speed = speed;
        speedTracks.flatten(true);
        updateSpeed();
        updateChart();
        log(`Smart skip speed: ${speed}x`);
    }

    function setEasingFunction(value: string, fn: EasingFunction) {
        config.easingFunction = { value, fn };
        updateSpeed();
        updateChart();
        log("Easing function updated");
    }

    function setNonSpeechFilter(
        filterSquareBrackets: boolean,
        filterParentheses: boolean,
    ) {
        if (
            filterSquareBrackets === config.filterSquareBrackets &&
            filterParentheses === config.filterParentheses
        ) {
            return;
        }

        config.filterSquareBrackets = filterSquareBrackets;
        config.filterParentheses = filterParentheses;

        // Re-process the cached raw timedtext so current intervals reflect
        // the new filters immediately.
        const cached = getCachedTimedText(currentVideoId ?? "");

        if (cached) {
            applyCaptions(cached, "cache");
        }

        log(
            `Non-speech filter: [${filterSquareBrackets ? "on" : "off"}], (${filterParentheses ? "on" : "off"})`,
        );
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

    window.addEventListener("AUTO_SPEED_GET_WATCH", (event) => {
        const { videoId, data } = (event as AutoSpeedVideoDataEvent).detail;
        if (getCachedSmartSkips(videoId)) return;
        const smartSkips = parseFromVideoData(data);
        cacheSmartSkips(videoId, smartSkips);
        if (videoId !== currentVideoId) {
            return;
        }
        applySmartSkips(smartSkips);
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

    ENABLED.listen(setEnabled);
    ALWAYS_SHOW_CHART.listen(setAlwaysShowChart);
    RAMP_DURATION.listen(setRampDuration);
    TALKING_SPEED.listen(setTalkingSpeed);
    SILENT_SPEED.listen(setSilentSpeed);
    SMART_SKIP_SPEED.listen(setSmartSkipSpeed);
    FILTER_SQUARE_BRACKETS.listen((v) =>
        setNonSpeechFilter(v, FILTER_PARENTHESES.value),
    );
    FILTER_PARENTHESES.listen((v) =>
        setNonSpeechFilter(FILTER_SQUARE_BRACKETS.value, v),
    );
    EASING_FUNCTION.listen(() =>
        setEasingFunction(EASING_FUNCTION.value, EASING_FUNCTION.mappedValue),
    );

    log("Initialized");
})();
