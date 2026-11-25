// Location and microphone permission, remembered on this device so the app
// never asks again by itself after an answer. iPhone Safari (and the Home
// Screen app) can show its own prompt every time the page asks, so the app
// asks only when it really needs the position or a recording, never on
// screen open, and not at all once the answer was "no".

export type PermName = 'geolocation' | 'microphone';
export type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

const KEY = (name: PermName) => `smarttrip.perm.${name}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The last answer seen on this device ('unknown' when never asked). */
export function storedPerm(name: PermName): PermState {
  try {
    const v = storage()?.getItem(KEY(name));
    return v === 'granted' || v === 'denied' ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Remembers an answer (from the prompt itself or the browser's permission state). */
export function notePerm(name: PermName, state: 'granted' | 'denied') {
  try {
    storage()?.setItem(KEY(name), state);
  } catch {
    // Private mode: nothing remembered, nothing breaks
  }
}

/** Forgets the answer: the person asked to try again (or turned the setting back on). */
export function forgetPerm(name: PermName) {
  try {
    storage()?.removeItem(KEY(name));
  } catch {
    // ignore
  }
}

/**
 * The permission as it is now. Where the browser can tell (Permissions API) its
 * answer wins and is remembered; a "no" changed to "ask" in the phone's settings
 * clears the remembered "no". Elsewhere (older iPhones) the remembered answer.
 */
export async function permState(name: PermName): Promise<PermState> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { permissions?: Permissions });
  if (nav?.permissions?.query) {
    try {
      const res = await nav.permissions.query({ name: name as PermissionName });
      const live = res.state as PermState;
      if (live === 'granted' || live === 'denied') notePerm(name, live);
      else if (live === 'prompt' && storedPerm(name) === 'denied') forgetPerm(name);
      return live;
    } catch {
      // This browser can't query that name: fall back to what we remember
    }
  }
  return storedPerm(name);
}
