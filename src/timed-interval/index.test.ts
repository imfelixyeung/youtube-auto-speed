import { describe, expect, test } from "bun:test";
import { TimedInterval } from ".";

describe("TimedInterval.merge", () => {
    test("returns an empty array for empty input", () => {
        expect(TimedInterval.merge([])).toEqual([]);
    });

    test("returns a single interval unchanged", () => {
        expect(TimedInterval.merge([new TimedInterval(1, 2)])).toEqual([
            new TimedInterval(1, 2),
        ]);
    });

    test("merges overlapping intervals", () => {
        expect(
            TimedInterval.merge([
                new TimedInterval(1, 3),
                new TimedInterval(2, 4),
            ]),
        ).toEqual([new TimedInterval(1, 4)]);
    });

    test("keeps the widest bounds when one interval contains another", () => {
        expect(
            TimedInterval.merge([
                new TimedInterval(1, 5),
                new TimedInterval(2, 3),
            ]),
        ).toEqual([new TimedInterval(1, 5)]);
    });

    test("merges intervals closer than the gap threshold", () => {
        expect(
            TimedInterval.merge([
                new TimedInterval(1, 2),
                new TimedInterval(2.04, 3),
            ]),
        ).toEqual([new TimedInterval(1, 3)]);
    });

    test("keeps intervals beyond the gap threshold separate", () => {
        expect(
            TimedInterval.merge([
                new TimedInterval(1, 2),
                new TimedInterval(2.06, 3),
            ]),
        ).toEqual([new TimedInterval(1, 2), new TimedInterval(2.06, 3)]);
    });

    test("chains merges through a merged interval", () => {
        expect(
            TimedInterval.merge([
                new TimedInterval(1, 2),
                new TimedInterval(1.9, 3),
                new TimedInterval(3.04, 4),
            ]),
        ).toEqual([new TimedInterval(1, 4)]);
    });
});
