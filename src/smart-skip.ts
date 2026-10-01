import { CacheStore } from "./cache/store";
import type { VideoData } from "./schemas/video-data";
import { TimedInterval } from "./timed-interval";

export type SmartSkipIntervals = TimedInterval[];

export const SMART_SKIP_CACHE = new CacheStore<SmartSkipIntervals>({
    size: 20,
});

export function parseFromVideoData(data: VideoData): TimedInterval[] {
    return data.playerOverlays.playerOverlayRenderer.timelyActionsOverlayViewModel.timelyActionsOverlayViewModel.timelyActions.map(
        (timings) =>
            new TimedInterval(
                timings.timelyActionViewModel.smartSkipMetadata.loggingData
                    .startMilliseconds / 1000,
                timings.timelyActionViewModel.smartSkipMetadata.loggingData
                    .endMilliseconds / 1000,
            ),
    );
}
