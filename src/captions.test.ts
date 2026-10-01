import { describe, expect, test } from "bun:test";
import { _captionsToIntervals as captionsToIntervals } from "./captions";
import { TimedInterval } from "./timed-interval";
import type { TimedText } from "./types";

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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(1, 3)]);
    });

    test("ignores events without text", () => {
        const data: TimedText = {
            events: [
                { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "   " }] },
                { tStartMs: 4000, dDurationMs: 500, segs: [{ utf8: "x" }] },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(4, 4.5)]);
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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(4, 5)]);
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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(4, 5)]);
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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(4, 5)]);
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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(1, 3)]);
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

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(5, 6)]);
    });

    test('treats "(music)" as speech by default', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "(music)" }],
                },
            ],
        };

        expect(captionsToIntervals(data)).toEqual([new TimedInterval(1, 3)]);
    });

    test('ignores "(music)" labels when the parenthesised filter is on', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "(music)" }],
                },
            ],
        };

        expect(
            captionsToIntervals(data, {
                filterSquareBrackets: true,
                filterParentheses: true,
            }),
        ).toEqual([]);
    });

    test('keeps "[music]" as speech when the square-bracket filter is off', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "[music]" }],
                },
            ],
        };

        expect(
            captionsToIntervals(data, {
                filterSquareBrackets: false,
                filterParentheses: false,
            }),
        ).toEqual([new TimedInterval(1, 3)]);
    });

    test("strips parenthesised asides but keeps the speech around them", () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 2000,
                    segs: [{ utf8: "hello (aside)" }],
                },
            ],
        };

        expect(
            captionsToIntervals(data, {
                filterSquareBrackets: true,
                filterParentheses: true,
            }),
        ).toEqual([new TimedInterval(1, 3)]);
    });

    test('treats "(music) [applause]" as non-speech with both filters on', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 1000,
                    segs: [{ utf8: "(music) [applause]" }],
                },
            ],
        };

        expect(
            captionsToIntervals(data, {
                filterSquareBrackets: true,
                filterParentheses: true,
            }),
        ).toEqual([]);
    });

    test('treats ">>> (music)" as non-speech with the parenthesised filter on', () => {
        const data: TimedText = {
            events: [
                {
                    tStartMs: 1000,
                    dDurationMs: 1000,
                    segs: [{ utf8: ">>> (music)" }],
                },
            ],
        };

        expect(
            captionsToIntervals(data, {
                filterSquareBrackets: true,
                filterParentheses: true,
            }),
        ).toEqual([]);
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
            new TimedInterval(1, 3.1),
            new TimedInterval(5, 6),
        ]);
    });
});
