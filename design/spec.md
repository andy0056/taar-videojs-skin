# Taar: design spec

One idea: **the whole player is one unbroken line.**

## Layout and control order

A single stroke crosses the frame from the left edge to the right. Controls sit along it in the conventional order, left to right:

play/pause · current time · seek · duration · mute (volume mast above) · captions · settings · picture-in-picture · fullscreen

Device buttons (AirPlay, Cast) sit top right and appear only when available.

Three poses share one geometry:

| Pose | When | Line | Glyphs |
| --- | --- | --- | --- |
| Poster | before first play | horizon through the middle of the frame, 3 px | only the play flag, large; title and running time stand on the line at either end |
| Active | controls visible | 22 px above the bottom edge, 2 px | all raised |
| Idle | playing, controls hidden | on the bottom edge, 2 px, 55 % ink | none; played part in the accent |

Widths (container queries on the player, not the page):

| Player width | Change |
| --- | --- |
| under 640 px | picture-in-picture leaves the bar |
| under 496 px | 40 px slots; the two times stand on the ends of the string, which takes their place; they step off while the string is held; smaller seek thumbnail |
| under 368 px | only the elapsed time stays on the string; the poster title goes |

## Glyph grammar

- 44-unit slot, 18-unit cap height, baseline 34/44 down the slot.
- Each glyph is an open polyline that leaves the baseline and returns to it. Retracing a stroke is allowed; lifting is not.
- Closed shapes attach at one corner and the line runs on beneath them.
- 2 px stroke, round caps and joins, 1.7 px corner softening (derived: 0.5× on the gear's teeth).
- Toggles that are on fill a closed region (captions bubble, PiP inset). Mute strikes through the horn.

## Type

System UI stack, 620 weight, tabular numerals, 12.4 px at the default scale, with a 3 px dark outline. Times stand on the line.

## Colour and surfaces

- Ink: white. Casing: black at 50 %. Accent (played time): copper, `oklch(72% 0.185 48)`; `--media-accent-color` overrides.
- No surfaces on the bar. Menus, tooltips and dialogs: near-black at 94 %, 2 px ink frame for menus and dialogs.
- Shade: a gradient at the foot of the frame; before playback a soft band around the horizon.

## Slider

- The seek stretch is the line itself. Played part: accent, 4 px. Buffered: 5.5 px ink at 30 %. Bead: 5 px radius, 6.5 on hover, 7.5 while held.
- Chapter starts: 4.5 px ticks below the line. Pointer position: an 8 px tick above it.
- Held: the string bends toward the pointer, up to 20 px. Rate steps at 36, 84 and 140 px from the line: ½, ¼, ⅛.
- Pulled upward: the preview rides 14 px above a cursor, 40 px above a fingertip, and stops at the top of the frame. It settles back 240 ms after release.
- Released: damped wave, first mode about 7.5 Hz, still within roughly 300 ms.

## Motion

- Springs throughout; interruptible. Layout 150/24, rise 520/34, hide 700/52, morph 620/44 (stiffness/damping).
- Stand-up ripple: up to 70 ms outward from the play button. Lie-down: no stagger.
- Measured at 60 fps (mean of five runs): controls turn visible 8 ms after the pointer moves. Standing up, the play button is 90% up at about 125 ms and the far end of the bar at about 205 ms, all settled by about 225 ms. Lying down, every control is 90% flat at about 140 ms and settled by about 220 ms.
- Poster to active: about 400 ms, once per source. Bead and labels wait 300 ms for the line to land.
- Reduced motion: every spring snaps, no ring, no loading ripple.

## Not included

No title during playback, no seek-by-10 buttons, no centre play button after playback starts.
