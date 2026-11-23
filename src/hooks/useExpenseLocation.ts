import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { currentPosition, placeKey, reverseGeocode, type Place } from '@/lib/location';
import { usePrefs } from '@/store/prefs';

/** A place seen in the last 30 minutes stands in when there is no fix now. */
const RECENT_MS = 30 * 60_000;

/**
 * Where the phone is now, for a new expense: the position (asks for permission
 * the first time), and a short name from this device's cache or, online, from
 * OpenStreetMap. Null when turned off in Settings, denied, or unknown.
 */
export async function capturePlace(lang: string): Promise<Place | null> {
  const prefs = usePrefs.getState();
  if (!prefs.saveLocation) return null;
  const pos = await currentPosition();
  if (!pos) {
    const last = usePrefs.getState().lastPlace;
    return last && Date.now() - last.at < RECENT_MS ? { lat: last.lat, lng: last.lng, name: last.name } : null;
  }
  const cached = usePrefs.getState().places[placeKey(pos.lat, pos.lng)] ?? null;
  const name = cached ?? (onlineManager.isOnline() ? await reverseGeocode(pos.lat, pos.lng, lang) : null);
  usePrefs.getState().notePlace(pos.lat, pos.lng, name);
  return { ...pos, name };
}

/** The place for a new expense, found while the form is open (never waited for). */
export function useExpenseLocation(active: boolean, lang: string): Place | null {
  const [place, setPlace] = useState<Place | null>(null);
  const on = usePrefs((s) => s.saveLocation);
  useEffect(() => {
    if (!active || !on) return setPlace(null);
    let alive = true;
    capturePlace(lang).then((p) => alive && setPlace(p));
    return () => {
      alive = false;
    };
  }, [active, on]);
  return place;
}

/** The fields sent with a new expense. */
export const placeFields = (p: Place | null | undefined) => (p ? { lat: p.lat, lng: p.lng, location_name: p.name } : {});
