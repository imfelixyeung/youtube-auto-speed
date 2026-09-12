import { describe, expect, test } from "bun:test";
import {
    cacheTimedText,
    captionsToIntervals,
    getCachedTimedText,
    mergeIntervals,
} from "./captions";
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

describe("timedtext cache", () => {
    test("returns null before anything is cached", () => {
        expect(getCachedTimedText("video-a")).toBeNull();
    });

    test("returns the cached data for the matching video", () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "hi" }] },
            ],
        };

        cacheTimedText("video-a", data);

        expect(getCachedTimedText("video-a")).toEqual(data);
        expect(getCachedTimedText("video-b")).toBeNull();
    });

    test("replaces data for a re-cached video", () => {
        cacheTimedText("video-a", {
            events: [{ tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "old" }] }],
        });
        cacheTimedText("video-a", {
            events: [{ tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "new" }] }],
        });

        expect(getCachedTimedText("video-a")?.events[0]?.segs?.[0]?.utf8).toBe(
            "new",
        );
    });

    test("evicts the least-recently-used entry past the cap", () => {
        for (let i = 0; i < 21; i++) {
            cacheTimedText(`video-${i}`, {
                events: [
                    { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "x" }] },
                ],
            });
        }

        expect(getCachedTimedText("video-0")).toBeNull();
        expect(getCachedTimedText("video-20")).not.toBeNull();
    });

    test("accessing an entry makes it the most-recently-used", () => {
        for (let i = 0; i < 20; i++) {
            cacheTimedText(`video-${i}`, {
                events: [
                    { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "x" }] },
                ],
            });
        }

        // Touching video-0 moves it to the back, so inserting a 21st entry
        // evicts video-1 instead.
        expect(getCachedTimedText("video-0")).not.toBeNull();
        cacheTimedText("video-20", {
            events: [{ tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "x" }] }],
        });

        expect(getCachedTimedText("video-1")).toBeNull();
        expect(getCachedTimedText("video-0")).not.toBeNull();
    });
});
