import { TimedInterval } from "../timed-interval";

export class Track<D, I extends TimedInterval<D> = TimedInterval<D>> {
    static infinite = new TimedInterval(-Infinity, Infinity, {
        label: "",
        value: 0,
    });
    public data: D;

    constructor(name: string, intervals: I[]);
    constructor(name: string, intervals: I[], data: D, enabled?: boolean);
    constructor(
        public name: string,
        public intervals: I[],
        data?: D,
        public enabled = true,
    ) {
        this.data = data as D;
    }

    public static empty(): Track<void, TimedInterval<void>>;
    public static empty<D, I extends TimedInterval<D> = TimedInterval<D>>(
        value: D,
    ): Track<D, I>;
    public static empty<
        D = void,
        I extends TimedInterval<D> = TimedInterval<D>,
    >(value?: D): Track<D, I> {
        return new Track<D, I>("", [], value as D);
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

export class Tracks<T extends string, D = void> {
    private trackMap: Map<T, Track<D>>;
    private flattened: Track<D> | null = null;
    constructor(
        public tracks: {
            name: T;
            track: Track<D>;
        }[],
    ) {
        this.trackMap = new Map();
        tracks.forEach((t) => void this.trackMap.set(t.name, t.track));
    }

    get(name: T): Track<D> {
        const track = this.trackMap.get(name);
        if (track === undefined) {
            throw new Error(`Unknown track ${name}`);
        }
        return track;
    }

    flatten(recalculate = false): Track<D> {
        if (this.flattened && !recalculate) {
            return this.flattened;
        }

        this.flattened = Track.empty<D>(null as D);

        for (const { track } of this.tracks) {
            if (!track.enabled) continue;
            for (const interval of track.intervals) {
                if (track.data === null) continue;
                this.flattened.addInterval({
                    ...interval,
                    data: track.data as D,
                });
            }
        }

        this.flattened.sort();
        console.log({ flattened: this.flattened });
        return this.flattened;
    }
}

export type InferTrackNames<T> = T extends Tracks<infer N, unknown> ? N : never;
