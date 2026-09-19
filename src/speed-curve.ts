export type TimedInterval = {
    start: number;
    end: number;
};

export type TimedIntervals = {
    captions: TimedInterval[];
    smartSkips: TimedInterval[];
};

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
    active: boolean;
    previousEnd: number;
    nextStart: number;
};

/**
 * Locate whether `time` is inside a speech interval, plus the nearest
 * surrounding speech boundaries (`previousEnd` / `nextStart`).
 *
 * `previousEnd` is `-Infinity` before any speech, `nextStart` is `Infinity`
 * after the last speech, so ramps behave sensibly at the edges of a video.
 */
export function findSpeechNeighbors(
    time: number,
    intervals: TimedInterval[],
): Neighbors {
    if (intervals.length === 0) {
        return { active: false, previousEnd: -Infinity, nextStart: Infinity };
    }

    // Binary search for the last interval whose start time is <= `time`.
    let low = 0;
    let high = intervals.length - 1;
    let found = -1;

    while (low <= high) {
        const mid = (low + high) >> 1;
        const start = intervals[mid]?.start;

        if (start !== undefined && start <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // `time` is before the first interval.
    if (found === -1) {
        return {
            active: false,
            previousEnd: -Infinity,
            nextStart: intervals[0]?.start ?? Infinity,
        };
    }

    const current = intervals[found];

    if (!current) {
        return {
            active: false,
            previousEnd: -Infinity,
            nextStart: Infinity,
        };
    }

    const previousEnd =
        found > 0 ? (intervals[found - 1]?.end ?? -Infinity) : -Infinity;

    if (time <= current.end) {
        return { active: true, previousEnd, nextStart: current.start };
    }

    return {
        active: false,
        previousEnd: current.end,
        nextStart:
            found + 1 < intervals.length
                ? (intervals[found + 1]?.start ?? Infinity)
                : Infinity,
    };
}

/**
 * Desired playback rate at a given video time.
 *
 * Talking              -> `talkingSpeed` (1x).
 * After talking stops  -> ease up to `silentSpeed` (2x) over
 *                         `rampDurationSeconds`.
 * Until the next talk  -> ease back down to `talkingSpeed`, reaching it
 *                         exactly when talking starts.
 *
 * The two ramps overlap when a gap is shorter than twice the ramp
 * duration; the minimum of both constraints keeps the curve continuous.
 */
export function computeSpeedAtTime(
    time: number,
    intervals: TimedIntervals,
    config: SpeedCurveConfig,
): number {
    if (intervals.captions.length === 0 && intervals.smartSkips.length === 0) {
        return config.talkingSpeed;
    }

    const smartSkips = findSpeechNeighbors(time, intervals.smartSkips);
    if (smartSkips.active) {
        return config.smartSkipSpeed;
    }

    const captions = findSpeechNeighbors(time, intervals.captions);

    if (captions.active) {
        return config.talkingSpeed;
    }

    const { previousEnd, nextStart } = captions;

    const ramp = config.rampDurationSeconds;
    const range = config.silentSpeed - config.talkingSpeed;

    // Ease away from the previous speech.
    const upProgress = clamp01((time - previousEnd) / ramp);
    const upSpeed = config.talkingSpeed + range * config.easing(upProgress);

    // Ease toward the next speech.
    const downProgress = clamp01((nextStart - time) / ramp);
    const downSpeed = config.talkingSpeed + range * config.easing(downProgress);

    return Math.min(upSpeed, downSpeed);
}

export type SpeedPoint = {
    time: number;
    speed: number;
};

/**
 * Sample the speed curve so it can be rendered as a line graph later.
 */
export function sampleSpeedCurve(
    intervals: TimedIntervals,
    config: SpeedCurveConfig,
    durationSeconds: number,
    stepSeconds = 0.1,
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
