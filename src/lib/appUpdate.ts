// Web app updates. The service worker (public/sw.js) opens the app from its
// cache at once and fetches the latest version in the background; when a newer
// one is stored it tells the page (public/index.html sets a flag and fires
// "app-update-ready"). The app then offers to reload; otherwise the new version
// simply opens next time.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

const web = Platform.OS === 'web' && typeof window !== 'undefined';
const CHECK_EVERY = 10 * 60_000;
let lastCheck = Date.now(); // opening the app already checks

/** True once a newer version is ready (web only). */
export function useAppUpdateReady() {
  return useSyncExternalStore(
    (cb) => {
      if (!web) return () => {};
      window.addEventListener('app-update-ready', cb);
      return () => window.removeEventListener('app-update-ready', cb);
    },
    () => web && !!(window as unknown as { __appUpdateReady?: boolean }).__appUpdateReady,
    () => false,
  );
}

export function applyAppUpdate() {
  if (web) window.location.reload();
}

/** Coming back to the app after a while: ask the service worker to look for a newer version. */
export function startAppUpdateChecks() {
  if (!web || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    const sw = navigator.serviceWorker?.controller;
    if (document.visibilityState !== 'visible' || !sw || Date.now() - lastCheck < CHECK_EVERY) return;
    lastCheck = Date.now();
    sw.postMessage({ type: 'CHECK_UPDATE' });
  });
}
