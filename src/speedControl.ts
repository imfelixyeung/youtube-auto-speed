import { SPEED_STEP } from "./config";
import {
    computeSpeedAtTime,
    easeInOutCubic,
    type TimedInterval,
} from "./speedCurve";
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
    getIntervals: () => TimedInterval[];
    onRateApplied: (rounded: number) => void;
    log: (...args: unknown[]) => void;
}): SpeedControl {
    const { getVideo, getConfig, getIntervals, onRateApplied, log } = opts;

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

        log(`Playback speed: ${rounded}x`);
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
            talkingSpeed: config.talkingSpeed,
            silentSpeed: config.silentSpeed,
            rampDurationSeconds: config.rampDurationSeconds,
            easing: easeInOutCubic,
        });

        set(desired);
    }

    return {
        set,
        update,
    };
}
