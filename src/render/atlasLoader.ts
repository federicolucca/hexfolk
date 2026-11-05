// Loads atlas JSON and images. The @2x image is only fetched once it is needed.
import { type Atlas, type CommonAtlas, parseAtlas, parseCommonAtlas } from './atlas';

export interface Loaded<T extends { images: { '1': string; '2': string } }> {
  atlas: T;
  image: HTMLImageElement;
  /** The @2x image, once loaded. */
  hd: HTMLImageElement | null;
}

export type LoadedAtlas = Loaded<Atlas>;
export type LoadedCommon = Loaded<CommonAtlas>;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export class AtlasLoader {
  private readonly cache = new Map<string, Promise<Loaded<Atlas | CommonAtlas>>>();
  private readonly hdRequested = new Set<string>();

  /** baseUrl is the folder holding the atlases, ending with a slash. */
  constructor(private readonly baseUrl: string) {}

  private loadAny<T extends Atlas | CommonAtlas>(name: string, parse: (json: unknown) => T): Promise<Loaded<T>> {
    let pending = this.cache.get(name) as Promise<Loaded<T>> | undefined;
    if (!pending) {
      pending = (async () => {
        const response = await fetch(`${this.baseUrl}${name}.json`);
        if (!response.ok) throw new Error(`Could not load the ${name} atlas (HTTP ${response.status})`);
        const atlas = parse(await response.json());
        return { atlas, image: await loadImage(`${this.baseUrl}${atlas.images['1']}`), hd: null };
      })();
      pending.catch(() => this.cache.delete(name));
      this.cache.set(name, pending);
    }
    return pending;
  }

  load(theme: string): Promise<LoadedAtlas> {
    return this.loadAny(theme, parseAtlas);
  }

  loadCommon(): Promise<LoadedCommon> {
    return this.loadAny('common', parseCommonAtlas);
  }

  /** Starts loading the @2x image once; calls onReady when it can be drawn. */
  requestHd(loaded: Loaded<Atlas | CommonAtlas>, onReady: () => void): void {
    const key = loaded.atlas.images['2'];
    if (loaded.hd || this.hdRequested.has(key)) return;
    this.hdRequested.add(key);
    loadImage(`${this.baseUrl}${key}`)
      .then((image) => {
        loaded.hd = image;
        onReady();
      })
      .catch((err: unknown) => {
        this.hdRequested.delete(key);
        console.warn('Could not load an @2x atlas', err);
      });
  }
}
