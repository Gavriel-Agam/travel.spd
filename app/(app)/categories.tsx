import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAddCategory, useArchiveCategory } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { errorCode } from '@/lib/supabase';
import { space, useColors } from '@/theme';
import { confirmDialog } from '@/ui/Dialog';
import { Sheet } from '@/ui/Sheet';
import { Button, Card, Divider, Field, IconButton, ListRow, Row, Screen, Text } from '@/ui/primitives';

const COLORS = ['#5B6CFF', '#FF7A59', '#FFB020', '#14B8A6', '#E05BD8', '#22C55E', '#EF4444', '#8E8E93'];

export default function Categories() {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, categories } = useTripData();
  const add = useAddCategory(trip?.id ?? '');
  const archive = useArchiveCategory(trip?.id ?? '');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const builtIn = categories.filter((x) => !x.trip_id);
  const custom = categories.filter((x) => x.trip_id);

  async function submit() {
    if (!name.trim()) return;
    try {
      await add.mutateAsync({ name: name.trim(), icon: icon.trim() || '🏷️', color });
      setOpen(false);
      setName('');
      setIcon('');
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  async function remove(id: string, name: string) {
    if (await confirmDialog(t('categories.deleteConfirm', { name }), t('categories.deleteBody'), t('common.delete'), t('common.cancel'), true)) {
      archive.mutate(id);
    }
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} />
      </Row>
      <Text variant="title">{t('categories.manage')}</Text>

      <Card style={{ gap: 0 }}>
        <Text variant="label" muted>
          {t('categories.custom')}
        </Text>
        {custom.map((cat, i) => (
          <View key={cat.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              icon={<Text style={{ fontSize: 20 }}>{cat.icon}</Text>}
              iconBg={cat.color + '22'}
              title={cat.name}
              right={<IconButton name="trash-outline" color={c.danger} onPress={() => remove(cat.id, cat.name)} />}
            />
          </View>
        ))}
        <Button title={t('categories.add')} icon="add" variant="secondary" onPress={() => setOpen(true)} style={{ marginTop: space.sm }} />
      </Card>

      <Card style={{ gap: 0 }}>
        <Text variant="label" muted>
          {t('categories.builtIn')}
        </Text>
        {builtIn.map((cat) => (
          <ListRow key={cat.id} icon={<Text style={{ fontSize: 20 }}>{cat.icon}</Text>} iconBg={cat.color + '22'} title={categoryLabel(cat, t)} />
        ))}
      </Card>

      <Sheet visible={open} onClose={() => setOpen(false)} title={t('categories.add')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Row gap={space.md} align="flex-start">
            <View style={{ width: 80 }}>
              <Field label={t('categories.icon')} value={icon} onChangeText={(v) => setIcon([...v].slice(-2).join(''))} placeholder="💆" style={{ textAlign: 'center', fontSize: 22 }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('categories.name')} value={name} onChangeText={setName} maxLength={40} autoFocus error={error} />
            </View>
          </Row>
          <Row style={{ justifyContent: 'center' }} gap={space.md}>
            {COLORS.map((col) => (
              <Pressable key={col} onPress={() => setColor(col)}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: 3, borderColor: color === col ? c.text : 'transparent' }} />
              </Pressable>
            ))}
          </Row>
          <Button title={t('common.save')} onPress={submit} loading={add.isPending} disabled={!name.trim()} />
        </View>
      </Sheet>
    </Screen>
  );
}
