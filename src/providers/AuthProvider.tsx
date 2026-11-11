import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { finishPendingTransfer, hasPendingTransfer } from '@/lib/auth';
import { clearLaunchSnapshot } from '@/lib/launchSnapshot';
import { errorCode, readStoredSession, readStoredSessionNow, supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** Opened from a "reset password" email link: ask for a new password. */
  recovery: boolean;
  /** Moving an old anonymous identity's trips to the account that just signed in. */
  transferring: boolean;
  clearRecovery: () => void;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true, recovery: false, transferring: false, clearRecovery: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // Web: the saved login is read synchronously, so the first render is already the app
  const [session, setSession] = useState<Session | null>(() => (openedFromAuthLink() ? null : usableSaved(readStoredSessionNow())));
  const [loading, setLoading] = useState(() => !session);
  const [recovery, setRecovery] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    // After signing in with a real account, finish a pending transfer before the
    // app loads trips. Only then is a loading screen shown: after a normal launch
    // there is nothing to move and the app stays on screen.
    const afterSignIn = async (s: Session | null) => {
      if (!s || s.user.is_anonymous || running.current || !(await hasPendingTransfer())) return;
      running.current = true;
      setTransferring(true);
      try {
        const moved = await finishPendingTransfer();
        if (moved > 0) await qc.invalidateQueries();
      } finally {
        running.current = false;
        setTransferring(false);
      }
    };

    (async () => {
      // Open at once with the login saved on this device: the saved trip data
      // shows straight away. Checking it (and refreshing an expired token) needs
      // the network, which on a weak signal can take half a minute; the checked
      // session replaces this one when it arrives. Not when the page was opened
      // from a sign-in or password-reset link: that link decides who is signed in.
      const stored = await readStoredSession();
      const saved = openedFromAuthLink() ? null : usableSaved(stored);
      if (saved) {
        setSession((cur) => cur ?? saved);
        setLoading(false);
      }
      const { data, error } = await supabase.auth.getSession();
      let s = data.session;
      if (!s && error && errorCode(error) === 'network') {
        // Still no connection: stay in the app with the saved data (never the sign-in screen just for lack of signal)
        s = stored;
      } else {
        await afterSignIn(s);
      }
      setSession(s);
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Start-up is decided by getSession above (which knows about the offline
      // fallback); the library's own start-up event could briefly say "signed out"
      if (event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') clearLaunchSnapshot();
      if (event === 'SIGNED_IN') void afterSignIn(s);
      setSession(s);
      setLoading(false);
    });

    // Refresh tokens only while the app is in the foreground
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, [qc]);

  return (
    <AuthContext.Provider value={{ session, loading, recovery, transferring, clearRecovery: () => setRecovery(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

/** A saved login the app can open with straight away (not the old anonymous identity, which must sign in). */
function usableSaved(s: Session | null) {
  return s && !s.user.is_anonymous ? s : null;
}

/** The page was opened from a Google / Facebook sign-in or a password-reset email (the URL carries it). */
function openedFromAuthLink() {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return false;
  return /[?#&](code|access_token|error_description|type=recovery)/.test(location.search + location.hash);
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUserId() {
  return useContext(AuthContext).session?.user.id ?? null;
}
