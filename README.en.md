# VidVeil

**A Shadow DOM video control layer for the open web.**

[简体中文](README.md) | [English](README.en.md)

VidVeil is a Manifest V3 browser extension that adds a consistent, lightweight control layer to eligible HTML5 video players. It keeps the original `<video>` element and media stream in place, isolates its interface in a Shadow DOM, and lets you restore the site's player without reloading the page.

## Features

- **Unified controls:** playback, timeline scrubbing, buffered progress, volume, playback speed, fullscreen and Picture-in-Picture.
- **Shadow DOM isolation:** VidVeil's interface and styles stay separate from the page's CSS.
- **Native-player shielding:** suppresses a detected native control layer while VidVeil is active; restoring the site player restores its original state.
- **Per-site rules:** force-enable and block individual domains, with built-in exemptions for mature players such as YouTube, Bilibili, Netflix, iQIYI, Youku, Douyin, TikTok, Twitch and Disney+.
- **Instant switching:** enable or restore the player from the overlay or extension popup without reloading the page. Cross-origin frames are handled in the context of their top-level site.
- **Video gestures:** click to play/pause, double-click for fullscreen, horizontal drag to seek, long press for temporary 3x speed, and wheel-to-volume on desktop.
- **Frame previews:** generate JPEG previews from seekable, CORS-compatible media; use supported WebVTT thumbnail tracks when available. Unsupported streams fall back to a timestamp and an explanation.
- **Privacy-minded:** settings are stored in the browser. Thumbnail extraction uses the media source already presented by the site; VidVeil does not provide a media proxy or upload extracted frames to a VidVeil server.

## Requirements

- Node.js 20 or newer and npm.
- A Chromium-based browser with Manifest V3 extension support, such as current Chrome or Microsoft Edge.
- Internet access to install npm dependencies. Video playback and thumbnail previews remain subject to the media host's availability and browser CORS rules.

Safari and iOS browser extension packages are not currently provided. Android browser support depends on whether that browser supports desktop-style extensions and Manifest V3.

## Build from source

```bash
npm install
npx wxt prepare
npm run compile
npm run build
```

The unpacked Chrome-compatible extension is written to `.output/chrome-mv3`.

To create a distributable archive:

```bash
npm run zip
```

For a local development build with extension reload support:

```bash
npm run dev
```

## Install the unpacked extension

1. Run the build commands above.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the project's `.output/chrome-mv3` directory.
5. Open or reload a video page. Use the VidVeil popup to inspect the current domain and change its site rule.

Some pages opened before installing or reloading the extension may need one page refresh before their content scripts are available.

## Local test playground

The repository includes `test-playground.html`, with standard-video, small-video, decorative-video and dynamically inserted-video scenarios.

Start a local HTTP server from the project root:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Then visit `http://localhost:4173/test-playground.html` and enable `localhost` in the VidVeil popup. The test video is hosted by Video.js, so the playground needs an internet connection. `localhost` and `127.0.0.1` are separate domain rules.

## Site-rule priority

The rule engine evaluates a hostname in this order:

1. **User whitelist:** force-enable the domain, including a domain covered by a built-in exemption.
2. **User blocklist:** leave the site's player in control.
3. **Built-in exemptions:** applied when the built-in ignore setting is enabled.
4. **Default:** allow eligible videos to be considered for takeover.

Wildcard rules such as `*.example.com` match both `example.com` and its subdomains. Video candidates are skipped when they are too small, short, live (`duration === Infinity`), or appear to be muted looping decorative media.

## Controls

| Action | Result |
| --- | --- |
| Single click on the video | Play or pause |
| Double-click on the video | Toggle fullscreen |
| Drag horizontally on the video | Seek; approximately 1 second per 5 pixels |
| Press and hold on the video | Temporarily use 3x playback speed |
| Mouse wheel over the video | Adjust volume |
| `Space` | Play or pause |
| `ArrowRight` / `ArrowLeft` | Hold right for temporary 3x speed; tap right to seek +5 seconds; left seeks -5 seconds |
| `ArrowUp` / `ArrowDown` | Adjust volume |
| `F` | Toggle fullscreen |

Use **Restore Native Player** to return control to the page. When VidVeil is active on that site, the compact **Enable VidVeil** launcher can re-enable it without a page reload.

## Permissions

The extension requests the following Manifest V3 permissions:

- `storage` — save site rules locally in the browser.
- `activeTab` and `scripting` — support interaction with the active tab and extension tooling.
- `<all_urls>` host access — inspect eligible video elements in web pages, including embedded player frames, and place the overlay above the original video.

The broad host access is needed for a general-purpose video controller. Site rules and built-in exemptions determine where VidVeil actually starts scanning and mounting controls.

## Limitations

- The original media and playback engine are preserved, but the site can still enforce its own keyboard shortcuts, overlays, DRM, or player behavior. Native UI shielding is best-effort across different player implementations.
- Canvas frame extraction requires a seekable source and permission from the media host's CORS policy. `blob:`/MSE or DRM streams may not expose a reusable source; in that case VidVeil shows the timestamp or an unsupported message. A preview is aligned to a 2-second bucket, not guaranteed to be an exact frame.
- A website may change its iframe layout, player DOM, or media source at any time. Compatibility can vary by site and browser.
- Touch gestures, native fullscreen behavior, and Picture-in-Picture availability vary across mobile browsers. A dedicated mobile extension package and full real-device certification are not currently provided.

## Project layout

```text
src/
├── components/       # Shadow DOM Vue player interface
├── core/             # Player lifecycle, native UI shield and page launcher
├── entrypoints/      # WXT background, content script and popup
├── presets/          # Built-in exempt domains
├── types/            # Shared TypeScript types
└── utils/            # Storage, rule engine and frame extraction
```

## Configuration migration

When upgrading from the earlier UniPlayer build, VidVeil reads the existing `uniplayer:config` setting and copies it to `vidveil:config`. Existing whitelist and blocklist preferences are retained.

## Contributing

Issues and pull requests are welcome. Before submitting a change, run:

```bash
npm run compile
npm run build
```

For player, frame, or iframe changes, also verify the relevant scenarios in `test-playground.html` and, where applicable, test the target site in a real browser.

## License

This project is licensed under the [MIT License](LICENSE).
