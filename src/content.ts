import type { AutoSpeedCaptionsEvent, TimedText } from "./types";

type CaptionInterval = {
    start: number;
    end: number;
};
type State = "talking" | "silent" | "normal";

(() => {
    const NORMAL_SPEED = 1.0;
    const FAST_SPEED = 2.0;

    const SPEED_UP_DELAY_MS = 300;
    const SLOW_DOWN_DELAY_MS = 100;

    let video: HTMLVideoElement | null = null;

    let captionIntervals: CaptionInterval[] = [];

    let speedTimer: number | null = null;
    let currentState: State = "normal";

    let animationFrame: number | null = null;

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

        if (state === "talking") {
            setSpeed(NORMAL_SPEED);
        } else {
            setSpeed(FAST_SPEED);
        }
    }

    function updateSpeed() {
        if (!video) {
            return;
        }

        if (video.paused || video.ended) {
            speedTimer && clearTimeout(speedTimer);
            speedTimer = null;

            setSpeed(NORMAL_SPEED);
            currentState = "normal";

            return;
        }

        const talking = isTalking(video.currentTime);

        speedTimer && clearTimeout(speedTimer);
        speedTimer = null;

        if (talking) {
            if (currentState !== "talking") {
                speedTimer = setTimeout(() => {
                    setState("talking");
                }, SLOW_DOWN_DELAY_MS);
            }

            return;
        }

        if (currentState !== "silent") {
            speedTimer = setTimeout(() => {
                // Check again because a caption may have appeared
                // during the delay.
                if (!video || video.paused || video.ended) {
                    return;
                }

                if (!isTalking(video.currentTime)) {
                    setState("silent");
                }
            }, SPEED_UP_DELAY_MS);
        }
    }

    function tick() {
        updateSpeed();

        animationFrame = requestAnimationFrame(tick);
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        log("Video attached");

        video = newVideo;

        speedTimer && clearTimeout(speedTimer);
        speedTimer = null;

        currentState = "normal";

        setSpeed(NORMAL_SPEED);

        video.addEventListener("play", updateSpeed);
        video.addEventListener("playing", updateSpeed);

        video.addEventListener("pause", () => {
            speedTimer && clearTimeout(speedTimer);

            setSpeed(NORMAL_SPEED);
            currentState = "normal";
        });

        video.addEventListener("ended", () => {
            speedTimer && clearTimeout(speedTimer);

            setSpeed(NORMAL_SPEED);
            currentState = "normal";
        });

        video.addEventListener("seeked", updateSpeed);
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
        }
    }

    window.addEventListener("AUTO_SPEED_CAPTIONS", (event) => {
        const data = (event as AutoSpeedCaptionsEvent).detail?.data;

        if (!data) {
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

    animationFrame = requestAnimationFrame(tick);

    log("Initialized");
})();
