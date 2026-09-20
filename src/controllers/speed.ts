import { SPEED_STEP } from "../config";
import {
    computeSpeedAtTime,
    type TimedIntervalWithSpeed,
} from "../speed-curve";
import type { AutoSpeedConfig } from "../types";

function roundToNearest05(value: number) {
    return Math.round(value / SPEED_STEP) * SPEED_STEP;
}

export class SpeedController {
    private getVideo: () => HTMLVideoElement | null;
    private getConfig: () => AutoSpeedConfig;
    private getIntervals: () => TimedIntervalWithSpeed[];
    private onRateApplied: (rounded: number) => void;

    constructor(props: {
        getVideo: () => HTMLVideoElement | null;
        getConfig: () => AutoSpeedConfig;
        getIntervals: () => TimedIntervalWithSpeed[];
        onRateApplied: (rounded: number) => void;
    }) {
        this.getVideo = props.getVideo;
        this.getConfig = props.getConfig;
        this.getIntervals = props.getIntervals;
        this.onRateApplied = props.onRateApplied;
    }

    public set(rate: number) {
        const video = this.getVideo();

        if (!video) {
            return;
        }

        const rounded = roundToNearest05(rate);

        if (video.playbackRate === rounded) {
            return;
        }

        video.playbackRate = rounded;
        this.onRateApplied(rounded);
    }

    public update() {
        const video = this.getVideo();
        const config = this.getConfig();

        if (!config.enabled || !video) {
            return;
        }

        if (video.paused || video.ended) {
            this.set(1);

            return;
        }

        const desired = computeSpeedAtTime(
            video.currentTime,
            this.getIntervals(),
            {
                fallbackSpeed: config.talkingSpeed,
                rampDuration: config.rampDurationSeconds,
                easingFn: config.easingFunction.fn,
            },
        );

        this.set(desired);
    }
}
