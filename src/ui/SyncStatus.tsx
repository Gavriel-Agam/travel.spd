import { useEffect, useMemo, useState } from 'react';
import { useOnline } from '@/hooks/useOutboxSync';
import { useT } from '@/i18n';
import { useOutbox, useSyncFlash } from '@/store/outbox';
import { useColors } from '@/theme';
import { Banner } from './primitives';

const FLASH_MS = 3000;

/**
 * Slim banner at the top of each tab:
 * - offline: "showing saved data", plus how many changes are waiting;
 * - back online: "syncing…" while queued changes are sent;
 * - then "all synced" for a few seconds;
 * - a change the server refused: asks to open it.
 * Nothing at all when everything is normal.
 */
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

  // "All synced" for a moment after a sync or a reconnect
  const flashedAt = useSyncFlash((s) => s.at);
  const [, tick] = useState(0);
  const flashing = flashedAt > 0 && Date.now() - flashedAt < FLASH_MS;
  useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(() => tick((n) => n + 1), FLASH_MS - (Date.now() - flashedAt) + 50);
    return () => clearTimeout(id);
  }, [flashedAt, flashing]);

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
  if (flashing) return <Banner text={t('sync.allSynced')} color={c.success} icon="checkmark-circle" />;
  return null;
}
