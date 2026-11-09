/**
 * The name, written by the same pen as the player.
 *
 * "taar" stands on the line in Latin letters; "तार" hangs from it in Devanagari, where every word is written
 * under one continuous headline. Both are single strokes: the pen goes out along a letter and retraces to the
 * line, never lifting.
 */
import { toPath, type Pt } from '@/video/glyphs';

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)]);
  }
  return out;
};

/** Out along a stroke and straight back, so the pen ends where it began. */
const retrace = (out: Pt[]): Pt[] => [...out, ...out.slice(0, -1).reverse()];

const X_HEIGHT = 16;
const ASCENDER = 27;
const HANG = 23;

const t = (x: number): Pt[] => [
  [x + 6, 0],
  [x + 6, -ASCENDER],
  [x + 6, -X_HEIGHT],
  [x + 0.5, -X_HEIGHT],
  [x + 12.5, -X_HEIGHT],
  [x + 6, -X_HEIGHT],
  [x + 6, 0],
];

const a = (x: number): Pt[] => [
  [x + 17, 0],
  [x + 17, -X_HEIGHT],
  [x + 17, -8],
  ...arc(x + 9, -8, 8, 8, 0, 360, 36).slice(1),
  [x + 17, 0],
];

const r = (x: number): Pt[] => {
  const shoulder = arc(x + 11, -8.5, 7, 7, 180, 62, 14);
  return [[x + 4, 0], [x + 4, -X_HEIGHT], [x + 4, -8.5], ...shoulder.slice(1), ...shoulder.slice(0, -1).reverse(), [x + 4, 0]];
};

/** त: a stem, and an arm that leaves it and curls down the left side. */
const ta = (x: number): Pt[] => {
  const curl = arc(x + 9.5, 14.8, 8.2, 7.6, 84, 250, 26);
  return [[x + 17, 0], [x + 17, HANG], ...retrace([[x + 17, 7.2], ...curl, [x + 9.2, HANG + 0.4]]), [x + 17, 0]];
};

/** ा: a plain stem. */
const aa = (x: number): Pt[] => [
  [x, 0],
  [x, HANG],
  [x, 0],
];

/** र: a short neck, a bowl, and a leg striding down to the right. */
const ra = (x: number): Pt[] => {
  const bowl = arc(x + 7.2, 9.2, 5.6, 4.9, 68, 262, 20);
  return retrace([[x + 9.4, 0], [x + 9.4, 4.4], ...bowl, [x + 17.5, HANG + 0.4]]);
};

const LATIN_WIDTH = 80;
const GAP = 22;
const DEVANAGARI_WIDTH = 48;

/** Units from the first letter's edge to the last letter's edge. */
export const WORDMARK_WIDTH = LATIN_WIDTH + GAP + DEVANAGARI_WIDTH;
export const WORDMARK_ABOVE = ASCENDER + 3;
export const WORDMARK_BELOW = HANG + 4;

/**
 * The path of a line that crosses `width` pixels and writes both words on the way, starting `inset` pixels in,
 * at `scale` pixels per unit. The line itself sits at y = 0.
 */
export function wordmarkPath(width: number, inset: number, scale: number): string {
  const letters: Pt[] = [...t(0), ...a(15), ...a(38), ...r(62), ...ta(LATIN_WIDTH + GAP), ...aa(LATIN_WIDTH + GAP + 26), ...ra(LATIN_WIDTH + GAP + 30)];
  const points: Pt[] = [[-8, 0], ...letters.map(([x, y]) => [inset + x * scale, y * scale] as Pt), [width + 8, 0]];
  return toPath(points, 1.6 * scale);
}
