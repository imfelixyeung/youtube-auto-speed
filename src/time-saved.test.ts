import { describe, expect, test } from "bun:test";
import {
    cumulativeTimeSaved,
    formatTimeSaved,
    formatTimeSavedRatio,
    type TimeSavedPoint,
    timeSavedAt,
    timeSavedForElapsed,
} from "./time-saved";

describe("timeSavedForElapsed", () => {
    test("saves nothing at 1x", () => {
        expect(timeSavedForElapsed(60, 1)).toBe(0);
    });

    test("saves half the elapsed media time at 2x", () => {
        expect(timeSavedForElapsed(60, 2)).toBe(30);
    });

    test("scales with elapsed media time", () => {
        expect(timeSavedForElapsed(120, 2)).toBe(60);
    });

    test("saves three quarters of the time at 4x", () => {
        expect(timeSavedForElapsed(40, 4)).toBe(30);
    });

    test("is negative below 1x", () => {
        expect(timeSavedForElapsed(60, 0.5)).toBe(-60);
    });

    test("returns zero for a non-positive playback rate", () => {
        expect(timeSavedForElapsed(60, 0)).toBe(0);
        expect(timeSavedForElapsed(60, -1)).toBe(0);
    });
});

describe("cumulativeTimeSaved", () => {
    test("returns an empty curve for empty input", () => {
        expect(cumulativeTimeSaved([])).toEqual([]);
    });

    test("saves nothing when the whole curve runs at 1x", () => {
        const curve = cumulativeTimeSaved(sharedValuePoints(0, 60, 10, 1));

        expect(curve.at(-1)?.saved).toBe(0);
    });

    test("integrates a constant 2x curve to half the duration", () => {
        const curve = cumulativeTimeSaved(sharedValuePoints(0, 60, 10, 2));

        expect(curve).toEqual([
            { time: 0, saved: 0 },
            { time: 10, saved: 5 },
            { time: 20, saved: 10 },
            { time: 30, saved: 15 },
            { time: 40, saved: 20 },
            { time: 50, saved: 25 },
            { time: 60, saved: 30 },
        ]);
    });

    test("accumulates savings across different value segments", () => {
        const curve = cumulativeTimeSaved(
            sharedValuePoints(0, 60, 10, 2).concat(
                sharedValuePoints(60, 90, 10, 4),
            ),
        );

        expect(curve.at(-1)?.saved).toBeCloseTo(52.5);
    });

    test("yields a non-decreasing curve for values above 1x", () => {
        const curve = cumulativeTimeSaved(rampValuePoints(0, 60, 10, 1, 2));

        for (let i = 1; i < curve.length; i++) {
            expect(curve[i]?.saved).toBeGreaterThanOrEqual(
                curve[i - 1]?.saved ?? 0,
            );
        }
    });
});

describe("timeSavedAt", () => {
    const curve: TimeSavedPoint[] = [
        { time: 0, saved: 0 },
        { time: 10, saved: 5 },
        { time: 20, saved: 10 },
    ];

    test("returns zero for an empty or missing curve", () => {
        expect(timeSavedAt([], 10)).toBe(0);
    });

    test("clamps below the first sample", () => {
        expect(timeSavedAt(curve, -5)).toBe(0);
    });

    test("clamps beyond the last sample", () => {
        expect(timeSavedAt(curve, 999)).toBe(10);
    });

    test("returns exact values at sampled points", () => {
        expect(timeSavedAt(curve, 0)).toBe(0);
        expect(timeSavedAt(curve, 10)).toBe(5);
        expect(timeSavedAt(curve, 20)).toBe(10);
    });

    test("interpolates between samples", () => {
        expect(timeSavedAt(curve, 5)).toBe(2.5);
        expect(timeSavedAt(curve, 15)).toBe(7.5);
    });
});

describe("formatTimeSavedRatio", () => {
    test("shows cumulative and total side by side", () => {
        expect(formatTimeSavedRatio(135, 324)).toBe("2m 15s / 5m 24s");
    });

    test("formats both sides independently", () => {
        expect(formatTimeSavedRatio(42, 3600)).toBe("42s / 1h");
    });

    test("clamps each side separately at zero", () => {
        expect(formatTimeSavedRatio(-5, 0)).toBe("0s / 0s");
    });
});

describe("formatTimeSaved", () => {
    test("renders sub-minute savings in seconds", () => {
        expect(formatTimeSaved(42)).toBe("42s");
    });

    test("clamps negative savings to zero", () => {
        expect(formatTimeSaved(-10)).toBe("0s");
        expect(formatTimeSaved(0)).toBe("0s");
    });

    test("renders an exact minute without seconds", () => {
        expect(formatTimeSaved(60)).toBe("1m");
    });

    test("renders minutes and seconds", () => {
        expect(formatTimeSaved(90)).toBe("1m 30s");
    });

    test("renders an exact hour without minutes", () => {
        expect(formatTimeSaved(3600)).toBe("1h");
    });

    test("renders hours and minutes", () => {
        expect(formatTimeSaved(5400)).toBe("1h 30m");
    });

    test("rounds fractional seconds", () => {
        expect(formatTimeSaved(42.6)).toBe("43s");
    });
});

function sharedValuePoints(
    start: number,
    end: number,
    step: number,
    value: number,
) {
    const points: { time: number; value: number }[] = [];

    for (let time = start; time <= end; time += step) {
        points.push({ time, value });
    }

    return points;
}

/** Linearly ramp from `fromValue` to `toValue` across `start`..`end`. */
function rampValuePoints(
    start: number,
    end: number,
    step: number,
    fromValue: number,
    toValue: number,
) {
    const points: { time: number; value: number }[] = [];

    for (let time = start; time <= end + 1e-9; time += step) {
        const progress = (time - start) / (end - start);

        points.push({
            time,
            value: fromValue + progress * (toValue - fromValue),
        });
    }

    return points;
}
