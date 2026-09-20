import {
    ALWAYS_SHOW_CHART,
    ENABLED,
    FILTER_PARENTHESES,
    FILTER_SQUARE_BRACKETS,
    RAMP_DURATION,
    SILENT_SPEED,
    TALKING_SPEED,
} from "./config";

const $config = document.querySelector("#config") as HTMLDivElement;

const configs = [
    ENABLED,
    ALWAYS_SHOW_CHART,
    FILTER_SQUARE_BRACKETS,
    FILTER_PARENTHESES,
    RAMP_DURATION,
    TALKING_SPEED,
    SILENT_SPEED,
];

configs.forEach((config) => {
    const [html, input] = config.addFormElement();
    $config.appendChild(html);
    config.attachToElement(input);
});
