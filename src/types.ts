import type { VideoData } from "./schemas/video-data";

export type AutoSpeedConfig = {
    enabled: boolean;
    alwaysShowChart: boolean;
    rampDurationSeconds: number;
    talkingSpeed: number;
    silentSpeed: number;
    smartSkipSpeed: number;
    filterSquareBrackets: boolean;
    filterParentheses: boolean;
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
