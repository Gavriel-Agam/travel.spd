import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { findCardExpense, useVoiceExpense } from '@/hooks/useVoiceExpense';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { formatMoney } from '@/lib/money';
import { draftMinor, type Source, type VoiceDraft } from '@/lib/voice';
import { useVoice, type CardItem } from '@/store/voice';
import { radius, space, useColors } from '@/theme';
import { CategoryIcon } from './CategoryIcon';
import { Row, Text, tap } from './primitives';

/** How long the card stays when nothing needs checking. */
export const CARD_MS = 6000;

/**
 * The confirmation card after a voice expense is saved: one chip per field,
 * marked 🎙 heard, ✨ default (filled in) or ⚠ to check. Tapping a chip or
 * Edit opens the expense; Undo takes it back. Closes after 6 s, but not while
 * touched or hovered, or while a field needs checking.
 */
export function VoiceCard({ hidden }: { hidden?: boolean }) {
  const c = useColors();
  const { t, lang } = useT();
  const card = useVoice((s) => s.card);
  const showCard = useVoice((s) => s.showCard);
  const { undo } = useVoiceExpense();
  const { trip, expenses, members, memberById, me, allCategories } = useTripData();
  const [held, setHeld] = useState(false);
  const announced = useRef<string | null>(null);

  const needsCheck = !!card && !card.undone && card.items.some((i) => i.draft.status === 'pending_payer');
  const visible = !!card && card.tripId === trip?.id;

  // Auto close: 6 s (2.5 s once undone), paused while held or when something needs checking
  useEffect(() => {
    if (!visible || held || needsCheck) return;
    const id = setTimeout(() => showCard(null), card!.undone ? 2500 : CARD_MS);
    return () => clearTimeout(id);
  }, [visible, held, needsCheck, card?.id, card?.undone]);

  const fmt = (d: VoiceDraft) => (draftMinor(d) !== null ? formatMoney(draftMinor(d)!, d.currency, { lang }) : '');
  const nameOf = (id: string) => memberById.get(id)?.display_name ?? '?';

  // Read out once for screen readers
  useEffect(() => {
    if (!visible || card!.undone || announced.current === card!.id) return;
    announced.current = card!.id;
    const d = card!.items[0].draft;
    const filled = (Object.keys(d.sources) as (keyof VoiceDraft['sources'])[]).filter((k) => d.sources[k] === 'default').map((k) => t(`voice.fields.${k}`));
    AccessibilityInfo.announceForAccessibility(
      t('voice.announce', { amount: fmt(d), what: d.description, defaults: filled.length ? t('voice.announceDefaults', { fields: filled.join(', ') }) : '' }),
    );
  }, [visible, card?.id]);

  if (!visible || hidden) return null;

  const open = (it: CardItem) => {
    const e = findCardExpense(expenses, it.clientId);
    showCard(null);
    if (e) router.push({ pathname: '/expense/[id]/edit', params: { id: e.id } });
  };

  const splitLabel = (d: VoiceDraft) => {
    const s = d.split;
    if (d.kind === 'settlement' && s.type === 'personal') return t('voice.settlement', { name: nameOf(s.memberId) });
    switch (s.type) {
      case 'equal':
        return s.memberIds.length === members.length && members.every((m) => s.memberIds.includes(m.id))
          ? t('voice.splitAll')
          : s.memberIds.length === 1
            ? t('voice.splitOnly', { name: nameOf(s.memberIds[0]) })
            : t('voice.splitEqual', { count: s.memberIds.length });
      case 'personal':
        return t('voice.splitOnly', { name: nameOf(s.memberId) });
      case 'treat':
        return t('voice.splitTreat', { name: d.payerId ? nameOf(d.payerId) : '' });
      case 'percent':
        return t('voice.splitPercent');
      case 'amount':
        return t('voice.splitAmount');
    }
  };

  const items = card!.items;
  return (
    <Pressable
      accessibilityRole="summary"
      onHoverIn={() => setHeld(true)}
      onHoverOut={() => setHeld(false)}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      style={{
        position: 'absolute',
        start: space.md,
        end: space.md,
        bottom: '100%',
        marginBottom: 88,
        maxWidth: 480,
        alignSelf: 'center',
        padding: space.md,
        gap: space.sm,
        borderRadius: radius.lg,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: needsCheck ? c.warning : c.border,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      }}
    >
      {card!.undone ? (
        <Row gap={space.sm}>
          <Ionicons name="arrow-undo" size={18} color={c.textMuted} />
          <Text style={{ fontWeight: '700', flex: 1 }}>{t('voice.undone')}</Text>
        </Row>
      ) : (
        <>
          {items.length > 1 ? (
            <Text style={{ fontWeight: '700' }}>✅ {t('voice.savedMany', { count: items.length })}</Text>
          ) : null}
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: space.md }}>
            {items.map((it) => (
              <ItemView key={it.clientId} it={it} single={items.length === 1} fmt={fmt} nameOf={nameOf} splitLabel={splitLabel} onOpen={() => open(it)} category={allCategories.find((x) => x.id === it.draft.categoryId) ?? null} meId={me?.id ?? null} t={t} />
            ))}
          </ScrollView>
          {card!.transcript ? (
            <Text variant="caption" muted numberOfLines={2} style={{ fontStyle: 'italic' }}>
              "{card!.transcript}"
            </Text>
          ) : null}
          <Row gap={space.sm} style={{ justifyContent: 'flex-end' }}>
            <CardButton label={t('voice.edit')} icon="create-outline" onPress={() => open(items[0])} />
            <CardButton
              label={t('voice.undo')}
              icon="arrow-undo"
              onPress={() => {
                tap();
                void undo();
              }}
            />
          </Row>
        </>
      )}
    </Pressable>
  );
}

function ItemView({
  it,
  single,
  fmt,
  nameOf,
  splitLabel,
  onOpen,
  category,
  meId,
  t,
}: {
  meId: string | null;
  it: CardItem;
  single: boolean;
  fmt: (d: VoiceDraft) => string;
  nameOf: (id: string) => string;
  splitLabel: (d: VoiceDraft) => string;
  onOpen: () => void;
  category: Parameters<typeof categoryLabel>[0] | null;
  t: ReturnType<typeof useT>['t'];
}) {
  const c = useColors();
  const d = it.draft;
  const pending = d.status === 'pending_payer';
  const payer = pending
    ? t('voice.whoIs', { name: d.payerSaid })
    : d.payerId === null
      ? t('voice.joint')
      : d.payerId === meId
        ? t('voice.youPaid')
        : t('voice.paidBy', { name: nameOf(d.payerId) });
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <Text style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {single ? `${pending ? '⚠️' : '✅'} ${t('voice.saved')}${d.description ? ` · ${d.description}` : ''}` : d.description || (category ? categoryLabel(category, t) : '')}
        </Text>
        <Text style={{ fontWeight: '800' }}>{fmt(d)}</Text>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <FieldChip source={d.sources.amount} label={d.scaledFrom !== null ? `${fmt(d)} · ${t('voice.scaled', { said: d.scaledFrom })}` : fmt(d)} onPress={onOpen} />
        <FieldChip source={d.sources.currency} label={d.sources.currency === 'default' ? `${d.currency} · ${t('voice.tripCurrency')}` : d.currency} onPress={onOpen} />
        {d.kind === 'settlement' ? null : <FieldChip source={pending ? 'unresolved' : d.sources.paid_by} label={payer} onPress={onOpen} />}
        <FieldChip
          source={d.sources.split}
          label={d.sources.split === 'default' && d.kind !== 'settlement' ? `${splitLabel(d)} · ${t('voice.likeLastTime')}` : splitLabel(d)}
          pinned={d.persist}
          onPress={onOpen}
        />
        {d.kind === 'settlement' ? null : (
          <FieldChip source="plain" label={category ? categoryLabel(category, t) : ''} icon={category ? <CategoryIcon category={category} size={14} /> : null} onPress={onOpen} />
        )}
      </View>
      {d.persist ? (
        <Text variant="caption" muted>
          📌 {t('voice.keptDefault')}
        </Text>
      ) : null}
    </View>
  );
}

/** One field: 🎙 heard (solid), ✨ default (dashed), ⚠ check (amber). */
function FieldChip({ source, label, onPress, icon, pinned }: { source: Source | 'plain'; label: string; onPress: () => void; icon?: React.ReactNode; pinned?: boolean }) {
  const c = useColors();
  const { t } = useT();
  // Typed in by the user (an amount that wasn't heard): no mark
  const kind = source === 'unresolved' ? 'check' : source === 'default' || source === 'inferred' ? 'default' : source === 'plain' || source === 'edited' ? 'plain' : 'heard';
  const mark = kind === 'check' ? '⚠️' : kind === 'default' ? '✨' : kind === 'heard' ? '🎙' : null;
  const what = kind === 'check' ? t('voice.check') : kind === 'default' ? t('voice.default') : kind === 'heard' ? t('voice.heard') : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={what ? `${label}, ${what}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 32,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: kind === 'default' ? 'dashed' : 'solid',
        borderColor: kind === 'check' ? c.warning : kind === 'default' ? c.textFaint : 'transparent',
        backgroundColor: kind === 'check' ? c.warning + '22' : kind === 'default' ? 'transparent' : c.cardAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {mark ? <Text variant="caption">{mark}</Text> : icon}
      <Text variant="caption" style={{ fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
      {pinned ? <Text variant="caption">📌</Text> : null}
    </Pressable>
  );
}

function CardButton({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.cardAlt : 'transparent' })}
    >
      <Ionicons name={icon} size={18} color={c.primary} />
      <Text style={{ fontWeight: '700' }} color={c.primary}>
        {label}
      </Text>
    </Pressable>
  );
}
