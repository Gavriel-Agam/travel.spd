import { useMemo } from 'react';
import { useOnline } from '@/hooks/useOutboxSync';
import { useT } from '@/i18n';
import { useOutbox } from '@/store/outbox';
import { useColors } from '@/theme';
import { Banner } from './primitives';

/** Shows when the device is offline or expenses are waiting to be saved. */
export function SyncStatus({ tripId }: { tripId: string }) {
  const { t } = useT();
  const c = useColors();
  const online = useOnline();
  // Select the stored array itself: a selector that builds a new array on
  // every call makes zustand re-render forever (blank screen on Home)
  const all = useOutbox((s) => s.items);
  const items = useMemo(() => all.filter((i) => i.tripId === tripId), [all, tripId]);
  const failed = items.filter((i) => i.error).length;
  const waiting = items.length - failed;

  if (failed > 0) return <Banner text={t('sync.failed', { count: failed })} color={c.danger} icon="alert-circle" />;
  if (!online) {
    return (
      <Banner
        text={waiting > 0 ? t('sync.offlineWaiting', { count: waiting }) : t('sync.offline')}
        color={c.warning}
        icon="cloud-offline-outline"
      />
    );
  }
  if (waiting > 0) return <Banner text={t('sync.syncing', { count: waiting })} color={c.primary} icon="sync" />;
  return null;
}
