import { computeValueAtTime, type TimedIntervalWithNumberData } from "../curve";
import type { AutoSpeedConfig } from "../types";

export abstract class AbstractController {
    protected getVideo: () => HTMLVideoElement | null;
    protected getConfig: () => AutoSpeedConfig;
    protected getIntervals: () => TimedIntervalWithNumberData[];
    protected onApplied: (
        value: number,
        interval: TimedIntervalWithNumberData | null,
    ) => void;
    private oldIntervalData: TimedIntervalWithNumberData["data"] | null = null;

    constructor(props: {
        getVideo: () => HTMLVideoElement | null;
        getConfig: () => AutoSpeedConfig;
        getIntervals: () => TimedIntervalWithNumberData[];
        onApplied: (
            value: number,
            interval: TimedIntervalWithNumberData | null,
        ) => void;
    }) {
        this.getVideo = props.getVideo;
        this.getConfig = props.getConfig;
        this.getIntervals = props.getIntervals;
        this.onApplied = props.onApplied;
    }

    public abstract set(
        value: number,
        interval: TimedIntervalWithNumberData | null,
    ): void;

    protected reset(): void {}

    protected compute(): [number, TimedIntervalWithNumberData | null] {
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
        this.set(...desired);
    }

    protected updateAndCheckIsNewIntervalData(
        data: TimedIntervalWithNumberData["data"],
    ) {
        if (this.oldIntervalData === data) return true;
        this.oldIntervalData = data;
        return false;
    }
}
