import type { VideoData } from "./schemas/video-data";

export type EasingFunction = (v: number) => number;

export const autoSpeedConfigSpeedKeys = [
    "talkingSpeed",
    "boostSpeed",
    "silentSpeed",
    "smartSkipSpeed",
    "skipSegmentsSpeed",
] as const;
export type AutoSpeedConfigSpeedKey = (typeof autoSpeedConfigSpeedKeys)[number];

export type AutoSpeedConfig = {
    enabled: boolean;
    alwaysShowChart: boolean;
    rampDurationSeconds: number;
    boostAt: number;
    filterSquareBrackets: boolean;
    filterParentheses: boolean;
    easingFunction: { value: string; fn: EasingFunction };
} & {
    [key in AutoSpeedConfigSpeedKey]: number;
};

export type AutoSpeedCaptionsEvent = CustomEvent<{
    videoId: string;
    url: string;
    data: TimedText;
}>;

export type AutoSpeedVideoDataEvent = CustomEvent<{
    videoId: string;
    data: VideoData;
}>;

export type AutoSpeedConfigChangedEvent = CustomEvent<{
    enabled: boolean;
}>;

export type TimedTextEventItem = {
    tStartMs: number;
    dDurationMs: number;
    segs?: { utf8: string; tOffsetMs?: number }[];
};
export type TimedText = {
    events: TimedTextEventItem[];
};
