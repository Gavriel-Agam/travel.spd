import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useAddCategory, useResetCategory, useSetCategoryHidden, useSetCategoryOrder, useUpdateCategory } from '@/api/queries';
import { useDragScroll } from '@/hooks/useCardOrder';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, EMOJI_CHOICES, isSelectable, nextCategoryOrder, normalizeEmoji } from '@/lib/categories';
import { categoryIconFromPick } from '@/lib/image';
import { goBack } from '@/lib/nav';
import { errorCode } from '@/lib/supabase';
import { radius, space, useColors } from '@/theme';
import type { Category } from '@/types/db';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { confirmDialog } from '@/ui/Dialog';
import { DraggableGrid } from '@/ui/DraggableGrid';
import { Sheet } from '@/ui/Sheet';
import { SwipeRow } from '@/ui/SwipeRow';
import { Button, Card, Field, IconButton, ListRow, Row, Screen, Text, tap } from '@/ui/primitives';

const COLORS = ['#5B6CFF', '#FF7A59', '#FFB020', '#14B8A6', '#3B9EFF', '#E05BD8', '#8B5CF6', '#22C55E', '#EF4444', '#8E8E93'];

/** null: closed; 'new': adding; a category: editing it. */
type Editing = null | 'new' | Category;

export default function Categories() {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, allCategories } = useTripData();
  const add = useAddCategory(trip?.id ?? '');
  const update = useUpdateCategory(trip?.id ?? '');
  const setHidden = useSetCategoryHidden(trip?.id ?? '');
  const reset = useResetCategory(trip?.id ?? '');
  const setOrder = useSetCategoryOrder(trip?.id ?? '');
  const drag = useDragScroll();
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const active = allCategories.filter(isSelectable);
  const hidden = allCategories.filter((x) => !isSelectable(x));
  const current = editing && editing !== 'new' ? editing : null;
  const busy = add.isPending || update.isPending || setHidden.isPending || reset.isPending;

  function open(target: Editing) {
    setEditing(target);
    setError(null);
    if (target && target !== 'new') {
      setName(categoryLabel(target, t));
      setIcon(target.icon);
      setImage(target.image ?? null);
      setColor(target.color);
    } else {
      setName('');
      setIcon('');
      setImage(null);
      setColor(COLORS[0]);
    }
  }

  async function save() {
    if (!name.trim()) return;
    try {
      const fields = { name: name.trim(), icon: normalizeEmoji(icon) || '🏷️', color, image };
      if (current) await update.mutateAsync({ category: current, ...fields });
      else await add.mutateAsync(fields);
      setEditing(null);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    }
  }

  /**
   * Delete from this trip's list. Built-ins are shared by every trip, so for
   * them this hides them here; either way past expenses keep the category and
   * it can be brought back from the hidden section.
   */
  async function remove(cat: Category) {
    const ok = await confirmDialog(
      t('categories.deleteConfirm', { name: categoryLabel(cat, t) }),
      t('categories.deleteBody'),
      t('common.delete'),
      t('common.cancel'),
      true,
    );
    if (!ok) return false;
    setHidden.mutate({ category: cat, hidden: true });
    return true;
  }

  async function restoreDefault() {
    if (!current) return;
    await reset.mutateAsync(current.id);
    setEditing(null);
  }

  async function pickImage() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // The phone app crops and shrinks it here; the browser does it in categoryIconFromPick
      ...(Platform.OS === 'web' ? { quality: 1 } : { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.4 }),
    });
    const asset = !res.canceled ? res.assets[0] : undefined;
    if (!asset) return;
    setPicking(true);
    try {
      setImage(await categoryIconFromPick(asset.uri));
    } catch (e) {
      setError(t((e as Error).message === 'image_too_large' ? 'categories.imageTooLarge' : 'categories.imageUnreadable'));
    } finally {
      setPicking(false);
    }
  }

  const preview = { icon: normalizeEmoji(icon) || '🏷️', image };

  return (
    <Screen {...drag.scrollProps}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/settings')} />
      </Row>
      <Text variant="title">{t('categories.manage')}</Text>
      <Text variant="caption" muted>
        {t('categories.editHint')}
      </Text>

      {/* Hold a row to lift it and drag it to a new place; swipe it for edit / delete */}
      <DraggableGrid
        columns={1}
        gap={space.sm}
        items={active.map((cat) => ({
          key: cat.id,
          radius: radius.md,
          node: (
            <SwipeRow
              background={c.card}
              style={{ borderRadius: radius.md }}
              contentStyle={{ paddingHorizontal: space.md }}
              actions={[
                { key: 'edit', icon: 'create-outline', color: c.primary, label: t('common.edit'), onPress: () => open(cat) },
                { key: 'delete', icon: 'trash-outline', color: c.danger, label: t('common.delete'), onPress: () => void remove(cat) },
              ]}
            >
              {(guardTap) => (
                <ListRow
                  icon={<CategoryIcon category={cat} size={20} />}
                  iconBg={cat.color + '22'}
                  title={categoryLabel(cat, t)}
                  subtitle={cat.trip_id ? t('categories.customTag') : cat.edited ? t('categories.editedTag') : undefined}
                  right={<Ionicons name="reorder-three" size={22} color={c.textFaint} accessibilityLabel={t('categories.dragHint')} />}
                  onPress={guardTap(() => open(cat))}
                  onLongPress={() => {}}
                />
              )}
            </SwipeRow>
          ),
        }))}
        onReorder={(keys) => setOrder.mutate(nextCategoryOrder(allCategories, keys))}
        scrollRef={drag.scrollRef}
        scroll={drag.scroll}
        onDragging={drag.setDragging}
      />
      <Button title={t('categories.add')} icon="add" variant="secondary" onPress={() => open('new')} />

      {hidden.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <Text variant="label" muted>
            {t('categories.hiddenSection')}
          </Text>
          {hidden.map((cat) => (
            <ListRow
              key={cat.id}
              icon={<CategoryIcon category={cat} size={20} dim />}
              iconBg={c.cardAlt}
              title={categoryLabel(cat, t)}
              right={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setHidden.mutate({ category: cat, hidden: false })}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name="eye-outline" size={18} color={c.primary} />
                  <Text variant="label" color={c.primary}>
                    {t('categories.show')}
                  </Text>
                </Pressable>
              }
            />
          ))}
        </Card>
      ) : null}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={current ? t('categories.edit') : t('categories.add')} height="88%">
        <View style={{ padding: space.lg, gap: space.md }}>
          {/* How it will look, next to its name */}
          <Row gap={space.md} align="flex-start">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: color + '22',
                borderWidth: 1.5,
                borderColor: color,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 22,
              }}
            >
              <CategoryIcon category={preview} size={30} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('categories.name')} value={name} onChangeText={setName} maxLength={40} autoFocus={!current} />
            </View>
          </Row>

          {/* Picture */}
          <Row gap={space.sm}>
            <Button
              title={image ? t('categories.changeImage') : t('categories.uploadImage')}
              icon="image-outline"
              variant="secondary"
              onPress={pickImage}
              loading={picking}
              style={{ flex: 1 }}
            />
            {image ? <Button title={t('categories.removeImage')} icon="close" variant="ghost" onPress={() => setImage(null)} /> : null}
          </Row>
          <Text variant="caption" muted>
            {image ? t('categories.imageActive') : t('categories.imageHint')}
          </Text>

          {/* Emoji: ready-made choices or your own */}
          <Text variant="label" muted>
            {t('categories.icon')}
          </Text>
          <ScrollView style={{ maxHeight: 170 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} nestedScrollEnabled>
            {EMOJI_CHOICES.map((e) => {
              const on = !image && normalizeEmoji(icon) === e;
              return (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={e}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    tap();
                    setIcon(e);
                    setImage(null);
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? color + '33' : c.cardAlt,
                    borderWidth: 1.5,
                    borderColor: on ? color : 'transparent',
                  }}
                >
                  <CategoryIcon category={{ icon: e }} size={21} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Field
            label={t('categories.ownEmoji')}
            value={icon}
            onChangeText={(v) => {
              setIcon(normalizeEmoji(v));
              if (v.trim()) setImage(null);
            }}
            placeholder="💆"
            style={{ textAlign: 'center', fontSize: 22 }}
          />

          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }} gap={space.md}>
            {COLORS.map((col) => (
              <Pressable key={col} onPress={() => setColor(col)} accessibilityRole="button" accessibilityLabel={col}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: 3, borderColor: color === col ? c.text : 'transparent' }} />
              </Pressable>
            ))}
          </Row>
          {error ? (
            <Text variant="label" color={c.danger}>
              {error}
            </Text>
          ) : null}
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!name.trim() || picking} />
          {current && !current.trip_id && current.edited ? (
            <Button title={t('categories.resetDefault')} variant="ghost" icon="refresh" onPress={restoreDefault} disabled={busy} />
          ) : null}
          {current ? (
            <Button
              title={t('common.delete')}
              variant="danger"
              icon="trash-outline"
              onPress={async () => {
                if (await remove(current)) setEditing(null);
              }}
              disabled={busy}
            />
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}
