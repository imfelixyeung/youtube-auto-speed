import {
    computeValueAtTime,
    type TimedIntervalWithNumberValue,
} from "../speed-curve";
import type { AutoSpeedConfig } from "../types";

export abstract class AbstractController {
    protected getVideo: () => HTMLVideoElement | null;
    protected getConfig: () => AutoSpeedConfig;
    protected getIntervals: () => TimedIntervalWithNumberValue[];
    protected onApplied: (value: number) => void;

    constructor(props: {
        getVideo: () => HTMLVideoElement | null;
        getConfig: () => AutoSpeedConfig;
        getIntervals: () => TimedIntervalWithNumberValue[];
        onApplied: (rounded: number) => void;
    }) {
        this.getVideo = props.getVideo;
        this.getConfig = props.getConfig;
        this.getIntervals = props.getIntervals;
        this.onApplied = props.onApplied;
    }

    public abstract set(value: number): void;

    protected reset(): void {}

    protected compute(): number {
        const config = this.getConfig();
        return computeValueAtTime(
            this.getVideo()?.currentTime ?? 0,
            this.getIntervals(),
            {
                fallback: config.talkingSpeed,
                rampDuration: config.rampDurationSeconds,
                easingFn: config.easingFunction.fn,
            },
        );
    }

    public update() {
        const video = this.getVideo();
        const config = this.getConfig();

        if (!config.enabled || !video) return;

        if (video.paused || video.ended) {
            this.reset();
            return;
        }

        const desired = this.compute();
        this.set(desired);
    }
}
