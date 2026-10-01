export class TimedInterval<D = void> {
    public data: D;

    constructor(start: number, end: number);
    constructor(start: number, end: number, data: D);
    constructor(
        public start: number,
        public end: number,
        data?: D,
    ) {
        this.data = data as D;
    }

    public static merge(intervals: TimedInterval[]): TimedInterval[] {
        if (intervals.length === 0) return [];

        const merged: TimedInterval[] = [];
        const GAP_TO_MERGE = 0.05;

        for (const interval of intervals) {
            const previous = merged[merged.length - 1];

            if (previous && interval.start <= previous.end + GAP_TO_MERGE) {
                previous.end = Math.max(previous.end, interval.end);
            } else {
                merged.push(new TimedInterval(interval.start, interval.end));
            }
        }

        return merged;
    }

    public static invert(
        data: TimedInterval[],
        duration: number,
    ): TimedInterval[] {
        const result: TimedInterval[] = [];
        let lastEnd = 0;

        for (const interval of data) {
            if (lastEnd !== interval.end) {
                result.push(new TimedInterval(lastEnd, interval.start));
            }
            lastEnd = interval.end;
            if (lastEnd > duration) {
                lastEnd = duration;
                break;
            }
        }

        result.push(new TimedInterval(lastEnd, duration));
        return result;
    }
}
