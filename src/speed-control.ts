import { SPEED_STEP } from "./config";
import { computeSpeedAtTime, type TimedIntervalWithSpeed } from "./speed-curve";
import type { AutoSpeedConfig } from "./types";

export type SpeedControl = {
    /**
     * Apply a desired playback rate to the video.
     */
    set: (rate: number) => void;
    /**
     * Recompute the desired rate for the current video time and apply it.
     */
    update: () => void;
};

export function createSpeedControl(opts: {
    getVideo: () => HTMLVideoElement | null;
    getConfig: () => AutoSpeedConfig;
    getIntervals: () => TimedIntervalWithSpeed[];
    onRateApplied: (rounded: number) => void;
}): SpeedControl {
    const { getVideo, getConfig, getIntervals, onRateApplied } = opts;

    function roundToNearest05(value: number) {
        return Math.round(value / SPEED_STEP) * SPEED_STEP;
    }

    function set(rate: number) {
        const video = getVideo();

        if (!video) {
            return;
        }

        const rounded = roundToNearest05(rate);

        if (video.playbackRate === rounded) {
            return;
        }

        video.playbackRate = rounded;
        onRateApplied(rounded);
    }

    function update() {
        const video = getVideo();
        const config = getConfig();

        if (!config.enabled || !video) {
            return;
        }

        if (video.paused || video.ended) {
            set(1);

            return;
        }

        const desired = computeSpeedAtTime(video.currentTime, getIntervals(), {
            fallbackSpeed: config.talkingSpeed,
            rampDuration: config.rampDurationSeconds,
            easingFn: config.easingFunction.fn,
        });

        set(desired);
    }

    return {
        set,
        update,
    };
}
