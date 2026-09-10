export type TimedInterval = {
    start: number;
    end: number;
};

export type EasingFn = (t: number) => number;

export type SpeedCurveConfig = {
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

export type SpeechNeighbors = {
    talking: boolean;
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
): SpeechNeighbors {
    let previousEnd = -Infinity;
    let nextStart = Infinity;

    for (const interval of intervals) {
        if (time < interval.start) {
            nextStart = interval.start;
            break;
        }

        if (time <= interval.end) {
            return { talking: true, previousEnd, nextStart: interval.start };
        }

        previousEnd = interval.end;
    }

    return { talking: false, previousEnd, nextStart };
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
    intervals: TimedInterval[],
    config: SpeedCurveConfig,
) {
    if (intervals.length === 0) {
        return config.talkingSpeed;
    }

    const { talking, previousEnd, nextStart } = findSpeechNeighbors(
        time,
        intervals,
    );

    if (talking) {
        return config.talkingSpeed;
    }

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
    intervals: TimedInterval[],
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
