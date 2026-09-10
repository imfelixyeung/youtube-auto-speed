import type {
    AutoSpeedCaptionsEvent,
    AutoSpeedConfigChangedEvent,
    TimedText,
} from "./types";

type CaptionInterval = {
    start: number;
    end: number;
};
type State =
    | "talking"
    | "silent"
    | "normal"
    | "about-to-talk"
    | "finished-talking";
const stateToSpeed: Record<State, number> = {
    talking: 1.0,
    silent: 1.5,
    normal: 1.0,
    "about-to-talk": 1.0,
    "finished-talking": 1.25,
};

(() => {
    const STORAGE_KEY = "enabled";

    let video: HTMLVideoElement | null = null;

    let enabled = true;

    let captionIntervals: CaptionInterval[] = [];

    let currentState: State = "normal";

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    function findVideo() {
        return document.querySelector(
            "video.html5-main-video, video",
        ) as HTMLVideoElement;
    }

    function setSpeed(speed: number) {
        if (!video) {
            return;
        }

        if (video.playbackRate === speed) {
            return;
        }

        video.playbackRate = speed;

        log(`Playback speed: ${speed}x`);
    }

    function processCaptionData(data: TimedText | null) {
        if (!data || !Array.isArray(data.events)) {
            return;
        }

        const intervals = [];

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

            // Ignore empty caption events.
            const text = event.segs
                .map((seg) => seg.utf8 || "")
                .join("")
                .trim();

            if (!text) {
                continue;
            }

            intervals.push({
                start,
                end,
                text,
            });
        }

        // Sort by start time.
        intervals.sort((a, b) => a.start - b.start);

        captionIntervals = mergeIntervals(intervals);

        log(`Loaded ${captionIntervals.length} caption intervals`);

        log(captionIntervals.slice(0, 10));
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
    function mergeIntervals(intervals: CaptionInterval[]) {
        if (intervals.length === 0) {
            return [];
        }

        const merged = [];

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

    function isTalking(time: number) {
        const intervals = captionIntervals;

        if (intervals.length === 0) {
            return false;
        }

        // Binary search would be better for huge transcripts.
        // This version is intentionally simple.
        for (const interval of intervals) {
            if (time < interval.start) {
                return false;
            }

            if (time >= interval.start && time <= interval.end) {
                return true;
            }
        }

        return false;
    }

    function setState(state: State) {
        if (state === currentState) {
            return;
        }

        currentState = state;

        const speed = stateToSpeed[currentState];
        setSpeed(speed);
    }

    function updateSpeed() {
        if (!enabled || !video) {
            return;
        }

        if (video.paused || video.ended) {
            setState("normal");

            return;
        }

        const talking = isTalking(video.currentTime);

        if (talking) {
            return setState("talking");
        }

        const GAP = 0.5;

        if (isTalking(video.currentTime - GAP)) {
            return setState("finished-talking");
        }
        if (isTalking(video.currentTime + GAP)) {
            return setState("about-to-talk");
        }

        setState("silent");
    }

    function tick() {
        updateSpeed();

        requestAnimationFrame(tick);
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        log("Video attached");

        video = newVideo;

        setState("normal");

        video.addEventListener("play", updateSpeed);
        video.addEventListener("playing", updateSpeed);

        video.addEventListener("pause", () => {
            setState("normal");
        });

        video.addEventListener("ended", () => {
            setState("normal");
        });

        video.addEventListener("seeked", updateSpeed);
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
        }
    }

    function propagateConfig() {
        const event = new CustomEvent<AutoSpeedConfigChangedEvent["detail"]>(
            "AUTO_SPEED_CONFIG_CHANGED",
            {
                detail: {
                    enabled,
                },
            },
        );

        window.dispatchEvent(event);
    }

    function setEnabled(value: boolean) {
        if (value === enabled) {
            return;
        }

        enabled = value;

        propagateConfig();

        if (enabled) {
            updateSpeed();
        } else {
            // Restore normal playback speed when disabled.
            currentState = "normal";
            setSpeed(1.0);
        }

        log(`Auto speed ${enabled ? "enabled" : "disabled"}`);
    }

    window.addEventListener("AUTO_SPEED_CAPTIONS", (event) => {
        const data = (event as AutoSpeedCaptionsEvent).detail?.data;

        if (!data || !enabled) {
            return;
        }

        processCaptionData(data);

        // Immediately recalculate because a new caption track
        // probably means a new video or language.
        updateSpeed();
    });

    const pageObserver = new MutationObserver(() => {
        checkForVideo();
    });

    pageObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    checkForVideo();

    requestAnimationFrame(tick);

    chrome.storage.sync.get(STORAGE_KEY, (result) => {
        const stored = result[STORAGE_KEY];

        if (typeof stored === "boolean") {
            setEnabled(stored);
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
            return;
        }

        const change = changes[STORAGE_KEY];

        if (change && typeof change.newValue === "boolean") {
            setEnabled(change.newValue);
        }
    });

    log("Initialized");
})();
