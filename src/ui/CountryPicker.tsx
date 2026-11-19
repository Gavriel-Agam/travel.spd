import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { countryFlag, countryName, searchCountries } from '@/lib/countries';
import { vatRule } from '@/lib/taxFree';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { Button, Row, Text, tap, useTextFieldDirection } from './primitives';
import { Sheet, SheetSectionList } from './Sheet';

/**
 * Pick countries, with a search box (Hebrew or English name, or code).
 * - `multi`: tap toggles, the sheet stays open (trip destinations);
 * - otherwise tap picks one and closes (an expense's location).
 * `top` (e.g. the trip's destinations) is listed first. Countries with VAT
 * refund rules show the rate.
 */
export function CountryPicker({
  visible,
  title,
  selected,
  onPick,
  onClose,
  multi = false,
  top = [],
}: {
  visible: boolean;
  title: string;
  selected: readonly string[];
  onPick: (code: string) => void;
  onClose: () => void;
  multi?: boolean;
  top?: readonly string[];
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [query, setQuery] = useState('');
  const searchDir = useTextFieldDirection(query);

  const sections = useMemo(() => {
    if (query.trim()) return [{ key: 'results', title: '', data: searchCountries(query, lang) }];
    const first = [...new Set([...top, ...(multi ? selected : [])])];
    const rest = searchCountries('', lang).filter((x) => !first.includes(x));
    return [
      { key: 'top', title: multi ? t('countries.chosen') : t('countries.tripDestinations'), data: first },
      { key: 'all', title: t('countries.all'), data: rest },
    ].filter((s) => s.data.length > 0);
  }, [query, lang, top, selected, multi, t]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={title} height="85%" scroll={false}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md }}>
          <Ionicons name="search" size={18} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('countries.search')}
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t('countries.search')}
            {...(searchDir.dir ? ({ dir: searchDir.dir } as object) : null)}
            style={[{ flex: 1, height: 44, fontSize: 16, color: c.text }, searchDir.align]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.clearText')} hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={c.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <SheetSectionList
        sections={sections}
        keyExtractor={(code: string) => code}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
        ListEmptyComponent={
          <Text muted center style={{ padding: space.xl }}>
            {t('countries.none')}
          </Text>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text variant="caption" muted style={{ paddingTop: space.md, paddingBottom: space.xs }}>
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item: code }: { item: string }) => {
          const rule = vatRule(code);
          const on = selected.includes(code);
          return (
            <Pressable
              accessibilityRole={multi ? 'checkbox' : 'button'}
              accessibilityState={multi ? { checked: on } : { selected: on }}
              onPress={() => {
                tap();
                onPick(code);
                if (!multi) close();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: 11,
                paddingHorizontal: space.sm,
                borderRadius: radius.md,
                backgroundColor: on ? c.primarySoft : pressed ? c.cardAlt : 'transparent',
              })}
            >
              <Text style={{ fontSize: 24 }}>{countryFlag(code)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                  {countryName(code, lang)}
                </Text>
                {rule ? (
                  <Row gap={4}>
                    {/* A green check: shops here can refund VAT */}
                    {!rule.noRefund ? <Ionicons name="checkmark-circle" size={14} color={c.success} accessibilityLabel={t('countries.hasRefund')} /> : null}
                    <Text variant="caption" muted>
                      {rule.noRefund ? t('countries.noRefund') : t('countries.vatRefund', { vat: rule.vat })}
                    </Text>
                  </Row>
                ) : null}
              </View>
              {multi ? (
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? c.primary : c.textFaint} />
              ) : on ? (
                <Ionicons name="checkmark-circle" size={22} color={c.primary} />
              ) : null}
            </Pressable>
          );
        }}
      />
      {multi ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg }}>
          <Button title={t('common.done')} onPress={close} />
        </View>
      ) : null}
    </Sheet>
  );
}
