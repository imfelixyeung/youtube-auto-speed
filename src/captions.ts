import { CacheStore } from "./cache/store";
import { REDACT_PADDING } from "./constants";
import type { TimedInterval } from "./curve";
import type { TimedText, TimedTextEventItem } from "./types";

const TIMED_TEXT_CACHE = new CacheStore<TimedText>({ size: 20 });

export function cacheTimedText(videoId: string, data: TimedText) {
    return TIMED_TEXT_CACHE.set(videoId, data);
}

export function getCachedTimedText(videoId: string): TimedText | null {
    return TIMED_TEXT_CACHE.get(videoId);
}

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
 * Which non-speech caption fragments (labels, markers, etc.) to strip out
 * of caption text before deciding whether it contains speech.
 */
export type NonSpeechOptions = {
    filterSquareBrackets: boolean;
    filterParentheses: boolean;
};

const DEFAULT_NON_SPEECH_OPTIONS: NonSpeechOptions = {
    filterSquareBrackets: true,
    filterParentheses: false,
};

/**
 * "> " sign-along caption markers that never count as speech, regardless of
 * the toggleable bracket filters.
 */
const MARKER_PATTERN = />/g;

function stripNonSpeech(text: string, options: NonSpeechOptions): string {
    let remaining = text;

    if (options.filterSquareBrackets) {
        remaining = remaining.replace(/\[.*?\]/g, "");
    }

    if (options.filterParentheses) {
        remaining = remaining.replace(/\(.*?\)/g, "");
    }

    return remaining.replace(MARKER_PATTERN, "");
}

function isNonSpeech(text: string, options: NonSpeechOptions): boolean {
    return stripNonSpeech(text, options).trim() === "";
}

function invert(data: TimedInterval[], duration: number): TimedInterval[] {
    const result: TimedInterval[] = [];
    let lastEnd = 0;

    for (const interval of data) {
        if (lastEnd !== interval.end) {
            result.push({
                start: lastEnd,
                end: interval.start,
            });
        }
        lastEnd = interval.end;
        if (lastEnd > duration) {
            lastEnd = duration;
            break;
        }
    }

    result.push({
        start: lastEnd,
        end: duration,
    });

    return result;
}

/**
 * Convert raw timedtext events into a sorted list of merged speech
 * intervals (in seconds). Empty and non-speech caption events are
 * ignored.
 */
export function _captionsToIntervals(
    data: TimedText | null,
    options: NonSpeechOptions = DEFAULT_NON_SPEECH_OPTIONS,
): TimedInterval[] {
    if (!data || !Array.isArray(data.events)) {
        return [];
    }

    const intervals: TimedInterval[] = [];

    for (const event of data.events) {
        if (!isValidEvent(event)) {
            continue;
        }

        const text = event.segs
            .map((seg) => seg.utf8 ?? "")
            .filter((seg) => seg?.trim() && !isNonSpeech(seg, options))
            .join("");

        if (!text.trim() || isNonSpeech(text, options)) {
            continue;
        }

        const last = event.segs[event.segs.length - 1];
        const start = event.tStartMs / 1000;
        const eventEnd = (event.tStartMs + event.dDurationMs) / 1000;
        const segDuration = 1.5; // Assumption.
        const end = last?.tOffsetMs
            ? Math.min(start + last.tOffsetMs / 1000 + segDuration, eventEnd)
            : eventEnd;

        intervals.push({
            start,
            end,
        });
    }

    // Sort by start time.
    intervals.sort((a, b) => a.start - b.start);

    return mergeIntervals(intervals);
}

/**
 * Convert raw timedtext events into a sorted list of merged speech
 * intervals (in seconds). Empty and non-speech caption events are
 * ignored.
 */
export function captionsToSilentIntervals(
    data: TimedText | null,
    duration: number,
    options: NonSpeechOptions = DEFAULT_NON_SPEECH_OPTIONS,
): TimedInterval[] {
    return invert(
        mergeIntervals(_captionsToIntervals(data, options)),
        duration,
    );
}

function shouldRedact(text: string) {
    return text.includes("[ __ ]");
}

export function captionsToRedactedIntervals(data: TimedText): TimedInterval[] {
    const intervals: TimedInterval[] = [];

    if (!data || !Array.isArray(data.events)) {
        return [];
    }

    data.events.forEach((event) => {
        if (!isValidEvent(event)) {
            return;
        }
        const { segs } = event;

        segs.forEach((seg, i, segs) => {
            const redact = shouldRedact(seg.utf8);
            if (!redact) {
                return;
            }
            const start = event.tStartMs + (seg.tOffsetMs ?? 0);
            const nextSeg = segs[i + 1];
            const end = nextSeg?.tOffsetMs
                ? event.tStartMs + nextSeg?.tOffsetMs
                : event.tStartMs + event.dDurationMs;

            // Add, convert to seconds and add margin.
            intervals.push({
                start: start / 1000 - REDACT_PADDING,
                end: end / 1000 + REDACT_PADDING,
            });
        });
    });

    // Sort by start time.
    intervals.sort((a, b) => a.start - b.start);
    return mergeIntervals(intervals);
}

function isValidEvent(event: TimedTextEventItem | undefined): event is Omit<
    TimedTextEventItem,
    "segs"
> & {
    segs: NonNullable<TimedTextEventItem["segs"]>;
} {
    if (event === undefined) return false;
    if (!Array.isArray(event.segs)) return false;
    if (!Number.isFinite(event.tStartMs)) return false;
    if (!Number.isFinite(event.dDurationMs)) return false;
    return true;
}
