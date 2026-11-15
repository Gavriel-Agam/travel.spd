import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '@/hooks/useOutboxSync';
import { useT } from '@/i18n';
import { applyAppUpdate, useAppUpdateReady } from '@/lib/appUpdate';
import { readableOn } from '@/lib/contrast';
import { useOutbox, useSyncFlash } from '@/store/outbox';
import { space, useColors } from '@/theme';
import { Text, type IconName } from './primitives';

const FLASH_MS = 3000;

/**
 * A full-width strip pinned to the very top of the screen, above every screen's
 * own header (the trip name on Home), flush with the top edge:
 * - offline: "showing saved data", plus how many changes are waiting;
 * - back online: "syncing…" while queued changes are sent;
 * - then "all synced" for a few seconds;
 * - a change the server refused: asks to open it;
 * - a newer version of the app was downloaded: tap to reload.
 * Nothing at all when everything is normal.
 */
export function SyncBar({ tripId }: { tripId: string }) {
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
  const updateReady = useAppUpdateReady();
  const [, tick] = useState(0);
  const flashing = flashedAt > 0 && Date.now() - flashedAt < FLASH_MS;
  useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(() => tick((n) => n + 1), FLASH_MS - (Date.now() - flashedAt) + 50);
    return () => clearTimeout(id);
  }, [flashedAt, flashing]);

  if (failed > 0) return <Strip text={t('sync.failed', { count: failed })} color={c.danger} icon="alert-circle" />;
  if (!online) {
    return <Strip text={waiting > 0 ? t('sync.offlineWaiting', { count: waiting }) : t('sync.offline')} color={c.warning} icon="cloud-offline-outline" />;
  }
  if (waiting > 0) return <Strip text={t('sync.syncing', { count: waiting })} color={c.primary} icon="sync" />;
  if (updateReady) return <Strip text={t('sync.updateReady')} color={c.primary} icon="sparkles-outline" onPress={applyAppUpdate} />;
  if (flashing) return <Strip text={t('sync.allSynced')} color={c.success} icon="checkmark-circle" />;
  return null;
}

/** The strip itself: the state's colour edge to edge, from the top of the screen (under the status bar on a phone). */
function Strip({ text, color, icon, onPress }: { text: string; color: string; icon: IconName; onPress?: () => void }) {
  const insets = useSafeAreaInsets();
  const ink = readableOn(color);
  const body = (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: color,
        paddingTop: insets.top + 6,
        paddingBottom: 6,
        paddingHorizontal: space.lg,
      }}
    >
      <Ionicons name={icon} size={15} color={ink} />
      <Text variant="caption" color={ink} style={{ flex: 1, fontWeight: '700' }} numberOfLines={2}>
        {text}
      </Text>
      {onPress ? <Ionicons name="refresh" size={15} color={ink} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}
