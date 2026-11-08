import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import { useSaveExpense } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, minorToInput, parseAmount } from '@/lib/money';
import type { Transfer } from '@/lib/settlement';
import { errorCode } from '@/lib/supabase';
import { radius, space, useColors } from '@/theme';
import { ExpenseRow } from '@/ui/ExpenseRow';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Divider, EmptyState, ErrorView, Field, IconButton, Loading, Row, Screen, Text } from '@/ui/primitives';

export default function SettleUp() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, balances, transfers, memberById, expenses, categoryById } = data;
  const save = useSaveExpense(trip?.id ?? '');
  const [recording, setRecording] = useState<Transfer | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });
  const name = (id: string) => memberById.get(id)?.display_name ?? '?';

  if (!trip) return null;
  // Balances are only meaningful once everything has loaded
  if (data.isLoading) return <Loading />;
  if (data.error)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ErrorView error={data.error} onRetry={data.refetch} />
      </Screen>
    );
  const history = expenses.filter((e) => e.kind === 'settlement');

  function open(tr: Transfer) {
    setRecording(tr);
    setAmount(minorToInput(tr.amount, HOME_CURRENCY));
    setError(null);
  }

  async function record() {
    if (!recording) return;
    const minor = parseAmount(amount, HOME_CURRENCY);
    if (minor == null) return setError(t('errors.invalid_amount'));
    try {
      // A payment from the debtor that belongs entirely to the creditor:
      // it moves both balances toward zero and never counts as spending.
      await save.mutateAsync({
        trip_id: trip!.id,
        kind: 'settlement',
        paid_by_member_id: recording.from,
        amount_minor: minor,
        currency: HOME_CURRENCY,
        fx_rate: '1',
        fx_source: 'par',
        fx_rate_date: null,
        fx_fetched_at: null,
        fx_is_manual: false,
        category_id: null,
        description: '',
        notes: null,
        occurred_at: new Date().toISOString(),
        receipt_path: null,
        payment_method: 'transfer',
        split_type: 'personal',
        splits: [{ member_id: recording.to }],
      });
      setRecording(null);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  return (
    <Screen>
      <Row>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/')} />
      </Row>
      <Text variant="title">{t('settle.title')}</Text>

      <Card>
        {balances.map((b, i) => {
          const m = memberById.get(b.memberId);
          if (!m) return null;
          return (
            <View key={b.memberId} style={{ gap: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <Row gap={space.md}>
                <Avatar name={m.display_name} color={m.color} photoPath={m.photo_path} />
                <Text variant="h2" style={{ flex: 1 }}>
                  {m.display_name}
                </Text>
                <Text variant="mono" color={b.net > 0 ? c.success : b.net < 0 ? c.danger : c.textMuted}>
                  {b.net > 0 ? '+' : b.net < 0 ? '−' : ''}
                  {ils(Math.abs(b.net))}
                </Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" muted>
                  {t('settle.paid')}: {ils(b.paid)}
                </Text>
                <Text variant="caption" muted>
                  {t('settle.share')}: {ils(b.share)}
                </Text>
              </Row>
            </View>
          );
        })}
      </Card>

      {transfers.length === 0 ? (
        <Card>
          <EmptyState emoji="✅" title={t('home.settled')} body={t('settle.settledBody')} />
        </Card>
      ) : (
        transfers.map((tr) => (
          <Card key={tr.from + tr.to}>
            <Row gap={space.md}>
              <Avatar name={name(tr.from)} color={memberById.get(tr.from)?.color ?? c.textFaint} photoPath={memberById.get(tr.from)?.photo_path} />
              <Ionicons name={lang === 'he' ? 'arrow-back' : 'arrow-forward'} size={20} color={c.textMuted} />
              <Avatar name={name(tr.to)} color={memberById.get(tr.to)?.color ?? c.textFaint} photoPath={memberById.get(tr.to)?.photo_path} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{t('home.owes', { from: name(tr.from), to: name(tr.to) })}</Text>
              </View>
              <Text variant="h2" color={c.primary}>
                {ils(tr.amount)}
              </Text>
            </Row>
            <Button title={t('settle.record')} icon="checkmark-circle-outline" onPress={() => open(tr)} />
          </Card>
        ))
      )}

      {history.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <Text variant="h2">{t('settle.history')}</Text>
          {history.map((e) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              category={e.category_id ? categoryById.get(e.category_id) : undefined}
              payer={memberById.get(e.paid_by_member_id ?? '')}
              recipient={memberById.get(e.expense_splits[0]?.member_id)}
              onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
            />
          ))}
        </Card>
      ) : null}

      <Sheet visible={!!recording} onClose={() => setRecording(null)} title={t('settle.record')}>
        {recording ? (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Text muted center>
              {t('settle.recordBody', { from: name(recording.from), to: name(recording.to) })}
            </Text>
            <Field
              value={amount}
              onChangeText={(v) => setAmount(v.replace(',', '.').replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              style={{ fontSize: 28, fontWeight: '700', textAlign: 'center', borderRadius: radius.md }}
              error={error}
              hint={t('settle.partialHint')}
            />
            <Button title={t('settle.confirm')} onPress={record} loading={save.isPending} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
