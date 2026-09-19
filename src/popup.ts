import {
    ALWAYS_SHOW_CHART,
    ENABLED,
    FILTER_PARENTHESES,
    FILTER_SQUARE_BRACKETS,
    RAMP_DURATION,
    SILENT_SPEED,
    TALKING_SPEED,
} from "./config";
import type { ConfigType } from "./config/types/_type";

const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;

const bracketFilterToggle = document.getElementById(
    "filter-brackets-toggle",
) as HTMLInputElement;

const parenFilterToggle = document.getElementById(
    "filter-parens-toggle",
) as HTMLInputElement;

const alwaysShowChartToggle = document.getElementById(
    "always-show-chart-toggle",
) as HTMLInputElement;

const rampInput = document.getElementById("ramp-duration") as HTMLInputElement;

const talkingInput = document.getElementById(
    "talking-speed",
) as HTMLInputElement;

const silentInput = document.getElementById("silent-speed") as HTMLInputElement;

const configElementMap: [ConfigType<unknown>, HTMLInputElement][] = [
    [ENABLED, toggle],
    [ALWAYS_SHOW_CHART, alwaysShowChartToggle],
    [FILTER_SQUARE_BRACKETS, bracketFilterToggle],
    [FILTER_PARENTHESES, parenFilterToggle],
    [RAMP_DURATION, rampInput],
    [TALKING_SPEED, talkingInput],
    [SILENT_SPEED, silentInput],
];

configElementMap.forEach(
    ([config, element]) => void config.attachToElement(element),
);
