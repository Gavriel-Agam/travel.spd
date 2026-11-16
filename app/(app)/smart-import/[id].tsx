import Ionicons from '@expo/vector-icons/Ionicons';
import { onlineManager, useQueries } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { fetchRates, keys, uploadReceiptBlob } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, parseAmount } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { lastPaymentFor, paymentLabel } from '@/lib/payments';
import { draftHome, draftToSaveInput, enrichCandidates, type SmartDraft } from '@/lib/smartImport';
import { dayKey } from '@/lib/stats';
import { countryForCurrency, meetsVatMinimum } from '@/lib/taxFree';
import { useUserId } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { cachedRatesFor, usePrefs } from '@/store/prefs';
import { useSmartImports } from '@/store/smartImports';
import { radius, space, useColors } from '@/theme';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { useConfetti } from '@/ui/Confetti';
import { CurrencyPicker } from '@/ui/CurrencyPicker';
import { DateField } from '@/ui/DateField';
import { confirmDialog } from '@/ui/Dialog';
import { Sheet } from '@/ui/Sheet';
import { Button, Card, Chip, EmptyState, Field, IconButton, Row, Screen, Segmented, Text, Toggle, tap } from '@/ui/primitives';
import type { Category, Member, RatesSnapshot, Trip } from '@/types/db';

/** Step 2 of Smart import: check the expenses found, then add them all. */
export default function SmartImportReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t, lang } = useT();
  const data = useTripData();
  const { trip, members, me, memberById, categories, allCategories } = data;
  const userId = useUserId();
  const loaded = useSmartImports((s) => s.loaded);
  const rec = useSmartImports((s) => s.records.find((r) => r.id === id));
  const lastPayer = usePrefs((s) => (trip ? s.lastPayer[trip.id] : undefined));
  const lastSplit = usePrefs((s) => (trip ? s.lastSplit[trip.id] : undefined));
  const lastPayment = usePrefs((s) => (trip ? lastPaymentFor(s.lastPayment, s.lastPaymentAny, trip.id, trip.payment_methods ?? []) : null));
  const cachedRates = usePrefs((s) => s.rates);
  const notePayerUsed = usePrefs((s) => s.notePayerUsed);
  const noteSplitUsed = usePrefs((s) => s.noteSplitUsed);

  const [drafts, setDrafts] = useState<SmartDraft[] | null>(null);
  const [saveReceipts, setSaveReceipts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencyFor, setCurrencyFor] = useState<string | null>(null);
  const [categoryFor, setCategoryFor] = useState<string | null>(null);

  // Fill in what the parser couldn't tell, once the trip and the import are here
  useEffect(() => {
    if (drafts || !trip || !rec?.parsed_expenses || !categories.length) return;
    setDrafts(
      enrichCandidates(rec.parsed_expenses, {
        members,
        defaultCurrency: trip.default_currency,
        todayIso: dayKey(new Date(), trip.timezone),
        lastPayer,
        lastSplit,
        categoryIds: new Set(categories.map((x) => x.id)),
        fallbackCategoryId: categories.find((x) => x.key === 'other')?.id ?? categories[categories.length - 1].id,
      }),
    );
  }, [drafts, trip, rec, categories, members, lastPayer, lastSplit]);

  // Rates for every date in the list (saved copy when offline)
  const dates = useMemo(() => [...new Set((drafts ?? []).map((d) => d.date))].sort(), [drafts]);
  const rateQueries = useQueries({
    queries: dates.map((date) => ({ queryKey: keys.rates(date), queryFn: () => fetchRates(date), staleTime: 30 * 60_000, retry: 1 })),
  });
  const snapshotFor = (date: string): RatesSnapshot | null => {
    const q = rateQueries[dates.indexOf(date)];
    return (q?.data as RatesSnapshot | undefined) ?? cachedRatesFor(cachedRates, date);
  };

  if (!trip) return null;
  const update = (key: string, patch: Partial<SmartDraft>) =>
    setDrafts((list) => list?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);
  const removeDraft = (key: string) => setDrafts((list) => list?.filter((d) => d.key !== key) ?? null);

  async function clearImport() {
    const ok = await confirmDialog(t('smartImport.clear'), t('smartImport.clearConfirm'), t('smartImport.discard'), t('common.cancel'));
    if (!ok) return;
    if (rec) await useSmartImports.getState().remove(rec.id);
    goBack('/');
  }

  const header = (
    <Row style={{ justifyContent: 'space-between' }}>
      <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} label={t('smartImport.back')} onPress={() => goBack('/')} />
      {rec ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={clearImport} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}>
          <Ionicons name="trash-outline" size={18} color={c.danger} />
          <Text variant="label" color={c.danger}>
            {t('smartImport.clear')}
          </Text>
        </Pressable>
      ) : null}
    </Row>
  );

  if (loaded && (!rec || rec.status !== 'ready_for_review'))
    return (
      <Screen>
        {header}
        <EmptyState emoji="✨" title={t('smartImport.gone')} />
      </Screen>
    );
  if (!drafts) return <Screen>{header}</Screen>;

  const images = rec?.compressed_images ?? [];
  const minorOf = (d: SmartDraft) => {
    const v = parseAmount(d.amountText, d.currency);
    return v != null && v > 0 ? v : null;
  };
  const allValid = drafts.length > 0 && drafts.every((d) => minorOf(d) != null && d.title.trim() && draftHome(minorOf(d)!, d, { snapshot: snapshotFor(d.date), paymentMethod: lastPayment, trip, me, memberById }));

  async function commit() {
    if (!trip || !rec || !drafts || busy) return;
    if (!allValid) return setError(t('smartImport.invalidAmount'));
    if (saveReceipts && images.length && !onlineManager.isOnline()) return setError(t('smartImport.receiptsOffline'));
    setError(null);
    setBusy(true);
    try {
      // Each screenshot is uploaded once; every expense from it points to the same file
      const paths: (string | null)[] = [];
      if (saveReceipts && images.length) {
        const used = new Set(drafts.map((d) => (d.imageIndex != null && d.imageIndex < images.length ? d.imageIndex : 0)));
        for (let i = 0; i < images.length; i++) paths.push(used.has(i) ? await uploadReceiptBlob(trip.id, images[i]) : null);
      }
      const now = new Date().toISOString();
      const add = useOutbox.getState().add;
      for (const d of drafts) {
        const clientId = Crypto.randomUUID();
        const receiptPath = paths.length ? paths[d.imageIndex != null && d.imageIndex < paths.length ? d.imageIndex : 0] : null;
        const payload = draftToSaveInput(d, minorOf(d)!, { clientId, trip, members, me, memberById, snapshot: snapshotFor(d.date), paymentMethod: lastPayment, receiptPath });
        // On the list at once; the offline queue sends them (now, or when back online)
        if (payload) add({ clientId, tripId: trip.id, createdBy: userId ?? '', queuedAt: now, payload });
      }
      const last = drafts[drafts.length - 1];
      if (members.length > 1 && last) {
        notePayerUsed(trip.id, last.payerId);
        noteSplitUsed(trip.id, last.split);
      }
      // Done with it: the screenshots are dropped from the device (kept only if uploaded as receipts)
      await useSmartImports.getState().remove(rec.id);
      useConfetti.getState().fire();
      goBack('/expenses');
    } catch (e) {
      setError(t(`errors.${(e as Error)?.message?.includes('network') ? 'network' : 'unknown'}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen contentStyle={{ paddingBottom: 140 }}>
        {header}
        <Text variant="title">✨ {t('smartImport.found', { count: drafts.length })}</Text>

        {images.length ? (
          <Card>
            <Row gap={space.md}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '600' }}>{t('smartImport.saveReceipts')}</Text>
                <Text variant="caption" muted>
                  {t('smartImport.saveReceiptsHint')}
                </Text>
              </View>
              <Toggle value={saveReceipts} onValueChange={setSaveReceipts} label={t('smartImport.saveReceipts')} />
            </Row>
          </Card>
        ) : null}

        {drafts.map((d) => (
          <DraftCard
            key={d.key}
            d={d}
            trip={trip}
            members={members}
            me={me}
            memberById={memberById}
            category={allCategories.find((x) => x.id === d.categoryId) ?? null}
            snapshot={snapshotFor(d.date)}
            paymentMethod={lastPayment}
            onChange={(patch) => update(d.key, patch)}
            onRemove={() => removeDraft(d.key)}
            onPickCurrency={() => setCurrencyFor(d.key)}
            onPickCategory={() => setCategoryFor(d.key)}
          />
        ))}
      </Screen>

      <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, padding: space.lg, paddingBottom: space.xl, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border, gap: space.sm }}>
        {error ? <Text color={c.danger}>{error}</Text> : null}
        <Button title={t('smartImport.commit', { count: drafts.length })} icon="checkmark-done" onPress={commit} loading={busy} disabled={!drafts.length} />
      </View>

      <CurrencyPicker
        visible={!!currencyFor}
        value={drafts.find((d) => d.key === currencyFor)?.currency ?? trip.default_currency}
        onSelect={(code) => {
          if (currencyFor) update(currencyFor, { currency: code, guessed: { ...drafts.find((d) => d.key === currencyFor)!.guessed, currency: false } });
          setCurrencyFor(null);
        }}
        onClose={() => setCurrencyFor(null)}
      />
      <Sheet visible={!!categoryFor} onClose={() => setCategoryFor(null)} title={t('form.category')}>
        <View style={{ padding: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={categoryLabel(cat, t)}
              icon={<CategoryIcon category={cat} size={16} />}
              color={cat.color}
              selected={drafts.find((d) => d.key === categoryFor)?.categoryId === cat.id}
              onPress={() => {
                if (categoryFor) update(categoryFor, { categoryId: cat.id });
                setCategoryFor(null);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function DraftCard({
  d,
  trip,
  members,
  me,
  memberById,
  category,
  snapshot,
  paymentMethod,
  onChange,
  onRemove,
  onPickCurrency,
  onPickCategory,
}: {
  d: SmartDraft;
  trip: Trip;
  members: Member[];
  me: Member | null;
  memberById: Map<string, Member>;
  category: Category | null;
  snapshot: RatesSnapshot | null;
  paymentMethod: string | null;
  onChange: (patch: Partial<SmartDraft>) => void;
  onRemove: () => void;
  onPickCurrency: () => void;
  onPickCategory: () => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const cur = getCurrency(d.currency);
  const amountMinor = parseAmount(d.amountText, d.currency);
  const home = amountMinor != null && amountMinor > 0 ? draftHome(amountMinor, d, { snapshot, paymentMethod, trip, me, memberById }) : null;
  const country = countryForCurrency(d.currency, trip.countries ?? []);
  const vatOk = category?.key === 'shopping' && meetsVatMinimum({ amountMinor, currency: d.currency, minorUnits: cur.minor_units, country });
  const warn = c.warning;
  const flagged = (on: boolean) => (on ? { borderWidth: 1.5, borderColor: warn, borderRadius: radius.md } : null);
  const [y, m, day] = d.date.split('-').map(Number);

  return (
    <Card style={d.needsReview ? { borderWidth: 1.5, borderColor: warn + 'AA' } : undefined}>
      <View style={{ gap: space.md }}>
        <Row gap={space.sm}>
          {d.needsReview ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle" size={16} color={warn} />
              <Text variant="caption" color={warn} style={{ flex: 1, fontWeight: '600' }}>
                {d.reviewReason || t('smartImport.needsReview')}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={t('smartImport.remove')} hitSlop={8} onPress={onRemove} style={{ padding: 4 }}>
            <Ionicons name="close-circle-outline" size={22} color={c.textMuted} />
          </Pressable>
        </Row>

        <Field label={t('smartImport.titleLabel')} value={d.title} onChangeText={(v) => onChange({ title: v })} maxLength={120} />

        <Row gap={space.sm} align="flex-end">
          <View style={[{ flex: 1 }]}>
            <Field
              label={t('smartImport.amountLabel')}
              value={d.amountText}
              onChangeText={(v) => onChange({ amountText: v })}
              keyboardType="decimal-pad"
              amountDecimals={cur.minor_units}
              error={amountMinor == null || amountMinor <= 0 ? ' ' : null}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              onPickCurrency();
            }}
            style={[
              { height: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.cardAlt, flexDirection: 'row', alignItems: 'center', gap: 4 },
              flagged(d.guessed.currency),
            ]}
          >
            <Text style={{ fontWeight: '700' }}>{d.currency}</Text>
            <Ionicons name="chevron-down" size={14} color={c.textMuted} />
          </Pressable>
        </Row>
        {d.guessed.currency ? (
          <Text variant="caption" color={warn}>
            {t('smartImport.guessedCurrency')}
          </Text>
        ) : null}

        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              onPickCategory();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: (category?.color ?? c.textMuted) + '22' }}
          >
            <CategoryIcon category={category} size={16} />
            <Text style={{ fontWeight: '600' }}>{categoryLabel(category, t)}</Text>
            <Ionicons name="chevron-down" size={14} color={c.textMuted} />
          </Pressable>
          <View style={[{ padding: 2 }, flagged(d.guessed.date)]}>
            <DateField
              value={new Date(y, m - 1, day, 12)}
              onChange={(dt) => onChange({ date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, guessed: { ...d.guessed, date: false } })}
            />
          </View>
        </Row>
        {d.guessed.date ? (
          <Text variant="caption" color={warn}>
            {t('smartImport.guessedDate')}
          </Text>
        ) : null}

        {members.length > 1 ? (
          <View style={[{ gap: space.sm, padding: d.guessed.payer ? space.sm : 0 }, flagged(d.guessed.payer)]}>
            <Text variant="label" muted>
              {t('smartImport.payer')}
            </Text>
            <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
              <Chip label={t('smartImport.joint')} icon="👥" selected={d.payerId === null} onPress={() => onChange({ payerId: null, split: 'equal', guessed: { ...d.guessed, payer: false } })} />
              {members.map((mem) => (
                <Chip
                  key={mem.id}
                  label={mem.display_name}
                  color={mem.color}
                  selected={d.payerId === mem.id}
                  onPress={() => onChange({ payerId: mem.id, guessed: { ...d.guessed, payer: false } })}
                />
              ))}
            </Row>
            {d.payerId ? (
              <Segmented
                options={[
                  { value: 'equal', label: t('smartImport.splitEqual') },
                  { value: 'personal', label: t('smartImport.splitPersonal') },
                ]}
                value={d.split}
                onChange={(split) => onChange({ split, guessed: { ...d.guessed, payer: false } })}
              />
            ) : null}
            {d.guessed.payer ? (
              <Text variant="caption" color={warn}>
                {t('smartImport.guessedPayer')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 4, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
          <Row style={{ justifyContent: 'space-between' }}>
            {home ? (
              <Text variant="h2">{formatMoney(home.homeMinor, HOME_CURRENCY, { lang })}</Text>
            ) : amountMinor ? (
              <Text variant="caption" color={warn} style={{ flex: 1 }}>
                {t('smartImport.noRate', { currency: d.currency })}
              </Text>
            ) : (
              <View />
            )}
            {vatOk || d.taxFree ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: d.taxFree }}
                onPress={() => {
                  tap();
                  onChange({ taxFree: !d.taxFree });
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: d.taxFree ? c.success : c.success + '1F' }}
              >
                <Ionicons name={d.taxFree ? 'checkmark' : 'pricetag-outline'} size={13} color={d.taxFree ? '#fff' : c.success} />
                <Text variant="caption" color={d.taxFree ? '#fff' : c.success} style={{ fontWeight: '700' }}>
                  {d.taxFree ? t('smartImport.taxFreeBadge') : t('smartImport.taxFreePossible')}
                </Text>
              </Pressable>
            ) : null}
          </Row>
          {/* The payment method of the last expense saved (like a new expense in the form) */}
          {paymentMethod || (home && home.feePct > 0) ? (
            <Text variant="caption" muted>
              {[paymentMethod ? paymentLabel(paymentMethod, t) : null, home && home.feePct > 0 ? t('smartImport.fee', { pct: home.feePct }) : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
