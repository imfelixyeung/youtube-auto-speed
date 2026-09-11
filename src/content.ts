import {
    CategoryScale,
    Chart,
    Filler,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    type ScriptableContext,
} from "chart.js";
import {
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
import "./content.css";
import { createPlayheadPlugin } from "./playheadPlugin";
import {
    computeSpeedAtTime,
    easeInOutCubic,
    type SpeedPoint,
    sampleSpeedCurve,
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
    talkingSpeed: number;
    silentSpeed: number;
};

(() => {
    const config: AutoSpeedConfig = {
        enabled: true,
        rampDurationSeconds: DEFAULT_RAMP_DURATION,
        talkingSpeed: DEFAULT_TALKING_SPEED,
        silentSpeed: DEFAULT_SILENT_SPEED,
    };

    let video: HTMLVideoElement | null = null;

    let captionIntervals: TimedInterval[] = [];

    let captionVersion = 0;

    let badge: HTMLElement | null = null;

    let overlay: HTMLElement | null = null;

    let chart: Chart | null = null;

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    function findVideo() {
        return document.querySelector(
            "video.html5-main-video, video",
        ) as HTMLVideoElement;
    }

    function roundToNearest05(value: number) {
        return Math.round(value / 0.05) * 0.05;
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

    Chart.register(
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Filler,
    );

    const MAX_CHART_SAMPLES = 4000;

    let fillGradient: CanvasGradient | null = null;

    let fillGradientArea = { top: 0, bottom: 0 };

    const playhead = {
        time: 0,
        duration: 0,
    };

    let lastPlayheadRender = 0;

    let overlayHovered = false;

    let ticking = false;

    let cachedChartKey = "";

    let cachedChartPoints: SpeedPoint[] = [];

    const playheadLinePlugin = createPlayheadPlugin(() => playhead);

    function createBadge(): HTMLElement {
        const badgeEl = document.createElement("div");

        badgeEl.className = "auto-speed-badge";

        badgeEl.setAttribute("data-auto-speed-badge", "");

        badgeEl.textContent = "1.00x";

        return badgeEl;
    }

    function createChart(canvas: HTMLCanvasElement): Chart {
        const chart = new Chart(canvas, {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        data: [],
                        borderColor: "rgba(255, 255, 255, 0.9)",
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: true,
                        backgroundColor: (ctx: ScriptableContext<"line">) => {
                            const { chart } = ctx;

                            const area = chart.chartArea;

                            if (!area) {
                                return "transparent";
                            }

                            // Reuse the gradient across renders; recreate it
                            // only when the chart area actually resized.
                            if (
                                !fillGradient ||
                                fillGradientArea.top !== area.top ||
                                fillGradientArea.bottom !== area.bottom
                            ) {
                                fillGradient = chart.ctx.createLinearGradient(
                                    0,
                                    area.top,
                                    0,
                                    area.bottom,
                                );

                                fillGradient.addColorStop(
                                    0,
                                    "rgba(0, 0, 0, 0.5)",
                                );

                                fillGradient.addColorStop(
                                    1,
                                    "rgba(0, 0, 0, 0.25)",
                                );

                                fillGradientArea = {
                                    top: area.top,
                                    bottom: area.bottom,
                                };
                            }

                            return fillGradient;
                        },
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                events: [],
                layout: {
                    padding: 0,
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        enabled: false,
                    },
                },
                scales: {
                    x: {
                        display: false,
                    },
                    y: {
                        display: false,
                        min: 1,
                        max: 2,
                        reverse: true,
                    },
                },
            },
            plugins: [playheadLinePlugin],
        });

        return chart;
    }

    /**
     * Attach a badge + chart overlay to YouTube's player container.
     *
     * The player (`#movie_player`) is the element that goes fullscreen, so an
     * overlay appended to it stays pinned to the video in all display modes.
     */
    function attachOverlay() {
        const player = document.querySelector<HTMLElement>("#movie_player");

        if (!player) {
            return;
        }

        if (!overlay) {
            const canvas = document.createElement("canvas");

            canvas.className = "auto-speed-chart";

            canvas.setAttribute("data-auto-speed-chart", "");

            overlay = document.createElement("div");

            overlay.className = "auto-speed-overlay";

            overlay.setAttribute("data-auto-speed-overlay", "");

            overlay.appendChild(canvas);

            badge = createBadge();

            overlay.appendChild(badge);

            chart = createChart(canvas);

            overlay.addEventListener("mouseenter", () => {
                overlayHovered = true;
            });

            overlay.addEventListener("mouseleave", () => {
                overlayHovered = false;
            });

            log("Chart created");
        }

        if (overlay.parentElement !== player) {
            overlay.remove();

            player.appendChild(overlay);
        }

        overlay.style.display = config.enabled ? "block" : "none";

        updateChart();
    }

    function updateChart() {
        if (!chart || !video) {
            return;
        }

        const dataset = chart.data.datasets[0];

        if (!dataset) {
            return;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : 0;

        playhead.duration = duration;
        playhead.time = video.currentTime;

        if (captionIntervals.length === 0 || duration <= 0) {
            if (cachedChartKey === "") {
                return;
            }

            cachedChartKey = "";

            cachedChartPoints = [];

            chart.data.labels = [];

            dataset.data = [];

            chart.update("none");

            return;
        }

        // Only resample and rerender when captions, duration, or speed config
        // actually change. Otherwise the point data is identical, and calling
        // `chart.update` again would redundantly re-render on every player DOM
        // mutation that reaches `checkForVideo`.
        const cacheKey = [
            captionVersion,
            duration.toFixed(3),
            config.talkingSpeed,
            config.silentSpeed,
            config.rampDurationSeconds,
        ].join("|");

        if (cacheKey !== cachedChartKey) {
            cachedChartPoints = sampleSpeedCurve(
                captionIntervals,
                {
                    talkingSpeed: config.talkingSpeed,
                    silentSpeed: config.silentSpeed,
                    rampDurationSeconds: config.rampDurationSeconds,
                    easing: easeInOutCubic,
                },
                duration,
                duration / MAX_CHART_SAMPLES,
            );

            chart.data.labels = cachedChartPoints.map((point) =>
                point.time.toFixed(2),
            );

            dataset.data = cachedChartPoints.map((point) => point.speed);

            const yScale = chart.options.scales?.y as
                | { min?: number; max?: number }
                | undefined;

            if (yScale) {
                yScale.min = config.talkingSpeed;

                yScale.max = config.silentSpeed;
            }

            cachedChartKey = cacheKey;

            chart.update("none");

            log(`Chart resampled with ${cachedChartPoints.length} samples`);
        }
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
            const hasText = event.segs.some((seg) => seg.utf8?.trim());

            if (!hasText) {
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

        captionVersion++;

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
                talkingSpeed: config.talkingSpeed,
                silentSpeed: config.silentSpeed,
                rampDurationSeconds: config.rampDurationSeconds,
                easing: easeInOutCubic,
            },
        );

        setSpeed(desired);
    }

    function refreshPlayhead() {
        if (!chart || !overlay || overlay.style.display === "none") {
            return;
        }

        if (!overlayHovered) {
            return;
        }

        const now = performance.now();

        if (now - lastPlayheadRender < 100) {
            return;
        }

        if (!video) {
            return;
        }

        lastPlayheadRender = now;
        playhead.time = video.currentTime;
        chart.render();
    }

    function tick() {
        updateSpeed();
        refreshPlayhead();

        if (video && !video.paused && !video.ended && config.enabled) {
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
        setSpeed(1);
    }

    function handleEnded() {
        setSpeed(1);
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

        setSpeed(1);

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
            setSpeed(1);
        }

        attachOverlay();

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

    function setTalkingSpeed(speed: number) {
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
        const data = (event as AutoSpeedCaptionsEvent).detail?.data;

        if (!data || !config.enabled) {
            return;
        }

        processCaptionData(data);

        // Immediately recalculate because a new caption track
        // probably means a new video or language.
        updateSpeed();

        updateChart();
    });

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

    window.addEventListener("yt-navigate-finish", () => {
        observePrimaryTarget();
        checkForVideo();
    });

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
