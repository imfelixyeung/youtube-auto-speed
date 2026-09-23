import { CacheStore } from "./cache/store";
import type { VideoData } from "./schemas/video-data";
import type { TimedInterval } from "./speed-curve";

export type SmartSkipIntervals = TimedInterval[];

const SMART_SKIP_CACHE = new CacheStore<SmartSkipIntervals>({ size: 20 });

export function cacheSmartSkips(videoId: string, data: SmartSkipIntervals) {
    SMART_SKIP_CACHE.set(videoId, data);
}

export function getCachedSmartSkips(
    videoId: string,
): SmartSkipIntervals | null {
    return SMART_SKIP_CACHE.get(videoId);
}

export function parseFromVideoData(data: VideoData) {
    return data.playerOverlays.playerOverlayRenderer.timelyActionsOverlayViewModel.timelyActionsOverlayViewModel.timelyActions.map(
        (timings) => ({
            start:
                timings.timelyActionViewModel.smartSkipMetadata.loggingData
                    .startMilliseconds / 1000,
            end:
                timings.timelyActionViewModel.smartSkipMetadata.loggingData
                    .endMilliseconds / 1000,
        }),
    );
}
