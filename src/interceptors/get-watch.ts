import { z } from "zod";
import { type VideoData, videoDataSchema } from "../schemas/video-data";
import type { AutoSpeedVideoDataEvent } from "../types";
import { Interceptor } from "./_interceptor";

const ENDPOINT = "/youtubei/v1/get_watch";

const responseSchema = z.object({
    watchNextResponse: videoDataSchema,
    responseType: z.literal(
        "STREAMING_WATCH_RESPONSE_TYPE_WATCH_NEXT_RESPONSE",
    ),
});

const schema = z.array(z.union([responseSchema, z.object()]));

export class GetWatchInterceptor extends Interceptor {
    public name: string = "get-watch";
    private static data: VideoData | null = null;

    public init(): void {
        const handleInitialData = () => {
            videoDataSchema
                .parseAsync((window as any).ytInitialData)
                .then(GetWatchInterceptor.handleVideoData)
                .catch(() => null);
        };
        document.addEventListener("DOMContentLoaded", handleInitialData);

        // Emit the video data every second.
        setInterval(() => {
            if (!GetWatchInterceptor.data) return;
            window.dispatchEvent(
                new CustomEvent("AUTO_SPEED_GET_WATCH", {
                    detail: {
                        videoId:
                            GetWatchInterceptor.data.currentVideoEndpoint
                                .watchEndpoint.videoId,
                        data: GetWatchInterceptor.data,
                    } satisfies AutoSpeedVideoDataEvent["detail"],
                }),
            );
        }, 1_000);
    }

    public match(url: string): boolean {
        try {
            const absoluteUrl = new URL(url, window.location.href);
            return absoluteUrl.pathname === ENDPOINT;
        } catch {
            return false;
        }
    }

    public async handle(_url: string, text: string): Promise<void> {
        try {
            const json = JSON.parse(text);
            const parsed = await schema.safeParseAsync(json);
            if (!parsed.success) {
                return this.log("Error parsing", parsed.error);
            }

            const { data } = parsed;

            const videosData = data.filter(
                (d) =>
                    d.responseType ===
                    "STREAMING_WATCH_RESPONSE_TYPE_WATCH_NEXT_RESPONSE",
            );

            videosData.forEach(
                (d) =>
                    void GetWatchInterceptor.handleVideoData(
                        d.watchNextResponse,
                    ),
            );
        } catch (error) {
            this.log("Error handling", error);
        }
    }

    public static handleVideoData(videoData: VideoData) {
        GetWatchInterceptor.data = videoData;
    }
}
