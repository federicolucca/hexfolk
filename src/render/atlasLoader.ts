// Loads a theme's atlas JSON and images. The @2x image is only fetched once it is needed.
import type { Theme } from '../core/theme';
import { type Atlas, parseAtlas } from './atlas';

export interface LoadedAtlas {
  atlas: Atlas;
  image: HTMLImageElement;
  /** The @2x image, once loaded. */
  hd: HTMLImageElement | null;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export class AtlasLoader {
  private readonly cache = new Map<Theme, Promise<LoadedAtlas>>();
  private readonly hdRequested = new Set<Theme>();

  /** baseUrl is the folder holding the atlases, ending with a slash. */
  constructor(private readonly baseUrl: string) {}

  load(theme: Theme): Promise<LoadedAtlas> {
    let pending = this.cache.get(theme);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(`${this.baseUrl}${theme}.json`);
        if (!response.ok) throw new Error(`Could not load the ${theme} atlas (HTTP ${response.status})`);
        const atlas = parseAtlas(await response.json());
        return { atlas, image: await loadImage(`${this.baseUrl}${atlas.images['1']}`), hd: null };
      })();
      pending.catch(() => this.cache.delete(theme));
      this.cache.set(theme, pending);
    }
    return pending;
  }

  /** Starts loading the @2x image once; calls onReady when it can be drawn. */
  requestHd(theme: Theme, loaded: LoadedAtlas, onReady: () => void): void {
    if (loaded.hd || this.hdRequested.has(theme)) return;
    this.hdRequested.add(theme);
    loadImage(`${this.baseUrl}${loaded.atlas.images['2']}`)
      .then((image) => {
        loaded.hd = image;
        onReady();
      })
      .catch((err: unknown) => {
        this.hdRequested.delete(theme);
        console.warn('Could not load the @2x atlas', err);
      });
  }
}
