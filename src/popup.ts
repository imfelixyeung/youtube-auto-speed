import {
    ALWAYS_SHOW_CHART,
    BOOST_SPEED,
    EASING_FUNCTION,
    ENABLED,
    FILTER_PARENTHESES,
    FILTER_SQUARE_BRACKETS,
    PRESERVE_PITCH_ENABLED,
    RAMP_DURATION,
    REDACT_ENABLED,
    REDACT_VOLUME,
    SILENT_SPEED,
    SKIP_SEGMENTS_SPEED,
    SMART_SKIP_SPEED,
    TALKING_SPEED,
    WARP_SPEED,
} from "./config";

const $config = document.querySelector("#config") as HTMLDivElement;

const configs = [
    ENABLED,
    ALWAYS_SHOW_CHART,
    FILTER_SQUARE_BRACKETS,
    FILTER_PARENTHESES,
    RAMP_DURATION,
    TALKING_SPEED,
    BOOST_SPEED,
    SILENT_SPEED,
    SMART_SKIP_SPEED,
    SKIP_SEGMENTS_SPEED,
    PRESERVE_PITCH_ENABLED,
    EASING_FUNCTION,
    REDACT_ENABLED,
    REDACT_VOLUME,
    WARP_SPEED,
];

configs.forEach((config) => {
    const [html] = config.addAndAttachToElement();
    $config.appendChild(html);
});
