import { z } from "zod";
import { timestampSchema } from "./timestamps";

export const videoDataSchema = z.object({
    currentVideoEndpoint: z.object({
        watchEndpoint: z.object({ videoId: z.string() }),
    }),
    playerOverlays: z.object({
        playerOverlayRenderer: z.object({
            timelyActionsOverlayViewModel: z.object({
                timelyActionsOverlayViewModel: z.object({
                    timelyActions: z.array(
                        z.object({
                            timelyActionViewModel: z.object({
                                startTimeMilliseconds: timestampSchema,
                                endTimeMilliseconds: timestampSchema,
                                smartSkipMetadata: z.object({
                                    loggingData: z.object({
                                        startMilliseconds: timestampSchema,
                                        endMilliseconds: timestampSchema,
                                    }),
                                }),
                            }),
                        }),
                    ),
                }),
            }),
        }),
    }),
});

export type VideoData = z.infer<typeof videoDataSchema>;
