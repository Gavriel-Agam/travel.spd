import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, TextInput, View } from 'react-native';
import { useCurrencyList } from '@/api/queries';
import { allCurrencies, currencyName, orderForPicker, searchCurrencies, type Currency } from '@/lib/currencies';
import { useT } from '@/i18n';
import { usePrefs } from '@/store/prefs';
import { radius, space, useColors } from '@/theme';
import { Text, tap } from './primitives';
import { Sheet } from './Sheet';

export function CurrencyPicker({
  visible,
  value,
  onSelect,
  onClose,
  autoRateCodes,
}: {
  visible: boolean;
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  /** Codes with an automatic rate; others get a "manual rate" hint. */
  autoRateCodes?: Set<string>;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [query, setQuery] = useState('');
  const remote = useCurrencyList(); // registers server-side currencies when online
  const recent = usePrefs((s) => s.recentCurrencies);
  const usage = usePrefs((s) => s.currencyUsage);

  const sections = useMemo(() => {
    const list = allCurrencies();
    if (query.trim()) return [{ key: 'results', title: '', data: searchCurrencies(list, query) }];
    const o = orderForPicker(list, recent, usage);
    return [
      { key: 'recent', title: t('currency.recent'), data: o.recent },
      { key: 'frequent', title: t('currency.frequent'), data: o.frequent },
      { key: 'all', title: t('currency.all'), data: o.all },
    ].filter((s) => s.data.length > 0);
    // remote.data triggers a refresh once server currencies are registered
  }, [query, recent, usage, t, remote.data]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={t('currency.title')} height="85%">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            backgroundColor: c.cardAlt,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
          }}
        >
          <Ionicons name="search" size={18} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('currency.search')}
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, height: 44, fontSize: 16, color: c.text, textAlign: 'auto' }}
          />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.code}-${i}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
        ListEmptyComponent={
          <Text muted center style={{ padding: space.xl }}>
            {t('currency.none')}
          </Text>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text variant="caption" muted style={{ paddingTop: space.md, paddingBottom: space.xs, textTransform: 'uppercase' }}>
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <CurrencyRow
            currency={item}
            name={currencyName(item, lang)}
            selected={item.code === value}
            manualHint={autoRateCodes && autoRateCodes.size > 1 && !autoRateCodes.has(item.code) ? t('form.noAutoRate') : undefined}
            onPress={() => {
              tap();
              onSelect(item.code);
              close();
            }}
          />
        )}
      />
    </Sheet>
  );
}

function CurrencyRow({ currency, name, selected, onPress, manualHint }: {
  currency: Currency;
  name: string;
  selected: boolean;
  onPress: () => void;
  manualHint?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: 12,
        paddingHorizontal: space.sm,
        borderRadius: radius.md,
        backgroundColor: selected ? c.primarySoft : pressed ? c.cardAlt : 'transparent',
      })}
    >
      <Text style={{ fontSize: 26 }}>{currency.flag || '🏳️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600' }} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" muted>
          {currency.code}
          {manualHint ? ` · ${manualHint}` : ''}
        </Text>
      </View>
      <Text variant="h2" muted>
        {currency.symbol}
      </Text>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
    </Pressable>
  );
}
