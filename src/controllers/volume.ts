import { easeLinear } from "d3-ease";
import { REDACT_RAMP_DURATION } from "../constants";
import { computeValueAtTime } from "../curve";
import { AbstractController } from ".";

export class VolumeController extends AbstractController {
    public set(value: number) {
        const video = this.getVideo();
        if (!video) return;
        if (video.volume === value) return;

        video.volume = value;
        this.onApplied(value);
    }

    protected reset(): void {
        this.set(1);
    }

    protected compute(): number {
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
