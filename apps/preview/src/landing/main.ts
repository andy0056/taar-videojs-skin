import '@videojs/html/i18n';
import '@/skin.css';
import { glyphs, toPath, type Pt } from '@/video/glyphs';
import { createPlayer } from '../frame/player';
import { WORDMARK_ABOVE, WORDMARK_BELOW, WORDMARK_WIDTH, wordmarkPath } from './wordmark';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ───────────── the name, written on a line that crosses the whole window

const wordmark = document.getElementById('wordmark')!;
const page = document.querySelector<HTMLElement>('.page')!;

function drawWordmark(): void {
  const width = document.documentElement.clientWidth;
  const inner = page.clientWidth - 40;
  const scale = Math.min(4.6, Math.max(1.5, inner / (WORDMARK_WIDTH + 6)));
  const inset = Math.max(20, (width - page.clientWidth) / 2 + 20);
  const above = WORDMARK_ABOVE * scale + 6;
  const height = above + WORDMARK_BELOW * scale + 6;

  let svg = wordmark.querySelector('svg');
  let path = svg?.querySelector('path') ?? null;
  if (!svg || !path) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('pathLength', '1');
    svg.append(path);
    wordmark.append(svg);
  }
  svg.setAttribute('viewBox', `0 ${-above} ${width} ${height}`);
  svg.setAttribute('height', String(Math.round(height)));
  path.setAttribute('d', wordmarkPath(width, inset, scale));
  path.style.strokeWidth = `${Math.max(2, scale * 0.62).toFixed(2)}px`;
}

drawWordmark();
window.addEventListener('resize', drawWordmark);

// ───────────── the player

const stage = document.getElementById('stage')!;

// An offline build (`VITE_TAAR_OFFLINE=1`) plays only the bundled clips, for hosts that cannot reach Mux.
if (import.meta.env.VITE_TAAR_OFFLINE) {
  const footage = document.querySelector('.tool[aria-label="Footage"]');
  for (const chip of footage?.querySelectorAll<HTMLButtonElement>('.chip') ?? []) {
    if (chip.dataset.clip === 'stars') {
      chip.dataset.clip = 'dev';
      chip.textContent = 'Test clip';
    } else if (chip.dataset.clip === 'aurora') chip.remove();
  }
  document.querySelector('.tool-link')?.remove();
  const credit = document.querySelector('.credit');
  if (credit) credit.textContent = 'Offline preview: bundled clips only. The public build streams NASA footage from Mux, with storyboard thumbnails and generated captions.';
}

function mount(clip?: string): void {
  // The i18n provider follows the page's `lang` and loads Video.js's built-in translations for it.
  const i18n = document.createElement('media-i18n');
  i18n.append(createPlayer(clip));
  stage.replaceChildren(i18n);
}

mount();

/** A row of buttons where exactly one is pressed. */
function choose(selector: string, apply: (button: HTMLButtonElement) => void): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      apply(button);
    });
  }
}

choose('.chip[data-clip]', (button) => mount(button.dataset.clip));
choose('.chip[data-width]', (button) => {
  stage.style.maxWidth = `${button.dataset.width}px`;
});
choose('.swatch', (button) => {
  if (button.dataset.accent) stage.style.setProperty('--media-accent-color', button.dataset.accent);
  else stage.style.removeProperty('--media-accent-color');
});

// ───────────── small drawings for the "try" cards: a short length of the line doing each thing

const BASE = 50;
const place = (points: Pt[], x: number, scale = 1): Pt[] => points.map(([px, py]) => [x + (px - 22) * scale, BASE + py * scale] as Pt);
const line = (points: Pt[], radius = 1.7): string => `<path d="${toPath([[0, BASE], ...points, [232, BASE]], radius)}"/>`;

const art: Record<string, () => string> = {
  // The horizon with its flag.
  flag: () => line(place(glyphs.play(), 108, 2.1), 3),
  // The string pulled into a triangle, bead at the apex.
  pluck: () => {
    const apex: Pt = [96, BASE - 30];
    return `${line([[24, BASE], apex, [208, BASE]], 0)}<path class="signal" d="M24,${BASE}L${apex[0]},${apex[1]}"/><circle cx="${apex[0]}" cy="${apex[1]}" r="6"/>`;
  },
  // The speaker with its mast up.
  mast: () => {
    const horn = place(glyphs.speaker(0.8, 20), 100, 1.25);
    const x = 100 + (17 - 22) * 1.25;
    return `${line(horn, 2)}<path class="signal" style="stroke:var(--ink)" d="M${x},${BASE - 26}L${x},${BASE - 40}"/><circle cx="${x}" cy="${BASE - 40}" r="5"/>`;
  },
  // Flat on the bottom edge, part played.
  rest: () => `${line([], 0)}<path class="signal" style="stroke-width:2" d="M0,${BASE}L84,${BASE}"/>`,
};

for (const slot of document.querySelectorAll<HTMLElement>('.try-art')) {
  const draw = art[slot.dataset.art ?? ''];
  if (draw) slot.innerHTML = `<svg viewBox="0 0 232 64" preserveAspectRatio="xMinYMid meet">${draw()}</svg>`;
}
