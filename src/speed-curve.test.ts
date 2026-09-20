import { describe, expect, test } from "bun:test";
import { easeCubicInOut } from "d3-ease";
import { clamp01, computeSpeedAtTime, sampleSpeedCurve } from "./speed-curve";

const fallback = 1;
const baseConfig = {
    fallbackSpeed: fallback,
    rampDuration: 1,
    easingFn: easeCubicInOut,
};

describe("clamp01", () => {
    test("clamps values into [0, 1]", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(0)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(1)).toBe(1);
        expect(clamp01(2)).toBe(1);
    });
});

describe("computeSpeedAtTime", () => {
    const first = { start: 0, end: 1, speed: 1 };
    const second = { start: 1, end: 2, speed: 2 };
    const intervals = [first, second];

    test("returns first speed while a within interval", () => {
        expect(computeSpeedAtTime(0.5, intervals, baseConfig)).toBe(
            first.speed,
        );
    });

    test("returns fallback speed when there are no intervals", () => {
        expect(computeSpeedAtTime(10, [], baseConfig)).toBe(fallback);
    });

    test("ramps up between first and second speed after speech ends", () => {
        const speed = computeSpeedAtTime(1.5, intervals, baseConfig);

        expect(speed).toBeGreaterThan(first.speed);
        expect(speed).toBeLessThan(second.speed);
    });

    test("reaches fallback speed one full ramp after speech ends", () => {
        expect(computeSpeedAtTime(3, intervals, baseConfig)).toBe(fallback);
    });

    test("returns fallback speed far from any intervals", () => {
        expect(computeSpeedAtTime(5, intervals, baseConfig)).toBe(fallback);
    });

    test("reaches defined speed exactly when the next caption starts", () => {
        expect(computeSpeedAtTime(2, intervals, baseConfig)).toBe(second.speed);
    });
});

describe("sampleSpeedCurve", () => {
    test("samples the curve every step, inclusive of the end", () => {
        const intervals = [{ start: 1, end: 2, speed: 1 }];

        const points = sampleSpeedCurve(intervals, 2, 0.5, baseConfig);

        expect(points.map((point) => point.time)).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    test("samples the correct speed at each point", () => {
        const intervals = [
            { start: 1, end: 2, speed: 1 },
            { start: 2, end: 3, speed: 2 },
        ];

        const points = sampleSpeedCurve(intervals, 3, 0.5, baseConfig);

        expect(points[0]?.speed).toBe(1);
        expect(points[4]?.speed).toBe(1); // t=2
        expect(points[5]?.speed).toBe(1.5); // t=2.5
        expect(points[6]?.speed).toBe(2); // t=3
    });
});
