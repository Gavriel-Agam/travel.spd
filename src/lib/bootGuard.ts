// The start-up guard in public/index.html repairs this device's copy when a new
// version can't start (blank screen). The app tells it it has started, and logs
// a repair that happened so the cause can be found.
import { Platform } from 'react-native';
import { logError } from './log';

type BootWindow = Window & { __appStarted?: boolean; __appStartedOk?: () => void };

export function markAppStarted() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window as BootWindow;
  w.__appStarted = true;
  // Count the start as good only once it has stayed up for a few seconds
  setTimeout(() => w.__appStartedOk?.(), 5000);
  try {
    const reason = localStorage.getItem('smarttrip-repaired');
    if (reason) {
      localStorage.removeItem('smarttrip-repaired');
      logError(new Error(`start-up repaired: ${reason}`), 'boot-repair');
    }
  } catch {
    // storage blocked
  }
}
