import {
    computeSpeedAtTime,
    type TimedIntervalWithSpeed,
} from "../speed-curve";
import type { AutoSpeedConfig } from "../types";

export abstract class AbstractController {
    protected getVideo: () => HTMLVideoElement | null;
    protected getConfig: () => AutoSpeedConfig;
    protected getIntervals: () => TimedIntervalWithSpeed[];
    protected onApplied: (value: number) => void;

    constructor(props: {
        getVideo: () => HTMLVideoElement | null;
        getConfig: () => AutoSpeedConfig;
        getIntervals: () => TimedIntervalWithSpeed[];
        onApplied: (rounded: number) => void;
    }) {
        this.getVideo = props.getVideo;
        this.getConfig = props.getConfig;
        this.getIntervals = props.getIntervals;
        this.onApplied = props.onApplied;
    }

    public abstract set(value: number): void;

    public reset(): void {}

    public update() {
        const video = this.getVideo();
        const config = this.getConfig();

        if (!config.enabled || !video) {
            return;
        }

        if (video.paused || video.ended) {
            this.reset();
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
