// Autosave: the whole GameState is plain JSON, so a save is JSON.stringify. Storage may be
// missing or full (private windows), so every access is guarded and never breaks the game.
import type { GameState } from '../core/state';

export const SAVE_KEY = 'hexfolk:save';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveGame(store: Store | undefined, state: GameState): boolean {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(state));
    return store !== undefined;
  } catch {
    return false;
  }
}

/** The saved game, or null when there is none or it is not a game this version can read. */
export function loadGame(store: Store | undefined): GameState | null {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<GameState>;
    const ok =
      s.version === 1 &&
      // Saves from before economy v0.2 have no dice state and old resource names: start fresh.
      typeof s.rollState === 'number' &&
      Array.isArray(s.tiles) &&
      s.tiles.length === (s.width ?? 0) * (s.height ?? 0) &&
      Array.isArray(s.players) &&
      s.players.length >= 2 &&
      Array.isArray(s.cities) &&
      Array.isArray(s.units) &&
      typeof s.current === 'number' &&
      typeof s.turn === 'number';
    return ok ? (s as GameState) : null;
  } catch {
    return null;
  }
}
