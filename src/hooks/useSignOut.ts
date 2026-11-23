import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { clearLaunchSnapshot } from '@/lib/launchSnapshot';
import { useVoice } from '@/store/voice';
import { clearReceiptCache } from '@/lib/receiptCache';
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
    clearLaunchSnapshot();
    useVoice.getState().clear();
    // Places looked up on this device are personal
    usePrefs.setState({ places: {}, lastPlace: null });
    void clearReceiptCache();
    await supabase.auth.signOut();
    useOutbox.setState({ items: [] });
    usePrefs.setState({ homeOrderDirty: false });
    queryClient.clear();
  };
}
