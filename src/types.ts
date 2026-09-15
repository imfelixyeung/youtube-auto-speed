export type AutoSpeedConfig = {
    enabled: boolean;
    rampDurationSeconds: number;
    talkingSpeed: number;
    silentSpeed: number;
    filterSquareBrackets: boolean;
    filterParentheses: boolean;
};

export type AutoSpeedCaptionsEvent = CustomEvent<{
    videoId: string;
    url: string;
    data: TimedText;
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
