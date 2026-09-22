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
import { createPlayheadPlugin, type PlayheadState } from "./playhead-plugin";
import {
    type SpeedPoint,
    sampleSpeedCurve,
    type TimedIntervalWithSpeed,
} from "./speed-curve";
import {
    cumulativeTimeSaved,
    formatTimeSavedRatio,
    type TimeSavedPoint,
    timeSavedAt,
} from "./time-saved";
import type { AutoSpeedConfig } from "./types";
import { cssVar } from "./utils";

export type ChartData = {
    video: HTMLVideoElement | null;
    intervals: TimedIntervalWithSpeed[];
    captionVersion: number;
    config: AutoSpeedConfig;
};

export type ChartOverlay = {
    attach: (player: HTMLElement | null, enabled: boolean) => void;
    update: (data: ChartData) => void;
    refreshPlayhead: (time: number) => void;
    setBadgeText: (text: string) => void;
    setTimeSavedText: (text: string) => void;
    /**
     * Cumulative seconds saved (vs 1x) if the playhead is at `time`, from the
     * one-integration-pass cached speed curve.
     */
    getTimeSavedAt: (time: number) => number;
    /**
     * Total expected seconds saved for the whole video if it played through at
     * the speed curve.
     */
    getExpectedTimeSaved: () => number;
    /**
     * Reflect whether the current video actually has captions available.
     * Auto speed is active but has no data to drive it: the badge is dimmed
     * and the time-saved element is hidden.
     */
    setBadgeActive: (active: boolean) => void;
};

Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Filler,
);

const MAX_CHART_SAMPLES = 4000;
const CHART_PAD_TOP = 1.75;
const REM_PER_SPEED_UNIT = 0.5;

/**
 * Owns the badge + speed-curve chart overlay attached to YouTube's player.
 *
 * The player (`#movie_player`) is the element that goes fullscreen, so an
 * overlay appended to it stays pinned to the video in all display modes.
 */
export function createChartOverlay(
    log: (...args: unknown[]) => void,
    options: {
        onBoostStart: () => void;
        onBoostEnd: () => void;
    },
): ChartOverlay {
    let overlay: HTMLElement | null = null;
    let badge: HTMLElement | null = null;
    let timeSaved: HTMLElement | null = null;
    let badgeActive = true;
    let chart: Chart | null = null;
    let fillGradient: CanvasGradient | null = null;
    let fillGradientArea = { top: 0, bottom: 0 };

    const playhead: PlayheadState = {
        time: 0,
        duration: 0,
    };

    const playheadLinePlugin = createPlayheadPlugin(() => playhead);

    let lastPlayheadRender = 0;
    let overlayHovered = false;
    let cachedChartKey = "";
    let cachedChartPoints: SpeedPoint[] = [];
    let cachedTimeSaved: TimeSavedPoint[] = [];
    let lastData: ChartData | null = null;

    function createStatusBar(): HTMLElement {
        const statusEl = document.createElement("div");
        statusEl.className = "auto-speed-status";
        statusEl.setAttribute("data-auto-speed-status", "");

        timeSaved = document.createElement("div");
        timeSaved.className = "auto-speed-time-saved";
        timeSaved.setAttribute("data-auto-speed-time-saved", "");
        timeSaved.textContent = formatTimeSavedRatio(0, 0);

        badge = document.createElement("div");
        badge.className = "auto-speed-badge";
        badge.setAttribute("data-auto-speed-badge", "");
        badge.textContent = "1.00x";

        statusEl.appendChild(timeSaved);
        statusEl.appendChild(badge);
        return statusEl;
    }

    function createChart(canvas: HTMLCanvasElement): Chart {
        const chart = new Chart(canvas, {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        data: [],
                        borderColor: "rgba(255, 255, 255, 0.5)",
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
                                    cssVar(
                                        canvas,
                                        "--auto-speed-gradient-from",
                                    ),
                                );
                                fillGradient.addColorStop(
                                    1,
                                    cssVar(canvas, "--auto-speed-gradient-to"),
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
                layout: { padding: 0 },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
                scales: {
                    x: { display: false },
                    y: { display: false, min: 1, max: 2, reverse: true },
                },
            },
            plugins: [playheadLinePlugin],
        });

        return chart;
    }

    function attach(player: HTMLElement | null, enabled: boolean) {
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
            overlay.appendChild(createStatusBar());
            chart = createChart(canvas);
            overlay.addEventListener("mouseenter", () => {
                overlayHovered = true;
            });

            overlay.addEventListener("mouseleave", () => {
                overlayHovered = false;
            });

            overlay.addEventListener("mousedown", options.onBoostStart);
            overlay.addEventListener("mouseup", options.onBoostEnd);
            overlay.addEventListener("mouseleave", options.onBoostEnd);

            log("Chart created");
        }

        if (overlay.parentElement !== player) {
            overlay.remove();

            player.appendChild(overlay);
        }

        overlay.style.display = enabled ? "block" : "none";

        if (lastData) {
            update(lastData);
        }
    }

    function update(data: ChartData) {
        lastData = data;

        if (!chart || !data.video) {
            return;
        }

        const dataset = chart.data.datasets[0];

        if (!dataset) {
            return;
        }

        const duration = Number.isFinite(data.video.duration)
            ? data.video.duration
            : 0;

        playhead.duration = duration;
        playhead.time = data.video.currentTime;

        if (data.intervals.length === 0 || duration <= 0) {
            if (cachedChartKey === "") {
                return;
            }

            cachedChartKey = "";
            cachedChartPoints = [];
            cachedTimeSaved = [];
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
            data.captionVersion,
            duration.toFixed(3),
            data.config.talkingSpeed,
            data.config.boostSpeed,
            data.config.boostAt,
            data.config.silentSpeed,
            data.config.smartSkipSpeed,
            data.config.rampDurationSeconds,
            data.config.easingFunction.value,
        ].join("|");

        if (cacheKey !== cachedChartKey) {
            cachedChartPoints = sampleSpeedCurve(
                data.intervals,
                duration,
                duration / MAX_CHART_SAMPLES,
                {
                    fallbackSpeed: data.config.talkingSpeed,
                    rampDuration: data.config.rampDurationSeconds,
                    easingFn: data.config.easingFunction.fn,
                },
            );

            chart.data.labels = cachedChartPoints.map((point) =>
                point.time.toFixed(2),
            );

            dataset.data = cachedChartPoints.map((point) => point.speed);

            // The cumulative saved-time curve is a side-effect of the same
            // sampled speed curve, so it only needs this one integration pass
            // per (captions, duration, config) change. Live lookups are O(log n).
            cachedTimeSaved = cumulativeTimeSaved(cachedChartPoints);

            const yScale = chart.options.scales?.y as
                | { min?: number; max?: number }
                | undefined;

            if (yScale) {
                const speeds = [
                    data.config.talkingSpeed,
                    data.config.boostSpeed,
                    data.config.silentSpeed,
                    data.config.smartSkipSpeed,
                ];
                yScale.min = Math.min(...speeds);
                yScale.max = Math.max(...speeds);

                if (overlay) {
                    const diff = yScale.max - yScale.min;
                    overlay.style.height = `${(CHART_PAD_TOP + diff * REM_PER_SPEED_UNIT).toFixed(2)}rem`;
                }
            }

            cachedChartKey = cacheKey;
            chart.update("none");
            log(`Chart resampled with ${cachedChartPoints.length} samples`);
        }
    }

    function isChartVisible(): boolean {
        if (overlayHovered || lastData?.config.alwaysShowChart) {
            return true;
        }

        const player = overlay?.closest("#movie_player");
        return player ? !player.classList.contains("ytp-autohide") : false;
    }

    function refreshPlayhead(time: number) {
        if (!chart || !overlay || overlay.style.display === "none") {
            return;
        }

        if (!isChartVisible()) {
            return;
        }

        const now = performance.now();

        if (now - lastPlayheadRender < 100) {
            return;
        }

        lastPlayheadRender = now;
        playhead.time = time;
        chart.render();
    }

    function setBadgeText(text: string) {
        if (badge) {
            badge.textContent = text;
        }
    }

    function setTimeSavedText(text: string) {
        if (timeSaved) {
            timeSaved.textContent = text;
        }
    }

    function getTimeSavedAt(time: number): number {
        return timeSavedAt(cachedTimeSaved, time);
    }

    function getExpectedTimeSaved(): number {
        const data = lastData;

        if (!data?.video) {
            return 0;
        }

        return timeSavedAt(cachedTimeSaved, data.video.duration);
    }

    function setBadgeActive(active: boolean) {
        if (!badge || !timeSaved || active === badgeActive) {
            return;
        }

        badgeActive = active;
        badge.classList.toggle("auto-speed-badge--inactive", !active);
        timeSaved.classList.toggle("auto-speed-time-saved--hidden", !active);
    }

    return {
        attach,
        update,
        refreshPlayhead,
        setBadgeText,
        setTimeSavedText,
        getTimeSavedAt,
        getExpectedTimeSaved,
        setBadgeActive,
    };
}
