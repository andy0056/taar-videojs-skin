# Taar

**A Video.js v10 skin where the whole player is one unbroken line.**

One stroke enters at the left edge of the frame and leaves at the right. Where a control is needed it rises into that shape and comes back down without lifting. Where time is needed it runs straight and taut, and you can pull it like a string. When you are just watching, it lies flat on the bottom edge as a progress hairline.

*Taar* (तार) is Hindi for wire, and for the string of a sitar. In Devanagari every word hangs from one continuous line; this player stands on one.

Built for the [Video.js Skins Design Challenge](https://contra.com/community/topic/videojsskinschallenge) by [Anirudh Thakur](https://anirudhthakur.work). Video skin for HTML, styled with CSS, started from the Scaffold skin with `npx @videojs/cli skin create`.

## What it does

- **Three poses, one line.** Before playback the line is a horizon through the middle of the frame with a single play flag on it. On play it comes down to the foot of the frame and every control stands up out of it. While you watch it rests on the bottom edge and shows progress.
- **Glyphs you could draw without lifting a pen.** Play is a flag, pause is two pulses, the speaker's sound is a wave in the line itself, as tall as the volume. Closed shapes attach to the line at one corner; the pen may go back over a stroke but never lifts.
- **State is a shape.** Captions and picture-in-picture fill in when they are on, mute strikes through the horn and flattens the wave, fullscreen turns its arrow round. Nothing depends on colour alone.
- **A seek bar that is a string.** Drag the bead to scrub. Pull the pointer away from the line and the string bends toward it while the scrub slows to ½, ¼, then ⅛ speed, with the rate shown beside the time. The preview rides just above the cursor or fingertip while you pull, so the frame you are scrubbing to is never covered. Let go and the string rings for about a quarter of a second.
- **A volume mast.** Point at the speaker and its front edge grows upward into a slider with its own bead.
- **Frets.** Chapter starts are small ticks on the string; the hover preview shows the chapter, the time and a storyboard thumbnail when the media has one (Mux streams do, and so do the bundled clips).

## Under the line

Every control is a stock Video.js v10 component: `media-play-button`, `media-time-slider`, `media-mute-button`, `media-volume-slider`, `media-captions-button`, the settings `media-menu`, picture-in-picture and fullscreen. They keep their roles, translated labels, shortcuts and tab order, and they paint nothing.

The one new part is `<taar-line>`. It finds the controls marked `data-taar`, measures where they sit, and draws a single SVG path through them. It reads state from the attributes the components already set (`data-paused`, `data-muted`, `data-active`, `data-fullscreen`) and from the player store (time, buffer, volume, chapters). It is `aria-hidden`; if it were removed, the player would still work with the keyboard and a screen reader.

Fine scrubbing does not replace the slider's own seeking. While the string is held, `<taar-line>` hands the slider a pointer that moves more slowly than the real one, so keyboard seeking, throttling and the preview all stay Video.js's.

## Craft notes

- **Readable over any frame.** The line is cased like a road on a map: a light core with a dark edge, over a soft shade at the foot of the frame. Over a paper-white frame the core still measures 3.9:1 against the picture and over 10:1 against its casing. The bundled test card (`?media=card`) runs paper white, a moving checkerboard, colour bars, static and black.
- **Springs, not timelines.** Every movement is a spring aimed at a target, so anything can be interrupted mid-way. Controls stand up in a short ripple outward from the play button and lie down together, faster. The horizon drop happens once, on first play. Nothing animates on load.
- **Preferences.** `prefers-reduced-motion` makes the line change pose without travelling, stops the string ringing and the loading ripple. `prefers-contrast: more` and `prefers-reduced-transparency` swap the shade for a solid band. `forced-colors` uses `CanvasText`, `Canvas` and `Highlight`.
- **Focus.** A white ring with a dark halo on every stop, slider beads included. Focus brings hidden controls straight back.
- **Touch.** 44 px targets (40 px on the narrowest players), no hover dependence. Phones get mute and use their own volume keys.
- **Small players.** Container queries drop picture-in-picture, then duration, then the clock, so the string keeps its room down to 320 px wide.
- **Own type.** A system UI stack with tabular numerals; the host page's font is not inherited and nothing is downloaded.
- **Public knobs.** `--media-accent-color` colours played time (copper by default). `--media-accent-text-color`, `--media-border-radius`, `--media-font-family` and `--media-scale-unit` work as on the packaged skins. Taar adds `--taar-ink` and `--taar-casing`.

## Develop

```sh
npm install
npm run dev
```

The workbench opens the skin in the Video.js skin sandbox: set the player's width and aspect ratio, colour scheme, text direction, language and playback options. Settings live in the URL, so `/workbench.html?width=384&ratio=9:16` opens it in that state and `/preview.html#width=384&ratio=9:16` opens the preview alone.

`?media=` picks what plays: `stars` and `aurora` stream from Mux; `dev` and `card` are bundled clips for working offline and for checking legibility. The Mux playback IDs are in `apps/preview/src/frame/player.ts`.

`npm run typecheck` and `npm run build` check and build it.

## Use the skin

Import `src/video/skin.ts` once, then paste the markup from `src/video/skin.html` around your media component inside a `<video-player>`, replacing the placeholder comment. A `kind="chapters"` track adds frets and chapter titles; `<mux-video>` adds storyboard thumbnails on its own.

## Where things live

- `src/video/skin.html`: the layout. Device buttons top right; the bar of hit targets along the foot.
- `src/video/skin.css`: Taar's styles.
- `src/video/taar-line.ts`: the `<taar-line>` element: layout measurement, springs, the string, fine scrubbing, drawing.
- `src/video/glyphs.ts`: the glyphs, as polylines.
- `src/video/icons.ts`: the same glyphs as standalone icons for menus and indicators.
- `src/video/scaffold-base.css`: the Scaffold component behaviours Taar inherits (popups, menus, indicators, dialogs).
- `src/styles/`: shared tokens and preference overrides from the Scaffold skin.
- `apps/preview/`: the workbench and the landing page.
- `design/spec.md`: the design spec the build follows.

## Credits

Demo footage from NASA's [image and video library](https://images.nasa.gov/) (public domain), streamed from [Mux](https://www.mux.com). The bundled test clip uses photographs that ship with scikit-image (NASA, public domain; CC0).

## License

Apache-2.0. See `LICENSE`.
