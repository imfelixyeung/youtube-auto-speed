import { beforeEach, describe, expect, it, vi } from "bun:test";
import type { TimedInterval, TimedIntervalWithData } from "../curve";
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
            const track = Track.empty(null);
            const interval: TimedInterval = { start: 0, end: 10 };

            track.addInterval(interval);

            expect(track.intervals).toEqual([{ start: 0, end: 10 }]);
        });

        it("appends non-overlapping intervals (Case 1)", () => {
            const track = new Track("Test", 1, [{ start: 0, end: 5 }]);
            track.addInterval({ start: 10, end: 15 });

            expect(track.intervals).toEqual([
                { start: 0, end: 5 },
                { start: 10, end: 15 },
            ]);
        });

        it("removes existing intervals fully covered by the new interval (Case 2)", () => {
            const track = new Track("Test", 1, [
                { start: 2, end: 4 },
                { start: 5, end: 8 },
            ]);
            track.addInterval({ start: 0, end: 10 });

            expect(track.intervals).toEqual([{ start: 0, end: 10 }]);
        });

        it("splits an existing interval when new interval is strictly inside it (Case 3)", () => {
            const track = new Track("Test", 1, [{ start: 0, end: 10 }]);
            track.addInterval({ start: 3, end: 7 });

            expect(track.intervals).toEqual([
                { start: 0, end: 3 },
                { start: 7, end: 10 },
                { start: 3, end: 7 },
            ]);
        });

        it("trims the end of an existing interval overlapping on its right (Case 4)", () => {
            const track = new Track("Test", 1, [{ start: 0, end: 10 }]);
            track.addInterval({ start: 6, end: 15 });

            expect(track.intervals).toEqual([
                { start: 0, end: 6 },
                { start: 6, end: 15 },
            ]);
        });

        it("trims the start of an existing interval overlapping on its left (Case 5)", () => {
            const track = new Track("Test", 1, [{ start: 5, end: 15 }]);
            track.addInterval({ start: 0, end: 8 });

            expect(track.intervals).toEqual([
                { start: 8, end: 15 },
                { start: 0, end: 8 },
            ]);
        });

        it("handles multiple overlapping intervals across different cases", () => {
            const track = new Track("Test", 1, [
                { start: 0, end: 5 }, // Overlaps end (Case 4)
                { start: 7, end: 9 }, // Fully covered (Case 2)
                { start: 12, end: 20 }, // Overlaps start (Case 5)
            ]);

            track.addInterval({ start: 3, end: 15 });

            expect(track.intervals).toEqual([
                { start: 0, end: 3 },
                { start: 15, end: 20 },
                { start: 3, end: 15 },
            ]);
        });

        it("preserves additional properties on custom interval types", () => {
            const track = new Track("Custom", 1, [
                { start: 0, end: 10, label: "Original" },
            ]);

            track.addInterval({ start: 3, end: 7, label: "New" });

            expect(track.intervals).toEqual([
                { start: 0, end: 3, label: "Original" },
                { start: 7, end: 10, label: "Original" },
                { start: 3, end: 7, label: "New" },
            ]);
        });
    });

    describe("sort()", () => {
        it("sorts intervals primarily by start time", () => {
            const track = new Track("Test", 1, [
                { start: 10, end: 15 },
                { start: 0, end: 5 },
                { start: 6, end: 8 },
            ]);

            const result = track.sort();

            expect(result).toBe(track); // Verify chaining reference
            expect(track.intervals).toEqual([
                { start: 0, end: 5 },
                { start: 6, end: 8 },
                { start: 10, end: 15 },
            ]);
        });

        it("sorts intervals secondarily by end time if start times are equal", () => {
            const track = new Track("Test", 1, [
                { start: 0, end: 10 },
                { start: 0, end: 5 },
                { start: 0, end: 8 },
            ]);

            track.sort();

            expect(track.intervals).toEqual([
                { start: 0, end: 5 },
                { start: 0, end: 8 },
                { start: 0, end: 10 },
            ]);
        });
    });
});

describe("Tracks", () => {
    type TrackName = "bass" | "treble";

    let trackA: Track<number>;
    let trackB: Track<number>;
    let tracks: Tracks<number, TrackName>;

    beforeEach(() => {
        trackA = new Track("bass", 1.5, [{ start: 0, end: 10 }]);
        trackB = new Track("treble", 2.0, [{ start: 5, end: 15 }]);
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

            expect(result.intervals).toEqual<TimedIntervalWithData<number>[]>([
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
