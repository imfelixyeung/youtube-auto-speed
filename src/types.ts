export type AutoSpeedCaptionsEvent = CustomEvent<{
    url: string;
    data: TimedText;
}>;

export type AutoSpeedConfigChangedEvent = CustomEvent<{
    enabled: boolean;
}>;

export type TimedTextEventItem = {
    tStartMs: number;
    dDurationMs: number;
    segs?: { utf8: string }[];
};
export type TimedText = {
    events: TimedTextEventItem[];
};
