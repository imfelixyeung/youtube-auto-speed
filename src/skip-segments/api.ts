import z from "zod";

const BASE_URL = "https://sponsor.ajay.app/";

const skipSegmentSchema = z.object({
    category: z.string(),
    actionType: z.string(),
    segment: z.tuple([z.number(), z.number()]),
});
const responseSchema = z.array(skipSegmentSchema);

export type SkipSegment = z.infer<typeof skipSegmentSchema>;

export const getSkipSegments = async (videoId: string) => {
    const url = new URL("/api/skipSegments", BASE_URL);
    url.searchParams.set("videoID", videoId);
    const parsed = await fetch(url)
        .then((res) => res.json())
        .then(responseSchema.parseAsync)
        .catch(() => null);

    return parsed;
};
