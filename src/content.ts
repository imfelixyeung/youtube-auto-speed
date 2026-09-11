import {
    CategoryScale,
    Chart,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
} from "chart.js";
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
};

(() => {
    const config: AutoSpeedConfig = {
        enabled: true,
        rampDurationSeconds: DEFAULT_RAMP_DURATION,
    };

    let video: HTMLVideoElement | null = null;

    let captionIntervals: TimedInterval[] = [];

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

    Chart.register(
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
    );

    const SPEED_CURVE_STYLE_ID = "auto-speed-overlay-styles";

    const MAX_CHART_SAMPLES = 4000;

    function ensureOverlayStyles() {
        if (document.getElementById(SPEED_CURVE_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");

        style.id = SPEED_CURVE_STYLE_ID;

        style.textContent = `
            #movie_player {
                .auto-speed-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 8rem;
                    z-index: 2147483647;
                    pointer-events: none;
                }

                .auto-speed-badge {
                    position: absolute;
                    top: 0.5rem;
                    right: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 16rem;
                    background: rgba(0, 0, 0, 0.7);
                    color: #fff;
                    font-family: "Roboto", "Arial", sans-serif;
                    font-size: 1rem;
                    font-weight: 500;
                    line-height: normal;
                    pointer-events: auto;
                    user-select: none;
                }

                .auto-speed-chart {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    transition: opacity 0.15s ease;
                }

                .auto-speed-overlay:hover {
                    .auto-speed-chart {
                        opacity: 1;
                    }
                }
            }
        `;

        document.head.appendChild(style);
    }

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
                        borderWidth: 2,
                        pointRadius: 0,
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
                        suggestedMin: 0,
                        suggestedMax: 2.5,
                    },
                },
            },
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

        ensureOverlayStyles();

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

        if (captionIntervals.length === 0 || duration <= 0) {
            chart.data.labels = [];

            dataset.data = [];

            chart.update("none");

            return;
        }

        const points = sampleSpeedCurve(
            captionIntervals,
            {
                talkingSpeed: 1,
                silentSpeed: 2,
                rampDurationSeconds: config.rampDurationSeconds,
                easing: easeInOutCubic,
            },
            duration,
            duration / MAX_CHART_SAMPLES,
        );

        chart.data.labels = points.map((point) => point.time.toFixed(2));

        dataset.data = points.map((point) => point.speed);

        chart.update("none");

        log(`Chart updated with ${points.length} samples`);
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
