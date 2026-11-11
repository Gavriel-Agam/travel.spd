// Web: instant launch. A copy of the Home screen as it was last shown (its page
// markup and styles) is kept on the device. The next time the app opens, a small
// script in public/index.html puts it on screen the moment the page loads,
// before the app's own script has even started, with or without signal. The app
// then draws the live Home screen in its place a fraction of a second later; it
// looks the same, so nothing jumps.
//
// It holds only what Home showed (trip name, totals, recent expenses), the same
// trip data the app already keeps on this device for offline use. It is shown
// only while the same login is still saved, removed at launch once it is a month
// old, and deleted on sign-out.
import { Platform } from 'react-native';
import { webStorage } from './deviceStorage';

export const LAUNCH_SNAPSHOT_KEY = 'smarttrip-launch';
const MAX_CHARS = 700_000;
const HOME_PATH = '/travel.spd/';
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionKey = '';

function onHome() {
  return typeof location !== 'undefined' && location.pathname === HOME_PATH;
}

/** All style rules on the page (the app's own and its icon font), as text. */
function pageStyles() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as Element | null;
    if (owner?.id === 'launch-snapshot-css') continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + '\n';
    } catch {
      // A sheet from another site can't be read: skip it
    }
  }
  return css;
}

function save() {
  const ls = webStorage();
  const root = typeof document === 'undefined' ? null : document.getElementById('root');
  // Only Home, and not with a sheet or dialog open over it
  if (!ls || !root || !sessionKey || !onHome() || document.querySelector('[aria-modal="true"]')) return;
  try {
    const html = root.innerHTML;
    const css = pageStyles();
    if (!html || html.length + css.length > MAX_CHARS) return;
    ls.setItem(
      LAUNCH_SNAPSHOT_KEY,
      JSON.stringify({
        v: 1,
        at: Date.now(),
        html,
        css,
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        dark: !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
        // Laid out for this screen size: not shown on another one
        w: window.innerWidth,
        h: window.innerHeight,
        session: sessionKey,
      }),
    );
  } catch {
    // Storage full or blocked: launch normally next time
  }
}

/** Home has drawn (or changed): keep a copy once it has settled. */
export function scheduleLaunchSnapshot(storageKeyOfSession: string) {
  if (Platform.OS !== 'web') return;
  sessionKey = storageKeyOfSession;
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 1500);
}

/** Also keep a copy when the app goes to the background (its most recent state). */
export function startLaunchSnapshots() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

/** The live app is on screen: the copy's styles are no longer needed. */
export function dropLaunchSnapshotStyles() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.getElementById('launch-snapshot-css')?.remove();
}

export function clearLaunchSnapshot() {
  sessionKey = '';
  if (timer) clearTimeout(timer);
  try {
    webStorage()?.removeItem(LAUNCH_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}
