import z from "zod";

const BASE_URL = "https://sponsor.ajay.app/";

const skipSegmentSchema = z.object({
    category: z.enum([
        "sponsor",
        "selfpromo",
        "interaction",
        "intro",
        "outro",
        "preview",
        "hook",
        "filler",
    ]),
    actionType: z.enum(["skip", "mute", "full", "poi", "chapter"]),
    segment: z.tuple([z.number(), z.number()]),
});
const responseSchema = z.array(skipSegmentSchema.nullable().catch(() => null));

export type SkipSegment = z.infer<typeof skipSegmentSchema>;
const whitelistedCategories: SkipSegment["category"][] = [
    "sponsor",
    "selfpromo",
    "intro",
    "outro",
];
const whitelistedActionTypes: SkipSegment["actionType"][] = ["skip"];

export const getSkipSegments = async (
    videoId: string,
): Promise<SkipSegment[]> => {
    const url = new URL("/api/skipSegments", BASE_URL);
    url.searchParams.set("videoID", videoId);
    const parsed = await fetch(url)
        .then((res) => res.json())
        .then(responseSchema.parseAsync)
        .then((parsed) => parsed.filter((seg) => seg !== null))
        .then((parsed) =>
            parsed.filter(
                ({ category, actionType }) =>
                    whitelistedCategories.includes(category) &&
                    whitelistedActionTypes.includes(actionType),
            ),
        )
        .catch(() => []);

    return parsed;
};
