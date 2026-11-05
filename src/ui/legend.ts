// The Legend drawer: every sprite in the atlases with a short label, drawn from the atlas JSON.
import type { Theme } from '../core/theme';
import type { AtlasFrame } from '../render/atlas';
import './legend.css';

interface AtlasFile {
  images: { '1': string; '2': string };
  frames: Record<string, AtlasFrame>;
}

export interface Legend {
  /** Rebuilds the Terrain and Cities sections for this theme. */
  setTheme(theme: Theme): void;
}

interface Entry {
  frame: string;
  label: string;
  note?: string;
}

const THUMB = 52;
const DESKTOP = '(min-width: 720px)';

const LABELS: Record<string, string> = {
  grass: 'Grass',
  forest: 'Forest',
  hill: 'Hill',
  mountain: 'Mountain',
  water: 'Water',
  ruins: 'Ruins',
  village: 'Village',
  city_2: 'City (level 2)',
  city_3: 'City (level 3)',
  capital: 'Capital',
  walls: 'City walls',
  fruit: 'Fruit',
  game: 'Game',
  fish: 'Fish',
  ore: 'Ore',
  star: 'Star (currency)',
  hunting: 'Hunting',
  fishing: 'Fishing',
  riding: 'Riding',
  climbing: 'Climbing',
  archery: 'Archery',
  fortification: 'Fortification',
  warrior: 'Warrior',
  archer: 'Archer',
  rider: 'Rider',
  defender: 'Defender',
};

/** Which terrain a resource sits on. */
const RESOURCE_TERRAIN: Record<string, string> = { fruit: 'Grass', game: 'Forest', fish: 'Water', ore: 'Mountain' };
const CITY_KEYS = ['village', 'city_2', 'city_3', 'capital'];
const COLOURS = ['red', 'blue', 'green', 'yellow'];

const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;
const label = (key: string): string => LABELS[key] ?? capitalise(key.replace(/_/g, ' '));

/** "grass_2" -> "grass", "city_2_1" -> "city_2"; returns the variant number too. */
function tileKey(frame: string): { key: string; variant: number } {
  const m = /^(.*)_(\d+)$/.exec(frame);
  return m ? { key: m[1] ?? frame, variant: Number(m[2]) } : { key: frame, variant: 1 };
}

/** The frames in a folder of the common atlas, e.g. "icons/". */
const folder = (atlas: AtlasFile, prefix: string): string[] =>
  Object.keys(atlas.frames)
    .filter((n) => n.startsWith(prefix))
    .sort();

function tileEntries(atlas: AtlasFile): { terrain: Entry[]; cities: Entry[] } {
  const groups = new Map<string, string[]>();
  for (const name of Object.keys(atlas.frames)) {
    const { key } = tileKey(name);
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  const entriesOf = (key: string): Entry[] => {
    const names = (groups.get(key) ?? []).sort((a, b) => tileKey(a).variant - tileKey(b).variant);
    return names.map((frame, i) => ({ frame, label: names.length > 1 ? `${label(key)} ${i + 1}` : label(key) }));
  };
  const terrainKeys = [...groups.keys()].filter((k) => !CITY_KEYS.includes(k));
  return { terrain: terrainKeys.flatMap(entriesOf), cities: CITY_KEYS.flatMap(entriesOf) };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function createLegend(container: HTMLElement, baseUrl: string): Legend {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const files = new Map<string, Promise<AtlasFile>>();

  const loadFile = (name: string): Promise<AtlasFile> => {
    let p = files.get(name);
    if (!p) {
      p = fetch(`${baseUrl}${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${name}.json (HTTP ${r.status})`);
        return r.json() as Promise<AtlasFile>;
      });
      p.catch(() => files.delete(name));
      files.set(name, p);
    }
    return p;
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    let p = images.get(url);
    if (!p) {
      const image = new Image();
      image.src = url;
      p = image.decode().then(() => image);
      p.catch(() => images.delete(url));
      images.set(url, p);
    }
    return p;
  };

  /** One thumbnail: a canvas that fits the frame in the box; uses the @2x image on HiDPI screens. */
  const thumb = (atlas: AtlasFile, entry: Entry, hd: boolean): HTMLElement => {
    const cell = element('li', 'hf-legend-item');
    const canvas = element('canvas', 'hf-legend-thumb');
    const f = atlas.frames[entry.frame];
    const ratio = window.devicePixelRatio > 1 ? 2 : 1;
    canvas.width = THUMB * ratio;
    canvas.height = THUMB * ratio;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', entry.label);
    if (f) {
      loadImage(`${baseUrl}${atlas.images[hd && ratio === 2 ? '2' : '1']}`)
        .then((image) => {
          const k = hd && ratio === 2 ? 2 : 1;
          const scale = Math.min(canvas.width / (f.w * k), canvas.height / (f.h * k));
          const w = f.w * k * scale;
          const h = f.h * k * scale;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(image, f.x * k, f.y * k, f.w * k, f.h * k, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        })
        .catch((err: unknown) => console.warn('Legend thumbnail failed', err));
    }
    cell.append(canvas, element('span', 'hf-legend-label', entry.label));
    if (entry.note) cell.append(element('span', 'hf-legend-note', entry.note));
    return cell;
  };

  const section = (title: string, atlas: AtlasFile, entries: Entry[], extra = ''): HTMLElement => {
    const sec = element('section', 'hf-legend-section');
    sec.append(element('h3', 'hf-legend-heading', title));
    const list = element('ul', `hf-legend-grid ${extra}`.trim());
    list.append(...entries.map((e) => thumb(atlas, e, true)));
    sec.append(list);
    return sec;
  };

  // The drawer and its toggle.
  const toggle = element('button', 'hf-legend-toggle', 'Legend');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'hf-legend');
  const drawer = element('aside', 'hf-legend');
  drawer.id = 'hf-legend';
  drawer.setAttribute('aria-label', 'Legend');
  const head = element('div', 'hf-legend-head');
  const close = element('button', 'hf-legend-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close legend');
  head.append(element('h2', 'hf-legend-title', 'Legend'), close);
  const body = element('div', 'hf-legend-body');
  const themed = element('div');
  const fixed = element('div');
  body.append(themed, fixed);
  drawer.append(head, body);

  const setOpen = (open: boolean): void => {
    drawer.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.hidden = open;
  };
  toggle.addEventListener('click', () => {
    setOpen(true);
    close.focus();
  });
  close.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || drawer.hidden) return;
    const hadFocus = drawer.contains(document.activeElement);
    setOpen(false);
    if (hadFocus) toggle.focus();
  });
  setOpen(window.matchMedia(DESKTOP).matches);
  container.append(drawer, toggle);

  // Theme-independent sections, built once from common.json.
  loadFile('common')
    .then((common) => {
      const units = ['warrior', 'archer', 'rider', 'defender'].flatMap((u) =>
        COLOURS.map((c) => ({ frame: `units/${u}_${c}`, label: `${label(u)} (${c})` })),
      );
      const resources = folder(common, 'overlays/')
        .map((n) => n.slice('overlays/'.length))
        .filter((k) => k in RESOURCE_TERRAIN)
        .map((k) => ({ frame: `overlays/${k}`, label: label(k), note: `on ${RESOURCE_TERRAIN[k]}` }));
      const icons = folder(common, 'icons/').map((n) => ({ frame: n, label: label(n.slice('icons/'.length)) }));
      fixed.replaceChildren(
        section('Units', common, units.filter((u) => common.frames[u.frame]), 'hf-legend-units'),
        section('Resources', common, resources),
        section('Icons', common, icons),
      );
    })
    .catch((err: unknown) => console.warn('Legend: common atlas failed', err));

  let token = 0;
  return {
    setTheme: (theme) => {
      const mine = ++token;
      Promise.all([loadFile(theme), loadFile('common')])
        .then(([atlas, common]) => {
          if (mine !== token) return;
          const { terrain, cities } = tileEntries(atlas);
          const walls = common.frames['overlays/walls'] ? [{ frame: 'overlays/walls', label: label('walls') }] : [];
          themed.replaceChildren(
            section(`Terrain (${capitalise(theme)})`, atlas, terrain),
            section('Cities', atlas, cities),
          );
          // Walls live in the common atlas, so they get their own list in the Cities section.
          if (walls.length) themed.lastElementChild?.append(section('', common, walls).lastElementChild as Node);
        })
        .catch((err: unknown) => console.warn('Legend: theme atlas failed', err));
    },
  };
}
