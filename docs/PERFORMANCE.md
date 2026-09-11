# Performance Analysis

Audit of the YouTube Auto Speed extension. Findings are grouped by severity and
ordered by estimated real-world impact within each group.

---

## HIGH — Fix first

### 1. Unconditional `requestAnimationFrame` loop

**File:** `src/content.ts:505-510`

```ts
function tick() {
    updateSpeed();
    refreshPlayhead();
    requestAnimationFrame(tick);
}
```

`tick()` calls `requestAnimationFrame` unconditionally, so the loop runs
forever at ~60 fps. It fires even when the video is paused, ended, when the
extension is disabled, or before a video element is found. Each iteration calls
`computeSpeedAtTime` (binary search over caption intervals), `findSpeechNeighbors`,
and `setSpeed` — all of which do meaningful work.

On a 2-hour video with 1 000 caption intervals this means ~4 million operations
per second for no reason when idle.

**Fix:** Start the loop from video events (`play`, `playing`, `seeked`) and stop
it when idle. A simple boolean guard avoids re-scheduling:

```ts
let ticking = false;

function startTicking() {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(tick);
    }
}

function tick() {
    updateSpeed();
    refreshPlayhead();
    if (!video || video.paused || video.ended || !config.enabled) {
        ticking = false;
        return;
    }
    requestAnimationFrame(tick);
}
```

---

### 2. `getComputedStyle()` called every frame

**File:** `src/content.ts:492`

```ts
if (getComputedStyle(overlay).opacity === "0") {
    return;
}
```

This is inside `refreshPlayhead`, which is throttled to 10 Hz but still calls
`getComputedStyle` up to 10 times per second. `getComputedStyle` forces the
browser to resolve the computed style, which can trigger layout. The check is
used to skip chart rendering when the overlay is transparent (not hovered).

**Fix:** Replace with boolean flags driven by `mouseenter`/`mouseleave`:

```ts
let overlayHovered = false;
overlay.addEventListener("mouseenter", () => { overlayHovered = true; });
overlay.addEventListener("mouseleave", () => { overlayHovered = false; });
```

---

### 3. O(N × M) chart resampling on every caption event

**File:** `src/content.ts:340-354`, `src/speedCurve.ts:117-133`

`sampleSpeedCurve` generates up to `duration / step` points (4 000 at default
settings for a 2-hour video). For every point it calls `findSpeechNeighbors`,
which scans all caption intervals linearly. With 1 000 intervals and 4 000
samples, this is 4 million iterations per update.

The function is called on every `AUTO_SPEED_CAPTIONS` event and on every
config change (`setRampDuration`, `setTalkingSpeed`, `setSilentSpeed`).

**Fixes:**

1. **Cache chart data.** Only resample when `captionIntervals` actually change.
   Config changes (speed, ramp) only need to update the y-axis range and
   re-render — not resample the entire curve.
2. **Binary search in `findSpeechNeighbors`.** Intervals are sorted by start
   time; a binary search drops per-point cost from O(N) to O(log N).
3. **Adaptive step size.** Use `Math.max(1, duration / MAX_CHART_SAMPLES)` so
   long videos don't generate an unnecessarily dense point array.

---

## MEDIUM — Fix next

### 4. MutationObserver on entire `<body>`

**File:** `src/content.ts:658-665`

```ts
pageObserver.observe(document.body, {
    subtree: true,
    childList: true,
});
```

YouTube's player frequently mutates the DOM — ads, comments, recommendations,
controls, captions. Every mutation triggers `checkForVideo()`, which runs
`querySelector`. On a busy page this fires dozens of times per second.

**Fix:** Scope the observer to `#movie_player` (where the video lives) and
debounce the callback. Also short-circuit `checkForVideo` if the existing video
element is still in the DOM:

```ts
const player = document.querySelector("#movie_player");
if (player) {
    pageObserver.observe(player, { subtree: true, childList: true });
}
```

---

### 5. Chart.js as a content script dependency

**File:** `src/content.ts:1-10`, `dist/content.js` (156 KB minified)

The content script imports the full Chart.js library (~155 KB) and registers
all chart components at the top level. This is parsed and evaluated on every
YouTube page load. The chart itself is only visible on hover — many users may
never see it.

**Fixes:**

1. **Lazy-load Chart.js.** Use dynamic `import()` when the overlay is first
   hovered. The speed badge and `playbackRate` logic need no chart library.
2. **Replace with raw Canvas 2D.** For a simple line chart with a gradient
   fill, a hand-written Canvas implementation would be ~2–3 KB and eliminate
   the entire dependency.

---

### 6. No video event listener cleanup

**File:** `src/content.ts:512-537`

`attachVideo` adds 6 event listeners (`play`, `playing`, `pause`, `ended`,
`seeked`, `loadedmetadata`, `durationchange`) to the video element but never
removes them. YouTube can replace the video element on playlist navigation or
quality changes, causing old listeners to leak and new ones to accumulate.

**Fix:** Track the current video and remove all listeners before attaching to a
new one:

```ts
function detachVideo() {
    if (!video) return;
    video.removeEventListener("play", updateSpeed);
    video.removeEventListener("playing", updateSpeed);
    video.removeEventListener("pause", handlePause);
    video.removeEventListener("ended", handleEnded);
    video.removeEventListener("seeked", updateSpeed);
    video.removeEventListener("loadedmetadata", updateChart);
    video.removeEventListener("durationchange", updateChart);
    video = null;
}
```

---

## LOW — Nice to have

### 7. Gradient recreated on every chart render

**File:** `src/content.ts:206-226`

The `backgroundColor` callback creates a new `CanvasGradient` on every chart
render cycle. The gradient is static and never changes.

**Fix:** Compute the gradient once in `createChart` and update it only on
canvas resize. Store a reference and return it from the callback.

---

### 8. Redundant rounding in `roundToNearest05`

**File:** `src/content.ts:74-76`

```ts
function roundToNearest05(value: number) {
    return Math.round(Math.round(value / 0.05) * 0.05 * 100) / 100;
}
```

The outer `Math.round(... / 100) * 100` is redundant. The inner expression
already produces a number representable in two decimal places. Simplify to:

```ts
return Math.round(value / 0.05) * 0.05;
```

---

### 9. Unused `sidePanel` permission

**File:** `manifest.json:25`

```json
"permissions": ["sidePanel", "storage"]
```

The `sidePanel` permission is declared but never used anywhere in the codebase.
Unnecessary permissions reduce user trust and may cause friction during Chrome
Web Store review.

---

### 10. Stale build artifact

**File:** `dist/script.js`

A leftover from an earlier DOM-based approach (`src/script.ts` which no longer
exists). Not referenced by the manifest but adds ~3 KB to dist and could
confuse contributors or the zip packaging step.

**Fix:** Delete the file. Add a clean step to the Makefile or CI workflow.

---

### 11. `processCaptionData` string allocations

**File:** `src/content.ts:396-399`

```ts
const text = event.segs
    .map((seg) => seg.utf8 || "")
    .join("")
    .trim();
```

For every caption event this creates an intermediate array via `.map`, joins it
into a string, then trims. For the empty-caption guard a simpler check avoids
the allocation:

```ts
const hasText = event.segs.some((seg) => seg.utf8?.trim());
if (!hasText) continue;
```

---

## Summary

| Priority | Issue | File | Impact |
|---|---|---|---|
| HIGH | Unconditional rAF loop | `content.ts:505` | ~60 ops/sec wasted when idle |
| HIGH | `getComputedStyle` per frame | `content.ts:492` | Forced layout 10x/sec |
| HIGH | O(N × M) chart resample | `speedCurve.ts:117` | Up to 4M ops per caption event |
| MEDIUM | MutationObserver on body | `content.ts:658` | Dozens of spurious triggers/sec |
| MEDIUM | Chart.js in content script | `content.ts:1` | ~155 KB parsed on every page |
| MEDIUM | No listener cleanup | `content.ts:512` | Leak on playlist navigation |
| LOW | Gradient per render | `content.ts:206` | Minor per-frame allocation |
| LOW | Redundant rounding | `content.ts:74` | Extra computation per frame |
| LOW | Unused permission | `manifest.json:25` | Trust / review risk |
| LOW | Stale build artifact | `dist/script.js` | Dead code |
| LOW | String allocations in caption parse | `content.ts:396` | Minor overhead per event |
