import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { finishPendingTransfer } from '@/lib/auth';
import { errorCode, readStoredSession, supabase } from '@/lib/supabase';

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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const running = useRef(false);
  // Opened offline with an expired login token: using the saved session until the server is reachable
  const offlineSession = useRef(false);

  useEffect(() => {
    // After signing in with a real account, finish a pending transfer before the app loads trips
    const afterSignIn = async (s: Session | null) => {
      if (!s || s.user.is_anonymous || running.current) return;
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
      // An expired login token needs the network to refresh, and the library
      // retries for ~30s before giving up. Don't make the user wait for that:
      // open with the saved session now (cached data shows) and swap in the
      // fresh one when the refresh succeeds.
      const stored = await readStoredSession();
      const expired = !!stored?.expires_at && stored.expires_at * 1000 < Date.now() + 10_000;
      if (stored && expired) {
        offlineSession.current = true;
        setSession(stored);
        setLoading(false);
      }
      const { data, error } = await supabase.auth.getSession();
      let s = data.session;
      if (!s && error && errorCode(error) === 'network') {
        // Still no connection: stay in the app with the saved data (never the sign-in screen just for lack of signal)
        s = stored;
        offlineSession.current = !!s;
      } else {
        offlineSession.current = false;
        await afterSignIn(s);
      }
      setSession(s);
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Start-up is decided by getSession above (which knows about the offline
      // fallback); the library's own start-up event could briefly say "signed out"
      if (event === 'INITIAL_SESSION') return;
      if (s) offlineSession.current = false;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
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

export function useAuth() {
  return useContext(AuthContext);
}

export function useUserId() {
  return useContext(AuthContext).session?.user.id ?? null;
}
