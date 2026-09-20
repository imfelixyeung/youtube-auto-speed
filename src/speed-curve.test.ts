import { describe, expect, test } from "bun:test";
import { easeCubicInOut } from "d3-ease";
import { clamp01, computeValueAtTime, sampleCurve } from "./speed-curve";

const fallback = 1;
const baseConfig = {
    fallback,
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
    const first = { start: 0, end: 1, value: 1 };
    const second = { start: 1, end: 2, value: 2 };
    const intervals = [first, second];

    test("returns first speed while a within interval", () => {
        expect(computeValueAtTime(0.5, intervals, baseConfig)).toBe(
            first.value,
        );
    });

    test("returns fallback speed when there are no intervals", () => {
        expect(computeValueAtTime(10, [], baseConfig)).toBe(fallback);
    });

    test("ramps up between first and second speed after speech ends", () => {
        const speed = computeValueAtTime(1.5, intervals, baseConfig);
        expect(speed).toBe(2);
    });

    test("reaches fallback speed one full ramp after speech ends", () => {
        expect(computeValueAtTime(3, intervals, baseConfig)).toBe(fallback);
    });

    test("returns fallback speed far from any intervals", () => {
        expect(computeValueAtTime(5, intervals, baseConfig)).toBe(fallback);
    });

    test("reaches defined speed exactly when the next caption starts", () => {
        expect(computeValueAtTime(2, intervals, baseConfig)).toBe(second.value);
    });
});

describe("sampleSpeedCurve", () => {
    test("samples the curve every step, inclusive of the end", () => {
        const intervals = [{ start: 1, end: 2, value: 1 }];

        const points = sampleCurve(intervals, 2, 0.5, baseConfig);

        expect(points.map((point) => point.time)).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    test("samples the correct speed at each point", () => {
        const intervals = [
            { start: 1, end: 2, value: 1 },
            { start: 2, end: 3, value: 2 },
        ];

        const points = sampleCurve(intervals, 3, 0.25, baseConfig);

        expect(points[0]?.value).toBe(1);
        expect(points[4]?.value).toBe(1); // t=2
        expect(points[8]?.value).toBe(1); // t=2
        expect(points[9]?.value).toBe(1.5); // t=2.25
        expect(points[10]?.value).toBe(2); // t=2.5
        expect(points[11]?.value).toBe(1.5); // t=2.75
    });
});
