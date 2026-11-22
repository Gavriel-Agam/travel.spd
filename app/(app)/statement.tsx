import { onlineManager, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { keys } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { inputFromExpense } from '@/lib/expenseOrder';
import { formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { billedRate, matchStatement, parseStatement, type StatementRow } from '@/lib/statementMatch';
import { errorCode, supabase } from '@/lib/supabase';
import { space, useColors } from '@/theme';
import { Banner, Button, Card, Divider, Field, IconButton, Row, Screen, Text } from '@/ui/primitives';
import { Topbar } from '@/ui/Topbar';

const digitsOf = (c: string) => getCurrency(c).minor_units;

/** Opens the browser's file picker and reads a text file (CSV). Web only. */
function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt,text/csv,text/plain';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}

/** Settings › Card statement: matches a monthly statement to the trip's expenses, on this device. */
export default function Statement() {
  const c = useColors();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const { trip, expenses, me, categories } = useTripData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseStatement(text) : null), [text]);
  const result = useMemo(() => (parsed?.rows.length ? matchStatement(parsed.rows, expenses, digitsOf) : null), [parsed, expenses]);
  const toUpdate = result?.matched.filter((m) => m.expense.billed_ils_minor !== m.row.billedMinor) ?? [];

  const fail = (e: unknown) => setMsg({ text: t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }), ok: false });

  const apply = async () => {
    if (!trip || !toUpdate.length) return;
    if (!onlineManager.isOnline()) return setMsg({ text: t('statement.offline'), ok: false });
    setBusy(true);
    let done = 0;
    try {
      for (const { row, expense: e } of toUpdate) {
        const foreign = e.currency !== HOME_CURRENCY;
        const input = {
          ...inputFromExpense(e),
          id: e.id,
          billed_ils_minor: row.billedMinor,
          // The statement's real rate (card fee included): the home amount becomes what was billed
          ...(foreign ? { fx_rate: billedRate(e.amount_minor, e.currency, row.billedMinor, digitsOf), fx_is_manual: true, fx_source: 'manual', fx_fee_pct: 0 } : {}),
        };
        const { error } = await supabase.rpc('save_expense', { p_expense: input, p_expected_version: e.version });
        if (error) throw error;
        done++;
      }
      setMsg({ text: t('statement.updated', { count: done }), ok: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: keys.expenses(trip.id) });
    }
  };

  const importMissing = async () => {
    if (!trip || !me || !result?.unmatched.length) return;
    if (!onlineManager.isOnline()) return setMsg({ text: t('statement.offline'), ok: false });
    setBusy(true);
    let done = 0;
    const other = categories.find((x) => x.key === 'other')?.id ?? categories[categories.length - 1]?.id ?? null;
    try {
      for (const row of result.unmatched) {
        const currency = row.currency && row.amount != null ? row.currency : HOME_CURRENCY;
        const amountMinor = currency === HOME_CURRENCY ? row.billedMinor : Math.round(row.amount! * 10 ** digitsOf(currency));
        const input = {
          client_id: Crypto.randomUUID(),
          trip_id: trip.id,
          kind: 'expense',
          paid_by_member_id: me.id,
          amount_minor: amountMinor,
          currency,
          fx_rate: currency === HOME_CURRENCY ? '1' : billedRate(amountMinor, currency, row.billedMinor, digitsOf),
          fx_source: currency === HOME_CURRENCY ? 'par' : 'manual',
          fx_rate_date: null,
          fx_fetched_at: null,
          fx_is_manual: currency !== HOME_CURRENCY,
          fx_fee_pct: 0,
          category_id: other,
          description: row.merchant.slice(0, 120),
          notes: null,
          occurred_at: new Date(`${row.date}T12:00:00`).toISOString(),
          receipt_path: null,
          payment_method: 'card',
          split_type: 'personal',
          splits: [{ member_id: me.id }],
          source: 'statement_import',
          merchant: row.merchant.slice(0, 120),
          review_status: 'pending_review',
          billed_ils_minor: row.billedMinor,
        };
        const { error } = await supabase.rpc('save_expense', { p_expense: input, p_expected_version: null });
        if (error) throw error;
        done++;
      }
      setMsg({ text: t('statement.imported', { count: done }), ok: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: keys.expenses(trip.id) });
    }
  };

  const RowLine = ({ row, right }: { row: StatementRow; right?: string }) => (
    <Row gap={space.sm}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: '600' }}>
          {row.merchant}
        </Text>
        <Text variant="caption" muted>
          {[row.date, row.amount != null && row.currency ? formatMoney(Math.round(row.amount * 10 ** digitsOf(row.currency)), row.currency, { lang }) : null, right].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text variant="mono">{formatMoney(row.billedMinor, HOME_CURRENCY, { lang })}</Text>
    </Row>
  );

  return (
    <Screen>
      <Topbar title={t('statement.title')} onBack={() => goBack('/settings')} />
      <Text muted>{t('statement.intro')}</Text>
      {msg ? <Banner text={msg.text} color={msg.ok ? c.success : c.danger} icon={msg.ok ? 'checkmark-circle' : 'alert-circle'} /> : null}

      <Card>
        {Platform.OS === 'web' ? <Button title={t('statement.pickFile')} icon="document-outline" variant="secondary" onPress={async () => setText((await pickTextFile()) ?? text)} /> : null}
        <Field label={t('statement.paste')} value={text} onChangeText={setText} multiline clearable={false} style={{ minHeight: 120, textAlignVertical: 'top' }} placeholder={t('statement.placeholder')} />
        {parsed?.error === 'no_header' ? <Text color={c.danger}>{t('statement.noHeader')}</Text> : null}
      </Card>

      {result ? (
        <>
          <Card>
            <Text variant="h2">{t('statement.matched', { count: result.matched.length })}</Text>
            {result.matched.map(({ row, expense: e }, i) => (
              <View key={`${e.id}-${i}`} style={{ gap: space.sm }}>
                {i ? <Divider /> : null}
                <RowLine row={row} right={`↔ ${e.description || e.merchant || ''} (${formatMoney(e.amount_ils_minor, HOME_CURRENCY, { lang })})`} />
              </View>
            ))}
            {toUpdate.length ? <Button title={t('statement.apply', { count: toUpdate.length })} onPress={apply} loading={busy} /> : result.matched.length ? <Text muted>{t('statement.upToDate')}</Text> : null}
          </Card>
          {result.unmatched.length ? (
            <Card>
              <Text variant="h2">{t('statement.missing', { count: result.unmatched.length })}</Text>
              {result.unmatched.map((row, i) => (
                <View key={i} style={{ gap: space.sm }}>
                  {i ? <Divider /> : null}
                  <RowLine row={row} />
                </View>
              ))}
              <Button title={t('statement.importMissing', { count: result.unmatched.length })} variant="secondary" onPress={importMissing} loading={busy} />
              <Text variant="caption" muted>
                {t('statement.importNote')}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
