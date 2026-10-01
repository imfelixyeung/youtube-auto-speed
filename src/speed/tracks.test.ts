import { beforeEach, describe, expect, it, vi } from "bun:test";
import { TimedInterval } from "../timed-interval";
import { Track, Tracks } from "./tracks";

describe("Track", () => {
    describe("static empty()", () => {
        it("creates an empty track with default values", () => {
            const track = Track.empty(null);
            expect(track.name).toBe("");
            expect(track.data).toBe(null);
            expect(track.intervals).toEqual([]);
        });
    });

    describe("addInterval()", () => {
        it("adds an interval to an empty track", () => {
            const track = Track.empty();
            const interval = new TimedInterval(0, 10);

            track.addInterval(interval);

            expect(track.intervals).toEqual([new TimedInterval(0, 10)]);
        });

        it("appends non-overlapping intervals (Case 1)", () => {
            const track = new Track("Test", [new TimedInterval(0, 5, null)]);
            track.addInterval(new TimedInterval(10, 15, null));

            expect(track.intervals).toEqual([
                new TimedInterval(0, 5, null),
                new TimedInterval(10, 15, null),
            ]);
        });

        it("removes existing intervals fully covered by the new interval (Case 2)", () => {
            const track = new Track("Test", [
                new TimedInterval(2, 4, null),
                new TimedInterval(5, 8, null),
            ]);
            track.addInterval(new TimedInterval(0, 10, null));

            expect(track.intervals).toEqual([new TimedInterval(0, 10, null)]);
        });

        it("splits an existing interval when new interval is strictly inside it (Case 3)", () => {
            const track = new Track("Test", [new TimedInterval(0, 10, null)]);
            track.addInterval(new TimedInterval(3, 7, null));

            expect(track.intervals).toEqual([
                new TimedInterval(0, 3, null),
                new TimedInterval(7, 10, null),
                new TimedInterval(3, 7, null),
            ]);
        });

        it("trims the end of an existing interval overlapping on its right (Case 4)", () => {
            const track = new Track("Test", [new TimedInterval(0, 10, null)]);
            track.addInterval(new TimedInterval(6, 15, null));

            expect(track.intervals).toEqual([
                new TimedInterval(0, 6, null),
                new TimedInterval(6, 15, null),
            ]);
        });

        it("trims the start of an existing interval overlapping on its left (Case 5)", () => {
            const track = new Track("Test", [new TimedInterval(5, 15, null)]);
            track.addInterval(new TimedInterval(0, 8, null));

            expect(track.intervals).toEqual([
                new TimedInterval(8, 15, null),
                new TimedInterval(0, 8, null),
            ]);
        });

        it("handles multiple overlapping intervals across different cases", () => {
            const track = new Track("Test", [
                new TimedInterval(0, 5, null), // Overlaps end (Case 4)
                new TimedInterval(7, 9, null), // Fully covered (Case 2)
                new TimedInterval(12, 20, null), // Overlaps start (Case 5)
            ]);

            track.addInterval(new TimedInterval(3, 15, null));

            expect(track.intervals).toEqual([
                new TimedInterval(0, 3, null),
                new TimedInterval(15, 20, null),
                new TimedInterval(3, 15, null),
            ]);
        });

        it("preserves additional properties on custom interval types", () => {
            const track = new Track("Custom", [
                new TimedInterval(0, 10, "Original"),
            ]);

            track.addInterval(new TimedInterval(3, 7, "New"));

            expect(track.intervals).toEqual([
                new TimedInterval(0, 3, "Original"),
                new TimedInterval(7, 10, "Original"),
                new TimedInterval(3, 7, "New"),
            ]);
        });
    });

    describe("sort()", () => {
        it("sorts intervals primarily by start time", () => {
            const track = new Track("Test", [
                new TimedInterval(10, 15, null),
                new TimedInterval(0, 5, null),
                new TimedInterval(6, 8, null),
            ]);

            const result = track.sort();

            expect(result).toBe(track); // Verify chaining reference
            expect(track.intervals).toEqual([
                new TimedInterval(0, 5, null),
                new TimedInterval(6, 8, null),
                new TimedInterval(10, 15, null),
            ]);
        });

        it("sorts intervals secondarily by end time if start times are equal", () => {
            const track = new Track("Test", [
                new TimedInterval(0, 10, null),
                new TimedInterval(0, 5, null),
                new TimedInterval(0, 8, null),
            ]);

            track.sort();

            expect(track.intervals).toEqual([
                new TimedInterval(0, 5, null),
                new TimedInterval(0, 8, null),
                new TimedInterval(0, 10, null),
            ]);
        });
    });
});

describe("Tracks", () => {
    type TrackName = "bass" | "treble";

    let trackA: Track<number>;
    let trackB: Track<number>;
    let tracks: Tracks<TrackName, number>;

    beforeEach(() => {
        trackA = new Track("bass", [new TimedInterval(0, 10)], 1.5);
        trackB = new Track("treble", [new TimedInterval(5, 15)], 2.0);
        tracks = new Tracks([
            { name: "bass", track: trackA },
            { name: "treble", track: trackB },
        ]);
    });

    describe("get()", () => {
        it("returns the registered track by name", () => {
            expect(tracks.get("bass")).toBe(trackA);
            expect(tracks.get("treble")).toBe(trackB);
        });

        it("throws an error when looking up an unregistered track", () => {
            expect(() => tracks.get("unknown" as TrackName)).toThrowError(
                "Unknown track unknown",
            );
        });
    });

    describe("flatten()", () => {
        it("flattens multiple tracks into a single sorted track with speed attached", () => {
            const consoleSpy = vi
                .spyOn(console, "log")
                .mockImplementation(() => {});

            const result = tracks.flatten();

            expect(result.intervals).toEqual<TimedInterval<number>[]>([
                { start: 0, end: 5, data: 1.5 },
                { start: 5, end: 15, data: 2.0 },
            ]);

            consoleSpy.mockRestore();
        });

        it("caches the flattened track on subsequent calls when recalculate is false", () => {
            const consoleSpy = vi
                .spyOn(console, "log")
                .mockImplementation(() => {});

            const firstRun = tracks.flatten();
            const secondRun = tracks.flatten();

            expect(firstRun).toBe(secondRun);
            expect(consoleSpy).toHaveBeenCalledTimes(1);

            consoleSpy.mockRestore();
        });

        it("recalculates the flattened track when recalculate parameter is true", () => {
            const consoleSpy = vi
                .spyOn(console, "log")
                .mockImplementation(() => {});

            const firstRun = tracks.flatten();
            const secondRun = tracks.flatten(true);

            expect(firstRun).not.toBe(secondRun);
            expect(consoleSpy).toHaveBeenCalledTimes(2);

            consoleSpy.mockRestore();
        });
    });
});
