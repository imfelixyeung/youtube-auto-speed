import { easeLinear } from "d3-ease";
import { REDACT_RAMP_DURATION } from "../constants";
import { computeValueAtTime, type TimedIntervalWithNumberData } from "../curve";
import { AbstractController } from ".";

export class VolumeController extends AbstractController {
    public set(
        value: number,
        interval: TimedIntervalWithNumberData | null = null,
    ) {
        const video = this.getVideo();
        if (!video) return;
        if (
            video.volume === value &&
            interval &&
            this.updateAndCheckIsNewIntervalData(interval?.data)
        )
            return;

        video.volume = value;
        this.onApplied(value, interval);
    }

    protected reset(): void {
        this.set(1);
    }

    protected compute(): [number, TimedIntervalWithNumberData | null] {
        return computeValueAtTime(
            this.getVideo()?.currentTime ?? 0,
            this.getIntervals(),
            {
                fallback: 1,
                rampDuration: REDACT_RAMP_DURATION,
                easingFn: easeLinear,
            },
        );
    }
}
