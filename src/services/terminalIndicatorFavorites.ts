/** Terminal Indicators modal favourites (technical studies + Wolf CMS ids). */

export type IndicatorFav =
  | { kind: 'tech'; id: string }
  | { kind: 'wolf'; id: string };

const FAV_KEY = 'wolf.terminal.indicator.favorites';
const MAX_FAVS = 40;

export function loadIndicatorFavorites(): IndicatorFav[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const kind = (item as { kind?: string }).kind;
        const id = String((item as { id?: string }).id || '').trim();
        if (!id) return null;
        if (kind === 'tech' || kind === 'wolf') return { kind, id } as IndicatorFav;
        return null;
      })
      .filter((x): x is IndicatorFav => Boolean(x))
      .slice(0, MAX_FAVS);
  } catch {
    return [];
  }
}

function saveIndicatorFavorites(list: IndicatorFav[]) {
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, MAX_FAVS)));
  } catch {
    /* ignore quota */
  }
}

export function isIndicatorFavorite(list: IndicatorFav[], kind: IndicatorFav['kind'], id: string) {
  return list.some((f) => f.kind === kind && f.id === id);
}

export function toggleIndicatorFavorite(
  list: IndicatorFav[],
  kind: IndicatorFav['kind'],
  id: string,
): IndicatorFav[] {
  const exists = isIndicatorFavorite(list, kind, id);
  const next = exists
    ? list.filter((f) => !(f.kind === kind && f.id === id))
    : [...list, { kind, id }].slice(-MAX_FAVS);
  saveIndicatorFavorites(next);
  return next;
}
