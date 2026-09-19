export type TimedInterval = {
    start: number;
    end: number;
};

export type TimedIntervalWithSpeed = TimedInterval & { speed: number };

export type EasingFn = (t: number) => number;

export type SpeedCurveConfig = {
    smartSkipSpeed: number;
    talkingSpeed: number;
    silentSpeed: number;
    rampDurationSeconds: number;
    easing: EasingFn;
};

export function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

/**
 * Smooth ease-in-out. The playback rate is treated as a continuous
 * function of video time, so it can later be rendered as a line graph.
 */
export const easeInOutCubic: EasingFn = (t) => {
    const x = clamp01(t);

    return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

export type Neighbors = {
    current: TimedIntervalWithSpeed | null;
    previous: TimedIntervalWithSpeed | null;
    next: TimedIntervalWithSpeed | null;
};

export function findSpeechNeighbors(
    time: number,
    intervals: TimedIntervalWithSpeed[],
) {
    let current: TimedIntervalWithSpeed | null = null;
    let previous: TimedIntervalWithSpeed | null = null;
    let next: TimedIntervalWithSpeed | null = null;

    for (let i = 0; i < intervals.length; i++) {
        const interval = intervals[i];
        if (interval === undefined) continue;

        if (interval.start <= time && time < interval.end) {
            current = interval;
            previous = intervals[i - 1] ?? null;
            next = intervals[i + 1] ?? null;
            break;
        }

        if (interval.end <= time) {
            previous = interval;
        } else if (interval.start > time) {
            next = interval;
            break; // Since intervals are sorted, we don't need to look further
        }
    }

    return { current, previous, next };
}

/**
 * Desired playback rate at a given video time.
 */
export function computeSpeedAtTime(
    time: number,
    intervals: TimedIntervalWithSpeed[],
    fallbackSpeed: number,
): number {
    if (intervals.length === 0) {
        return fallbackSpeed;
    }

    const { current } = findSpeechNeighbors(time, intervals);
    if (current) {
        return current.speed;
    }

    return fallbackSpeed;
}

export type SpeedPoint = {
    time: number;
    speed: number;
};

/**
 * Sample the speed curve so it can be rendered as a line graph later.
 */
export function sampleSpeedCurve(
    intervals: TimedIntervalWithSpeed[],
    fallbackSpeed: number,
    durationSeconds: number,
    stepSeconds = 0.1,
): SpeedPoint[] {
    const points: SpeedPoint[] = [];

    for (let time = 0; time <= durationSeconds; time += stepSeconds) {
        points.push({
            time,
            speed: computeSpeedAtTime(time, intervals, fallbackSpeed),
        });
    }

    return points;
}
