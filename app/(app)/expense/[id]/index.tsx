import { router, useLocalSearchParams } from 'expo-router';
import { Image, View } from 'react-native';
import { useDeleteExpense, useReceiptUrl } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, invertRate, trimRate } from '@/lib/money';
import { rateSourceName } from '@/lib/rateLabels';
import { errorCode } from '@/lib/supabase';
import { radius, space, useColors } from '@/theme';
import { confirmDialog, showDialog } from '@/ui/Dialog';
import { Avatar, Button, Card, Divider, EmptyState, IconButton, Loading, Row, Screen, Text } from '@/ui/primitives';

export default function ExpenseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const c = useColors();
  const { trip, isLoading, expenses, memberById, categoryById, members } = useTripData();
  const del = useDeleteExpense(trip?.id ?? '');
  const e = expenses.find((x) => x.id === id);
  const receipt = useReceiptUrl(e?.receipt_path);

  if (isLoading) return <Loading />;
  if (!e)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <EmptyState emoji="🫥" title={t('errors.not_found')} action={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );

  const cat = e.category_id ? categoryById.get(e.category_id) : undefined;
  const payer = memberById.get(e.paid_by_member_id);
  const creator = members.find((m) => m.user_id === e.created_by);
  const editor = members.find((m) => m.user_id === e.updated_by);
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const isHome = e.currency === HOME_CURRENCY;

  async function remove() {
    const ok = await confirmDialog(t('expenses.deleteConfirm'), t('expenses.deleteConfirmBody'), t('common.delete'), t('common.cancel'), true);
    if (!ok) return;
    del.mutate(
      { id: e!.id, version: e!.version },
      {
        onSuccess: () => router.back(),
        onError: (err) => showDialog(t('errors.title'), t(`errors.${errorCode(err)}`)),
      },
    );
  }

  const Line = ({ label, value }: { label: string; value: string }) => (
    <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
      <Text muted>{label}</Text>
      <Text style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </Row>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} />
        {e.kind === 'expense' ? (
          <IconButton name="create-outline" onPress={() => router.push({ pathname: '/expense/[id]/edit', params: { id: e.id } })} label={t('common.edit')} />
        ) : null}
      </Row>

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: (cat?.color ?? UNCATEGORIZED.color) + '22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 32 }}>{e.kind === 'settlement' ? '🤝' : cat?.icon ?? UNCATEGORIZED.icon}</Text>
        </View>
        <Text variant="h2" center>
          {e.kind === 'settlement'
            ? t('settle.rowTitle', { name: memberById.get(e.expense_splits[0]?.member_id)?.display_name ?? '' })
            : e.description || categoryLabel(cat, t)}
        </Text>
        <Text variant="hero" center>
          {formatMoney(e.amount_minor, e.currency, { lang })}
        </Text>
        {!isHome ? (
          <Text variant="h2" color={c.primary} center>
            ≈ {formatMoney(e.amount_ils_minor, HOME_CURRENCY, { lang })}
          </Text>
        ) : null}
      </View>

      <Card>
        <Line label={t('form.category')} value={categoryLabel(cat, t)} />
        <Divider />
        <Line label={t('details.when')} value={new Date(e.occurred_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })} />
        <Divider />
        <Line label={t('details.paidBy')} value={payer?.display_name ?? '?'} />
        <Divider />
        <Line label={t('details.enteredBy')} value={creator?.display_name ?? '?'} />
        {e.payment_method ? (
          <>
            <Divider />
            <Line label={t('form.paymentMethod')} value={t(`payment.${e.payment_method}`)} />
          </>
        ) : null}
      </Card>

      {!isHome ? (
        <Card>
          <Line label={t('details.original')} value={formatMoney(e.amount_minor, e.currency, { lang, forceDecimals: true })} />
          <Divider />
          <Line label={t('details.converted')} value={formatMoney(e.amount_ils_minor, HOME_CURRENCY, { lang, forceDecimals: true })} />
          <Divider />
          <Line label={t('details.rate')} value={`1 ${e.currency} = ${trimRate(e.fx_rate)} ₪`} />
          <Line label="" value={`1 ₪ = ${invertRate(e.fx_rate, 4)} ${e.currency}`} />
          <Divider />
          <Line label={t('details.rateSource')} value={rateSourceName(t, e.fx_is_manual ? 'manual' : e.fx_source)} />
          {e.fx_rate_date ? (
            <>
              <Divider />
              <Line label={t('details.rateDate')} value={e.fx_rate_date} />
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text variant="h2">{t('details.splitTitle')}</Text>
        {e.expense_splits.map((s) => {
          const m = memberById.get(s.member_id);
          return (
            <Row key={s.member_id} gap={space.md}>
              <Avatar name={m?.display_name ?? '?'} color={m?.color ?? c.textFaint} size={28} />
              <Text style={{ flex: 1 }}>{m?.display_name}</Text>
              {s.share_pct ? (
                <Text variant="caption" muted>
                  {Number(s.share_pct)}%
                </Text>
              ) : null}
              <Text variant="mono">{formatMoney(s.share_ils_minor, HOME_CURRENCY, { lang })}</Text>
            </Row>
          );
        })}
      </Card>

      {e.notes ? (
        <Card>
          <Text variant="label" muted>
            {t('details.notes')}
          </Text>
          <Text>{e.notes}</Text>
        </Card>
      ) : null}

      {receipt.data ? (
        <Card>
          <Text variant="label" muted>
            {t('details.receipt')}
          </Text>
          <Image source={{ uri: receipt.data }} style={{ width: '100%', height: 320, borderRadius: radius.md }} resizeMode="contain" />
        </Card>
      ) : null}

      {editor && e.version > 1 ? (
        <Text variant="caption" muted center>
          {t('details.lastEdit', { name: editor.display_name })}
        </Text>
      ) : null}

      <Button title={t('common.delete')} variant="danger" icon="trash-outline" onPress={remove} loading={del.isPending} />
    </Screen>
  );
}
