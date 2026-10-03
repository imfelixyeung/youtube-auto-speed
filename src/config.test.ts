import { describe, expect, it } from "bun:test";
import { ConfigType } from "./config/types/_type";

describe("config", async () => {
    global.chrome = {
        storage: {
            sync: { get: () => void null },
            onChanged: { addListener: () => void null },
        },
    } as unknown as typeof chrome;

    const CONFIGS = await import("./config");

    const namedConfigs = Object.entries(CONFIGS)
        .map(([name, config]) =>
            config instanceof ConfigType
                ? {
                      name,
                      config,
                  }
                : null,
        )
        .filter((v) => v !== null);

    it.each(namedConfigs)(
        "$name config should have a default value set that matches its schema",
        ({ config }) => {
            expect(config.schema).not.toBe(null);
            const parsed = config.schema?.safeParse(config.defaultValue);
            expect(parsed?.success).toBeTrue();
        },
    );
});
