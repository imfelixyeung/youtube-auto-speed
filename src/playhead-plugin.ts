import type { Plugin } from "chart.js";

export type PlayheadState = {
    time: number;
    duration: number;
};

/**
 * Plugin that draws a red vertical line at the current video time.
 */
export function createPlayheadPlugin(getState: () => PlayheadState): Plugin {
    return {
        id: "auto-speed-playhead",
        afterDraw(chart) {
            const area = chart.chartArea;
            const { time, duration } = getState();
            if (!area || !Number.isFinite(time) || duration <= 0) {
                return;
            }
            const clamped = Math.min(Math.max(time, 0), duration);
            const x =
                area.left + (clamped / duration) * (area.right - area.left);
            const ctx = chart.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, area.top);
            ctx.lineTo(x, area.bottom);
            ctx.strokeStyle = "oklch(57.7% 0.245 27.325)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        },
    };
}
