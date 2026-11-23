// Where an expense was added: the phone's position when the expense is
// entered, with a short place name looked up online (OpenStreetMap). Never
// blocks saving: no permission, no fix in time, or offline just means less.

export type Place = { lat: number; lng: number; name: string | null };

/** Coordinates kept with an expense: ~1 m (5 decimals) is plenty. */
export const roundCoord = (v: number) => Math.round(v * 1e5) / 1e5;
/** Cache key for a place name: ~1 km cell. */
export const placeKey = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

export function validCoords(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function canLocate(): boolean {
  // The web build (no react-native import here, so the helpers stay testable)
  return typeof document !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.geolocation;
}

/** The current position, or null (denied, unavailable, or not within `timeoutMs`). A fix up to 10 min old is fine. */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  if (!canLocate()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}

/** A short name from an OpenStreetMap (Nominatim) reverse lookup: neighbourhood or town, then the city. */
export function placeName(address: Record<string, string> | undefined, fallback?: string): string | null {
  if (!address) return fallback?.split(',').slice(0, 2).join(',').trim() || null;
  const local = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.village ?? address.town ?? null;
  const city = address.city ?? address.town ?? address.municipality ?? address.county ?? address.state ?? null;
  const parts = [local, city].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
  return parts.length ? parts.join(', ').slice(0, 120) : fallback?.split(',').slice(0, 2).join(',').trim().slice(0, 120) || null;
}

/** Looks up a short place name (null when offline or it fails). Only the rounded position is sent. */
export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}&accept-language=${lang === 'he' ? 'he,en' : 'en'}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: Record<string, string>; display_name?: string };
    return placeName(j.address, j.display_name);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- map preview

export const TILE = 256;

/** Web Mercator: the tile (x, y) holding a point at a zoom, and the point's pixel inside that tile. */
export function tileFor(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), px: (x - Math.floor(x)) * TILE, py: (y - Math.floor(y)) * TILE };
}

/** The tiles around a point (3 × 3), each with its offset from the point, for a small static map. */
export function tilesAround(lat: number, lng: number, zoom: number) {
  const t = tileFor(lat, lng, zoom);
  const n = 2 ** zoom;
  const out: { key: string; url: string; dx: number; dy: number }[] = [];
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const x = (((t.x + i) % n) + n) % n;
      const y = t.y + j;
      if (y < 0 || y >= n) continue;
      out.push({ key: `${zoom}/${x}/${y}`, url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, dx: i * TILE - t.px, dy: j * TILE - t.py });
    }
  return out;
}

/** Opens the place in the phone's maps (OpenStreetMap on the web). */
export function mapLink(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** "13.7563° N, 100.5018° E" */
export function formatCoords(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
}
