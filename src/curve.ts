import { clamp } from "./utils/clamp";

export type TimedInterval = {
    start: number;
    end: number;
};

export type TimedIntervalWithValue<T> = TimedInterval & { value: T };
export type TimedIntervalWithNumberValue = TimedIntervalWithValue<number>;

export type EasingFn = (t: number) => number;

export function clamp01(value: number) {
    return clamp(value, 0, 1);
}

export type Neighbors = {
    current: TimedIntervalWithNumberValue | null;
    previous: TimedIntervalWithNumberValue | null;
    next: TimedIntervalWithNumberValue | null;
};

export function findNeighbors(
    time: number,
    intervals: TimedIntervalWithNumberValue[],
) {
    let current: TimedIntervalWithNumberValue | null = null;
    let previous: TimedIntervalWithNumberValue | null = null;
    let next: TimedIntervalWithNumberValue | null = null;

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
 * Desired playback rate at a given video time with smooth easing.
 */
export function computeValueAtTime(
    time: number,
    intervals: TimedIntervalWithNumberValue[],
    config: {
        fallback: number;
        rampDuration: number;
        easingFn: EasingFn;
    },
): number {
    const { fallback, rampDuration, easingFn } = config;
    if (intervals.length === 0) {
        return config.fallback;
    }

    const { current, previous, next } = findNeighbors(time, intervals);

    if (rampDuration <= 0) {
        return current?.value ?? fallback;
    }

    if (current) {
        const prevValue = previous ? previous.value : fallback;
        const nextValue = next ? next.value : fallback;
        const minNeighborValue = Math.min(prevValue, nextValue);

        let currentValue = current.value;
        let value = currentValue;
        const currentMid = (current.start + current.end) / 2;
        const currentDuration = current.end - current.start;
        const needRampIn = prevValue < current.value;
        const needRampOut = nextValue < current.value;

        // Override the current value if the bump is too much.
        if (needRampIn && needRampOut && currentDuration < rampDuration) {
            currentValue =
                minNeighborValue +
                (currentValue - minNeighborValue) *
                    (currentDuration / rampDuration);
        }

        // Ramp IN from previous value (only if previous value is lower)
        if (needRampIn) {
            const effectiveRamp = Math.min(
                needRampOut ? currentMid - current.start : currentDuration,
                rampDuration,
            );
            const rampEnd = current.start + effectiveRamp;
            if (time < rampEnd) {
                const progress = (time - current.start) / effectiveRamp;
                const easedProgress = easingFn(progress);
                const rampValue =
                    prevValue + easedProgress * (currentValue - prevValue);
                value = Math.min(value, rampValue);
            }
        }

        // Ramp OUT to next value (only if next value is lower)
        if (needRampOut) {
            const effectiveRamp = Math.min(
                needRampIn ? current.end - currentMid : currentDuration,
                rampDuration,
            );
            const rampStart = current.end - effectiveRamp;
            if (time >= rampStart) {
                const progress = (time - rampStart) / effectiveRamp;
                const easedProgress = easingFn(progress);
                const rampValue =
                    currentValue - easedProgress * (currentValue - nextValue);
                value = Math.min(value, rampValue);
            }
        }

        return value;
    }

    // When time falls outside any active interval (in fallback space)
    const prevValue = previous ? previous.value : fallback;
    const nextValue = next ? next.value : fallback;

    // Transition out of previous interval if previous value was higher
    if (previous && prevValue > fallback) {
        if (time < previous.end + rampDuration) {
            const progress = (time - previous.end) / rampDuration;
            const easedProgress = easingFn(progress);
            return prevValue - easedProgress * (prevValue - fallback);
        }
    }

    // Transition into next interval if next value is higher
    if (next && nextValue > fallback && rampDuration > 0) {
        if (time >= next.start - rampDuration) {
            const progress =
                (time - (next.start - rampDuration)) / rampDuration;
            const easedProgress = easingFn(progress);
            return fallback + easedProgress * (nextValue - fallback);
        }
    }

    return fallback;
}

export type ValuePoint = {
    time: number;
    value: number;
};

/**
 * Sample the curve so it can be rendered as a line graph later.
 */
export function sampleCurve(
    intervals: TimedIntervalWithNumberValue[],
    durationSeconds: number,
    stepSeconds = 0.1,
    config: {
        fallback: number;
        rampDuration: number;
        easingFn: EasingFn;
    },
): ValuePoint[] {
    const points: ValuePoint[] = [];

    for (let time = 0; time <= durationSeconds; time += stepSeconds) {
        points.push({
            time,
            value: computeValueAtTime(time, intervals, config),
        });
    }

    return points;
}
