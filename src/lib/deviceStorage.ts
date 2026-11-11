// Small saved state on this device (settings, offline queue, saved trip data).
// Web: the browser's localStorage, read synchronously so the very first screen
// already has it (no "loading" pass at launch). AsyncStorage's web version keeps
// the same keys in that same localStorage, so nothing saved earlier moves.
// Phone app: AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

/** The browser's localStorage, or null (phone app, or storage blocked). */
export function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Storage for zustand's persist: synchronous on the web. */
export function persistStorage(): StateStorage {
  const ls = webStorage();
  if (!ls) return AsyncStorage;
  return {
    getItem: (k) => {
      try {
        return ls.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        ls.setItem(k, v);
      } catch {
        // Full or blocked: the in-memory state still works for this session
      }
    },
    removeItem: (k) => {
      try {
        ls.removeItem(k);
      } catch {
        // ignore
      }
    },
  };
}
