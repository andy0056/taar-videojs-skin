/**
 * <taar-line> draws the whole player as one unbroken line.
 *
 * The real controls (Video.js buttons and sliders) sit in the layout as transparent hit targets, each marked with
 * `data-taar`. This element measures where they are and runs a single stroke through all of them: flat between
 * controls, raised into a glyph at each button, and pulled taut as a string across the time slider. Roles, labels,
 * keyboard handling and focus all stay with the Video.js components; this element is presentation only.
 *
 * Three poses share one geometry, so the line can move between them without a cut:
 *   poster  the line is a horizon through the middle of the frame, with only the play flag raised
 *   active  the line sits at the foot of the frame and every control stands up out of it
 *   idle    the line lies flat on the bottom edge as a progress hairline
 */
import {
  UIElement,
  PlayerController,
  playerContext,
  selectBuffer,
  selectPlayback,
  selectTextTrack,
  selectTime,
  selectVolume,
  type PropertyValues,
} from '@videojs/html';

import { MAST_X, blend, fills, glyphs, resample, softness, toPath, type GlyphName, type Pt } from './glyphs';

type Mode = 'poster' | 'active' | 'idle';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SLOT_CENTRE = 22;
/** The baseline sits this far down a 44-unit slot, leaving room for the glyph above and a thumb's width below. */
const BASELINE = 34 / 44;
const MORPH_POINTS = 64;
const STRING_POINTS = 72;

class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    value: number,
    public stiffness = 220,
    public damping = 28
  ) {
    this.value = value;
    this.target = value;
  }

  snap(value = this.target): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  step(dt: number): void {
    // Semi-implicit Euler in small steps keeps stiff springs stable at any frame rate.
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 0.004);
      this.velocity += (this.stiffness * (this.target - this.value) - this.damping * this.velocity) * h;
      this.value += this.velocity * h;
      left -= h;
    }
  }

  get resting(): boolean {
    return Math.abs(this.target - this.value) < 0.004 && Math.abs(this.velocity) < 0.05;
  }
}

interface GlyphNode {
  el: HTMLElement;
  role: string;
  present: boolean;
  seen: boolean;
  hover: boolean;
  focus: boolean;
  x: Spring;
  scale: Spring;
  rise: Spring;
  hot: Spring;
  press: Spring;
  fill: Spring;
  glyph: GlyphName;
  level: Spring;
  points: Pt[];
  from: Pt[] | null;
  to: Pt[] | null;
  mix: Spring;
  riseAt: number;
  riseTo: number;
  fillPath: SVGPathElement | null;
}

interface Stretch {
  el: HTMLElement | null;
  present: boolean;
  seen: boolean;
  x0: Spring;
  x1: Spring;
}

interface StoreSlice {
  [key: string]: unknown;
}

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export class TaarLineElement extends UIElement {
  #playback = new PlayerController(this, playerContext, selectPlayback);
  #time = new PlayerController(this, playerContext, selectTime);
  #buffer = new PlayerController(this, playerContext, selectBuffer);
  #volume = new PlayerController(this, playerContext, selectVolume);
  #tracks = new PlayerController(this, playerContext, selectTextTrack);

  #disconnect: AbortController | null = null;
  #container: HTMLElement | null = null;
  #resize: ResizeObserver | null = null;
  #mutations: MutationObserver | null = null;
  #motion: MediaQueryList | null = null;

  #svg!: SVGSVGElement;
  #casing!: SVGPathElement;
  #bufferPath!: SVGPathElement;
  #core!: SVGPathElement;
  #played!: SVGPathElement;
  #levelPath!: SVGPathElement;
  #hotPath!: SVGPathElement;
  #fillGroup!: SVGGElement;
  #beadCasing!: SVGCircleElement;
  #bead!: SVGCircleElement;
  #levelBead!: SVGCircleElement;

  #nodes: GlyphNode[] = [];
  #seek: Stretch = { el: null, present: false, seen: false, x0: new Spring(0, 150, 24), x1: new Spring(0, 150, 24) };
  /** The volume slider is a mast that rises out of the speaker: `x0` is its foot and `x1` its top, as heights. */
  #level: Stretch = { el: null, present: false, seen: false, x0: new Spring(0, 400, 40), x1: new Spring(0, 400, 40) };
  #mast = new Spring(0, 380, 32);

  #mode: Mode = 'poster';
  /** One slot unit in pixels: 1 at the default size, larger when the host raises `--media-scale-unit`. */
  #unit = 1;
  #width = 0;
  #height = 0;
  #ready = false;
  #dirty = true;
  #raf = 0;
  #last = 0;
  #frame = 0;
  #clock = 0;

  #lineY = new Spring(0, 150, 24);
  #stroke = new Spring(2, 150, 24);
  #open = new Spring(0, 300, 34);
  #ink = new Spring(1, 200, 28);
  #progress = new Spring(0, 260, 32);
  #beadRadius = new Spring(0, 420, 34);
  #volumeLevel = new Spring(1, 300, 34);
  #wave = new Spring(0, 60, 16);
  #tick = new Spring(0, 520, 40);

  #pointing = false;
  #dragging = false;
  #pointerFraction = 0;
  #pointerY = 0;
  #pull = 0;
  #u = new Float32Array(STRING_POINTS + 1);
  #v = new Float32Array(STRING_POINTS + 1);
  #ringing = false;
  #chapters: number[] = [];
  #buffered = 0;
  #lastFill = -1;
  #lastTime = 0;
  #lastWall = 0;
  #settleAt = 0;

  /**
   * Fine scrubbing. While the string is held, pulling the pointer away from the line slows the scrub: the further
   * the pull, the finer the step. The Video.js slider keeps doing the seeking; it is simply handed a pointer that
   * moves more slowly than the real one.
   */
  #scrub: { id: number; x: number; last: number; min: number; max: number; diverged: boolean } | null = null;
  #relayed = new WeakSet<Event>();
  #liftReset = 0;
  #rate = 1;

  connectedCallback(): void {
    super.connectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = new AbortController();
    const { signal } = this.#disconnect;

    if (!this.#svg) this.#build();
    this.setAttribute('aria-hidden', 'true');

    this.#container = this.closest<HTMLElement>('media-container, .media-container');
    const container = this.#container;
    if (!container) return;

    this.#motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#motion.addEventListener('change', () => this.#invalidate(), { signal });

    this.#resize = new ResizeObserver(() => this.#invalidate());
    this.#resize.observe(container);

    // Controls report their state through attributes, and the layout shifts when they appear or hide.
    this.#mutations = new MutationObserver((records) => {
      // Our own drawing changes attributes too; only the player's changes matter.
      if (records.some((record) => !this.contains(record.target))) this.#invalidate();
    });
    this.#mutations.observe(container, { attributes: true, childList: true, subtree: true });

    container.addEventListener('pointerover', this.#onPointerOver, { signal });
    container.addEventListener('pointerout', this.#onPointerOut, { signal });
    container.addEventListener('pointerdown', this.#onPointerDown, { signal });
    container.addEventListener('focusin', this.#onFocus, { signal });
    container.addEventListener('focusout', this.#onFocus, { signal });
    window.addEventListener('pointerup', this.#onPointerUp, { signal });
    window.addEventListener('pointercancel', this.#onPointerUp, { signal });
    window.addEventListener('pointermove', this.#onPointerMove, { signal, passive: true });
    container.addEventListener('pointerdown', this.#scrubStart, { signal, capture: true });
    container.addEventListener('pointermove', this.#scrubMove, { signal, capture: true });
    container.addEventListener('pointerup', this.#scrubEnd, { signal, capture: true });
    container.addEventListener('pointercancel', this.#scrubCancel, { signal, capture: true });

    this.#invalidate();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.#resize?.disconnect();
    this.#mutations?.disconnect();
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    clearTimeout(this.#liftReset);
  }

  update(changed: PropertyValues): void {
    super.update(changed);
    this.#invalidate();
  }

  // ───────────────────────────────────────────────────────────── build

  #build(): void {
    const el = <K extends keyof SVGElementTagNameMap>(name: K, className: string): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, name);
      node.setAttribute('class', className);
      return node;
    };
    this.#svg = el('svg', 'taar-svg');
    this.#svg.setAttribute('aria-hidden', 'true');
    this.#svg.setAttribute('focusable', 'false');
    this.#casing = el('path', 'taar-casing');
    this.#bufferPath = el('path', 'taar-buffer');
    this.#core = el('path', 'taar-core');
    this.#played = el('path', 'taar-played');
    this.#levelPath = el('path', 'taar-level-fill');
    this.#hotPath = el('path', 'taar-hot');
    this.#fillGroup = el('g', 'taar-fills');
    this.#beadCasing = el('circle', 'taar-bead-casing');
    this.#bead = el('circle', 'taar-bead');
    this.#levelBead = el('circle', 'taar-level-bead');
    this.#svg.append(
      this.#casing,
      this.#bufferPath,
      this.#core,
      this.#fillGroup,
      this.#played,
      this.#levelPath,
      this.#hotPath,
      this.#beadCasing,
      this.#bead,
      this.#levelBead
    );
    this.append(this.#svg);
  }

  // ───────────────────────────────────────────────────────────── input

  #nodeFor(target: EventTarget | null): GlyphNode | undefined {
    if (!(target instanceof Element)) return undefined;
    const el = target.closest('[data-taar]');
    return el ? this.#nodes.find((node) => node.el === el) : undefined;
  }

  #onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const node = this.#nodeFor(event.target);
    if (node) {
      node.hover = true;
      this.#invalidate();
    }
    if (this.#seek.el && event.target instanceof Node && this.#seek.el.contains(event.target)) {
      this.#pointing = true;
      this.#trackPointer(event);
    }
  };

  #onPointerOut = (event: PointerEvent): void => {
    const node = this.#nodeFor(event.target);
    if (node && !(event.relatedTarget instanceof Node && node.el.contains(event.relatedTarget))) {
      node.hover = false;
      this.#invalidate();
    }
    const seek = this.#seek.el;
    if (seek && event.target instanceof Node && seek.contains(event.target)) {
      if (!(event.relatedTarget instanceof Node && seek.contains(event.relatedTarget))) {
        this.#pointing = false;
        this.#invalidate();
      }
    }
  };

  #onPointerDown = (event: PointerEvent): void => {
    const node = this.#nodeFor(event.target);
    if (node) {
      node.press.target = 1;
      this.#wake();
    }
    if (this.#seek.el && event.target instanceof Node && this.#seek.el.contains(event.target)) this.#trackPointer(event);
  };

  #onPointerUp = (): void => {
    for (const node of this.#nodes) node.press.target = 0;
    this.#wake();
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#pointing && !this.#dragging) return;
    this.#trackPointer(event);
  };

  #onFocus = (): void => {
    // `:focus-visible` settles after the event, so read it on the next frame.
    requestAnimationFrame(() => {
      for (const node of this.#nodes) node.focus = node.el.matches(':focus-visible');
      this.#invalidate();
    });
  };

  #onSeek(event: Event): boolean {
    const seek = this.#seek.el;
    return !!seek && event.target instanceof Node && seek.contains(event.target);
  }

  #scrubStart = (event: PointerEvent): void => {
    if (!event.isTrusted || !this.#onSeek(event) || this.#still) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = this.#seek.el!.getBoundingClientRect();
    this.#scrub = { id: event.pointerId, x: event.clientX, last: event.clientX, min: rect.left, max: rect.right, diverged: false };
    this.#setRate(1);
    this.#setLift(0);
  };

  #scrubMove = (event: PointerEvent): void => {
    const scrub = this.#scrub;
    if (!scrub || event.pointerId !== scrub.id || this.#relayed.has(event) || !this.#container) return;
    const lineY = this.#container.getBoundingClientRect().top + this.#lineY.value;
    const away = Math.abs(event.clientY - lineY);
    // Whole steps, so the label beside the bead can say exactly how fine the scrub is.
    const reach = away / this.#unit;
    const rate = reach < 36 ? 1 : reach < 84 ? 0.5 : reach < 140 ? 0.25 : 0.125;
    this.#setRate(rate);
    this.#liftAbove(event, lineY);
    scrub.x = Math.min(scrub.max, Math.max(scrub.min, scrub.x + (event.clientX - scrub.last) * rate));
    scrub.last = event.clientX;
    if (!scrub.diverged && Math.abs(scrub.x - event.clientX) < 0.5) return;
    scrub.diverged = true;
    event.stopPropagation();
    this.#relay(event, 'pointermove', scrub.x);
  };

  #scrubEnd = (event: PointerEvent): void => {
    const scrub = this.#scrub;
    if (!scrub || event.pointerId !== scrub.id || this.#relayed.has(event)) return;
    this.#scrub = null;
    this.#setRate(1);
    this.#settleLift();
    if (!scrub.diverged) return;
    event.stopPropagation();
    this.#relay(event, 'pointerup', scrub.x);
  };

  #scrubCancel = (event: PointerEvent): void => {
    if (this.#scrub && event.pointerId === this.#scrub.id) {
      this.#scrub = null;
      this.#setRate(1);
      this.#settleLift();
    }
  };

  /** Pass a pointer event on to the slider with its horizontal position replaced. */
  #relay(event: PointerEvent, type: string, x: number): void {
    const copy = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      clientX: x,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    this.#relayed.add(copy);
    event.target?.dispatchEvent(copy);
  }

  #setRate(rate: number): void {
    if (rate === this.#rate) return;
    this.#rate = rate;
    const seek = this.#seek.el;
    if (!seek) return;
    if (rate === 1) delete seek.dataset.taarRate;
    else seek.dataset.taarRate = String(Math.round(1 / rate));
  }

  /**
   * Pulling the string upward puts the pointer where the preview normally sits, so the preview rides just above
   * whatever is doing the pulling: a little clear of a cursor, further clear of a fingertip.
   */
  #liftAbove(event: PointerEvent, lineY: number): void {
    const seek = this.#seek.el;
    const container = this.#container;
    if (!seek || !container) return;
    const unit = this.#unit;
    const preview = seek.querySelector<HTMLElement>('.taar-seek-preview');
    // Where the preview's lower edge rests, measured up from the line (see `.taar-seek-preview` in the stylesheet).
    const rest = seek.getBoundingClientRect().height * BASELINE - 2 * unit;
    const clearance = (event.pointerType === 'mouse' ? 14 : 40) * unit;
    const room = lineY - container.getBoundingClientRect().top - rest - (preview?.offsetHeight ?? 0) - 6 * unit;
    this.#setLift(Math.max(0, Math.min(lineY - event.clientY + clearance - rest, room)));
  }

  #setLift(lift: number): void {
    clearTimeout(this.#liftReset);
    const seek = this.#seek.el;
    if (!seek) return;
    if (lift > 0.5) seek.style.setProperty('--taar-lift', `${lift.toFixed(1)}px`);
    else seek.style.removeProperty('--taar-lift');
  }

  /** After a release the preview usually fades where it is; it drops back only once that fade is over. */
  #settleLift(): void {
    clearTimeout(this.#liftReset);
    this.#liftReset = window.setTimeout(() => this.#setLift(0), 240);
  }

  #trackPointer(event: PointerEvent): void {
    const container = this.#container;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const x0 = this.#seek.x0.value;
    const x1 = this.#seek.x1.value;
    const span = Math.max(1, x1 - x0);
    const fraction = (event.clientX - box.left - x0) / span;
    this.#pointerFraction = Math.min(1, Math.max(0, fraction));
    this.#pointerY = event.clientY - box.top;
    this.#wake();
  }

  // ───────────────────────────────────────────────────────────── state

  #invalidate(): void {
    this.#dirty = true;
    this.#wake();
  }

  #wake(): void {
    if (this.#raf || !this.isConnected) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#loop);
  }

  get #still(): boolean {
    return this.#motion?.matches ?? false;
  }

  #collect(): void {
    const container = this.#container;
    if (!container) return;
    const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-taar]'));
    for (const node of this.#nodes) node.seen = false;
    this.#seek.seen = false;
    this.#level.seen = false;

    for (const el of anchors) {
      const role = el.dataset.taar ?? '';
      if (role === 'seek') {
        this.#seek.el = el;
        this.#seek.seen = true;
        continue;
      }
      if (role === 'level') {
        this.#level.el = el;
        this.#level.seen = true;
        continue;
      }
      let node = this.#nodes.find((candidate) => candidate.el === el);
      if (!node) {
        node = {
          el,
          role,
          present: false,
          seen: true,
          hover: false,
          focus: false,
          x: new Spring(0, 150, 24),
          scale: new Spring(1, 150, 24),
          rise: new Spring(0, 520, 34),
          hot: new Spring(0, 620, 44),
          press: new Spring(0, 900, 50),
          fill: new Spring(0, 420, 38),
          glyph: 'play',
          level: new Spring(1, 300, 34),
          points: glyphs.play(),
          from: null,
          to: null,
          mix: new Spring(1, 620, 44),
          riseAt: 0,
          riseTo: 0,
          fillPath: null,
        };
        node.glyph = this.#glyphFor(node);
        node.points = this.#shape(node, node.glyph);
        this.#nodes.push(node);
      }
      node.seen = true;
    }
    this.#nodes = this.#nodes.filter((node) => {
      if (!node.seen) node.fillPath?.remove();
      return node.seen;
    });
    if (!this.#seek.seen) this.#seek.el = null;
    if (!this.#level.seen) this.#level.el = null;
  }

  #glyphFor(node: GlyphNode): GlyphName {
    const el = node.el;
    switch (node.role) {
      case 'play':
        if (el.hasAttribute('data-ended')) return 'replay';
        return el.hasAttribute('data-paused') || !el.hasAttribute('data-started') ? 'play' : 'pause';
      case 'volume':
        return el.hasAttribute('data-muted') || el.dataset.volumeLevel === 'off' ? 'muted' : 'speaker';
      case 'captions':
        return 'captions';
      case 'settings':
        return 'gear';
      case 'pip':
        return 'pip';
      case 'fullscreen':
        return el.hasAttribute('data-fullscreen') ? 'fullscreen-exit' : 'fullscreen-enter';
      case 'airplay':
        return 'airplay';
      case 'cast':
        return 'cast';
      default:
        return 'play';
    }
  }

  #shape(node: GlyphNode, glyph: GlyphName): Pt[] {
    // The mast is measured in pixels; glyphs are drawn in slot units.
    const mast = node.role === 'volume' ? Math.max(0, this.#mast.value) / Math.max(0.2, node.scale.value) : 0;
    if (glyph === 'speaker') return glyphs.speaker(node.level.value, mast);
    if (glyph === 'muted') return glyphs.muted(mast);
    return glyphs[glyph]();
  }

  #isOn(node: GlyphNode): boolean {
    const el = node.el;
    switch (node.role) {
      case 'captions':
        return el.hasAttribute('data-active');
      case 'pip':
        return el.hasAttribute('data-pip');
      case 'airplay':
        return el.dataset.airplayState === 'connected';
      case 'cast':
        return el.dataset.castState === 'connected';
      default:
        return false;
    }
  }

  /** Read the layout and the controls' state, and aim every spring at where it should end up. */
  #measure(now: number): void {
    const container = this.#container;
    if (!container) return;
    this.#collect();

    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const resized = Math.abs(box.width - this.#width) > 0.5 || Math.abs(box.height - this.#height) > 0.5;
    this.#width = box.width;
    this.#height = box.height;
    this.#svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

    const playNode = this.#nodes.find((node) => node.role === 'play');
    const started = playNode ? playNode.el.hasAttribute('data-started') : true;
    const controls = container.querySelector('media-controls');
    const visible = controls ? controls.hasAttribute('data-visible') : true;
    const mode: Mode = !started ? 'poster' : visible ? 'active' : 'idle';
    const modeChanged = mode !== this.#mode;
    const previous = this.#mode;
    this.#mode = mode;
    this.dataset.mode = mode;

    // First layout, a resize, or a reduced-motion preference: place everything without animating.
    const jump = !this.#ready || resized || this.#still;

    // Stroke weights and distances follow the size of a slot, so the line scales with `--media-scale-unit`.
    const slot = this.#seek.el?.getBoundingClientRect().height ?? 0;
    if (slot > 1) this.#unit = slot / 44;
    const unit = this.#unit;

    let lineY = this.#lineY.target;
    let reference: DOMRect | null = null;
    const origin = playNode ? playNode.el.getBoundingClientRect() : null;

    for (const node of this.#nodes) {
      const rect = node.el.getBoundingClientRect();
      const present = rect.width > 1 && rect.height > 1;
      if (present && (!reference || node.role === 'play')) reference = rect;
      const wasPresent = node.present;
      node.present = present;

      if (present) {
        node.x.target = rect.left - box.left + rect.width / 2;
        node.scale.target = rect.height / 44;
        if (jump || !wasPresent) {
          node.x.snap();
          node.scale.snap();
        }
      }

      const raised = present && (mode === 'active' || (mode === 'poster' && node.role === 'play'));
      const riseTo = raised ? 1 : 0;
      if (riseTo !== node.riseTo) {
        node.riseTo = riseTo;
        // Controls stand up in a quick ripple outward from the play flag, and lie down together.
        const distance = origin ? Math.abs(rect.left - origin.left) : 0;
        node.riseAt = riseTo && modeChanged && previous !== 'poster' ? now + Math.min(70, distance * 0.09) : now;
        if (riseTo && modeChanged && previous === 'poster') node.riseAt = now + 120 + Math.min(160, distance * 0.22);
        node.rise.stiffness = riseTo ? 520 : 700;
        node.rise.damping = riseTo ? 34 : 52;
      }
      if (jump) {
        node.riseAt = now;
        node.rise.snap(riseTo);
      }

      const glyph = this.#glyphFor(node);
      if (glyph !== node.glyph) {
        const current = this.#shape(node, node.glyph);
        const next = this.#shape(node, glyph);
        node.glyph = glyph;
        if (jump || node.rise.value < 0.05) {
          node.from = null;
          node.to = null;
          node.mix.snap(1);
        } else {
          node.from = resample(node.from && node.to ? blend(node.from, node.to, node.mix.value) : current, MORPH_POINTS);
          node.to = resample(next, MORPH_POINTS);
          node.mix.snap(0);
          node.mix.target = 1;
        }
        node.points = next;
      }

      node.fill.target = this.#isOn(node) ? 1 : 0;
      node.hot.target = node.hover || node.focus || node.el.getAttribute('aria-expanded') === 'true' ? 1 : 0;
      if (jump) node.fill.snap();
    }

    if (reference) lineY = reference.top - box.top + reference.height * BASELINE;
    if (mode === 'idle') lineY = box.height - 1.5 * unit;
    this.#lineY.target = lineY;
    this.#stroke.target = (mode === 'poster' && playNode ? 2 + 0.36 * (playNode.scale.target / unit - 1) : 2) * unit;
    this.#ink.target = mode === 'idle' ? 0.55 : 1;
    // Coming down from the poster, the bead and frets wait until the line has landed.
    if (modeChanged && previous === 'poster' && !jump) this.#settleAt = now + 300;
    const landed = now >= this.#settleAt;
    if (!landed) this.#dirty = true;
    this.#open.target = mode === 'active' && landed ? 1 : 0;
    this.#beadRadius.target = mode === 'active' && landed ? (this.#dragging ? 7.5 : this.#pointing ? 6.5 : 5) * unit : 0;

    // The time slider is the taut part of the line. At rest on the bottom edge it spans the whole frame.
    const seek = this.#seek;
    const seekRect = seek.el?.getBoundingClientRect();
    seek.present = !!seekRect && seekRect.width > 1;
    if (mode === 'idle' || !seek.present || !seekRect) {
      seek.x0.target = 0;
      seek.x1.target = box.width;
    } else {
      seek.x0.target = seekRect.left - box.left;
      seek.x1.target = seekRect.right - box.left;
    }
    const level = this.#level;
    const levelRect = level.el?.getBoundingClientRect();
    const popup = level.el?.closest('[popover], media-volume-popover');
    level.present = !!levelRect && levelRect.height > 6 && mode === 'active' && (!popup || popup.hasAttribute('data-open'));
    if (levelRect && levelRect.height > 6) {
      level.x0.snap(lineY - (levelRect.bottom - box.top));
      level.x1.snap(lineY - (levelRect.top - box.top));
    }
    this.#mast.target = level.present ? level.x1.value : 0;
    if (jump) this.#mast.snap();

    if (jump) {
      this.#lineY.snap();
      this.#stroke.snap();
      this.#open.snap();
      this.#ink.snap();
      this.#beadRadius.snap();
      seek.x0.snap();
      seek.x1.snap();
    }

    // Slider state.
    const slider = seek.el;
    const wasDragging = this.#dragging;
    this.#dragging = !!slider && slider.hasAttribute('data-dragging');
    if (wasDragging && !this.#dragging) this.#release();

    const time = this.#time.value as StoreSlice | undefined;
    const duration = num(time?.duration);
    let fill = -1;
    const inline = slider?.style.getPropertyValue('--media-slider-fill');
    if (inline) fill = Number.parseFloat(inline) / 100;
    if (!(fill >= 0) && duration > 0) fill = num(time?.currentTime) / duration;
    fill = Math.min(1, Math.max(0, fill >= 0 ? fill : 0));
    if (this.#dragging) {
      const pointer = slider?.style.getPropertyValue('--media-slider-pointer');
      if (pointer) fill = Math.min(1, Math.max(0, Number.parseFloat(pointer) / 100));
    }
    const leap = Math.abs(fill - this.#progress.target);
    this.#progress.target = fill;
    if (jump || this.#dragging || leap > 0.2 || this.#lastFill < 0) this.#progress.snap();
    // A seek that is not a drag gives the string a small flick where it lands. Playback moves media time in step
    // with the clock; a seek does not.
    const mediaTime = num(time?.currentTime);
    const drift = Math.abs(mediaTime - this.#lastTime) - (now - this.#lastWall) / 1000 * 2.5;
    if (!jump && !this.#dragging && !wasDragging && drift > 0.6 && this.#lastFill >= 0 && mode === 'active') this.#flick(fill, 3 * unit);
    this.#lastTime = mediaTime;
    this.#lastWall = now;
    this.#lastFill = fill;

    const buffer = this.#buffer.value as StoreSlice | undefined;
    const ranges = Array.isArray(buffer?.buffered) ? (buffer.buffered as [number, number][]) : [];
    const current = num(time?.currentTime);
    let end = 0;
    for (const [start, stop] of ranges) if (start <= current + 0.25 && stop > end) end = stop;
    this.#buffered = duration > 0 ? Math.min(1, Math.max(fill, end / duration)) : fill;

    const tracks = this.#tracks.value as StoreSlice | undefined;
    const cues = Array.isArray(tracks?.chaptersCues) ? (tracks.chaptersCues as { startTime: number }[]) : [];
    this.#chapters = duration > 0 ? cues.map((cue) => cue.startTime / duration).filter((f) => f > 0.005 && f < 0.995) : [];

    const volume = this.#volume.value as StoreSlice | undefined;
    const muted = volume?.muted === true;
    const loudness = muted ? 0 : num(volume?.volume, 1);
    this.#volumeLevel.target = loudness;
    for (const node of this.#nodes) if (node.role === 'volume') node.level.target = loudness;
    if (jump) {
      this.#volumeLevel.snap();
      for (const node of this.#nodes) node.level.snap();
    }

    const playback = this.#playback.value as StoreSlice | undefined;
    const waiting = playback?.waiting === true && playback?.paused !== true && started;
    // `data-waiting` forces the ripple, for demos and tests of the loading state.
    const rippling = (waiting || this.hasAttribute('data-waiting')) && mode !== 'poster';
    this.#wave.target = rippling && !this.#dragging && !this.#still ? 1 : 0;

    this.#ready = true;
  }

  /** Let go of a plucked string: it keeps the shape it was pulled into and is free to ring. */
  #release(): void {
    if (this.#still) {
      this.#u.fill(0);
      this.#v.fill(0);
      this.#pull = 0;
      return;
    }
    this.#ringing = true;
  }

  #flick(fraction: number, height: number): void {
    if (this.#still) return;
    const at = Math.round(fraction * STRING_POINTS);
    for (let i = 1; i < STRING_POINTS; i++) {
      const reach = 1 - Math.min(1, Math.abs(i - at) / 5);
      if (reach > 0) this.#v[i] = this.#v[i]! - height * 28 * reach;
    }
    this.#ringing = true;
  }

  // ───────────────────────────────────────────────────────────── animation

  #loop = (now: number): void => {
    this.#raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.#last) / 1000));
    this.#last = now;
    this.#frame++;
    this.#clock += dt;

    if (this.#dirty || this.#frame % 8 === 0) {
      this.#dirty = false;
      this.#measure(now);
    }
    if (!this.#ready) return;

    let moving = false;
    const run = (spring: Spring): void => {
      if (spring.resting) {
        if (spring.value !== spring.target) spring.snap();
        return;
      }
      spring.step(dt);
      moving = true;
    };

    for (const node of this.#nodes) {
      if (node.riseAt <= now) node.rise.target = node.riseTo;
      else moving = true;
      run(node.x);
      run(node.scale);
      run(node.rise);
      run(node.hot);
      run(node.press);
      run(node.fill);
      run(node.level);
      if (node.from) {
        run(node.mix);
        if (node.mix.resting) {
          node.from = null;
          node.to = null;
        }
      }
    }
    run(this.#lineY);
    run(this.#stroke);
    run(this.#open);
    run(this.#ink);
    run(this.#progress);
    run(this.#beadRadius);
    run(this.#volumeLevel);
    run(this.#mast);
    run(this.#wave);
    run(this.#seek.x0);
    run(this.#seek.x1);

    this.#tick.target = this.#pointing && !this.#dragging && this.#mode === 'active' ? 1 : 0;
    run(this.#tick);

    if (this.#stepString(dt)) moving = true;
    if (this.#wave.value > 0.01) moving = true;

    this.#render();

    if (moving || this.#dirty) this.#raf = requestAnimationFrame(this.#loop);
  };

  /** The string: held in a triangle while it is pulled, then a damped wave once it is let go. */
  #stepString(dt: number): boolean {
    const u = this.#u;
    const v = this.#v;
    const n = STRING_POINTS;

    if (this.#dragging && this.#mode === 'active' && !this.#still) {
      // Pulling the pointer away from the line bends the string toward it, up to a limit.
      const unit = this.#unit;
      const away = this.#pointerY - this.#lineY.value;
      const slack = 9 * unit;
      const beyond = Math.abs(away) <= slack ? 0 : away - Math.sign(away) * slack;
      const target = 20 * unit * Math.tanh(beyond / (70 * unit));
      this.#pull += (target - this.#pull) * (1 - Math.exp(-dt / 0.035));
      const apex = Math.min(n - 1, Math.max(1, this.#pointerFraction * n));
      for (let i = 1; i < n; i++) {
        const shape = i <= apex ? i / apex : (n - i) / (n - apex);
        u[i] = this.#pull * shape;
        v[i] = 0;
      }
      this.#ringing = false;
      return true;
    }

    if (!this.#ringing) return false;

    // u_tt = c² u_xx − γ u_t + η u_xxt, fixed at both ends. The last term soaks up the sharp kinks first.
    const c = 15;
    const gamma = 8.5;
    const eta = 0.035;
    const inv = n * n;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 0.0005);
      for (let i = 1; i < n; i++) {
        const bend = (u[i - 1]! - 2 * u[i]! + u[i + 1]!) * inv;
        const shear = (v[i - 1]! - 2 * v[i]! + v[i + 1]!) * inv;
        v[i] = v[i]! + (c * c * bend - gamma * v[i]! + eta * shear) * h;
      }
      for (let i = 1; i < n; i++) u[i] = u[i]! + v[i]! * h;
      left -= h;
    }
    let energy = 0;
    for (let i = 1; i < n; i++) energy = Math.max(energy, Math.abs(u[i]!), Math.abs(v[i]!) * 0.02);
    this.#pull = 0;
    if (energy < 0.12 * this.#unit) {
      u.fill(0);
      v.fill(0);
      this.#ringing = false;
      return false;
    }
    return true;
  }

  // ───────────────────────────────────────────────────────────── drawing

  #glyphPoints(node: GlyphNode): Pt[] {
    if (node.from && node.to) return blend(node.from, node.to, node.mix.value);
    return node.role === 'volume' ? this.#shape(node, node.glyph) : node.points;
  }

  #place(node: GlyphNode, points: Pt[], y: number): Pt[] {
    const k = node.scale.value * (1 + 0.07 * node.hot.value - 0.08 * node.press.value);
    const rise = Math.max(0, node.rise.value);
    const cx = node.x.value;
    return points.map(([gx, gy]) => [cx + (gx - SLOT_CENTRE) * k, y + gy * k * rise] as Pt);
  }

  #render(): void {
    const width = this.#width;
    const unit = this.#unit;
    const y = this.#lineY.value;
    const open = Math.max(0, Math.min(1, this.#open.value));
    const x0 = this.#seek.x0.value;
    const x1 = this.#seek.x1.value;
    const span = x1 - x0;
    // Time runs left to right in every locale, as it does in the Video.js slider underneath.
    const along = (fraction: number): number => x0 + span * fraction;

    // Everything the pen passes through, left to right.
    interface Piece {
      at: number;
      points: Pt[];
      radius: number;
    }
    const pieces: Piece[] = [];
    let hot = '';
    let hottest = 0;

    for (const node of this.#nodes) {
      if (!node.present && node.rise.value < 0.01) {
        if (node.fillPath) node.fillPath.setAttribute('d', '');
        continue;
      }
      const placed = this.#place(node, this.#glyphPoints(node), y);
      const radius = 1.7 * (softness[node.glyph] ?? 1) * node.scale.value * Math.min(1, node.rise.value * 1.5);
      pieces.push({ at: node.x.value, points: placed, radius: node.from ? Math.min(radius, 1.1) : radius });
      if (node.hot.value > 0.02 && node.rise.value > 0.5) {
        hot += toPath(placed, radius);
        hottest = Math.max(hottest, node.hot.value);
      }
      const region = fills[node.glyph];
      if (region && (node.fill.value > 0.01 || node.fillPath)) {
        if (!node.fillPath) {
          node.fillPath = document.createElementNS(SVG_NS, 'path');
          node.fillPath.setAttribute('class', 'taar-fill');
          this.#fillGroup.append(node.fillPath);
        }
        const shape = this.#place(node, region, y);
        node.fillPath.setAttribute('d', `${toPath([...shape, shape[0]!], 1.4 * node.scale.value)}Z`);
        node.fillPath.style.opacity = String(Math.max(0, Math.min(1, node.fill.value * node.rise.value)));
      }
    }

    // The string, with a short tick under the pointer and frets at chapter starts.
    const string: Pt[] = [];
    const wave = this.#wave.value;
    const beadAt = this.#progress.value;
    const tick = this.#tick.value;
    const marks: { at: number; drop: number }[] = [];
    if (open > 0.02) for (const fraction of this.#chapters) marks.push({ at: fraction, drop: 4.5 * unit * open });
    if (tick > 0.02) marks.push({ at: this.#pointerFraction, drop: -8 * unit * tick });
    marks.sort((a, b) => a.at - b.at);

    const lively = this.#ringing || this.#dragging || wave > 0.01;
    const steps = lively ? STRING_POINTS : 1;
    let mark = 0;
    const displacement = (fraction: number): number => {
      const index = fraction * STRING_POINTS;
      const low = Math.min(STRING_POINTS - 1, Math.max(0, Math.floor(index)));
      const bend = this.#u[low]! + (this.#u[low + 1]! - this.#u[low]!) * (index - low);
      if (wave <= 0.01 || fraction <= beadAt) return bend;
      const reach = (fraction - beadAt) / Math.max(0.001, 1 - beadAt);
      return bend + 2.6 * unit * wave * Math.sin(reach * Math.PI) * Math.sin(2 * Math.PI * (fraction * 7 - this.#clock * 1.5));
    };
    for (let i = 0; i <= steps; i++) {
      const fraction = i / steps;
      while (mark < marks.length && marks[mark]!.at <= fraction) {
        const m = marks[mark++]!;
        const mx = along(m.at);
        const my = y + displacement(m.at);
        string.push([mx, my], [mx, my + m.drop], [mx, my]);
      }
      string.push([along(fraction), y + displacement(fraction)]);
    }
    pieces.push({ at: (x0 + x1) / 2, points: string, radius: 0 });

    pieces.sort((a, b) => a.at - b.at);
    const line: Pt[] = [[-4, y]];
    const radii: number[] = [0];
    for (const piece of pieces) {
      for (const point of piece.points) {
        line.push(point);
        radii.push(piece.radius);
      }
    }
    line.push([width + 4, y]);
    radii.push(0);

    const d = toPath(line, radii);
    const stroke = this.#stroke.value;
    this.#casing.setAttribute('d', d);
    this.#casing.style.strokeWidth = `${stroke + 3.6 * unit}px`;
    this.#core.setAttribute('d', d);
    this.#core.style.strokeWidth = `${stroke}px`;
    this.#core.style.strokeOpacity = String(this.#ink.value);

    this.#hotPath.setAttribute('d', hot);
    this.#hotPath.style.strokeWidth = `${stroke + 1.3 * unit * hottest}px`;
    this.#hotPath.style.opacity = String(Math.min(1, hottest * 1.6));

    // Played portion and the bead that rides the string.
    const playedPoints: Pt[] = [];
    const playedSteps = lively ? Math.max(1, Math.round(beadAt * STRING_POINTS)) : 1;
    for (let i = 0; i <= playedSteps; i++) {
      const fraction = (beadAt * i) / playedSteps;
      playedPoints.push([along(fraction), y + displacement(fraction)]);
    }
    const started = this.#mode !== 'poster';
    this.#played.setAttribute('d', started && beadAt > 0.0005 ? toPath(playedPoints, 0) : '');
    this.#played.style.strokeWidth = `${stroke + 2 * unit * open}px`;

    const bufferPoints: Pt[] = [];
    if (open > 0.02 && this.#buffered > beadAt + 0.002) {
      const bufferSteps = lively ? 24 : 1;
      for (let i = 0; i <= bufferSteps; i++) {
        const fraction = beadAt + ((this.#buffered - beadAt) * i) / bufferSteps;
        bufferPoints.push([along(fraction), y + displacement(fraction)]);
      }
    }
    this.#bufferPath.setAttribute('d', bufferPoints.length ? toPath(bufferPoints, 0) : '');
    this.#bufferPath.style.opacity = String(open);

    const beadX = along(beadAt);
    const beadY = y + displacement(beadAt);
    const radius = Math.max(0, this.#beadRadius.value);
    for (const circle of [this.#bead, this.#beadCasing]) {
      circle.setAttribute('cx', beadX.toFixed(2));
      circle.setAttribute('cy', beadY.toFixed(2));
    }
    this.#bead.setAttribute('r', radius.toFixed(2));
    this.#beadCasing.setAttribute('r', (radius > 0.2 ? radius + 2.2 * unit : 0).toFixed(2));

    // Volume: the mast that grows out of the speaker's front edge, with its own bead.
    const speaker = this.#nodes.find((node) => node.role === 'volume');
    const mast = this.#mast.value;
    if (speaker && mast > 3 * unit) {
      const k = speaker.scale.value;
      const mx = speaker.x.value + (MAST_X - SLOT_CENTRE) * k;
      const foot = y - this.#level.x0.value;
      const top = y - Math.min(mast, this.#level.x1.value);
      const loud = Math.max(0, Math.min(1, this.#volumeLevel.value));
      const knob = Math.max(top, foot - (this.#level.x1.value - this.#level.x0.value) * loud);
      const shown = Math.min(1, mast / Math.max(1, this.#level.x1.value));
      this.#levelPath.setAttribute('d', knob < foot - 0.5 ? `M${mx.toFixed(2)},${foot.toFixed(2)}L${mx.toFixed(2)},${knob.toFixed(2)}` : '');
      this.#levelBead.setAttribute('cx', mx.toFixed(2));
      this.#levelBead.setAttribute('cy', knob.toFixed(2));
      this.#levelBead.setAttribute('r', (4.5 * unit * shown * shown).toFixed(2));
      this.#levelPath.style.opacity = String(shown);
    } else {
      this.#levelPath.setAttribute('d', '');
      this.#levelBead.setAttribute('r', '0');
    }
  }
}

if (!customElements.get('taar-line')) customElements.define('taar-line', TaarLineElement);

declare global {
  interface HTMLElementTagNameMap {
    'taar-line': TaarLineElement;
  }
}
