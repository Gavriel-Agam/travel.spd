// In the guest demo nothing can be saved. Instead of an error, any attempt to
// add or change something invites the guest to create an account.
import type { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { usePrefs } from '@/store/prefs';
import { showDialog } from '@/ui/Dialog';
import { signInWithGoogle } from './auth';

/** Leaves the guest demo: forgets the sample trip and returns to sign-in. */
export function leaveDemo(qc: QueryClient) {
  usePrefs.getState().setDemo(false);
  usePrefs.getState().setActiveTrip(null);
  qc.clear();
}

let lastShown = 0;

export function promptSignUp(qc: QueryClient) {
  // One failed save can surface twice (form + global handler)
  if (Date.now() - lastShown < 800) return;
  lastShown = Date.now();
  const t = i18n.t.bind(i18n);
  showDialog(t('demo.promptTitle'), t('demo.promptBody'), [
    ...(Platform.OS === 'web'
      ? [
          {
            label: t('auth.google'),
            onPress: () => {
              leaveDemo(qc);
              signInWithGoogle().catch(() => {});
            },
          },
        ]
      : []),
    { label: t('demo.promptEmail'), onPress: () => leaveDemo(qc) },
    { label: t('demo.promptStay'), style: 'cancel' as const },
  ]);
}

/** True (and shows the invitation) when the app is in the guest demo. */
export function blockedInDemo(qc: QueryClient) {
  if (!usePrefs.getState().demo) return false;
  promptSignUp(qc);
  return true;
}
