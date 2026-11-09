/**
 * Taar icon family, for the places a control is not on the line: menu rows, on-screen indicators and the
 * device buttons in the corner. They are the same glyphs the line draws, each standing on its own short piece
 * of line, so the set stays one hand at one weight.
 */
import { registerIcons } from '@videojs/html/icons';

import { fills, glyphs, softness, toPath, type GlyphName, type Pt } from './glyphs';

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"';

const frame = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" aria-hidden="true" viewBox="6 -22.5 32 27">${body}</svg>`;

/** A glyph on a short baseline, optionally with its toggle region filled in. */
function fromGlyph(name: GlyphName, options: { on?: boolean; level?: number; shift?: number } = {}): string {
  const shift = options.shift ?? 0;
  const points = (name === 'speaker' ? glyphs.speaker(options.level ?? 1) : name === 'muted' ? glyphs.muted() : glyphs[name]()).map(
    ([x, y]) => [x + shift, y] as Pt
  );
  const line: Pt[] = [[7.5, 0], ...points, [36.5, 0]];
  let body = `<path d="${toPath(line, 1.7 * (softness[name] ?? 1))}" ${STROKE}/>`;
  const region = options.on ? fills[name] : undefined;
  if (region) {
    const shape = region.map(([x, y]) => [x + shift, y] as Pt);
    body += `<path d="${toPath([...shape, shape[0]!], 1.2)}Z" fill="currentColor" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>`;
  }
  return frame(body);
}

const stroke = (d: string) => frame(`<path d="${d}" ${STROKE}/>`);

export const chevronIcon = stroke('M18,-17 L26,-9 L18,-1');
export const checkIcon = stroke('M11,-9 L19,-1.5 L33,-17');

/** Speed: a dial rising off the line, its needle drawn out and retraced. */
export const speedIcon = stroke(
  'M7.5,0 L11,0 A11,11 0 0 1 33,0 L22,0 L28.5,-9 L22,0 L36.5,0'
);

/** Quality: the line climbing in steps. */
export const qualityIcon = stroke('M7.5,0 L12,0 L12,-5 L18.5,-5 L18.5,-11 L25,-11 L25,-17 L31.5,-17 L31.5,0 L36.5,0');

export const spinnerIcon = frame(
  `<style>@keyframes taar-spin{to{transform:rotate(360deg)}}</style><path d="M22,-20 A10.5,10.5 0 1 1 11.5,-9.5" ${STROKE} style="transform-origin:22px -9.5px;animation:var(--media-spinner-animation, taar-spin 0.9s linear infinite)"/>`
);

registerIcons('taar', {
  'airplay-enter': fromGlyph('airplay'),
  'airplay-exit': fromGlyph('airplay', { on: true }),
  audio: fromGlyph('speaker', { level: 0.7 }),
  captions: fromGlyph('captions'),
  'captions-off': fromGlyph('captions'),
  'captions-on': fromGlyph('captions', { on: true }),
  'cast-enter': fromGlyph('cast'),
  'cast-exit': fromGlyph('cast', { on: true }),
  check: checkIcon,
  chevron: chevronIcon,
  'fullscreen-enter': fromGlyph('fullscreen-enter'),
  'fullscreen-exit': fromGlyph('fullscreen-exit'),
  gear: fromGlyph('gear'),
  pause: fromGlyph('pause'),
  'pip-enter': fromGlyph('pip'),
  'pip-exit': fromGlyph('pip', { on: true }),
  play: fromGlyph('play'),
  quality: qualityIcon,
  restart: fromGlyph('replay'),
  speed: speedIcon,
  spinner: spinnerIcon,
  'volume-high': fromGlyph('speaker', { level: 1 }),
  'volume-low': fromGlyph('speaker', { level: 0.35 }),
  'volume-off': fromGlyph('muted'),
});
