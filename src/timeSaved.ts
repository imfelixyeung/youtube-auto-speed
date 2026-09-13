import type { SpeedPoint } from "./speedCurve";

/**
 * Wall-clock time "saved" by playing `elapsedMediaSeconds` of media at
 * `playbackRate` instead of 1x: playing at rate `r` for `t` media seconds
 * takes `t / r` real seconds, so the saving is `t - t / r`.
 *
 * At 1x this is 0, above 1x it is positive, and below 1x it is negative
 * (the video runs slower than real time).
 */
export function timeSavedForElapsed(
    elapsedMediaSeconds: number,
    playbackRate: number,
): number {
    if (playbackRate <= 0) {
        return 0;
    }

    return elapsedMediaSeconds * (1 - 1 / playbackRate);
}

export type TimeSavedPoint = {
    time: number;
    /** Cumulative seconds saved (vs 1x) when the playhead has reached `time`. */
    saved: number;
};

/**
 * One-pass integration of a sampled speed curve into a cumulative
 * time-saved curve.
 *
 * For each segment `dt` between consecutive samples played at rate `r` the
 * saving is `dt * (1 - 1 / r)`, so `saved(i)` is the running total over the
 * whole segment `[0, t(i)]`. Flat talking/silent stretches integrate exactly;
 * ramps are approximated by trapezoids over the samples.
 *
 * This is the only integration done — call it once per captions/config
 * change, then turn lookups into `timeSavedAt`.
 */
export function cumulativeTimeSaved(points: SpeedPoint[]): TimeSavedPoint[] {
    const out: TimeSavedPoint[] = [];
    let total = 0;

    for (let i = 0; i < points.length; i++) {
        const point = points[i];

        if (!point) {
            continue;
        }

        if (i > 0) {
            const previous = points[i - 1];

            if (previous) {
                const dt = point.time - previous.time;

                total +=
                    (timeSavedForElapsed(dt, previous.speed) +
                        timeSavedForElapsed(dt, point.speed)) /
                    2;
            }
        }

        out.push({ time: point.time, saved: total });
    }

    return out;
}

/**
 * Look up cumulative time saved at an arbitrary media time without scanning
 * the whole curve: binary search the closest surrounding samples and linearly
 * interpolate between them. Values outside the sampled range clamp to the
 * curve's endpoints.
 */
export function timeSavedAt(points: TimeSavedPoint[], time: number): number {
    if (points.length === 0) {
        return 0;
    }

    const first = points[0];
    const last = points[points.length - 1];

    if (!first || !last) {
        return 0;
    }

    if (time <= first.time) {
        return first.saved;
    }

    if (time >= last.time) {
        return last.saved;
    }

    let low = 0;
    let high = points.length - 1;
    let found = -1;

    while (low <= high) {
        const mid = (low + high) >> 1;
        const point = points[mid];

        if (point && point.time <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const left = found >= 0 ? points[found] : first;
    const right = found + 1 < points.length ? points[found + 1] : last;

    if (!left || !right) {
        return 0;
    }

    const span = right.time - left.time;

    if (span <= 0) {
        return left.saved;
    }

    const fraction = (time - left.time) / span;

    return left.saved + fraction * (right.saved - left.saved);
}

/**
 * Human-readable rendering of accumulated time saved, clamped at 0 (times run
 * below 1x don't show a negative saving).
 */
export function formatTimeSaved(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));

    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;

    if (minutes < 60) {
        return restSeconds === 0
            ? `${minutes}m`
            : `${minutes}m ${restSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}

/**
 * Combined status label: cumulative seconds saved so far alongside the total
 * expected saving for the whole video, e.g. `"2m 15s / 5m 24s"`.
 */
export function formatTimeSavedRatio(
    cumulativeSeconds: number,
    totalSeconds: number,
): string {
    return `${formatTimeSaved(cumulativeSeconds)} / ${formatTimeSaved(totalSeconds)}`;
}
