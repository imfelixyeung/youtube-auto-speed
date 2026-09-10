const STORAGE_KEY = "enabled";

const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;

chrome.storage.sync.get(STORAGE_KEY, (result) => {
    toggle.checked = result[STORAGE_KEY] !== false;
});

toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: toggle.checked });
});
