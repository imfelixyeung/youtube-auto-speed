import {
    ALWAYS_SHOW_CHART,
    EASING_FUNCTION,
    ENABLED,
    FILTER_PARENTHESES,
    FILTER_SQUARE_BRACKETS,
    RAMP_DURATION,
    SILENT_SPEED,
    SMART_SKIP_SPEED,
    TALKING_SPEED,
} from "./config";
import { ChoiceConfig } from "./config/types/choice";

const $config = document.querySelector("#config") as HTMLDivElement;

const configs = [
    ENABLED,
    ALWAYS_SHOW_CHART,
    FILTER_SQUARE_BRACKETS,
    FILTER_PARENTHESES,
    RAMP_DURATION,
    TALKING_SPEED,
    SILENT_SPEED,
    SMART_SKIP_SPEED,
    EASING_FUNCTION,
];

configs.forEach((config) => {
    if (config instanceof ChoiceConfig) {
        const [html, input] = config.addFormElement();
        $config.appendChild(html);
        config.attachToElement(input);
        return;
    }

    const [html, input] = config.addFormElement();
    $config.appendChild(html);
    config.attachToElement(input);
});
