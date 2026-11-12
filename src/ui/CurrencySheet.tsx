import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { currencyName, getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, percent } from '@/lib/money';
import { dayKey, spendByCurrency } from '@/lib/stats';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense } from '@/types/db';
import { CategoryIcon } from './CategoryIcon';
import { ProgressBar, Row, Text, tap } from './primitives';
import { Sheet, SheetScrollView } from './Sheet';

/**
 * Statistics › By currency, opened: one block per currency (flag, code, name,
 * symbol, total in that currency, its value in shekels, number of expenses and
 * share of the spending). Tap a block for its expenses, newest first.
 */
export function CurrencySheet({ visible, onClose, expenses, categoryById, timeZone, open: openFirst }: {
  visible: boolean;
  onClose: () => void;
  expenses: Expense[];
  categoryById: Map<string, Category>;
  timeZone: string;
  /** The currency to show opened (the row that was tapped). */
  open: string | null;
}) {
  const { t, lang } = useT();
  const c = useColors();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (visible) setOpened(new Set(openFirst ? [openFirst] : []));
  }, [visible, openFirst]);

  const rows = useMemo(() => spendByCurrency(expenses), [expenses]);
  const totalIls = rows.reduce((s, r) => s + r.ilsMinor, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  const byCurrency = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      if (e.kind !== 'expense') continue;
      map.set(e.currency, [...(map.get(e.currency) ?? []), e]);
    }
    return map;
  }, [expenses]);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmtDay = (iso: string) => new Date(dayKey(iso, timeZone) + 'T12:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });

  const toggle = (code: string) => {
    tap();
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('stats.currencyTitle')} height="85%" scroll={false}>
      <SheetScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <Text variant="label" muted center>
          {t('stats.currencyCount', { count: rows.length })} · {t('stats.expensesCount', { count })} · {ils(totalIls)}
        </Text>

        {rows.map((row) => {
          const cur = getCurrency(row.currency);
          const isOpen = opened.has(row.currency);
          const list = (byCurrency.get(row.currency) ?? []).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
          const share = percent(row.ilsMinor, totalIls);
          return (
            <View key={row.currency} style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, overflow: 'hidden' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => toggle(row.currency)}
                style={({ pressed }) => ({ padding: space.md, gap: 8, opacity: pressed ? 0.8 : 1 })}
              >
                <Row gap={space.sm}>
                  <Text style={{ fontSize: 26 }}>{cur.flag || '💱'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700' }}>
                      {cur.code} · {cur.symbol}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {currencyName(cur, lang)}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
                </Row>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="h2" style={{ fontSize: 20 }}>
                      {formatMoney(row.originalMinor, row.currency, { lang })}
                    </Text>
                    {row.currency !== HOME_CURRENCY ? (
                      <Text variant="caption" muted>
                        ≈ {ils(row.ilsMinor)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="label">{t('stats.expensesCount', { count: row.count })}</Text>
                    <Text variant="caption" muted>
                      {share.toFixed(share < 10 ? 1 : 0)}%
                    </Text>
                  </View>
                </Row>
                <ProgressBar value={share} height={6} />
              </Pressable>

              {isOpen ? (
                <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                  {list.map((e, i) => {
                    const cat = e.category_id ? categoryById.get(e.category_id) : undefined;
                    return (
                      <Row
                        key={e.id}
                        gap={space.sm}
                        style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}
                      >
                        <CategoryIcon category={cat} size={16} />
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ fontWeight: '600' }}>
                            {e.description || categoryLabel(cat, t)}
                          </Text>
                          <Text variant="caption" muted>
                            {fmtDay(e.occurred_at)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text variant="label">{formatMoney(e.amount_minor, e.currency, { lang })}</Text>
                          {e.currency !== HOME_CURRENCY ? (
                            <Text variant="caption" muted>
                              {ils(e.amount_ils_minor)}
                            </Text>
                          ) : null}
                        </View>
                      </Row>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </SheetScrollView>
    </Sheet>
  );
}
