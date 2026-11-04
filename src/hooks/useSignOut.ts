import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useOutbox } from '@/store/outbox';
import { usePrefs } from '@/store/prefs';
import { confirmDialog } from '@/ui/Dialog';

/** Signs out after a confirmation (warning about unsent expenses); nothing of the account stays on the device. */
export function useSignOut() {
  const { t } = useT();
  const queryClient = useQueryClient();
  return async () => {
    const pending = useOutbox.getState().items.length;
    const body = pending > 0 ? t('settings.signOutPending', { count: pending }) : undefined;
    if (!(await confirmDialog(t('settings.signOutConfirm'), body, t('settings.signOut'), t('common.cancel'), true))) return;
    usePrefs.getState().setActiveTrip(null);
    await supabase.auth.signOut();
    useOutbox.setState({ items: [] });
    usePrefs.setState({ homeOrderDirty: false });
    queryClient.clear();
  };
}
