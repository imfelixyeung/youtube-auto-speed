import type { TimedInterval } from "./curve";
import type { VideoData } from "./schemas/video-data";

export type SmartSkipIntervals = TimedInterval[];

const SMART_SKIP_CACHE = new Map<string, SmartSkipIntervals>();
const MAX_CACHED_VIDEOS = 20;

export function cacheSmartSkips(videoId: string, data: SmartSkipIntervals) {
    // Re-insert so the most-recently-used entry sits at the end.
    SMART_SKIP_CACHE.delete(videoId);
    SMART_SKIP_CACHE.set(videoId, data);

    if (SMART_SKIP_CACHE.size <= MAX_CACHED_VIDEOS) {
        return;
    }
    const oldest = SMART_SKIP_CACHE.keys().next().value;

    if (oldest === undefined) {
        return;
    }

    SMART_SKIP_CACHE.delete(oldest);
}

export function getCachedSmartSkips(
    videoId: string,
): SmartSkipIntervals | null {
    const data = SMART_SKIP_CACHE.get(videoId);

    if (data) {
        SMART_SKIP_CACHE.delete(videoId);
        SMART_SKIP_CACHE.set(videoId, data);
    }

    return data ?? null;
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
