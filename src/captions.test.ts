import { describe, expect, test } from "bun:test";
import { captionsToIntervals, mergeIntervals } from "./captions";
import type { TimedText } from "./types";

describe("mergeIntervals", () => {
    test("returns an empty array for empty input", () => {
        expect(mergeIntervals([])).toEqual([]);
    });

    test("returns a single interval unchanged", () => {
        expect(mergeIntervals([{ start: 1, end: 2 }])).toEqual([
            { start: 1, end: 2 },
        ]);
    });

    test("merges overlapping intervals", () => {
        expect(
            mergeIntervals([
                { start: 1, end: 3 },
                { start: 2, end: 4 },
            ]),
        ).toEqual([{ start: 1, end: 4 }]);
    });

    test("keeps the widest bounds when one interval contains another", () => {
        expect(
            mergeIntervals([
                { start: 1, end: 5 },
                { start: 2, end: 3 },
            ]),
        ).toEqual([{ start: 1, end: 5 }]);
    });

    test("merges intervals closer than the gap threshold", () => {
        expect(
            mergeIntervals([
                { start: 1, end: 2 },
                { start: 2.04, end: 3 },
            ]),
        ).toEqual([{ start: 1, end: 3 }]);
    });

    test("keeps intervals beyond the gap threshold separate", () => {
        expect(
            mergeIntervals([
                { start: 1, end: 2 },
                { start: 2.06, end: 3 },
            ]),
        ).toEqual([
            { start: 1, end: 2 },
            { start: 2.06, end: 3 },
        ]);
    });

    test("chains merges through a merged interval", () => {
        expect(
            mergeIntervals([
                { start: 1, end: 2 },
                { start: 1.9, end: 3 },
                { start: 3.04, end: 4 },
            ]),
        ).toEqual([{ start: 1, end: 4 }]);
    });
});

describe("captionsToIntervals", () => {
    test("returns an empty array for null data", () => {
        expect(captionsToIntervals(null)).toEqual([]);
    });

    test("returns an empty array when events are missing", () => {
        expect(captionsToIntervals({} as TimedText)).toEqual([]);
    });

    test("converts event timestamps from milliseconds to seconds", () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "hi" }] },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 1, end: 3 }]);
    });

    test("ignores events without text", () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "   " }] },
                { tStartMs: 4000, dDurationMs: 500, segs: [{ utf8: "x" }] },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 4, end: 4.5 }]);
    });

    test("ignores [music] labels", () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "[music]" }],
                },
                {
                    tStartMs: 4000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "hello" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 4, end: 5 }]);
    });

    test("treats [music] labels as case-insensitive", () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "[Music]" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([]);
    });

    test('ignores "> " caption markers', () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "> " }] },
                {
                    tStartMs: 4000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "hello" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 4, end: 5 }]);
    });

    test('ignores any run of ">" markers with no caption body', () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: ">>>>" }] },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([]);
    });

    test('treats ">>> [music]" as non-speech', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: ">>> [music]" }],
                },
                {
                    tStartMs: 4000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "hello" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 4, end: 5 }]);
    });

    test('treats ">> Hello world" as speech', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: ">> Hello world" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 1, end: 3 }]);
    });

    test('treats "[applause]" and "[laughter]" labels as non-speech', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "[applause]" }],
                },
                {
                    tStartMs: 3000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "[laughter]" }],
                },
                {
                    tStartMs: 5000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "thanks" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([{ start: 5, end: 6 }]);
    });

    test("joins segments before checking for non-speech labels", () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "[mu" }, { utf8: "sic]" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([]);
    });

    test("ignores events without segments", () => {
        const data: TimedText = {
            events: [{ tStartMs: 1000, dDurationMs: 2000 }],
        };

        expect(captionsToIntervals(data)).toEqual([]);
    });

    test("sorts out-of-order events and merges overlaps", () => {
        const data: TimedText = {
            events: [
                { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: "b" }] },
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "a" }] },
                { tStartMs: 2800, dDurationMs: 300, segs: [{ utf8: "c" }] },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([
            { start: 1, end: 3.1 },
            { start: 5, end: 6 },
        ]);
    });
});
