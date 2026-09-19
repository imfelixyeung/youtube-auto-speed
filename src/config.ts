import { BooleanConfig } from "./config/types/boolean";
import { NumberConfig } from "./config/types/number";

export const ENABLED = new BooleanConfig({
    storageKey: "enabled",
    defaultValue: true,
});

export const SPEED_STEP = 0.05;

export const RAMP_DURATION = new NumberConfig({
    storageKey: "rampDuration",
    defaultValue: 5,
    min: 0.5,
    max: 300,
    step: SPEED_STEP,
});

export const TALKING_SPEED = new NumberConfig({
    storageKey: "talkingSpeed",
    defaultValue: 1,
    min: 0.25,
    max: 4,
    step: SPEED_STEP,
});

export const SILENT_SPEED = new NumberConfig({
    storageKey: "silentSpeed",
    defaultValue: 2,
    min: 0.25,
    max: 16,
    step: SPEED_STEP,
});

export const DEFAULT_SMART_SKIP_SPEED = 3;

export const FILTER_SQUARE_BRACKETS = new BooleanConfig({
    storageKey: "filterSquareBrackets",
    defaultValue: true,
});

export const FILTER_PARENTHESES = new BooleanConfig({
    storageKey: "filterParentheses",
    defaultValue: false,
});

export const ALWAYS_SHOW_CHART = new BooleanConfig({
    storageKey: "alwaysShowChart",
    defaultValue: false,
});

export const BOOST_SPEED = 2.0;
