import { clamp } from "./utils/clamp";

export type TimedInterval = {
    start: number;
    end: number;
};

export type TimedIntervalWithSpeed = TimedInterval & { speed: number };

export type EasingFn = (t: number) => number;

export function clamp01(value: number) {
    return clamp(value, 0, 1);
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

export function findNeighbors(
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
 * Desired playback rate at a given video time with smooth easing.
 */
export function computeSpeedAtTime(
    time: number,
    intervals: TimedIntervalWithSpeed[],
    config: {
        fallbackSpeed: number;
        rampDuration: number;
        easingFn: EasingFn;
    },
): number {
    const { fallbackSpeed, rampDuration, easingFn } = config;
    if (intervals.length === 0) {
        return config.fallbackSpeed;
    }

    const { current, previous, next } = findNeighbors(time, intervals);

    if (current) {
        const prevSpeed = previous ? previous.speed : fallbackSpeed;
        const nextSpeed = next ? next.speed : fallbackSpeed;

        let speed = current.speed;

        // Ramp IN from previous speed (only if previous speed is lower)
        if (prevSpeed < current.speed && rampDuration > 0) {
            const rampEnd = current.start + rampDuration;
            if (time < rampEnd) {
                const progress = (time - current.start) / rampDuration;
                const easedProgress = easingFn(progress);
                const rampSpeed =
                    prevSpeed + easedProgress * (current.speed - prevSpeed);
                speed = Math.min(speed, rampSpeed);
            }
        }

        // Ramp OUT to next speed (only if next speed is lower)
        if (nextSpeed < current.speed && rampDuration > 0) {
            const rampStart = current.end - rampDuration;
            if (time >= rampStart) {
                const progress = (time - rampStart) / rampDuration;
                const easedProgress = easingFn(progress);
                const rampSpeed =
                    current.speed - easedProgress * (current.speed - nextSpeed);
                speed = Math.min(speed, rampSpeed);
            }
        }

        return speed;
    }

    // When time falls outside any active interval (in fallback space)
    const prevSpeed = previous ? previous.speed : fallbackSpeed;
    const nextSpeed = next ? next.speed : fallbackSpeed;

    // Transition out of previous interval if previous speed was higher
    if (previous && prevSpeed > fallbackSpeed && rampDuration > 0) {
        if (time < previous.end + rampDuration) {
            const progress = (time - previous.end) / rampDuration;
            const easedProgress = easingFn(progress);
            return prevSpeed - easedProgress * (prevSpeed - fallbackSpeed);
        }
    }

    // Transition into next interval if next speed is higher
    if (next && nextSpeed > fallbackSpeed && rampDuration > 0) {
        if (time >= next.start - rampDuration) {
            const progress =
                (time - (next.start - rampDuration)) / rampDuration;
            const easedProgress = easingFn(progress);
            return fallbackSpeed + easedProgress * (nextSpeed - fallbackSpeed);
        }
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
    durationSeconds: number,
    stepSeconds = 0.1,
    config: {
        fallbackSpeed: number;
        rampDuration: number;
        easingFn: EasingFn;
    },
): SpeedPoint[] {
    const points: SpeedPoint[] = [];

    for (let time = 0; time <= durationSeconds; time += stepSeconds) {
        points.push({
            time,
            speed: computeSpeedAtTime(time, intervals, config),
        });
    }

    return points;
}
