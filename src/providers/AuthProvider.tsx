import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { finishPendingTransfer } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

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

    supabase.auth.getSession().then(async ({ data }) => {
      await afterSignIn(data.session);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
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
