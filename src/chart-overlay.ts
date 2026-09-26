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
    sampleCurve,
    type TimedIntervalWithNumberData,
    type ValuePoint,
} from "./curve";
import { createPlayheadPlugin, type PlayheadState } from "./playhead-plugin";
import {
    cumulativeTimeSaved,
    formatTimeSavedRatio,
    type TimeSavedPoint,
    timeSavedAt,
} from "./time-saved";
import { type AutoSpeedConfig, autoSpeedConfigSpeedKeys } from "./types";
import { cssVar } from "./utils";
import { Warpspeed } from "./warpspeed";

export type ChartData = {
    video: HTMLVideoElement | null;
    intervals: TimedIntervalWithNumberData[];
    captionVersion: number;
    config: AutoSpeedConfig;
};

export type ChartOverlay = {
    attach: (player: HTMLElement | null, enabled: boolean) => void;
    update: (data: ChartData) => void;
    tick: () => void;
    setSpeed: (speed: number) => void;
    refreshPlayhead: (time: number) => void;
    setSpeedBadgeText: (text: string) => void;
    setVolumeBadgeText: (text: string) => void;
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
    let volumeBadge: HTMLElement | null = null;
    let speedBadge: HTMLElement | null = null;
    let timeSaved: HTMLElement | null = null;
    let badgeActive = true;
    let chart: Chart | null = null;
    let warpspeed: Warpspeed | null = null;
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
    let cachedChartPoints: ValuePoint[] = [];
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

        volumeBadge = document.createElement("div");
        volumeBadge.className = "auto-volume-badge";
        volumeBadge.setAttribute("data-auto-volume-badge", "");
        volumeBadge.textContent = "100%";

        speedBadge = document.createElement("div");
        speedBadge.className = "auto-speed-badge";
        speedBadge.setAttribute("data-auto-speed-badge", "");
        speedBadge.textContent = "1.00x";

        statusEl.appendChild(timeSaved);
        statusEl.appendChild(volumeBadge);
        statusEl.appendChild(speedBadge);
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

            const warpspeedCanvas = document.createElement("canvas");
            warpspeedCanvas.className = "auto-speed-warp";
            warpspeedCanvas.setAttribute("data-auto-speed-warp", "");
            player.appendChild(warpspeedCanvas);
            warpspeed = Warpspeed.instance(warpspeedCanvas);

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

        const speeds = autoSpeedConfigSpeedKeys.map((k) => data.config[k]);
        // Only resample and rerender when captions, duration, or speed config
        // actually change. Otherwise the point data is identical, and calling
        // `chart.update` again would redundantly re-render on every player DOM
        // mutation that reaches `checkForVideo`.
        const cacheKey = [
            data.captionVersion,
            duration.toFixed(3),
            data.config.boostAt,
            data.config.rampDurationSeconds,
            data.config.easingFunction.value,
            ...speeds,
        ].join("|");

        if (cacheKey !== cachedChartKey) {
            cachedChartPoints = sampleCurve(
                data.intervals,
                duration,
                duration / MAX_CHART_SAMPLES,
                {
                    fallback: data.config.talkingSpeed,
                    rampDuration: data.config.rampDurationSeconds,
                    easingFn: data.config.easingFunction.fn,
                },
            );

            chart.data.labels = cachedChartPoints.map((point) =>
                point.time.toFixed(2),
            );

            dataset.data = cachedChartPoints.map((point) => point.value);

            // The cumulative saved-time curve is a side-effect of the same
            // sampled speed curve, so it only needs this one integration pass
            // per (captions, duration, config) change. Live lookups are O(log n).
            cachedTimeSaved = cumulativeTimeSaved(cachedChartPoints);

            const yScale = chart.options.scales?.y as
                | { min?: number; max?: number }
                | undefined;

            if (yScale) {
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

    function setSpeedBadgeText(text: string) {
        if (speedBadge) {
            speedBadge.textContent = text;
        }
    }

    function setVolumeBadgeText(text: string) {
        if (volumeBadge) {
            volumeBadge.textContent = text;
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
        if (!speedBadge || !timeSaved || active === badgeActive) {
            return;
        }

        badgeActive = active;
        speedBadge.classList.toggle("auto-speed-badge--inactive", !active);
        timeSaved.classList.toggle("auto-speed-time-saved--hidden", !active);
    }

    function setSpeed(speed: number) {
        warpspeed?.setSpeed(speed);
    }

    function tick() {
        warpspeed?.tick();
        warpspeed?.draw();
    }

    return {
        attach,
        update,
        tick,
        setSpeed,
        refreshPlayhead,
        setSpeedBadgeText,
        setVolumeBadgeText,
        setTimeSavedText,
        getTimeSavedAt,
        getExpectedTimeSaved,
        setBadgeActive,
    };
}
