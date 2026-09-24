import { SPEED_STEP } from "../config";
import type { TimedIntervalWithNumberData } from "../curve";
import { AbstractController } from ".";

function roundToNearest05(value: number) {
    return Math.round(value / SPEED_STEP) * SPEED_STEP;
}

export class SpeedController extends AbstractController {
    public set(
        rate: number,
        interval: TimedIntervalWithNumberData | null = null,
    ) {
        const video = this.getVideo();
        if (!video) return;

        const rounded = roundToNearest05(rate);
        if (
            video.playbackRate === rounded &&
            interval &&
            this.updateAndCheckIsNewIntervalData(interval?.data)
        )
            return;

        video.playbackRate = rounded;
        this.onApplied(rounded, interval);
    }

    public reset(): void {
        this.set(1);
    }
}
