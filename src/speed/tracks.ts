import type {
    TimedInterval,
    TimedIntervalWithNumberValue,
} from "../speed-curve";

export class Track<I extends TimedInterval = TimedInterval> {
    static infinite: TimedInterval = { start: -Infinity, end: Infinity };

    constructor(
        public name: string,
        public value: number,
        public intervals: I[],
    ) {}

    public static empty<I extends TimedInterval = TimedInterval>() {
        return new Track<I>("", 0, []);
    }

    public addInterval(interval: I) {
        const nextIntervals: I[] = [];

        for (const existing of this.intervals) {
            // Case 1: No overlap
            if (
                existing.end <= interval.start ||
                existing.start >= interval.end
            ) {
                nextIntervals.push(existing);
                continue;
            }

            // Case 2: Fully covered by the new interval (skip/remove)
            if (
                existing.start >= interval.start &&
                existing.end <= interval.end
            ) {
                continue;
            }

            // Case 3: New interval splits existing interval in the middle
            if (
                existing.start < interval.start &&
                existing.end > interval.end
            ) {
                nextIntervals.push(
                    { ...existing, end: interval.start },
                    { ...existing, start: interval.end },
                );
                continue;
            }

            // Case 4: Overlaps end of existing interval (trim existing's end)
            if (existing.start < interval.start) {
                nextIntervals.push({ ...existing, end: interval.start });
            }

            // Case 5: Overlaps start of existing interval (trim existing's start)
            if (existing.end > interval.end) {
                nextIntervals.push({ ...existing, start: interval.end });
            }
        }

        // Add the new overriding interval
        nextIntervals.push(interval);
        this.intervals = nextIntervals;
    }

    /**
     * Sorts intervals in-place by start time (and end time if start times are equal).
     * Returns `this` to allow method chaining.
     */
    public sort(): this {
        this.intervals.sort((a, b) => a.start - b.start || a.end - b.end);
        return this;
    }
}

export type TimedTrack = Track<TimedInterval>;
export type TimedSpeedTrack = Track<TimedIntervalWithNumberValue>;

export class Tracks<T extends string> {
    private trackMap: Map<T, TimedTrack>;
    private flattened: TimedSpeedTrack | null = null;
    constructor(public tracks: { name: T; track: TimedTrack }[]) {
        this.trackMap = new Map();
        tracks.forEach((t) => void this.trackMap.set(t.name, t.track));
    }

    get(name: T): TimedTrack {
        const track = this.trackMap.get(name);
        if (track === undefined) {
            throw new Error(`Unknown track ${name}`);
        }
        return track;
    }

    flatten(recalculate = false): TimedSpeedTrack {
        if (this.flattened && !recalculate) {
            return this.flattened;
        }

        this.flattened = Track.empty();

        for (const { track } of this.tracks) {
            for (const interval of track.intervals) {
                this.flattened.addInterval({ ...interval, value: track.value });
            }
        }

        this.flattened.sort();
        console.log({ flattened: this.flattened });
        return this.flattened;
    }
}

export type InferTrackNames<T> = T extends Tracks<infer N> ? N : never;
