import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAddCategory, useResetCategory, useSetCategoryHidden, useUpdateCategory } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, isSelectable } from '@/lib/categories';
import { errorCode } from '@/lib/supabase';
import { space, useColors } from '@/theme';
import type { Category } from '@/types/db';
import { confirmDialog } from '@/ui/Dialog';
import { Sheet } from '@/ui/Sheet';
import { Button, Card, Divider, Field, IconButton, ListRow, Row, Screen, Text } from '@/ui/primitives';

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
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

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
      setColor(target.color);
    } else {
      setName('');
      setIcon('');
      setColor(COLORS[0]);
    }
  }

  async function save() {
    if (!name.trim()) return;
    try {
      const fields = { name: name.trim(), icon: icon.trim() || '🏷️', color };
      if (current) await update.mutateAsync({ category: current, ...fields });
      else await add.mutateAsync(fields);
      setEditing(null);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  async function hide() {
    if (!current) return;
    const label = categoryLabel(current, t);
    const builtIn = !current.trip_id;
    const ok = await confirmDialog(
      t(builtIn ? 'categories.hideConfirm' : 'categories.deleteConfirm', { name: label }),
      t('categories.deleteBody'),
      t(builtIn ? 'categories.hide' : 'common.delete'),
      t('common.cancel'),
      true,
    );
    if (!ok) return;
    setHidden.mutate({ category: current, hidden: true });
    setEditing(null);
  }

  async function restoreDefault() {
    if (!current) return;
    await reset.mutateAsync(current.id);
    setEditing(null);
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/settings')} />
      </Row>
      <Text variant="title">{t('categories.manage')}</Text>
      <Text variant="caption" muted>
        {t('categories.editHint')}
      </Text>

      <Card style={{ gap: 0 }}>
        {active.map((cat, i) => (
          <View key={cat.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              icon={<Text style={{ fontSize: 20 }}>{cat.icon}</Text>}
              iconBg={cat.color + '22'}
              title={categoryLabel(cat, t)}
              subtitle={cat.trip_id ? t('categories.customTag') : cat.edited ? t('categories.editedTag') : undefined}
              chevron
              onPress={() => open(cat)}
            />
          </View>
        ))}
        <Button title={t('categories.add')} icon="add" variant="secondary" onPress={() => open('new')} style={{ marginTop: space.sm }} />
      </Card>

      {hidden.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <Text variant="label" muted>
            {t('categories.hiddenSection')}
          </Text>
          {hidden.map((cat) => (
            <ListRow
              key={cat.id}
              icon={<Text style={{ fontSize: 20, opacity: 0.5 }}>{cat.icon}</Text>}
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

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={current ? t('categories.edit') : t('categories.add')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Row gap={space.md} align="flex-start">
            <View style={{ width: 80 }}>
              <Field
                label={t('categories.icon')}
                value={icon}
                onChangeText={(v) => setIcon([...v].slice(-2).join(''))}
                placeholder="💆"
                style={{ textAlign: 'center', fontSize: 22 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('categories.name')} value={name} onChangeText={setName} maxLength={40} autoFocus error={error} />
            </View>
          </Row>
          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }} gap={space.md}>
            {COLORS.map((col) => (
              <Pressable key={col} onPress={() => setColor(col)} accessibilityRole="button" accessibilityLabel={col}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: 3, borderColor: color === col ? c.text : 'transparent' }} />
              </Pressable>
            ))}
          </Row>
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!name.trim()} />
          {current && !current.trip_id && current.edited ? (
            <Button title={t('categories.resetDefault')} variant="ghost" icon="refresh" onPress={restoreDefault} disabled={busy} />
          ) : null}
          {current ? (
            <Button
              title={current.trip_id ? t('common.delete') : t('categories.hide')}
              variant="danger"
              icon={current.trip_id ? 'trash-outline' : 'eye-off-outline'}
              onPress={hide}
              disabled={busy}
            />
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}
