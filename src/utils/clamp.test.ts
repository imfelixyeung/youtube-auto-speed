import { describe, expect, test } from "bun:test";
import { clamp, clamp01 } from "./clamp";

describe("clamp", () => {
    test("returns value when within bounds", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-2, -5, 5)).toBe(-2);
        expect(clamp(0, -10, 10)).toBe(0);
    });

    test("clamps value to min when below min", () => {
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(-100, -10, 10)).toBe(-10);
    });

    test("clamps value to max when above max", () => {
        expect(clamp(15, 0, 10)).toBe(10);
        expect(clamp(100, -10, 10)).toBe(10);
    });

    test("handles boundary exact matches", () => {
        expect(clamp(0, 0, 10)).toBe(0);
        expect(clamp(10, 0, 10)).toBe(10);
    });

    test("handles min equal to max", () => {
        expect(clamp(5, 5, 5)).toBe(5);
        expect(clamp(0, 5, 5)).toBe(5);
        expect(clamp(10, 5, 5)).toBe(5);
    });

    test("handles special number values like NaN and Infinity", () => {
        expect(clamp(Infinity, 0, 10)).toBe(10);
        expect(clamp(-Infinity, 0, 10)).toBe(0);
        expect(clamp(NaN, 0, 10)).toBeNaN();
    });
});

describe("clamp01", () => {
    test("clamps values into [0, 1]", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(0)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(1)).toBe(1);
        expect(clamp01(2)).toBe(1);
    });
});
