import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { CATEGORY_BANK, inTrip, type BankItem } from '@/lib/categoryBank';
import { radius, space, useColors } from '@/theme';
import { CategoryIcon } from './CategoryIcon';
import { Sheet } from './Sheet';
import { Text, tap } from './primitives';

/**
 * Category & brand bank: ready-made categories by region (Asia, Europe and
 * global) and travel essentials. One tap adds one to the trip's list (it shows
 * a check from then on); works offline like every category change.
 */
export function CategoryBankSheet({
  visible,
  onClose,
  active,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  /** The trip's categories in the list now (icon and shown name). */
  active: { icon: string; name: string }[];
  /** Adds it; false when it couldn't be (guest demo). */
  onAdd: (fields: { name: string; icon: string; color: string }) => boolean;
}) {
  const { t } = useT();
  const c = useColors();
  // Added in this visit (shown at once, before the list updates)
  const [added, setAdded] = useState<Set<string>>(new Set());
  const nameOf = (item: BankItem) => item.brand ?? t(`bank.items.${item.id}`);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('bank.title')} height="88%">
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Text variant="caption" muted>
          {t('bank.hint')}
        </Text>
        {CATEGORY_BANK.map((group) => (
          <View key={group.key} style={{ gap: space.sm }}>
            <Text variant="label" muted accessibilityRole="header">
              {t(`bank.groups.${group.key}`)}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {group.items.map((item) => {
                const name = nameOf(item);
                const has = added.has(item.id) || inTrip(item, name, active);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={has ? t('bank.addedLabel', { name }) : t('bank.addLabel', { name })}
                    accessibilityState={{ disabled: has }}
                    disabled={has}
                    onPress={() => {
                      if (!onAdd({ name, icon: item.icon, color: item.color })) return;
                      tap();
                      setAdded((s) => new Set(s).add(item.id));
                    }}
                    style={({ pressed }) => ({
                      // Three a row; a short last row keeps the same tile size
                      width: '31.5%',
                      minHeight: 88,
                      borderRadius: radius.md,
                      padding: space.sm,
                      gap: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: has ? item.color + '1F' : c.cardAlt,
                      borderWidth: 1.5,
                      borderColor: has ? item.color : 'transparent',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <CategoryIcon category={{ icon: item.icon }} size={24} />
                    <Text variant="caption" center numberOfLines={2} style={{ fontWeight: '600' }}>
                      {name}
                    </Text>
                    {has ? (
                      <View style={{ position: 'absolute', top: 6, end: 6 }}>
                        <Ionicons name="checkmark-circle" size={18} color={c.success} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Text variant="caption" faint center>
          {t('bank.trademarks')}
        </Text>
      </View>
    </Sheet>
  );
}
