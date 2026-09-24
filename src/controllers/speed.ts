import { SPEED_STEP } from "../config";
import { AbstractController } from ".";

function roundToNearest05(value: number) {
    return Math.round(value / SPEED_STEP) * SPEED_STEP;
}

export class SpeedController extends AbstractController {
    public set(rate: number) {
        const video = this.getVideo();
        if (!video) return;

        const rounded = roundToNearest05(rate);
        if (video.playbackRate === rounded) return;

        video.playbackRate = rounded;
        this.onApplied(rounded);
    }

    public reset(): void {
        this.set(1);
    }
}
