/**
 * Taar glyphs.
 *
 * Every control is drawn by the same pen that draws the seek line, so each glyph is an open polyline that
 * leaves the baseline and comes back to it without lifting. Coordinates are in a 44-unit slot whose centre is
 * x = 22; y is negative above the line. The first and last point sit on the baseline (y = 0), and the line
 * between two neighbouring controls is simply the baseline itself.
 *
 * Going back over a stroke is allowed (the pen may retrace, it may not lift), which is how closed shapes such
 * as the speaker or the picture-in-picture frame attach to the line at a single corner.
 */
export type Pt = [number, number];

export const SLOT = 44;
export const CAP = 18;

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy - r * Math.sin(a)]);
  }
  return out;
};

/** A flag on the line: the triangle stands on its lower corner and the line runs on beneath it. */
const play = (): Pt[] => [
  [14, 0],
  [14, -18],
  [30, -9],
  [14, 0],
];

/** Two pulses. */
const pause = (): Pt[] => [
  [13, 0],
  [13, -18],
  [19, -18],
  [19, 0],
  [25, 0],
  [25, -18],
  [31, -18],
  [31, 0],
];

/** An open ring with an arrowhead, drawn out and retraced. */
const replay = (): Pt[] => {
  const sweep = 236;
  const ring = arc(22, -9, 9, 270, 270 + sweep, 30);
  const [ex, ey] = ring[ring.length - 1]!;
  const t = ((270 + sweep) * Math.PI) / 180;
  const tx = -Math.sin(t);
  const ty = -Math.cos(t);
  const barb = (spread: number): Pt => {
    const c = Math.cos(spread);
    const s = Math.sin(spread);
    return [ex - (tx * c - ty * s) * 7, ey - (tx * s + ty * c) * 7];
  };
  return [[22, 0], ...ring.slice(1), barb(0.95), [ex, ey], barb(-0.6), [ex, ey], ...ring.slice(0, -1).reverse()];
};

/**
 * The horn. Its upright front edge can grow into a mast (`mast` units tall above the horn): that is the volume
 * slider, still the same stroke, drawn up and retraced.
 */
const horn = (mast: number): Pt[] => [
  [17, 0],
  [17, -18 - mast],
  [17, -18],
  [10, -12],
  [5, -12],
  [5, -6],
  [10, -6],
  [17, 0],
];

/** Where the mast stands in the slot, for the bead that rides it. */
export const MAST_X = 17;

const WAVE_STEPS = 28;

/** A horn, then the line itself carries the sound: the wave's height is the volume. */
const speaker = (level = 1, mast = 0): Pt[] => {
  const out: Pt[] = [...horn(mast), [21, 0]];
  const x0 = 21;
  const x1 = 39;
  const amp = level <= 0 ? 0 : 1.2 + 4.3 * level;
  for (let i = 1; i <= WAVE_STEPS; i++) {
    const u = i / WAVE_STEPS;
    out.push([x0 + (x1 - x0) * u, -amp * Math.sin(u * 4 * Math.PI) * Math.sin(Math.PI * u) ** 0.6]);
  }
  return out;
};

/** The same horn with a stroke through it and a flat line after. */
const muted = (mast = 0): Pt[] => [[2, 0], [22, -19], [2, 0], ...horn(mast)];

/** A speech bubble whose tail touches the line. */
const captions = (): Pt[] => [
  [13, 0],
  [13, -6],
  [9, -6],
  [9, -19],
  [35, -19],
  [35, -6],
  [19, -6],
  [13, 0],
];

/** A six-tooth cog standing on one tooth. */
const gear = (): Pt[] => {
  const cx = 22;
  const cy = -10;
  const outer = 10;
  const inner = 6.9;
  const half = 11.5;
  const flank = 6.5;
  const at = (deg: number, radius: number): Pt => {
    const t = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(t), cy - radius * Math.sin(t)];
  };
  const left = at(270 - half, outer)[0];
  const right = at(270 + half, outer)[0];
  // Along the foot of the bottom tooth, counter-clockwise round the rim, and back along the foot.
  const out: Pt[] = [[left, 0], [right, 0], at(270 + half + flank, inner)];
  for (let k = 1; k < 6; k++) {
    const c = 270 + k * 60;
    out.push(at(c - half - flank, inner), at(c - half, outer), at(c + half, outer), at(c + half + flank, inner));
  }
  out.push(at(270 - half - flank + 360, inner), [left, 0], [right, 0]);
  return out;
};

/** A screen with a smaller screen in its corner. */
const pip = (): Pt[] => [
  [9, 0],
  [22, 0],
  [22, -9],
  [35, -9],
  [35, -17],
  [9, -17],
  [9, 0],
  [22, 0],
  [35, 0],
  [35, -9],
  [35, 0],
];

/** An arrow growing out of the line's corner. */
const fullscreenEnter = (): Pt[] => [
  [12, 0],
  [12, -7],
  [12, 0],
  [31, -19],
  [24, -19],
  [31, -19],
  [31, -12],
  [31, -19],
  [12, 0],
];

/** The arrow turned round: it points back down into the corner it grew from. */
const fullscreenExit = (): Pt[] => [
  [13, 0],
  [13, -12],
  [13, -4],
  [21, -4],
  [13, -4],
  [29, -20],
  [13, -4],
  [13, 0],
];

/** A screen with a triangle rising through its base. */
const airplay = (): Pt[] => [
  [9, 0],
  [16, 0],
  [22, -8],
  [28, 0],
  [35, 0],
  [35, -17],
  [9, -17],
  [9, 0],
  [35, 0],
];

/** A screen with a signal fanning out of its corner. */
const cast = (): Pt[] => {
  const fan = arc(9, 0, 9, 90, 0, 10);
  return [[9, 0], [9, -17], [35, -17], [35, 0], [18, 0], ...fan.slice().reverse(), [9, -5], [9, 0], [35, 0]];
};

export const glyphs = {
  play,
  pause,
  replay,
  speaker,
  muted,
  captions,
  gear,
  pip,
  'fullscreen-enter': fullscreenEnter,
  'fullscreen-exit': fullscreenExit,
  airplay,
  cast,
} as const;

export type GlyphName = keyof typeof glyphs;

/** Corner softness per glyph, relative to the default. Small teeth need crisper corners to stay teeth. */
export const softness: Partial<Record<GlyphName, number>> = {
  gear: 0.5,
  replay: 0.6,
};

/** Closed regions that fill in when a toggle is on, so state never rests on colour alone. */
export const fills: Partial<Record<GlyphName, Pt[]>> = {
  captions: [
    [9, -6],
    [9, -19],
    [35, -19],
    [35, -6],
  ],
  pip: [
    [22, 0],
    [22, -9],
    [35, -9],
    [35, 0],
  ],
  airplay: [
    [16, 0],
    [22, -8],
    [28, 0],
  ],
  cast: [
    [9, 0],
    [9, -9],
    [18, 0],
  ],
};

/** Evenly spaced points along a polyline, for blending one glyph into another. */
export function resample(points: Pt[], count: number): Pt[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[lengths.length - 1]!;
  if (total === 0) return Array.from({ length: count }, () => [points[0]![0], points[0]![1]] as Pt);
  const out: Pt[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (seg < points.length - 1 && lengths[seg]! < target) seg++;
    const span = lengths[seg]! - lengths[seg - 1]! || 1;
    const u = (target - lengths[seg - 1]!) / span;
    const [ax, ay] = points[seg - 1]!;
    const [bx, by] = points[seg]!;
    out.push([ax + (bx - ax) * u, ay + (by - ay) * u]);
  }
  return out;
}

export function blend(a: Pt[], b: Pt[], mix: number): Pt[] {
  return a.map(([ax, ay], i) => [ax + (b[i]![0] - ax) * mix, ay + (b[i]![1] - ay) * mix] as Pt);
}

/**
 * Turn points into a path, easing each corner with a quadratic curve. A corner where the pen doubles straight
 * back stays sharp, so retraced strokes cover themselves exactly. `radii[i]` is the corner radius at point i.
 */
export function toPath(points: Pt[], radii: number[] | number): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M${f(points[0]![0])},${f(points[0]![1])}`;
  let [px, py] = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    const a = Math.hypot(x - px, y - py);
    const b = Math.hypot(nx - x, ny - y);
    if (a < 0.01) continue;
    if (b < 0.01) continue;
    const cos = ((px - x) * (nx - x) + (py - y) * (ny - y)) / (a * b);
    const radius = typeof radii === 'number' ? radii : (radii[i] ?? 0);
    if (radius <= 0 || cos > 0.97 || cos < -0.995) {
      d += `L${f(x)},${f(y)}`;
    } else {
      const ra = Math.min(radius, a / 2);
      const rb = Math.min(radius, b / 2);
      d += `L${f(x - ((x - px) / a) * ra)},${f(y - ((y - py) / a) * ra)}Q${f(x)},${f(y)} ${f(x + ((nx - x) / b) * rb)},${f(y + ((ny - y) / b) * rb)}`;
    }
    px = x;
    py = y;
  }
  const last = points[points.length - 1]!;
  return `${d}L${f(last[0])},${f(last[1])}`;
}
