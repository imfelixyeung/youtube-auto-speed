import {
    DEFAULT_FILTER_PARENTHESES,
    DEFAULT_FILTER_SQUARE_BRACKETS,
    DEFAULT_RAMP_DURATION,
    DEFAULT_SILENT_SPEED,
    DEFAULT_TALKING_SPEED,
    ENABLED_KEY,
    FILTER_BRACKETS_KEY,
    FILTER_PARENS_KEY,
    MAX_RAMP_DURATION,
    MAX_SILENT_SPEED,
    MAX_TALKING_SPEED,
    MIN_RAMP_DURATION,
    MIN_SILENT_SPEED,
    MIN_TALKING_SPEED,
    RAMP_DURATION_KEY,
    SILENT_SPEED_KEY,
    SPEED_STEP,
    TALKING_SPEED_KEY,
} from "./config";

const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;

const bracketFilterToggle = document.getElementById(
    "filter-brackets-toggle",
) as HTMLInputElement;

const parenFilterToggle = document.getElementById(
    "filter-parens-toggle",
) as HTMLInputElement;

const rampInput = document.getElementById("ramp-duration") as HTMLInputElement;

const talkingInput = document.getElementById(
    "talking-speed",
) as HTMLInputElement;

const silentInput = document.getElementById("silent-speed") as HTMLInputElement;

talkingInput.min = String(MIN_TALKING_SPEED);
talkingInput.max = String(MAX_TALKING_SPEED);
talkingInput.step = String(SPEED_STEP);

silentInput.min = String(MIN_SILENT_SPEED);
silentInput.max = String(MAX_SILENT_SPEED);
silentInput.step = String(SPEED_STEP);

let talkingSpeed = DEFAULT_TALKING_SPEED;
let silentSpeed = DEFAULT_SILENT_SPEED;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

chrome.storage.sync.get(
    [
        ENABLED_KEY,
        RAMP_DURATION_KEY,
        TALKING_SPEED_KEY,
        SILENT_SPEED_KEY,
        FILTER_BRACKETS_KEY,
        FILTER_PARENS_KEY,
    ],
    (result) => {
        toggle.checked = result[ENABLED_KEY] !== false;

        bracketFilterToggle.checked =
            typeof result[FILTER_BRACKETS_KEY] === "boolean"
                ? result[FILTER_BRACKETS_KEY]
                : DEFAULT_FILTER_SQUARE_BRACKETS;

        parenFilterToggle.checked =
            typeof result[FILTER_PARENS_KEY] === "boolean"
                ? result[FILTER_PARENS_KEY]
                : DEFAULT_FILTER_PARENTHESES;

        rampInput.value = String(
            typeof result[RAMP_DURATION_KEY] === "number"
                ? result[RAMP_DURATION_KEY]
                : DEFAULT_RAMP_DURATION,
        );

        const storedTalking =
            typeof result[TALKING_SPEED_KEY] === "number"
                ? clamp(
                      result[TALKING_SPEED_KEY],
                      MIN_TALKING_SPEED,
                      MAX_TALKING_SPEED,
                  )
                : DEFAULT_TALKING_SPEED;

        const storedSilent =
            typeof result[SILENT_SPEED_KEY] === "number"
                ? clamp(
                      result[SILENT_SPEED_KEY],
                      MIN_SILENT_SPEED,
                      MAX_SILENT_SPEED,
                  )
                : DEFAULT_SILENT_SPEED;

        if (storedTalking < storedSilent) {
            talkingSpeed = storedTalking;
            silentSpeed = storedSilent;
        }

        talkingInput.value = String(talkingSpeed);

        silentInput.value = String(silentSpeed);
    },
);

toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ [ENABLED_KEY]: toggle.checked });
});

bracketFilterToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
        [FILTER_BRACKETS_KEY]: bracketFilterToggle.checked,
    });
});

parenFilterToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
        [FILTER_PARENS_KEY]: parenFilterToggle.checked,
    });
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

talkingInput.addEventListener("change", () => {
    const value = Number(talkingInput.value);

    if (talkingInput.value === "" || !Number.isFinite(value)) {
        talkingInput.value = String(talkingSpeed);

        return;
    }

    const clamped = clamp(value, MIN_TALKING_SPEED, MAX_TALKING_SPEED);

    // Talking speed must be slower than silent speed.
    if (clamped >= silentSpeed) {
        talkingInput.value = String(talkingSpeed);

        return;
    }

    talkingSpeed = clamped;
    talkingInput.value = String(clamped);
    chrome.storage.sync.set({ [TALKING_SPEED_KEY]: clamped });
});

silentInput.addEventListener("change", () => {
    const value = Number(silentInput.value);

    if (silentInput.value === "" || !Number.isFinite(value)) {
        silentInput.value = String(silentSpeed);

        return;
    }

    const clamped = clamp(value, MIN_SILENT_SPEED, MAX_SILENT_SPEED);

    // Silent speed must be faster than talking speed.
    if (clamped <= talkingSpeed) {
        silentInput.value = String(silentSpeed);

        return;
    }

    silentSpeed = clamped;
    silentInput.value = String(clamped);
    chrome.storage.sync.set({ [SILENT_SPEED_KEY]: clamped });
});
