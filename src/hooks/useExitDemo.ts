import { useQueryClient } from '@tanstack/react-query';
import { usePrefs } from '@/store/prefs';

/** Leaves the guest demo: forgets the sample trip and returns to sign-in. */
export function useExitDemo() {
  const qc = useQueryClient();
  return () => {
    usePrefs.getState().setDemo(false);
    usePrefs.getState().setActiveTrip(null);
    qc.clear();
  };
}
