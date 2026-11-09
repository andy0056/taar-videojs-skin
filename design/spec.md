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
- Released: damped wave, first mode about 7.5 Hz, still within roughly 300 ms.

## Motion

- Springs throughout; interruptible. Layout 150/24, rise 520/34, hide 700/52, morph 620/44 (stiffness/damping).
- Stand-up ripple: up to 70 ms outward from the play button. Lie-down: no stagger.
- Poster to active: about 400 ms, once per source. Bead and labels wait 300 ms for the line to land.
- Reduced motion: every spring snaps, no ring, no loading ripple.

## Not included

No title during playback, no seek-by-10 buttons, no centre play button after playback starts.
