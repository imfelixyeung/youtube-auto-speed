import {
    DEFAULT_RAMP_DURATION,
    ENABLED_KEY,
    MAX_RAMP_DURATION,
    MIN_RAMP_DURATION,
    RAMP_DURATION_KEY,
} from "./config";

const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;

const rampInput = document.getElementById("ramp-duration") as HTMLInputElement;

chrome.storage.sync.get([ENABLED_KEY, RAMP_DURATION_KEY], (result) => {
    toggle.checked = result[ENABLED_KEY] !== false;

    rampInput.value = String(
        typeof result[RAMP_DURATION_KEY] === "number"
            ? result[RAMP_DURATION_KEY]
            : DEFAULT_RAMP_DURATION,
    );
});

toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ [ENABLED_KEY]: toggle.checked });
});

rampInput.addEventListener("change", () => {
    const value = Number(rampInput.value);

    if (!Number.isFinite(value)) {
        return;
    }

    const clamped = Math.min(
        MAX_RAMP_DURATION,
        Math.max(MIN_RAMP_DURATION, value),
    );

    rampInput.value = String(clamped);

    chrome.storage.sync.set({ [RAMP_DURATION_KEY]: clamped });
});
