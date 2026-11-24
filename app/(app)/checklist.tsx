import { useRefreshAll } from '@/hooks/useRefreshAll';
import { Dissolve } from '@/ui/Dissolve';
import { dissolveThen } from '@/store/dissolve';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useChecklist, useChecklistActions } from '@/api/checklist';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { CHECKLIST_LISTS, CHECKLIST_TITLE_MAX, listItems, progress } from '@/lib/checklist';
import { blockedInDemo } from '@/lib/demoPrompt';
import { goBack } from '@/lib/nav';
import { useUserId } from '@/providers/AuthProvider';
import { radius, space, useColors } from '@/theme';
import type { ChecklistItem, ChecklistList } from '@/types/db';
import { Card, Divider, EmptyState, Segmented, Screen, Text, tap, useTextFieldDirection } from '@/ui/primitives';
import { Topbar, useThemeMenuItem } from '@/ui/Topbar';

const web = Platform.OS === 'web';

const EMOJI: Record<ChecklistList, string> = { to_pack: '🧳', to_buy_do: '🛍️', brought: '🎒' };

/**
 * Trip checklist: three short lists (to pack, to buy or do on the trip, what
 * I brought). One line to add (Enter adds and keeps the keyboard open), a tap
 * ticks, ✕ removes. Works offline: every change shows at once and is sent when
 * there is a connection. "What I brought" is personal; the other two are
 * shared with everyone on the trip.
 */
export default function Checklist() {
  const { t } = useT();
  const refreshAll = useRefreshAll();
  const c = useColors();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ list?: string }>();
  const { trip } = useTripData();
  const userId = useUserId();
  const query = useChecklist(trip?.id);
  const actions = useChecklistActions(trip?.id, userId ?? undefined);
  const themeItem = useThemeMenuItem();
  const [list, setList] = useState<ChecklistList>(CHECKLIST_LISTS.includes(params.list as ChecklistList) ? (params.list as ChecklistList) : 'to_pack');
  const [draft, setDraft] = useState('');
  const input = useRef<TextInputInstance | null>(null);
  const dir = useTextFieldDirection(draft);

  const all = query.data ?? [];
  const items = useMemo(() => listItems(all, list, userId ?? undefined), [all, list, userId]);
  const counts = useMemo(
    () => Object.fromEntries(CHECKLIST_LISTS.map((l) => [l, progress(listItems(all, l, userId ?? undefined))])) as Record<ChecklistList, { done: number; total: number }>,
    [all, userId],
  );

  if (!trip) return null;

  const add = () => {
    if (blockedInDemo(qc)) return;
    if (actions.add(list, draft, all)) {
      tap();
      setDraft('');
    }
    // Keep typing the next item: focus now (still inside the tap, so a phone keeps its keyboard) and again after the list redraws
    input.current?.focus();
    requestAnimationFrame(() => input.current?.focus());
  };

  const label = (l: ChecklistList) => {
    const n = counts[l];
    return n.total ? `${t(`checklist.lists.${l}`)} ${n.done}/${n.total}` : t(`checklist.lists.${l}`);
  };

  return (
    <Screen onRefresh={refreshAll}>
      <Topbar title={t('checklist.title')} onBack={() => goBack('/')} menu={[themeItem]} />
      <Segmented options={CHECKLIST_LISTS.map((l) => ({ value: l, label: label(l) }))} value={list} onChange={setList} />
      <Text variant="caption" muted>
        {t(`checklist.hints.${list}`)}
      </Text>

      {/* Quick add: one line, Enter adds */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.card, borderRadius: radius.lg, paddingStart: space.md, paddingEnd: 4, minHeight: 52 }}>
        <Ionicons name="add" size={22} color={c.textMuted} />
        <TextInput
          ref={input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          // The web build ignores submitBehavior: without this, Enter blurs the field
          blurOnSubmit={false}
          returnKeyType="done"
          maxLength={CHECKLIST_TITLE_MAX}
          placeholder={t(`checklist.placeholder.${list}`)}
          placeholderTextColor={c.textMuted}
          accessibilityLabel={t('checklist.addLabel', { list: t(`checklist.lists.${list}`) })}
          {...(dir.dir ? ({ dir: dir.dir } as object) : null)}
          style={[{ flex: 1, minWidth: 0, height: 48, fontSize: 16, color: c.text }, dir.align, web ? ({ outlineStyle: 'none' } as object) : null]}
        />
        {draft.trim() ? (
          <Pressable
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel={t('checklist.add')}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.cardAlt : 'transparent' })}
          >
            <Ionicons name="arrow-up-circle" size={30} color={c.primary} />
          </Pressable>
        ) : null}
      </View>

      {items.length ? (
        <Card style={{ gap: 0, paddingVertical: space.xs }}>
          {items.map((item, i) => (
            <Dissolve key={item.id} id={item.id}>
              {i > 0 ? <Divider /> : null}
              <ItemRow
                item={item}
                onToggle={() => {
                  if (blockedInDemo(qc)) return;
                  tap();
                  actions.toggle(item);
                }}
                onRemove={() => {
                  if (blockedInDemo(qc)) return;
                  // Turns to dust, then leaves the list
                  dissolveThen(item.id, () => actions.remove(item));
                }}
              />
            </Dissolve>
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState emoji={EMOJI[list]} title={t(`checklist.empty.${list}`)} body={t('checklist.emptyBody')} />
        </Card>
      )}
    </Screen>
  );
}

function ItemRow({ item, onToggle, onRemove }: { item: ChecklistItem; onToggle: () => void; onRemove: () => void }) {
  const c = useColors();
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.is_checked }}
        aria-checked={item.is_checked}
        accessibilityLabel={item.title}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: item.is_checked ? c.primary : c.textMuted,
            backgroundColor: item.is_checked ? c.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {item.is_checked ? <Ionicons name="checkmark" size={17} color={c.primaryText} /> : null}
        </View>
        <Text style={{ flex: 1, textDecorationLine: item.is_checked ? 'line-through' : 'none' }} color={item.is_checked ? c.textMuted : c.text}>
          {item.title}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('checklist.remove', { title: item.title })}
        style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: pressed ? c.cardAlt : 'transparent' }]}
      >
        <Ionicons name="close" size={18} color={c.textMuted} />
      </Pressable>
    </View>
  );
}
