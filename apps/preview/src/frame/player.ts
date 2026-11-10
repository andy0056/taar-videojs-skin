import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import '@/video/skin';
import skinTemplate from '@/video/skin.html?raw';

/**
 * What the preview plays.
 *
 * By default it streams from Mux, which also supplies the poster, the captions in the manifest and the
 * storyboard behind the timeline thumbnails. `?media=` picks another clip:
 *   stars   a scientist talking to camera (default)
 *   aurora  dark, narrated night footage
 *   dev     a bundled clip (dark, mid-tone and warm scenes), for working offline
 *   card    a bundled test card: paper white, checkerboard, colour bars, static and black
 *
 * The bundled clips carry their own storyboard, in the same form Mux serves one: a sprite sheet and a cue file that
 * points each second at its tile.
 */
interface MuxClip {
  playbackId: string;
  title: string;
  chapters?: string;
  posterTime: number;
}

const MUX: Record<string, MuxClip> = {
  stars: {
    playbackId: 'pKXQkIyGiC4S4urt7p7ivSqmItowQ0237J00E4NyF2JX8',
    title: 'How are we made of star stuff? · NASA',
    chapters: './star-stuff-chapters.vtt',
    posterTime: 1,
  },
  aurora: {
    playbackId: 'qJN02XNc7TbVnu3177t6Ixmfb95ca4HYuLf3JfpHBYPw',
    title: 'How can I see the northern lights? · NASA',
    posterTime: 12,
  },
};

interface LocalClip {
  src: string;
  captions: string;
  chapters: string;
  storyboard: string;
  title: string;
}

const LOCAL: Record<string, LocalClip> = {
  dev: {
    src: './dev-clip.mp4',
    captions: './dev-clip.vtt',
    chapters: './dev-clip-chapters.vtt',
    storyboard: './dev-clip-storyboard.vtt',
    title: 'Taar test clip',
  },
  card: {
    src: './test-card.mp4',
    captions: './test-card.vtt',
    chapters: './test-card-chapters.vtt',
    storyboard: './test-card-storyboard.vtt',
    title: 'Test card',
  },
};

const MEDIA_PLACEHOLDER = '<!-- Add a compatible media component here. -->';

/** A build can start on a bundled clip, for places that cannot reach Mux: `VITE_TAAR_DEFAULT_CLIP=dev`. */
const DEFAULT_CLIP: string = import.meta.env.VITE_TAAR_DEFAULT_CLIP || 'stars';

export function currentClip(): string {
  const match = /[?#&]media=([a-z]+)/.exec(location.href);
  const name = match?.[1] === 'demo' ? 'dev' : match?.[1];
  return name && (name in MUX || name in LOCAL) ? name : DEFAULT_CLIP;
}

export function createPlayer(clip = currentClip()): HTMLElement {
  const player = document.createElement('video-player');
  let media: string;

  const mux = MUX[clip];
  if (mux) {
    const chapters = mux.chapters
      ? `<track kind="chapters" label="English" srclang="en" src="${mux.chapters}" default>`
      : '';
    media = `<mux-video src="https://stream.mux.com/${mux.playbackId}.m3u8" playsinline crossorigin>${chapters}</mux-video>`;
    player.setAttribute('poster', `https://image.mux.com/${mux.playbackId}/thumbnail.webp?time=${mux.posterTime}`);
    player.setAttribute('content-title', mux.title);
  } else {
    const local = LOCAL[clip] ?? LOCAL.dev!;
    media = `<video src="${local.src}" playsinline crossorigin preload="metadata"><track kind="captions" label="English" srclang="en" src="${local.captions}"><track kind="chapters" label="English" srclang="en" src="${local.chapters}" default><track kind="metadata" label="thumbnails" src="${local.storyboard}"></video>`;
    player.setAttribute('content-title', local.title);
  }

  player.innerHTML = skinTemplate.replace(MEDIA_PLACEHOLDER, media);

  // A plain <video> switches on only its first default chapters or metadata track, so the storyboard is switched on
  // by hand. <mux-video> does the same for the tracks it manages.
  for (const element of player.querySelectorAll<HTMLTrackElement>('video > track[label="thumbnails"]')) {
    if (element.track.mode === 'disabled') element.track.mode = 'hidden';
  }

  return player;
}
