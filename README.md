# Dynamic Speed for YouTube

A Chrome extension that automatically speeds up YouTube videos while nobody is speaking, and cruises back down to normal speed when speech starts.

It uses YouTube's own captions to know when someone is talking, so it works on any video that has captions enabled — no audio analysis needed.

## How it works

1. An early `MAIN`-world script (`interceptor.ts`) wraps `fetch` and `XMLHttpRequest` and hooks YouTube's `/api/timedtext` requests to capture caption event data.
2. The content script (`content.ts`) turns those caption events into "speech intervals", merges nearby ones, and computes a continuous speed curve.
3. While a video plays, the playback rate follows the curve:
    - **Talking** → `talking speed` (default `1x`)
    - **Silent** → `silent speed` (default `2x`), easing up over the ramp duration
    - Approach of the next speech → eases back down so it reaches talking speed exactly when speech begins
4. An overlay pinned to the player renders the speed curve (Chart.js) with a live playhead and shows the current speed as a badge.

The source of truth for speech detection is caption data streamed in YouTube's timedtext JSON format; replies that are XML or empty are ignored.

## Settings

Configured from the extension popup and synced across devices via `chrome.storage.sync`:

| Setting           | Default | Range    | Notes                                    |
| ----------------- | ------- | -------- | ---------------------------------------- |
| Enable auto speed | on      | —        | Global on/off                            |
| Always show speed chart | off | —    | Keep the speed chart visible at all times |
| Filter out [...]  | on      | —        | Treat bracketed labels (e.g. `[music]`) as non-speech |
| Filter out (...)  | off     | —        | Treat parenthesised asides as non-speech |
| Ramp duration     | 5s      | 0.5–300s | Time to ease between speeds              |
| Talking speed     | 1x      | 0.25–4x  | Speed while someone is speaking          |
| Silent speed      | 2x      | 0.25–16x | Speed during silence (must be > talking) |

## Install (development)

The extension is not published; load it unpacked:

1. `bun install`
2. `make build` — emits the built extension into `dist/`
3. Open `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select this directory
5. Open a captioned YouTube video and enjoy

## Development

```sh
bun install          # install dependencies
make build           # build into dist/ (also cleans first)
make typecheck       # run tsc --noEmit
make zip             # build and package manifest.json + dist/ into youtube-auto-speed.zip
```

Lint/format uses [Biome](https://biomejs.dev). A GitHub Actions workflow type-checks and packages the extension on every push/PR and uploads `youtube-auto-speed.zip` as an artifact.

## Project structure

```
src/
├── content.ts        # Content script: speed curve, overlay, chart, config
├── interceptor.ts    # MAIN-world script: captures /api/timedtext responses
├── speedCurve.ts     # Pure speed-curve math (intervals, easing, sampling)
├── config.ts         # Storage keys, defaults, min/max bounds
├── types.ts          # Shared event/timedtext types
├── playheadPlugin.ts # Chart.js plugin for the live playhead line
├── popup.ts          # Popup logic
├── popup.html        # Popup markup
├── popup.css         # Popup styles (Tailwind + daisyUI)
└── content.css       # Overlay styles
```
