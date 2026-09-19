import { describe, expect, test } from "bun:test";
import {
    clamp01,
    computeSpeedAtTime,
    easeInOutCubic,
    sampleSpeedCurve,
    type TimedInterval,
} from "./speed-curve";

const baseConfig = 1;

const wrap = (intervals: TimedInterval[]) =>
    intervals.map((i) => ({ ...i, speed: 1 }));

describe("clamp01", () => {
    test("clamps values into [0, 1]", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(0)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(1)).toBe(1);
        expect(clamp01(2)).toBe(1);
    });
});

describe("easeInOutCubic", () => {
    test("is anchored at the endpoints", () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
    });

    test("is symmetric around the midpoint", () => {
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
        expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75));
    });
});

describe("computeSpeedAtTime", () => {
    const intervals = [{ start: 0, end: 1 }];

    test("returns talking speed while a caption is on screen", () => {
        expect(computeSpeedAtTime(0.5, wrap(intervals), baseConfig)).toBe(1);
    });

    test("returns talking speed when there are no captions", () => {
        expect(computeSpeedAtTime(10, wrap([]), baseConfig)).toBe(1);
    });

    test("ramps up between talking and silent speed after speech ends", () => {
        const speed = computeSpeedAtTime(1.5, wrap(intervals), baseConfig);

        expect(speed).toBeGreaterThan(1);
        expect(speed).toBeLessThan(2);
    });

    test("reaches silent speed one full ramp after speech ends", () => {
        expect(computeSpeedAtTime(2, wrap(intervals), baseConfig)).toBe(2);
    });

    test("returns silent speed far from any caption", () => {
        expect(computeSpeedAtTime(5, wrap(intervals), baseConfig)).toBe(2);
    });

    test("reaches talking speed exactly when the next caption starts", () => {
        const twoIntervals = [
            { start: 0, end: 1 },
            { start: 3, end: 4 },
        ];

        expect(computeSpeedAtTime(3, wrap(twoIntervals), baseConfig)).toBe(1);
    });
});

describe("sampleSpeedCurve", () => {
    test("samples the curve every step, inclusive of the end", () => {
        const intervals = [{ start: 1, end: 2 }];

        const points = sampleSpeedCurve(wrap(intervals), baseConfig, 2, 0.5);

        expect(points.map((point) => point.time)).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    test("samples the correct speed at each point", () => {
        const intervals = [{ start: 1, end: 2 }];

        const points = sampleSpeedCurve(wrap(intervals), baseConfig, 2, 0.5);

        expect(points[0]?.speed).toBe(2);
        expect(points[2]?.speed).toBe(1);
    });
});
