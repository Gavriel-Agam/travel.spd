import { expenseNets } from '@/lib/ledger';
import { NetChips } from '@/ui/NetChips';
import { LocationRow } from '@/ui/LocationRow';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useRef } from 'react';
import { Image, View } from 'react-native';
import { useReceiptSrc } from '@/api/queries';
import { BookingCard } from '@/ui/BookingCard';
import { useExpenseActions } from '@/hooks/useExpenseActions';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, invertRate, trimRate } from '@/lib/money';
import { paymentLabel } from '@/lib/payments';
import { rateSourceName } from '@/lib/rateLabels';
import { estimateRefund } from '@/lib/taxFree';
import { countryFlag, countryName } from '@/lib/countries';
import { blockedInDemo } from '@/lib/demoPrompt';
import { radius, space, useColors } from '@/theme';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Avatar, Banner, Button, Card, Divider, EmptyState, IconButton, Loading, Row, Screen, Text } from '@/ui/primitives';

export default function ExpenseDetails() {
  const { id, src } = useLocalSearchParams<{ id: string; src?: string }>();
  const { t, lang } = useT();
  const c = useColors();
  const { trip, isLoading, allExpenses: expenses, memberById, categoryById, members, me } = useTripData();
  const actions = useExpenseActions(trip?.id ?? '');
  const qc = useQueryClient();
  const e = expenses.find((x) => x.id === id);
  const receipt = useReceiptSrc(e?.receipt_path);

  // Deleted (here, or by a partner meanwhile): straight back to the list, no "not found" screen
  const gone = !isLoading && !e;
  const left = useRef(false);
  useEffect(() => {
    if (gone && !left.current) goBack('/expenses');
  }, [gone]);

  if (isLoading || !e) return <Loading />;

  const cat = e.category_id ? categoryById.get(e.category_id) : undefined;
  const payer = memberById.get(e.paid_by_member_id ?? '');
  const creator = members.find((m) => m.user_id === e.created_by);
  const editor = members.find((m) => m.user_id === e.updated_by);
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const isHome = e.currency === HOME_CURRENCY;

  const remove = () =>
    actions.remove(e, () => {
      left.current = true;
      goBack('/expenses');
    });

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
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/expenses')} />
        <Row gap={space.xs}>
          {/* An expense with an edit still waiting to sync can be edited again (the newest edit wins) */}
          {e.kind === 'expense' && (!e.pending || e.pending_op === 'update') ? (
            <IconButton name="create-outline" onPress={() => !blockedInDemo(qc) && router.push({ pathname: '/expense/[id]/edit', params: { id: e.id } })} label={t('common.edit')} />
          ) : null}
          {/* In the corner (top left in Hebrew). Opened from Statistics or a filtered list: jump to it in Expenses, among its day */}
          {src ? <IconButton name="open-outline" onPress={() => router.dismissTo({ pathname: '/expenses', params: { focus: e.id } })} label={t('expenses.showInSource')} /> : null}
        </Row>
      </Row>

      {e.pending ? (
        <Banner
          text={
            e.pending === 'failed'
              ? t(e.pending_op === 'update' ? 'sync.detailFailedEdit' : e.pending_op === 'delete' ? 'sync.detailFailedDelete' : 'sync.detailFailed', { reason: t(`errors.${e.pending_error ?? 'unknown'}`) })
              : t('sync.detailWaiting')
          }
          color={e.pending === 'failed' ? c.danger : c.warning}
          icon={e.pending === 'failed' ? 'alert-circle' : 'cloud-upload-outline'}
        />
      ) : null}

      {e.review_status === 'pending_review' ? <Banner text={t('pending.detailBanner')} color={c.warning} icon="hourglass-outline" /> : null}

      {e.booking_details ? <BookingCard booking={e.booking_details} expenseId={e.id} /> : null}

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
          <CategoryIcon category={cat} size={32} emoji={e.kind === 'settlement' ? '🤝' : undefined} />
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
        {e.vat_country ? <Line label={t('form.location')} value={`${countryFlag(e.vat_country)} ${countryName(e.vat_country, lang)}`} /> : null}
        <Divider />
        {/* Where it was added: closed at first, opens a small map */}
        <LocationRow lat={e.lat} lng={e.lng} name={e.location_name} />
        <Divider />
        <Line label={t('details.paidBy')} value={e.paid_by_member_id === null ? t('details.jointMoney') : payer?.display_name ?? '?'} />
        <Divider />
        <Line label={t('details.enteredBy')} value={creator?.display_name ?? '?'} />
        {e.payment_method ? (
          <>
            <Divider />
            <Line label={t('form.paymentMethod')} value={paymentLabel(e.payment_method, t)} />
          </>
        ) : null}
        {e.merchant && e.merchant !== e.description ? (
          <>
            <Divider />
            <Line label={t('details.merchant')} value={e.merchant} />
          </>
        ) : null}
        {e.source && e.source !== 'manual' ? (
          <>
            <Divider />
            <Line label={t('details.source')} value={t(`details.sources.${e.source}`)} />
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
          {e.billed_ils_minor != null ? (
            <>
              <Divider />
              <Line label={t('details.billed')} value={formatMoney(e.billed_ils_minor, HOME_CURRENCY, { lang, forceDecimals: true })} />
            </>
          ) : null}
          {Number(e.fx_fee_pct ?? 0) > 0 ? (
            <>
              <Divider />
              <Line label={t('details.cardFee', { pct: Number(e.fx_fee_pct) })} value={formatMoney(e.amount_ils_minor - Math.round(e.amount_ils_minor / (1 + Number(e.fx_fee_pct) / 100)), HOME_CURRENCY, { lang, forceDecimals: true })} />
            </>
          ) : null}
        </Card>
      ) : null}

      {e.tax_free ? (
        <Card>
          <Line
            label={t('taxFree.toggle')}
            value={(() => {
              const est = estimateRefund({ amountMinor: e.amount_minor, currency: e.currency, minorUnits: getCurrency(e.currency).minor_units, homeMinor: e.amount_ils_minor, feePct: Number(e.fx_fee_pct ?? 0), country: e.vat_country });
              return est.status === 'eligible' ? t('taxFree.cardUpTo', { amount: formatMoney(est.refundHomeMinor, HOME_CURRENCY, { lang }) }) : est.status === 'belowMin' ? t('taxFree.belowMinShort') : est.status === 'noRefund' ? t('taxFree.noRefundHere') : t('taxFree.noRule');
            })()}
          />
        </Card>
      ) : null}

      <Card>
        <Text variant="h2">{t('details.splitTitle')}</Text>
        {e.kind === 'expense' ? <NetChips nets={expenseNets({ ...e, splits: e.expense_splits })} memberById={memberById} meId={me?.id} size="md" /> : null}
        {e.expense_splits.map((s) => {
          const m = memberById.get(s.member_id);
          return (
            <Row key={s.member_id} gap={space.md}>
              <Avatar name={m?.display_name ?? '?'} color={m?.color ?? c.textFaint} photoPath={m?.photo_path} size={28} />
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

      {receipt.url ? (
        <Card>
          <Text variant="label" muted>
            {t('details.receipt')}
          </Text>
          <Image source={{ uri: receipt.url }} style={{ width: '100%', height: 320, borderRadius: radius.md }} resizeMode="contain" />
        </Card>
      ) : null}

      {editor && e.version > 1 ? (
        <Text variant="caption" muted center>
          {t('details.lastEdit', { name: editor.display_name })}
        </Text>
      ) : null}

      <Button title={t('common.delete')} variant="danger" icon="trash-outline" onPress={remove} loading={actions.removing} />
    </Screen>
  );
}
