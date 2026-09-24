import { describe, expect, test } from "bun:test";
import { easeCubicInOut } from "d3-ease";
import {
    clamp01,
    computeValueAtTime,
    sampleCurve,
    type TimedIntervalWithNumberData,
} from "./curve";

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
    const first: TimedIntervalWithNumberData = {
        start: 0,
        end: 1,
        data: { label: "", value: 1 },
    };
    const second: TimedIntervalWithNumberData = {
        start: 1,
        end: 2,
        data: { label: "", value: 2 },
    };
    const intervals = [first, second];

    test("returns first speed while a within interval", () => {
        expect(computeValueAtTime(0.5, intervals, baseConfig)[0]).toBe(
            first.data.value,
        );
    });

    test("returns fallback speed when there are no intervals", () => {
        expect(computeValueAtTime(10, [], baseConfig)[0]).toBe(fallback);
    });

    test("ramps up between first and second speed after speech ends", () => {
        const speed = computeValueAtTime(1.5, intervals, baseConfig)[0];
        expect(speed).toBe(2);
    });

    test("reaches fallback speed one full ramp after speech ends", () => {
        expect(computeValueAtTime(3, intervals, baseConfig)[0]).toBe(fallback);
    });

    test("returns fallback speed far from any intervals", () => {
        expect(computeValueAtTime(5, intervals, baseConfig)[0]).toBe(fallback);
    });

    test("reaches defined speed exactly when the next caption starts", () => {
        expect(computeValueAtTime(2, intervals, baseConfig)[0]).toBe(
            second.data.value,
        );
    });
});

describe("sampleSpeedCurve", () => {
    test("samples the curve every step, inclusive of the end", () => {
        const intervals: TimedIntervalWithNumberData[] = [
            { start: 1, end: 2, data: { label: "", value: 1 } },
        ];

        const points = sampleCurve(intervals, 2, 0.5, baseConfig);

        expect(points.map((point) => point.time)).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    test("samples the correct speed at each point", () => {
        const intervals: TimedIntervalWithNumberData[] = [
            { start: 1, end: 2, data: { label: "", value: 1 } },
            { start: 2, end: 3, data: { label: "", value: 2 } },
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
