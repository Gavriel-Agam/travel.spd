import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { goBack } from '@/lib/nav';
import { useConfetti } from './Confetti';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadReceipt, useRates, useReceiptUrl, useSaveExpense, useTripChanges, type SaveExpenseInput } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, nextCategoryOrder } from '@/lib/categories';
import { BUILTIN_PAYMENTS, cleanPaymentName, lastPaymentFor, MAX_CUSTOM_PAYMENTS, PAYMENT_NAME_MAX, paymentIcon, paymentLabel } from '@/lib/payments';
import { PaymentRow } from './PaymentRow';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatAmountTyping, groupThousands } from '@/lib/amountInput';
import {
  convertToHomeMinor,
  formatMoney,
  formatRate,
  invertRate,
  isValidRate,
  minorToInput,
  parseAmount,
  rateFromInput,
  trimRate,
  type RateDirection,
} from '@/lib/money';
import { previewShares, toSplitEntries, validateSplit, type SplitConfig, type SplitType } from '@/lib/split';
import { dayKey } from '@/lib/stats';
import { blockedInDemo } from '@/lib/demoPrompt';
import { errorCode, supabase } from '@/lib/supabase';
import { useUserId } from '@/providers/AuthProvider';
import { editKey, useOutbox } from '@/store/outbox';
import { cachedRatesFor, usePrefs } from '@/store/prefs';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense } from '@/types/db';
import { CategoryIcon } from './CategoryIcon';
import { flatten } from '@/lib/contrast';
import { CurrencyPicker } from './CurrencyPicker';
import { ReorderChips } from './ReorderChips';
import { Sheet } from './Sheet';
import { confirmDialog, showDialog } from './Dialog';
import { DateField } from './DateField';
import { Button, Chip, ClearButton, Field, IconButton, Row, Segmented, Text, Toggle, tap, useAmountTyping } from './primitives';
import { cardFeeFor, countriesForCurrency, countryForCurrency, estimateRefund, meetsVatMinimum, vatRule, withFee } from '@/lib/taxFree';
import { countryFlag, countryName } from '@/lib/countries';
import { CountryPicker } from './CountryPicker';
import { FadeIn } from './FadeIn';
import { InfoTip } from './InfoTip';
import { UploadZone } from './UploadZone';

type RateMode = 'stored' | 'auto' | 'manual';

// The "Paid by" option for joint money (a shared wallet or joint card)
const JOINT = '__joint';

export function ExpenseForm({ existing }: { existing?: Expense }) {
  const { t, lang } = useT();
  const c = useColors();
  const { width } = useWindowDimensions();
  const { trip, members, categories, allCategories, me, memberById } = useTripData();
  const save = useSaveExpense(trip?.id ?? '');
  // Category order and the trip's own payment methods: shown at once, sent when there is a connection
  const changes = useTripChanges(trip?.id ?? '');
  const customPayments = trip?.payment_methods ?? [];
  const queryClient = useQueryClient();
  const lastCurrency = usePrefs((s) => (trip ? s.lastCurrency[trip.id] : undefined));
  const noteCurrencyUsed = usePrefs((s) => s.noteCurrencyUsed);
  const notePaymentUsed = usePrefs((s) => s.notePaymentUsed);
  const lastCountry = usePrefs((s) => (trip ? s.lastCountry[trip.id] : undefined)) ?? null;
  const noteCountryUsed = usePrefs((s) => s.noteCountryUsed);
  // A new expense starts with the payment method used last (in this trip, else the last one anywhere that this trip offers)
  const lastPayment = usePrefs((s) => (trip ? lastPaymentFor(s.lastPayment, s.lastPaymentAny, trip.id, customPayments) : null));
  const cachedRates = usePrefs((s) => s.rates);

  // ---------------------------------------------------------------- state
  const [currency, setCurrency] = useState(existing?.currency ?? lastCurrency ?? trip?.default_currency ?? 'THB');
  const [amountText, setAmountText] = useState(existing ? groupThousands(minorToInput(existing.amount_minor, existing.currency)) : '');
  const [amountFocused, setAmountFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [taxFree, setTaxFree] = useState(existing?.tax_free ?? false);
  // Where the expense was (a country): picked, else the default below
  const [countryPick, setCountryPick] = useState<string | null>(existing ? existing.vat_country ?? null : null);
  const [pickCountry, setPickCountry] = useState(false);
  const [description, setDescription] = useState(existing?.description ?? '');
  // null = joint money (the default): no payer, so it never creates a debt
  const [payerId, setPayerId] = useState<string | null>(existing ? existing.paid_by_member_id : null);
  const [occurredAt, setOccurredAt] = useState(existing ? new Date(existing.occurred_at) : new Date());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(existing ? existing.payment_method : lastPayment);
  const [receiptPath, setReceiptPath] = useState<string | null>(existing?.receipt_path ?? null);
  const [localReceipt, setLocalReceipt] = useState<{ uri: string; mime: string } | null>(null);
  // Who paid, split, date, notes and receipt: folded away until opened
  const [detailsOpen, setDetailsOpen] = useState(false);
  // A category chip is being dragged: the form stops scrolling meanwhile
  const [draggingChip, setDraggingChip] = useState(false);
  // Adding the trip's own payment method
  const [addingPayment, setAddingPayment] = useState(false);
  // The methods that didn't fit on the form's single line (offered in the sheet)
  const [morePayments, setMorePayments] = useState<string[]>([]);
  const [newPayment, setNewPayment] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pickCurrency, setPickCurrency] = useState(false);
  const [rateMode, setRateMode] = useState<RateMode>(existing ? (existing.fx_is_manual ? 'manual' : 'stored') : 'auto');
  const [manualRate, setManualRate] = useState(existing?.fx_is_manual ? trimRate(existing.fx_rate) : '');
  const [editingRate, setEditingRate] = useState(false);
  const [rateDirection, setRateDirection] = useState<RateDirection>('homePerUnit');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Identifies a new expense across offline retries, so it is never saved twice
  const [clientId] = useState(() => Crypto.randomUUID());
  // The version this form was opened on. `existing` keeps updating in real time
  // when the partner saves, so using its live version would let a stale edit
  // pass the conflict check and silently overwrite their change (bug #1).
  const [baseVersion] = useState(existing?.version);
  const addToOutbox = useOutbox((s) => s.add);
  const queueUpdate = useOutbox((s) => s.queueUpdate);
  const userId = useUserId();

  const [splitType, setSplitType] = useState<SplitType>(existing?.split_type ?? 'equal');
  const [equalIds, setEqualIds] = useState<string[]>(
    existing?.split_type === 'equal' ? existing.expense_splits.map((s) => s.member_id) : members.map((m) => m.id),
  );
  // Personal: belongs to whoever paid, until another name is picked (null = follow the payer)
  const [personalId, setPersonalId] = useState<string | null>(
    existing?.split_type === 'personal' ? existing.expense_splits[0]?.member_id ?? null : null,
  );
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const s = existing?.split_type === 'percent' ? existing.expense_splits.find((x) => x.member_id === m.id) : undefined;
        return [m.id, s?.share_pct ? String(Number(s.share_pct)) : members.length ? String(Math.round(100 / members.length)) : ''];
      }),
    ),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const s = existing?.split_type === 'amount' ? existing.expense_splits.find((x) => x.member_id === m.id) : undefined;
        return [m.id, s?.share_original_minor ? groupThousands(minorToInput(s.share_original_minor, existing!.currency)) : ''];
      }),
    ),
  );
  const amountRef = useRef<TextInputInstance>(null);
  const amountTyping = useAmountTyping(getCurrency(currency).minor_units, setAmountText, amountRef);

  // ---------------------------------------------------------------- rates
  const tz = trip?.timezone ?? 'UTC';
  const rateDate = dayKey(occurredAt, tz);
  const rates = useRates(rateDate);
  const snapshot = rates.data ?? cachedRatesFor(cachedRates, rateDate);
  const fromCache = !rates.data && !!snapshot;
  const autoEntry = currency === HOME_CURRENCY ? undefined : snapshot?.rates[currency];
  const autoRate = currency === HOME_CURRENCY ? '1' : autoEntry?.rate;

  const effectiveRate =
    currency === HOME_CURRENCY
      ? '1'
      : rateMode === 'manual'
        ? rateFromInput(manualRate, rateDirection) ?? undefined
        : rateMode === 'stored'
          ? existing!.fx_rate
          : autoRate;

  const amountMinor = parseAmount(amountText, currency);
  const plainHomeMinor = amountMinor != null && effectiveRate ? convertToHomeMinor(amountMinor, currency, effectiveRate) : null;
  // Card fee on foreign-currency card payments (trip setting). An edited expense
  // keeps the fee it was saved with while its currency and payment stay the same.
  const feePct =
    existing && existing.currency === currency && existing.payment_method === paymentMethod
      ? Number(existing.fx_fee_pct ?? 0)
      : cardFeeFor(paymentMethod, currency, HOME_CURRENCY, trip?.card_fx_fee_pct);
  const homeMinor = plainHomeMinor != null ? withFee(plainHomeMinor, feePct) : null;
  const cur = getCurrency(currency);

  // Tax free: which country's rules, and the most it can get back
  const tripCountries = trip?.countries ?? [];
  // Location: what was picked; for a new expense the last one used in this trip,
  // else the destination that uses this currency (baht: Thailand), else the first destination
  const byCurrency = countryForCurrency(currency, tripCountries);
  const purchaseCountry = existing ? countryPick : countryPick ?? lastCountry ?? byCurrency ?? tripCountries[0] ?? null;
  const vatCandidates = countriesForCurrency(currency, tripCountries);
  const isShopping = allCategories.find((x) => x.id === categoryId)?.key === 'shopping';
  const showTaxFree = taxFree || (isShopping && (vatCandidates.length > 0 || !!vatRule(purchaseCountry)));
  const refund =
    taxFree && amountMinor != null && homeMinor != null
      ? estimateRefund({ amountMinor, currency, minorUnits: cur.minor_units, homeMinor, feePct, country: purchaseCountry })
      : null;

  // VAT refund popup: once per form, when a shopping (or tax free) amount reaches
  // the country's minimum. Waits for typing to pause so it never interrupts a number.
  // An edited expense already marked tax free that qualified when opened: no popup.
  const qualifiesForVat = showTaxFree && meetsVatMinimum({ amountMinor, currency, minorUnits: cur.minor_units, country: purchaseCountry });
  const vatAlerted = useRef(!!existing?.tax_free && qualifiesForVat);
  useEffect(() => {
    if (!qualifiesForVat || vatAlerted.current) return;
    const timer = setTimeout(() => {
      vatAlerted.current = true;
      showDialog(
        t('taxFree.eligibleTitle'),
        t('taxFree.eligibleBody'),
        taxFree
          ? [{ label: t('taxFree.gotIt') }]
          : [
              { label: t('taxFree.markTaxFree'), onPress: () => setTaxFree(true) },
              { label: t('taxFree.gotIt'), style: 'cancel' },
            ],
      );
    }, 900);
    return () => clearTimeout(timer);
  }, [qualifiesForVat, taxFree, t]);

  // Changing currency or date means the stored rate no longer applies
  function changeCurrency(code: string) {
    setCurrency(code);
    if (rateMode === 'stored') setRateMode('auto');
    if (rateMode === 'manual') {
      setRateMode('auto');
      setManualRate('');
    }
    // Re-validate decimals for the new currency
    const p = parseAmount(amountText, code);
    if (p == null && amountText) setAmountText(amountText.split('.')[0]);
  }
  function changeDate(d: Date) {
    setOccurredAt(d);
    if (rateMode === 'stored' && dayKey(d, tz) !== dayKey(existing!.occurred_at, tz)) setRateMode('auto');
  }

  // ---------------------------------------------------------------- split
  const splitConfig: SplitConfig = useMemo(() => {
    switch (splitType) {
      case 'equal':
        return { type: 'equal', memberIds: equalIds };
      case 'treat':
        return { type: 'treat' };
      case 'personal':
        return { type: 'personal', memberId: personalId ?? payerId ?? members[0]?.id ?? '' };
      case 'percent':
        return { type: 'percent', percents: Object.fromEntries(Object.entries(percents).map(([k, v]) => [k, Number(v) || 0])) };
      case 'amount':
        return {
          type: 'amount',
          amounts: Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, parseAmount(v, currency) ?? 0])),
        };
    }
  }, [splitType, equalIds, personalId, payerId, percents, amounts, currency]);
  // Joint money is shared equally by everyone on the trip (it only feeds the
  // per-person share; nobody owes anything for it)
  const effectiveSplit: SplitConfig = payerId === null ? { type: 'equal', memberIds: members.map((m) => m.id) } : splitConfig;

  const splitCheck = validateSplit(effectiveSplit, amountMinor ?? 0);
  const shares = useMemo(() => {
    if (homeMinor == null || !splitCheck.ok) return null;
    try {
      return previewShares(effectiveSplit, payerId, homeMinor);
    } catch {
      return null;
    }
  }, [homeMinor, splitCheck.ok, effectiveSplit, payerId]);

  /** With two people, typing one side fills in the other. */
  function setComplement(kind: 'percent' | 'amount', id: string, value: string) {
    const setter = kind === 'percent' ? setPercents : setAmounts;
    setter((prev) => {
      const next = { ...prev, [id]: value };
      if (members.length === 2) {
        const other = members.find((m) => m.id !== id)!.id;
        if (kind === 'percent') {
          const n = Number(value);
          if (value !== '' && n >= 0 && n <= 100) next[other] = String(Math.round((100 - n) * 100) / 100);
        } else if (amountMinor != null) {
          const v = parseAmount(value, currency);
          if (v != null && v <= amountMinor) next[other] = groupThousands(minorToInput(amountMinor - v, currency)) || '';
        }
      }
      return next;
    });
  }

  // ---------------------------------------------------------------- receipt
  async function pickReceipt(source: 'camera' | 'library') {
    const perm =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, mediaTypes: ['images'] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) {
      setLocalReceipt({ uri: res.assets[0].uri, mime: res.assets[0].mimeType ?? 'image/jpeg' });
    }
  }
  const remoteReceipt = useReceiptUrl(localReceipt ? null : receiptPath);

  // ---------------------------------------------------------------- save
  async function submit(overrideVersion?: number) {
    if (!trip) return;
    if (blockedInDemo(queryClient)) return;
    if (amountMinor == null) {
      setError(t('form.amountRequired'));
      amountRef.current?.focus();
      return;
    }
    if (!effectiveRate) return setError(t('form.rateRequired'));
    if (!splitCheck.ok) {
      // The split lives under "More details": show it
      setDetailsOpen(true);
      return setError(t('errors.invalid_split'));
    }
    setError(null);

    const auto = rateMode === 'auto' && currency !== HOME_CURRENCY;
    const build = (receipt: string | null): SaveExpenseInput => ({
      id: existing?.id,
      client_id: existing ? undefined : clientId,
      version: overrideVersion ?? baseVersion,
      trip_id: trip.id,
      kind: existing?.kind ?? 'expense',
      paid_by_member_id: payerId,
      amount_minor: amountMinor,
      currency,
      fx_rate: effectiveRate,
      // The server re-checks automatic rates against what it published and sets the source
      fx_source: currency === HOME_CURRENCY ? 'par' : rateMode === 'manual' ? 'manual' : rateMode === 'stored' ? existing!.fx_source : autoEntry!.source,
      fx_rate_date: auto ? autoEntry!.date : rateMode === 'stored' ? existing!.fx_rate_date : rateDate,
      fx_fetched_at: auto ? snapshot!.fetched_at : rateMode === 'stored' ? existing!.fx_fetched_at : new Date().toISOString(),
      fx_is_manual: rateMode === 'manual' && currency !== HOME_CURRENCY,
      category_id: categoryId,
      description: description.trim(),
      notes: notes.trim() || null,
      occurred_at: occurredAt.toISOString(),
      receipt_path: receipt,
      payment_method: paymentMethod,
      fx_fee_pct: feePct,
      tax_free: taxFree,
      vat_country: purchaseCountry,
      split_type: splitType,
      splits: toSplitEntries(effectiveSplit, payerId),
    });

    const remember = () => {
      if (purchaseCountry) noteCountryUsed(trip.id, purchaseCountry);
      noteCurrencyUsed(trip.id, currency);
      if (paymentMethod) notePaymentUsed(trip.id, paymentMethod);
    };
    const done = () => {
      remember();
      // Saved for real: an older offline edit of this expense must not be sent later
      if (existing) useOutbox.getState().remove(editKey(existing.id));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // A little celebration for every new expense (also when saved offline), not for edits
      if (!existing) useConfetti.getState().fire();
      goBack('/expenses');
    };

    // No signal: keep new expenses on the phone and send them later
    const queueOffline = () => {
      if (localReceipt) return setError(t('form.receiptOffline'));
      const { version: _v, ...payload } = build(null);
      addToOutbox({ clientId, tripId: trip.id, createdBy: userId ?? '', queuedAt: new Date().toISOString(), payload: { ...payload, client_id: clientId } });
      done();
    };

    // No signal: keep the edit on the phone and send it later, starting from the
    // version that was opened (a partner's change meanwhile is caught, not overwritten)
    const queueEdit = () => {
      if (localReceipt) return setError(t('form.receiptOffline'));
      const { version: _v, ...payload } = build(receiptPath);
      queueUpdate({ expenseId: existing!.id, expectedVersion: existing!.version, tripId: trip.id, createdBy: userId ?? '', queuedAt: new Date().toISOString(), payload });
      remember();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      goBack('/expenses');
    };

    if (!onlineManager.isOnline()) return existing ? queueEdit() : queueOffline();

    setBusy(true);
    try {
      let path = receiptPath;
      if (localReceipt) path = await uploadReceipt(trip.id, localReceipt.uri, localReceipt.mime);
      await save.mutateAsync(build(path));
      done();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'network') {
        if (existing) queueEdit();
        else queueOffline();
      } else if (code === 'conflict' && existing) {
        const keepMine = await confirmDialog(t('form.conflictTitle'), t('errors.conflict'), t('form.conflictKeepMine'), t('form.conflictUseTheirs'));
        if (!keepMine) {
          // Their version wins: a queued edit of mine must not be sent later
          useOutbox.getState().remove(editKey(existing.id));
          goBack('/expenses');
          return;
        }
        const { data } = await supabase.from('expenses').select('version').eq('id', existing.id).single();
        if (data) await submit(data.version as number);
      } else {
        setError(t(`errors.${code}`));
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- payment methods
  function addPayment() {
    const name = cleanPaymentName(newPayment, customPayments, t);
    if (!name) return setPaymentError(newPayment.trim() ? t('payment.addInvalid') : null);
    if (customPayments.length >= MAX_CUSTOM_PAYMENTS) return setPaymentError(t('payment.addLimit', { count: MAX_CUSTOM_PAYMENTS }));
    // Shared with the trip (shows at once; sent when there is a connection) and chosen for this expense
    changes.setPaymentMethods([...customPayments, name]);
    setPaymentMethod(name);
    setNewPayment('');
    setPaymentError(null);
    setAddingPayment(false);
  }
  async function removePayment(name: string) {
    const ok = await confirmDialog(t('payment.removeConfirm', { name }), t('payment.removeBody'), t('common.delete'), t('common.cancel'), true);
    if (!ok) return;
    changes.setPaymentMethods(customPayments.filter((n) => n !== name));
  }

  if (!trip) return null;

  // ---------------------------------------------------------------- render
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  // What "More details" holds, in one line while it is folded
  const detailsSummary = [
    members.length > 1 ? (payerId === null ? t('form.joint') : memberById.get(payerId)?.display_name) : null,
    `${occurredAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${occurredAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`,
    notes.trim() ? '📝' : null,
    localReceipt || receiptPath ? '🧾' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Payment chips: built-ins, the trip's own, and an older expense's method that is no longer listed
  const paymentKeys: string[] = [
    ...BUILTIN_PAYMENTS.map((p) => p.key),
    ...customPayments,
    ...(paymentMethod && !BUILTIN_PAYMENTS.some((p) => p.key === paymentMethod) && !customPayments.includes(paymentMethod) ? [paymentMethod] : []),
  ];
  // Under the amount: the rate, plus a short tag only when it matters
  // (typed by hand, from another day, saved copy while offline)
  const shortDate = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7);
  const rateTag = (() => {
    if (currency === HOME_CURRENCY) return null;
    if (rateMode === 'manual') return t('form.rateTagManual');
    if (rateMode === 'stored') {
      const d = existing!.fx_rate_date;
      return existing!.fx_source === 'manual' || !d ? t('form.rateTagManual') : d !== rateDate ? shortDate(d) : null;
    }
    if (!autoEntry) return null;
    if (fromCache) return t('form.rateTagSaved', { date: shortDate(autoEntry.date) });
    return autoEntry.date !== rateDate ? shortDate(autoEntry.date) : null;
  })();
  const rateMissing = currency !== HOME_CURRENCY && rateMode === 'auto' && !autoEntry && !rates.isLoading;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.card }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <IconButton name="close" onPress={() => goBack('/expenses')} label={t('common.cancel')} />
        <Text variant="h2">{existing ? t('form.editTitle') : t('form.newTitle')}</Text>
        <View style={{ width: 40 }} />
      </Row>

      {/* Everything a normal expense needs (currency, amount, rate, category,
          payment method, description) fits on one iPhone screen without scrolling;
          the rest waits under More details. */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!draggingChip}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.lg }}
      >
        {/* Currency on top, the amount under it, then the rate */}
        <View style={{ gap: 6 }}>
          <View style={{ alignItems: 'center' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('form.currency')}
              onPress={() => setPickCurrency(true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 44,
                backgroundColor: c.cardAlt,
                borderRadius: radius.md,
                paddingHorizontal: 12,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 20 }}>{cur.flag}</Text>
              <Text variant="label" style={{ fontSize: 15 }}>
                {cur.code}
              </Text>
              <Ionicons name="chevron-down" size={14} color={c.textMuted} />
            </Pressable>
          </View>
          <View style={{ position: 'relative', justifyContent: 'center' }}>
              <TextInput
                ref={amountTyping.ref}
                value={amountText}
                onChangeText={amountTyping.onChangeText}
                accessibilityLabel={t('form.amount')}
                placeholder="0"
                placeholderTextColor={c.textFaint}
                keyboardType={cur.minor_units > 0 ? 'decimal-pad' : 'number-pad'}
                autoFocus={!existing}
                {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                style={[
                  {
                    height: 56,
                    fontSize: amountFontSize(amountText),
                    fontWeight: '800',
                    color: c.text,
                    textAlign: 'center',
                    letterSpacing: -1,
                    paddingHorizontal: 36,
                    // A line under the amount instead of a box
                    borderBottomWidth: 2,
                    borderBottomColor: amountFocused ? c.primary : c.border,
                  },
                  WEB_NO_OUTLINE,
                ]}
              />
              {amountText ? <ClearButton rtl={lang === 'he'} inset={0} onPress={() => setAmountText('')} /> : null}
          </View>
          {currency !== HOME_CURRENCY ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('form.rateEdit')} onPress={() => setEditingRate((v) => !v)} hitSlop={6}>
              <View style={{ alignItems: 'center', gap: 2 }}>
                {homeMinor != null ? (
                  <Text variant="label" color={c.primary} style={{ fontSize: 16 }}>
                    ≈ {formatMoney(homeMinor, HOME_CURRENCY, { lang })}
                  </Text>
                ) : null}
                <Row gap={6} style={{ justifyContent: 'center' }}>
                  {rateMissing ? (
                    <Text variant="caption" color={c.danger}>
                      {t('form.rateMissingShort')}
                    </Text>
                  ) : effectiveRate ? (
                    <Text variant="caption" muted {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}>
                      {formatRate(effectiveRate, currency, cur.symbol, 2)}
                    </Text>
                  ) : (
                    <Text variant="caption" muted>
                      {t('common.loading')}
                    </Text>
                  )}
                  {rateTag ? (
                    <Text variant="caption" muted>
                      · {rateTag}
                    </Text>
                  ) : null}
                  <Ionicons name="pencil" size={12} color={c.textMuted} />
                </Row>
                {feePct > 0 && homeMinor != null && plainHomeMinor != null ? (
                  <Text variant="caption" muted>
                    {t('form.cardFeeIncluded', { pct: feePct, amount: formatMoney(homeMinor - plainHomeMinor, HOME_CURRENCY, { lang }) })}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ) : null}
          {editingRate && currency !== HOME_CURRENCY ? (
            <View style={{ width: '100%', gap: space.sm }}>
              <Segmented<RateDirection>
                options={[
                  { value: 'homePerUnit', label: `1 ${cur.symbol} → ₪` },
                  { value: 'unitsPerHome', label: `1 ₪ → ${cur.symbol}` },
                ]}
                value={rateDirection}
                onChange={(d) => {
                  // Keep the same rate, re-expressed in the new direction
                  if (effectiveRate) setManualRate(d === 'homePerUnit' ? trimRate(effectiveRate) : invertRate(effectiveRate, 4));
                  setRateDirection(d);
                }}
              />
              <Field
                label={rateDirection === 'homePerUnit' ? t('form.rateInput', { code: currency }) : t('form.rateInputInverse', { code: currency })}
                value={
                  rateMode === 'manual'
                    ? manualRate
                    : effectiveRate
                      ? rateDirection === 'homePerUnit'
                        ? trimRate(effectiveRate)
                        : invertRate(effectiveRate, 4)
                      : ''
                }
                onChangeText={(v) => {
                  setRateMode('manual');
                  setManualRate(v.replace(',', '.').replace(/[^\d.]/g, ''));
                }}
                keyboardType="decimal-pad"
                error={rateMode === 'manual' && manualRate !== '' && !isValidRate(manualRate) ? t('errors.invalid_rate') : null}
              />
              {autoRate && rateMode === 'manual' ? (
                <Button
                  title={t('form.rateReset')}
                  variant="ghost"
                  onPress={() => {
                    setRateMode('auto');
                    setManualRate('');
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Title: what it was */}
        <View style={{ gap: 6 }}>
          <SectionTitle icon="create-outline" title={t('form.title')} />
          <Field
            accessibilityLabel={t('form.title')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('form.descriptionPlaceholder')}
            maxLength={120}
            style={{ minHeight: 46, paddingVertical: 10 }}
          />
        </View>

        {/* Category: hold a tile to drag it to a new place (saved for the trip) */}
        <View style={{ gap: 6 }}>
          <SectionTitle icon="pricetag-outline" title={t('form.category')} />
          <ReorderChips
            columns={width >= 520 ? 5 : 4}
            items={categories.map((cat) => ({
              key: cat.id,
              node: (
                <CategoryTile
                  category={cat}
                  label={categoryLabel(cat, t)}
                  selected={categoryId === cat.id}
                  onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                />
              ),
            }))}
            onReorder={(keys) => changes.setCategoryOrder(nextCategoryOrder(allCategories, keys))}
            onDragging={setDraggingChip}
          />
        </View>

        {/* A clear break: categories above, how it was paid below */}
        <SectionBreak />

        {/* Payment method */}
        <View style={{ gap: 6 }}>
          <SectionTitle icon="card-outline" title={t('form.paymentMethod')} />
          <PaymentRow
            keys={paymentKeys}
            selected={paymentMethod}
            onSelect={setPaymentMethod}
            onMore={(hidden) => {
              setMorePayments(hidden);
              setPaymentError(null);
              setNewPayment('');
              setAddingPayment(true);
            }}
          />
        </View>

        {/* Location: the country the expense was in (remembered for the next one) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('form.location')}: ${purchaseCountry ? countryName(purchaseCountry, lang) : t('form.locationNone')}`}
          onPress={() => setPickCountry(true)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            backgroundColor: c.cardAlt,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            minHeight: 44,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="location-outline" size={18} color={c.primary} />
          <Text variant="label" color={c.text} style={{ flex: 1 }}>
            {t('form.location')}
          </Text>
          <Text style={{ fontWeight: '600' }} numberOfLines={1} color={purchaseCountry ? c.text : c.textFaint}>
            {purchaseCountry ? `${countryFlag(purchaseCountry)} ${countryName(purchaseCountry, lang)}` : t('form.locationNone')}
          </Text>
          <Ionicons name="chevron-down" size={14} color={c.textMuted} />
        </Pressable>

        {/* Tax free: suggested for shopping; estimates the VAT refund */}
        {showTaxFree ? (
          <View style={{ gap: 6, backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md }}>
            <Row gap={space.sm}>
              <Ionicons name="receipt-outline" size={18} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="label" color={c.text}>
                  {t('taxFree.toggle')}
                </Text>
                <Text variant="caption" muted>
                  {!taxFree
                    ? t('taxFree.toggleHint')
                    : !refund
                      ? t('taxFree.enterAmount')
                      : refund.status === 'eligible'
                        ? t('taxFree.upTo', { amount: formatMoney(refund.refundHomeMinor, HOME_CURRENCY, { lang }), vat: refund.rule.vat })
                        : refund.status === 'belowMin'
                          ? t(refund.rule.per === 'storeDay' ? 'taxFree.belowMinStore' : 'taxFree.belowMinReceipt', {
                              min: `${groupThousands(String(refund.rule.min))} ${refund.rule.currency}`,
                            })
                          : refund.status === 'noRefund'
                            ? t('taxFree.noRefundHere')
                            : purchaseCountry
                              ? t('taxFree.noRule')
                              : t('taxFree.pickLocation')}
                </Text>
              </View>
              <Toggle value={taxFree} onValueChange={setTaxFree} label={t('taxFree.toggle')} />
            </Row>
          </View>
        ) : null}

        {/* More details: who paid, split, date, notes, receipt. Folded until opened. */}
        <View style={{ gap: space.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => {
              tap();
              setDetailsOpen((v) => !v);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: c.cardAlt,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="options-outline" size={18} color={c.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" color={c.text}>
                {t('form.more')}
              </Text>
              {!detailsOpen ? (
                <Text variant="caption" muted numberOfLines={1}>
                  {detailsSummary}
                </Text>
              ) : null}
            </View>
            <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
          </Pressable>

          {detailsOpen ? (
            <FadeIn duration={180} style={{ gap: space.lg }}>
              {/* Who paid */}
              {members.length > 1 ? (
                <View style={{ gap: space.sm }}>
                  <Text variant="label" muted>
                    {t('form.paidBy')}
                  </Text>
                  <Segmented
                    options={[{ value: JOINT, label: t('form.joint') }, ...members.map((m) => ({ value: m.id, label: m.display_name }))]}
                    value={payerId ?? JOINT}
                    onChange={(v) => {
                      setPayerId(v === JOINT ? null : v);
                      // A treat belongs to whoever paid; it has no meaning for joint money
                      if (v === JOINT && splitType === 'treat') setSplitType('equal');
                    }}
                  />
                  {payerId === null ? (
                    <Text variant="caption" muted>
                      {t('form.jointHint')}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Split: only when one person paid (joint money is shared by everyone) */}
              {members.length > 1 && payerId !== null ? (
                <View style={{ gap: space.sm }}>
                  <Row gap={4}>
                    <Text variant="label" muted>
                      {t('form.splitTitle')}
                    </Text>
                    <InfoTip label={t('form.splitInfoLabel')}>
                      <Text variant="label">{t('form.splitInfo')}</Text>
                    </InfoTip>
                  </Row>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                    {(['equal', 'treat', 'personal', 'percent', 'amount'] as const).map((type) => (
                      <Chip
                        key={type}
                        label={type === 'equal' && members.length > 2 ? t('split.equalN') : t(`split.${type}`)}
                        selected={splitType === type}
                        onPress={() => {
                          // Switching to Personal: it belongs to whoever paid
                          if (type === 'personal' && splitType !== 'personal') setPersonalId(null);
                          setSplitType(type);
                        }}
                      />
                    ))}
                  </ScrollView>

                  {splitType === 'equal' && members.length > 2 ? (
                    <Row style={{ flexWrap: 'wrap' }}>
                      {members.map((m) => (
                        <Chip
                          key={m.id}
                          label={m.display_name}
                          color={m.color}
                          selected={equalIds.includes(m.id)}
                          onPress={() => setEqualIds((ids) => (ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
                        />
                      ))}
                    </Row>
                  ) : null}
                  {splitType === 'treat' ? (
                    <Text variant="caption" muted>
                      {t('split.treatHint', { name: memberById.get(payerId)?.display_name ?? '' })}
                    </Text>
                  ) : null}
                  {splitType === 'personal' ? (
                    <View style={{ gap: 6 }}>
                      <Text variant="caption" muted>
                        {t('split.belongsTo')}
                      </Text>
                      <Segmented
                        options={members.map((m) => ({ value: m.id, label: m.display_name }))}
                        value={personalId ?? payerId}
                        onChange={setPersonalId}
                      />
                      {/* Paid by its owner: private to them (other members don't see it) */}
                      {members.length > 1 && payerId && (personalId ?? payerId) === payerId ? (
                        <Text variant="caption" muted>
                          {t('split.privateHint')}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {splitType === 'percent' || splitType === 'amount'
                    ? members.map((m) => (
                        <Row key={m.id} gap={space.md}>
                          <Text style={{ flex: 1 }}>{m.display_name}</Text>
                          <TextInput
                            value={(splitType === 'percent' ? percents : amounts)[m.id] ?? ''}
                            onChangeText={(v) =>
                              setComplement(splitType, m.id, splitType === 'amount' ? formatAmountTyping(v, cur.minor_units) : v.replace(',', '.').replace(/[^\d.]/g, ''))
                            }
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={c.textFaint}
                            style={{
                              width: 120,
                              height: 42,
                              borderRadius: radius.sm,
                              backgroundColor: c.cardAlt,
                              paddingHorizontal: space.md,
                              fontSize: 16,
                              color: c.text,
                              textAlign: 'center',
                            }}
                          />
                          <Text muted style={{ width: 28 }}>
                            {splitType === 'percent' ? '%' : cur.symbol}
                          </Text>
                        </Row>
                      ))
                    : null}

                  {shares ? (
                    <Row style={{ flexWrap: 'wrap', backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md }} gap={space.md}>
                      {shares.map((s) => (
                        <Text key={s.memberId} variant="caption">
                          {t('split.shareOf', { name: memberById.get(s.memberId)?.display_name ?? '', amount: formatMoney(s.share, HOME_CURRENCY, { lang }) })}
                        </Text>
                      ))}
                    </Row>
                  ) : amountMinor != null && !splitCheck.ok ? (
                    <Text variant="caption" color={c.danger}>
                      {t('errors.invalid_split')}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Date / time */}
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" muted>
                  {t('form.date')}
                </Text>
                <Row gap={space.sm}>
                  <DateField value={occurredAt} onChange={changeDate} />
                  <DateField value={occurredAt} onChange={changeDate} mode="time" />
                </Row>
              </Row>

              <Field label={t('form.notes')} value={notes} onChangeText={setNotes} placeholder={t('form.notesPlaceholder')} multiline maxLength={1000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>
                  {t('form.receipt')}
                </Text>
                {localReceipt || remoteReceipt.data ? (
                  <View style={{ gap: space.sm }}>
                    <Image source={{ uri: localReceipt?.uri ?? remoteReceipt.data }} style={{ width: '100%', height: 200, borderRadius: radius.md }} resizeMode="cover" />
                    <Button
                      title={t('form.removeReceipt')}
                      variant="danger"
                      onPress={() => {
                        setLocalReceipt(null);
                        setReceiptPath(null);
                      }}
                    />
                  </View>
                ) : (
                  <Row gap={space.sm}>
                    {Platform.OS !== 'web' ? (
                      <Button title={t('form.takePhoto')} icon="camera-outline" variant="secondary" onPress={() => pickReceipt('camera')} style={{ flex: 1 }} />
                    ) : null}
                    <UploadZone
                      title={t('form.addReceipt')}
                      icon="receipt-outline"
                      onPress={() => pickReceipt('library')}
                      onDropFile={(uri, mime) => setLocalReceipt({ uri, mime })}
                      compact
                      style={{ flex: 1 }}
                    />
                  </Row>
                )}
              </View>
            </FadeIn>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
        {error ? (
          <Text variant="label" color={c.danger} center>
            {error}
          </Text>
        ) : null}
        <Button title={busy ? t('form.saving') : t('common.save')} onPress={() => submit()} loading={busy} disabled={amountMinor == null || !effectiveRate} />
      </View>

      {/* The trip's own payment methods: add one (and pick it), or remove one */}
      <Sheet visible={addingPayment} onClose={() => setAddingPayment(false)} title={morePayments.length ? t('payment.moreTitle') : t('payment.addTitle')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {morePayments.length ? (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {morePayments.map((key) => (
                  <Chip
                    key={key}
                    size="lg"
                    icon={paymentIcon(key)}
                    label={paymentLabel(key, t)}
                    selected={paymentMethod === key}
                    onPress={() => {
                      setPaymentMethod(key);
                      setAddingPayment(false);
                    }}
                  />
                ))}
              </View>
              <Text variant="label" muted style={{ marginTop: space.sm }}>
                {t('payment.addNew')}
              </Text>
            </View>
          ) : null}
          <Field
            label={t('payment.addLabel')}
            value={newPayment}
            onChangeText={(v) => {
              setNewPayment(v);
              setPaymentError(null);
            }}
            placeholder={t('payment.addPlaceholder')}
            maxLength={PAYMENT_NAME_MAX}
            autoFocus={!morePayments.length}
            returnKeyType="done"
            onSubmitEditing={addPayment}
            error={paymentError}
          />
          <Button title={t('payment.addSave')} icon="add" onPress={addPayment} disabled={!newPayment.trim()} />
          {customPayments.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Text variant="label" muted>
                {t('payment.yours')}
              </Text>
              {customPayments.map((name) => (
                <Row key={name} gap={space.sm} style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 }}>
                  <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                    {name}
                  </Text>
                  <IconButton name="trash-outline" color={c.danger} onPress={() => removePayment(name)} label={t('common.delete')} />
                </Row>
              ))}
              <Text variant="caption" muted>
                {t('payment.removeHint')}
              </Text>
            </View>
          ) : null}
        </View>
      </Sheet>

      <CountryPicker
        visible={pickCountry}
        title={t('form.location')}
        selected={purchaseCountry ? [purchaseCountry] : []}
        top={tripCountries}
        onPick={setCountryPick}
        onClose={() => setPickCountry(false)}
      />
      <CurrencyPicker
        visible={pickCurrency}
        value={currency}
        onSelect={changeCurrency}
        onClose={() => setPickCurrency(false)}
        autoRateCodes={snapshot ? new Set(Object.keys(snapshot.rates)) : undefined}
      />
    </SafeAreaView>
  );
}

/** A section heading in the form: small icon and label. */
function SectionTitle({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const c = useColors();
  const { lang } = useT();
  return (
    <Row gap={6}>
      <Ionicons name={icon} size={15} color={c.textMuted} />
      <Text variant="label" muted>
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" faint numberOfLines={1} style={{ flex: 1, textAlign: lang === 'he' ? 'left' : 'right' }}>
          {hint}
        </Text>
      ) : null}
    </Row>
  );
}

/** A full-width line between sections, so categories and payment methods never read as one list. */
function SectionBreak() {
  const c = useColors();
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ height: 1, backgroundColor: c.border, marginHorizontal: -space.lg }} />;
}

/** The amount gets smaller as it grows, so a long one (19,234,567.89) still fits on the line. */
function amountFontSize(text: string) {
  return text.length <= 9 ? 44 : text.length <= 12 ? 36 : 30;
}

// Long one-word names ("Accommodation") break at a syllable with a hyphen, not at a random letter
const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;
const WEB_HYPHENS = Platform.OS === 'web' ? ({ hyphens: 'auto', WebkitHyphens: 'auto' } as object) : null;

/**
 * One category in the form's picker: an equal-width tile (icon over name) so
 * the grid fills the whole width and every tile is an easy target. A long
 * hold picks it up to drag instead of selecting it.
 */
function CategoryTile({ category, label, selected, onPress }: { category: Category; label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={() => {}}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 58,
        borderRadius: radius.md,
        paddingHorizontal: 3,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        backgroundColor: selected ? flatten(category.color + '2E', c.card) : c.cardAlt,
        borderWidth: 1.5,
        borderColor: selected ? category.color : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <CategoryIcon category={category} size={20} />
      <Text variant="caption" color={c.text} center numberOfLines={2} style={[{ fontSize: 11, lineHeight: 13 }, WEB_HYPHENS, selected ? { fontWeight: '700' } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

