import {
    easeBackInOut,
    easeCircleInOut,
    easeCubicInOut,
    easeExpInOut,
    easePolyInOut,
    easeQuadInOut,
    easeSinInOut,
} from "d3-ease";
import { BooleanConfig } from "./config/types/boolean";
import { ChoiceConfig } from "./config/types/choice";
import { NumberConfig } from "./config/types/number";

export const ENABLED = new BooleanConfig({
    displayName: "Enable auto speed",
    storageKey: "enabled",
    defaultValue: true,
});

export const SPEED_STEP = 0.05;

export const RAMP_DURATION = new NumberConfig({
    displayName: "Ramp duration (s)",
    storageKey: "rampDuration",
    defaultValue: 5,
    min: 0,
    max: 300,
    step: 0.1,
});

export const TALKING_SPEED = new NumberConfig({
    displayName: "Talking speed (x)",
    storageKey: "talkingSpeed",
    defaultValue: 1,
    min: 0.25,
    max: 4,
    step: SPEED_STEP,
});

export const BOOST_SPEED = new NumberConfig({
    displayName: "Boost speed (x)",
    storageKey: "boostSpeed",
    defaultValue: 2,
    min: 0.25,
    max: 4,
    step: SPEED_STEP,
});

export const SILENT_SPEED = new NumberConfig({
    displayName: "Silent speed (x)",
    storageKey: "silentSpeed",
    defaultValue: 2,
    min: 0.25,
    max: 16,
    step: SPEED_STEP,
});

export const SMART_SKIP_SPEED = new NumberConfig({
    displayName: "Smart skip speed (x)",
    storageKey: "smartSkipSpeed",
    defaultValue: 3,
    min: 0.25,
    max: 16,
    step: SPEED_STEP,
});

export const FILTER_SQUARE_BRACKETS = new BooleanConfig({
    displayName: "Filter out [...]",
    storageKey: "filterSquareBrackets",
    defaultValue: true,
});

export const FILTER_PARENTHESES = new BooleanConfig({
    displayName: "Filter out (...)",
    storageKey: "filterParentheses",
    defaultValue: false,
});

export const ALWAYS_SHOW_CHART = new BooleanConfig({
    displayName: "Always show speed chart",
    storageKey: "alwaysShowChart",
    defaultValue: false,
});

export const EASING_FUNCTION = new ChoiceConfig({
    displayName: "Easing Function",
    storageKey: "easingFunction",
    defaultValue: "easeCubicInOut",
    options: [
        {
            value: "easeBackInOut",
            label: "Back",
            mapped: easeBackInOut,
        },
        {
            value: "easeCircleInOut",
            label: "Circle",
            mapped: easeCircleInOut,
        },
        {
            value: "easeCubicInOut",
            label: "Cubic",
            mapped: easeCubicInOut,
        },
        {
            value: "easeExpInOut",
            label: "Exp",
            mapped: easeExpInOut,
        },
        {
            value: "easePolyInOut",
            label: "Poly",
            mapped: easePolyInOut,
        },
        {
            value: "easeQuadInOut",
            label: "Quad",
            mapped: easeQuadInOut,
        },
        {
            value: "easeSinInOut",
            label: "Sin",
            mapped: easeSinInOut,
        },
    ],
});
