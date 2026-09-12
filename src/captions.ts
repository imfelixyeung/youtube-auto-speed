import type { TimedInterval } from "./speedCurve";
import type { TimedText } from "./types";

/**
 * Merge overlapping / very-near caption intervals.
 *
 * This prevents:
 *
 * 10.0 - 10.5
 * 10.5 - 11.2
 *
 * becoming two separate speech periods.
 */
export function mergeIntervals(intervals: TimedInterval[]): TimedInterval[] {
    if (intervals.length === 0) {
        return [];
    }

    const merged: TimedInterval[] = [];

    const GAP_TO_MERGE = 0.05;

    for (const interval of intervals) {
        const previous = merged[merged.length - 1];

        if (previous && interval.start <= previous.end + GAP_TO_MERGE) {
            previous.end = Math.max(previous.end, interval.end);
        } else {
            merged.push({
                start: interval.start,
                end: interval.end,
            });
        }
    }

    return merged;
}

/**
 * Non-speech caption fragments (labels, markers, etc.) that are
 * stripped out of caption text before deciding whether it contains
 * speech. To add a new label, append a regex here.
 */
const NON_SPEECH_PATTERNS: RegExp[] = [
    /\[music\]/gi,
    /\[applause\]/gi,
    /\[laughter\]/gi,
    />/g,
];

function isNonSpeech(text: string): boolean {
    const remaining = NON_SPEECH_PATTERNS.reduce(
        (result, pattern) => result.replace(pattern, ""),
        text,
    );

    return remaining.trim() === "";
}

/**
 * Convert raw timedtext events into a sorted list of merged speech
 * intervals (in seconds). Empty and non-speech caption events are
 * ignored.
 */
export function captionsToIntervals(data: TimedText | null): TimedInterval[] {
    if (!data || !Array.isArray(data.events)) {
        return [];
    }

    const intervals: TimedInterval[] = [];

    for (const event of data.events) {
        if (!Array.isArray(event.segs)) {
            continue;
        }

        if (!Number.isFinite(event.tStartMs)) {
            continue;
        }

        if (!Number.isFinite(event.dDurationMs)) {
            continue;
        }

        const start = event.tStartMs / 1000;

        const end = (event.tStartMs + event.dDurationMs) / 1000;

        const text = event.segs.map((seg) => seg.utf8 ?? "").join("");

        if (!text.trim() || isNonSpeech(text)) {
            continue;
        }

        intervals.push({
            start,
            end,
        });
    }

    // Sort by start time.
    intervals.sort((a, b) => a.start - b.start);

    return mergeIntervals(intervals);
}
