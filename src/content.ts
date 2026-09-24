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
    PRESERVE_PITCH_ENABLED,
    RAMP_DURATION,
    REDACT_ENABLED,
    REDACT_VOLUME,
    SILENT_SPEED,
    SKIP_SEGMENTS_SPEED,
    SMART_SKIP_SPEED,
    TALKING_SPEED,
} from "./config";
import { SpeedController } from "./controllers/speed";
import { VolumeController } from "./controllers/volume";
import { getSkipSegments, type SkipSegment } from "./skip-segments/api";
import {
    cacheSmartSkips,
    getCachedSmartSkips,
    parseFromVideoData,
    type SmartSkipIntervals,
} from "./smart-skip";
import { type InferTrackNames, Track, Tracks } from "./speed/tracks";
import { formatTimeSavedRatio } from "./time-saved";
import type {
    AutoSpeedCaptionsEvent,
    AutoSpeedConfig,
    AutoSpeedConfigChangedEvent,
    AutoSpeedConfigSpeedKey,
    AutoSpeedVideoDataEvent,
    EasingFunction,
    TimedText,
} from "./types";
import { clamp } from "./utils/clamp";

(() => {
    const config: AutoSpeedConfig = {
        enabled: true,
        alwaysShowChart: ALWAYS_SHOW_CHART.defaultValue,
        rampDurationSeconds: RAMP_DURATION.defaultValue,
        talkingSpeed: TALKING_SPEED.defaultValue,
        boostSpeed: BOOST_SPEED.defaultValue,
        boostAt: 0,
        silentSpeed: SILENT_SPEED.defaultValue,
        filterSquareBrackets: FILTER_SQUARE_BRACKETS.defaultValue,
        filterParentheses: FILTER_PARENTHESES.defaultValue,
        smartSkipSpeed: SMART_SKIP_SPEED.defaultValue,
        skipSegmentsSpeed: SKIP_SEGMENTS_SPEED.defaultValue,
        easingFunction: {
            value: EASING_FUNCTION.defaultValue,
            fn: EASING_FUNCTION.defaultMappedValue,
        },
        redact: {
            enabled: REDACT_ENABLED.defaultValue,
            volume: REDACT_VOLUME.defaultValue,
        },
    };
    let video: HTMLVideoElement | null = null;
    const speedTracks = new Tracks([
        {
            name: "normal",
            track: new Track(
                "normal",
                {
                    label: "Normal",
                    value: TALKING_SPEED.defaultValue,
                },
                [Track.infinite],
            ),
        },
        {
            name: "boost",
            track: new Track(
                "boost",
                {
                    label: "Boost",
                    value: BOOST_SPEED.defaultValue,
                },
                [],
            ),
        },
        {
            name: "silent",
            track: new Track(
                "silent",
                {
                    label: "Silent",
                    value: SILENT_SPEED.defaultValue,
                },
                [],
            ),
        },
        {
            name: "smartSkip",
            track: new Track(
                "smartSkip",
                {
                    label: "Smart Skip",
                    value: SMART_SKIP_SPEED.defaultValue,
                },
                [],
            ),
        },
        {
            name: "skipSegments",
            track: new Track(
                "skipSegments",
                {
                    label: "Skip Segments",
                    value: SKIP_SEGMENTS_SPEED.defaultValue,
                },
                [],
            ),
        },
    ]);
    const volumeTracks = new Tracks([
        {
            name: "normal",
            track: new Track("normal", { label: "Normal", value: 1 }, [
                { start: -Infinity, end: Infinity },
            ]),
        },
        {
            name: "redact",
            track: new Track(
                "redact",
                { label: "Redact", value: REDACT_VOLUME.defaultValue },
                [],
            ),
        },
    ]);
    let captionVersion = 0;
    let currentVideoId: string | null = null;
    let x2speed: {
        overlay: HTMLElement;
        observer: MutationObserver;
    } | null = null;
    let volumePanel: {
        overlay: HTMLElement;
        observer: MutationObserver;
    } | null = null;

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    const onBoostStart = () => {
        config.boostAt = Date.now();
        speedTracks.get("boost").intervals = [Track.infinite];
        setBoostSpeed(config.boostSpeed);
    };
    const onBoostEnd = () => {
        config.boostAt = 0;
        speedTracks.get("boost").intervals = [];
        setBoostSpeed(config.boostSpeed);
    };

    const overlay = createChartOverlay(log, {
        onBoostStart,
        onBoostEnd,
    });

    const speed = new SpeedController({
        getVideo: () => video,
        getConfig: () => config,
        getIntervals: () => speedTracks.flatten().intervals,
        onApplied: (rate, interval) =>
            overlay.setSpeedBadgeText(
                `${interval?.data.label ?? ""}@${rate.toFixed(2)}x`,
            ),
    });

    const volume = new VolumeController({
        getVideo: () => video,
        getConfig: () => config,
        getIntervals: () => volumeTracks.flatten().intervals,
        onApplied: (volume, interval) =>
            overlay.setVolumeBadgeText(
                `${interval?.data.label ?? ""}@${(volume * 100).toFixed()}%`,
            ),
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
        overlay.setBadgeActive(
            config.enabled &&
                (speedTracks.get("silent").intervals.length > 0 ||
                    speedTracks.get("smartSkip").intervals.length > 0 ||
                    speedTracks.get("skipSegments").intervals.length > 0),
        );
    }

    function refreshPlayhead() {
        if (video) {
            overlay.refreshPlayhead(video.currentTime);
        }
    }

    function tick() {
        updateSpeed();
        volume.update();
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
        unlistenX2Speed();
        unlistenVolumeChange();

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
        listenX2Speed();
        listenVolumeChange();

        log("Video attached");
        video = newVideo;
        video.preservesPitch = PRESERVE_PITCH_ENABLED.value;
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

    function unlistenVolumeChange() {
        if (volumePanel === null) return;
        volumePanel.observer.disconnect();
        volumePanel = null;
    }

    /**
     * This is to respect the YouTube player's volume slider.
     */
    function listenVolumeChange() {
        const overlay = document.querySelector(".ytp-volume-panel");
        if (!(overlay instanceof HTMLElement)) {
            return;
        }
        const observer = new MutationObserver((mutationList) => {
            for (const mutation of mutationList) {
                if (mutation.type !== "attributes" || volumePanel === null) {
                    continue;
                }

                const value = volumePanel.overlay?.ariaValueNow;
                if (value === undefined) continue;

                let volume = Number(volumePanel.overlay?.ariaValueNow);
                if (!Number.isInteger(volume)) continue;
                volume = clamp(Math.round(volume) / 100, 0, 1);

                volumeTracks.get("normal").data.value = volume;
                volumeTracks.flatten(true);
            }
        });
        observer.observe(overlay, { attributeFilter: ["aria-valuenow"] });
        volumePanel = {
            overlay,
            observer,
        };
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
            listenX2Speed();
            initSkipSegments();
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
        volumeTracks.flatten(true);
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

    function applySkipSegments(data: SkipSegment[]) {
        speedTracks.get("skipSegments").intervals = data.map((seg) => {
            const [start, end] = seg.segment;
            return { start, end };
        });
        speedTracks.flatten(true);
        log(`Loaded ${data.length} skip segments intervals`, data);
        updateSpeed();
        updateChart();
        updateBadgeCaptionState();
    }

    function initSkipSegments() {
        if (currentVideoId)
            getSkipSegments(currentVideoId).then(applySkipSegments);
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
        speedTracks.get("silent").intervals = [];
        speedTracks.get("smartSkip").intervals = [];
        speedTracks.get("skipSegments").intervals = [];
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

        initSkipSegments();

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

    function setSpeed(
        label: string,
        configKey: AutoSpeedConfigSpeedKey,
        track: InferTrackNames<typeof speedTracks>,
        speed: number,
    ) {
        config[configKey] = speed;
        speedTracks.get(track).data.value = speed;
        speedTracks.flatten(true);
        updateSpeed();
        updateChart();
        log(`${label}: ${speed}x`);
    }

    function setTalkingSpeed(speed: number) {
        setSpeed("Talking speed", "talkingSpeed", "normal", speed);
    }

    function setBoostSpeed(speed: number) {
        setSpeed("Boost speed", "boostSpeed", "boost", speed);
    }

    function setSilentSpeed(speed: number) {
        setSpeed("Silent speed", "silentSpeed", "silent", speed);
    }

    function setSmartSkipSpeed(speed: number) {
        setSpeed("Smart skip speed", "smartSkipSpeed", "smartSkip", speed);
    }

    function setSkipSegmentsSpeed(speed: number) {
        setSpeed(
            "Skip segments speed",
            "skipSegmentsSpeed",
            "skipSegments",
            speed,
        );
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
    BOOST_SPEED.listen(setBoostSpeed);
    SILENT_SPEED.listen(setSilentSpeed);
    SMART_SKIP_SPEED.listen(setSmartSkipSpeed);
    SKIP_SEGMENTS_SPEED.listen(setSkipSegmentsSpeed);
    FILTER_SQUARE_BRACKETS.listen((v) =>
        setNonSpeechFilter(v, FILTER_PARENTHESES.value),
    );
    FILTER_PARENTHESES.listen((v) =>
        setNonSpeechFilter(FILTER_SQUARE_BRACKETS.value, v),
    );
    EASING_FUNCTION.listen(() =>
        setEasingFunction(EASING_FUNCTION.value, EASING_FUNCTION.mappedValue),
    );
    PRESERVE_PITCH_ENABLED.listen((value) => {
        if (video === null) return;
        video.preservesPitch = value;
    });
    REDACT_ENABLED.listen((enabled) => {
        config.redact.enabled = enabled;
        volumeTracks.get("redact").enabled = enabled;
        volumeTracks.flatten(true);
        volume.update();
    });
    REDACT_VOLUME.listen((value) => {
        config.redact.volume = value;
        volumeTracks.get("redact").data.value = value;
        volumeTracks.flatten(true);
        volume.update();
    });

    log("Initialized");
})();
