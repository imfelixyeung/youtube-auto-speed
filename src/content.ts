type State = "talking" | "silent" | "normal";

(() => {
    const NORMAL_SPEED = 1.0;
    const FAST_SPEED = 2.0;

    // How long we wait before speeding up after a caption disappears.
    // This prevents tiny gaps between caption cues from causing constant
    // speed changes.
    const SILENCE_DELAY_MS = 250;

    let video: HTMLVideoElement | null = null;
    let captionObserver: MutationObserver | null = null;
    let silenceTimer: number | null = null;

    let currentState: State = "normal";

    function log(...args: unknown[]) {
        console.debug("[Auto Speed]", ...args);
    }

    function findVideo() {
        return document.querySelector(
            "video.html5-main-video, video",
        ) as HTMLVideoElement;
    }

    /**
     * Returns true when YouTube currently has a caption displayed.
     *
     * YouTube creates .ytp-caption-segment elements while a caption cue
     * is being displayed and removes them when the cue ends.
     */
    function hasActiveCaption() {
        const captions = document.querySelectorAll(".ytp-caption-segment");

        for (const caption of captions) {
            const text = caption.textContent?.trim();

            if (text) {
                return true;
            }
        }

        return false;
    }

    function setSpeed(speed: number) {
        if (!video) return;

        if (video.playbackRate === speed) {
            return;
        }

        video.playbackRate = speed;

        log(`Playback speed: ${speed}x`);
    }

    function setState(state: State) {
        if (currentState === state) {
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
        if (!video) return;

        // Don't interfere while the video isn't actually playing.
        if (video.paused || video.ended) {
            return;
        }

        if (hasActiveCaption()) {
            silenceTimer && clearTimeout(silenceTimer);
            silenceTimer = null;

            setState("talking");
            return;
        }

        // Give the next caption a small grace period.
        silenceTimer && clearTimeout(silenceTimer);

        silenceTimer = setTimeout(() => {
            if (!video || video.paused || video.ended) {
                return;
            }

            if (hasActiveCaption()) {
                setState("talking");
            } else {
                setState("silent");
            }
        }, SILENCE_DELAY_MS);
    }

    function observeCaptions() {
        if (captionObserver) {
            captionObserver.disconnect();
        }

        captionObserver = new MutationObserver(() => {
            updateSpeed();
        });

        // The caption window itself may not exist when we start,
        // so observe the whole player/document.
        captionObserver.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
        });
    }

    function attachVideo(newVideo: HTMLVideoElement) {
        if (!newVideo || newVideo === video) {
            return;
        }

        log("New video detected");

        video = newVideo;

        silenceTimer && clearTimeout(silenceTimer);
        silenceTimer = null;

        currentState = "normal";

        // Start at normal speed.
        setSpeed(NORMAL_SPEED);

        // React immediately when playback state changes.
        video.addEventListener("play", updateSpeed);
        video.addEventListener("playing", updateSpeed);
        video.addEventListener("pause", () => {
            silenceTimer && clearTimeout(silenceTimer);
            setSpeed(NORMAL_SPEED);
            currentState = "normal";
        });

        video.addEventListener("ended", () => {
            silenceTimer && clearTimeout(silenceTimer);
            setSpeed(NORMAL_SPEED);
            currentState = "normal";
        });

        // Seeking can jump directly from talking -> silence or vice versa.
        video.addEventListener("seeked", updateSpeed);

        updateSpeed();
    }

    function checkForVideo() {
        const newVideo = findVideo();

        if (newVideo && newVideo !== video) {
            attachVideo(newVideo);
        }
    }

    /**
     * YouTube is a single-page application.
     *
     * Navigating from:
     *   /watch?v=AAA
     *
     * to:
     *   /watch?v=BBB
     *
     * does not reload the page.
     *
     * Watching the DOM lets us detect those transitions.
     */
    const pageObserver = new MutationObserver(() => {
        checkForVideo();
    });

    pageObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    // Caption changes.
    observeCaptions();

    // Initial video.
    checkForVideo();

    // Extra safety for YouTube's dynamic player replacement.
    setInterval(checkForVideo, 1000);

    log("Initialized");
})();
