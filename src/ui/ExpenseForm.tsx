import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadReceipt, useRates, useReceiptUrl, useSaveExpense, type SaveExpenseInput } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import {
  convertToHomeMinor,
  formatMoney,
  formatRate,
  invertRate,
  clampDecimals,
  isValidRate,
  minorToInput,
  parseAmount,
  rateFromInput,
  trimRate,
  type RateDirection,
} from '@/lib/money';
import { rateSourceLabel } from '@/lib/rateLabels';
import { previewShares, toSplitEntries, validateSplit, type SplitConfig, type SplitType } from '@/lib/split';
import { dayKey } from '@/lib/stats';
import { errorCode, supabase } from '@/lib/supabase';
import { useUserId } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { cachedRatesFor, usePrefs } from '@/store/prefs';
import { radius, space, useColors } from '@/theme';
import type { Expense } from '@/types/db';
import { CurrencyPicker } from './CurrencyPicker';
import { confirmDialog } from './Dialog';
import { DateField } from './DateField';
import { Button, Chip, Divider, Field, IconButton, Row, Segmented, Text, tap } from './primitives';

type RateMode = 'stored' | 'auto' | 'manual';

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;

export function ExpenseForm({ existing }: { existing?: Expense }) {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, members, categories, me, memberById } = useTripData();
  const save = useSaveExpense(trip?.id ?? '');
  const lastCurrency = usePrefs((s) => (trip ? s.lastCurrency[trip.id] : undefined));
  const noteCurrencyUsed = usePrefs((s) => s.noteCurrencyUsed);
  const cachedRates = usePrefs((s) => s.rates);

  // ---------------------------------------------------------------- state
  const [currency, setCurrency] = useState(existing?.currency ?? lastCurrency ?? trip?.default_currency ?? 'THB');
  const [amountText, setAmountText] = useState(existing ? minorToInput(existing.amount_minor, existing.currency) : '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [payerId, setPayerId] = useState(existing?.paid_by_member_id ?? me?.id ?? members[0]?.id ?? '');
  const [occurredAt, setOccurredAt] = useState(existing ? new Date(existing.occurred_at) : new Date());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(existing?.payment_method ?? null);
  const [receiptPath, setReceiptPath] = useState<string | null>(existing?.receipt_path ?? null);
  const [localReceipt, setLocalReceipt] = useState<{ uri: string; mime: string } | null>(null);
  const [showMore, setShowMore] = useState(!!(existing?.notes || existing?.receipt_path || existing?.payment_method));
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
  const userId = useUserId();

  const [splitType, setSplitType] = useState<SplitType>(existing?.split_type ?? 'equal');
  const [equalIds, setEqualIds] = useState<string[]>(
    existing?.split_type === 'equal' ? existing.expense_splits.map((s) => s.member_id) : members.map((m) => m.id),
  );
  const [personalId, setPersonalId] = useState(
    existing?.split_type === 'personal' ? existing.expense_splits[0]?.member_id : me?.id ?? members[0]?.id,
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
        return [m.id, s?.share_original_minor ? minorToInput(s.share_original_minor, existing!.currency) : ''];
      }),
    ),
  );
  const amountRef = useRef<TextInputInstance>(null);

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
  const homeMinor = amountMinor != null && effectiveRate ? convertToHomeMinor(amountMinor, currency, effectiveRate) : null;
  const cur = getCurrency(currency);

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
        return { type: 'personal', memberId: personalId ?? payerId };
      case 'percent':
        return { type: 'percent', percents: Object.fromEntries(Object.entries(percents).map(([k, v]) => [k, Number(v) || 0])) };
      case 'amount':
        return {
          type: 'amount',
          amounts: Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, parseAmount(v, currency) ?? 0])),
        };
    }
  }, [splitType, equalIds, personalId, payerId, percents, amounts, currency]);

  const splitCheck = validateSplit(splitConfig, amountMinor ?? 0);
  const shares = useMemo(() => {
    if (homeMinor == null || !splitCheck.ok) return null;
    try {
      return previewShares(splitConfig, payerId, homeMinor);
    } catch {
      return null;
    }
  }, [homeMinor, splitCheck.ok, splitConfig, payerId]);

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
          if (v != null && v <= amountMinor) next[other] = minorToInput(amountMinor - v, currency) || '';
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
    if (amountMinor == null) {
      setError(t('form.amountRequired'));
      amountRef.current?.focus();
      return;
    }
    if (!effectiveRate) return setError(t('form.rateRequired'));
    if (!splitCheck.ok) return setError(t('errors.invalid_split'));
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
      split_type: splitType,
      splits: toSplitEntries(splitConfig, payerId),
    });

    const done = () => {
      noteCurrencyUsed(trip.id, currency);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    };

    // No signal: keep new expenses on the phone and send them later
    const queueOffline = () => {
      if (localReceipt) return setError(t('form.receiptOffline'));
      const { version: _v, ...payload } = build(null);
      addToOutbox({ clientId, tripId: trip.id, createdBy: userId ?? '', queuedAt: new Date().toISOString(), payload: { ...payload, client_id: clientId } });
      done();
    };

    if (!existing && !onlineManager.isOnline()) return queueOffline();

    setBusy(true);
    try {
      let path = receiptPath;
      if (localReceipt) path = await uploadReceipt(trip.id, localReceipt.uri, localReceipt.mime);
      await save.mutateAsync(build(path));
      done();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'network' && !existing) {
        queueOffline();
      } else if (code === 'network') {
        setError(t('form.editOffline'));
      } else if (code === 'conflict' && existing) {
        const keepMine = await confirmDialog(t('form.conflictTitle'), t('errors.conflict'), t('form.conflictKeepMine'), t('form.conflictUseTheirs'));
        if (!keepMine) {
          router.back();
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

  if (!trip) return null;

  // ---------------------------------------------------------------- render
  const rateInfo = (() => {
    if (currency === HOME_CURRENCY) return null;
    if (rateMode === 'manual') return t('form.rateManual');
    if (rateMode === 'stored') return rateSourceLabel(t, existing!.fx_source, existing!.fx_rate_date);
    if (!autoEntry) return rates.isLoading ? t('common.loading') : t('form.rateMissing', { code: currency });
    return fromCache ? t('form.rateCached', { date: autoEntry.date }) : rateSourceLabel(t, autoEntry.source, autoEntry.date);
  })();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.card }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <IconButton name="close" onPress={() => router.back()} label={t('common.cancel')} />
        <Text variant="h2">{existing ? t('form.editTitle') : t('form.newTitle')}</Text>
        <View style={{ width: 40 }} />
      </Row>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        {/* Amount + currency */}
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Pressable
            onPress={() => setPickCurrency(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.cardAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 18 }}>{cur.flag}</Text>
            <Text variant="label">
              {cur.code} · {cur.symbol}
            </Text>
            <Ionicons name="chevron-down" size={16} color={c.textMuted} />
          </Pressable>
          <TextInput
            ref={amountRef}
            value={amountText}
            onChangeText={(v) => setAmountText(clampDecimals(v, cur.minor_units))}
            placeholder="0"
            placeholderTextColor={c.textFaint}
            keyboardType={cur.minor_units > 0 ? 'decimal-pad' : 'number-pad'}
            autoFocus={!existing}
            style={{ fontSize: 52, fontWeight: '800', color: c.text, textAlign: 'center', minWidth: 120, letterSpacing: -1 }}
          />
          {currency !== HOME_CURRENCY ? (
            <Text variant="h2" color={homeMinor != null ? c.primary : c.textFaint} style={{ fontSize: 20 }}>
              ≈ {formatMoney(homeMinor ?? 0, HOME_CURRENCY, { lang })}
            </Text>
          ) : null}
          {rateInfo ? (
            <Pressable onPress={() => setEditingRate((v) => !v)} hitSlop={8}>
              <Row gap={6}>
                <Text variant="caption" muted>
                  {effectiveRate ? `${formatRate(effectiveRate, currency, cur.symbol)} · ` : ''}
                  {rateInfo}
                </Text>
                <Ionicons name="pencil" size={12} color={c.textMuted} />
              </Row>
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

        {/* Category */}
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t('form.category')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.map((cat) => (
              <Chip
                key={cat.id}
                icon={cat.icon}
                label={categoryLabel(cat, t)}
                color={cat.color}
                selected={categoryId === cat.id}
                onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
              />
            ))}
          </View>
        </View>

        <Field label={t('form.description')} value={description} onChangeText={setDescription} placeholder={t('form.descriptionPlaceholder')} maxLength={120} />

        {/* Who paid */}
        {members.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" muted>
              {t('form.paidBy')}
            </Text>
            <Segmented options={members.map((m) => ({ value: m.id, label: m.display_name }))} value={payerId} onChange={setPayerId} />
          </View>
        ) : null}

        {/* Split */}
        {members.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" muted>
              {t('form.split')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {(['equal', 'treat', 'personal', 'percent', 'amount'] as const).map((type) => (
                <Chip
                  key={type}
                  label={type === 'equal' && members.length > 2 ? t('split.equalN') : t(`split.${type}`)}
                  selected={splitType === type}
                  onPress={() => setSplitType(type)}
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
              </View>
            ) : null}
            {splitType === 'percent' || splitType === 'amount'
              ? members.map((m) => (
                  <Row key={m.id} gap={space.md}>
                    <Text style={{ flex: 1 }}>{m.display_name}</Text>
                    <TextInput
                      value={(splitType === 'percent' ? percents : amounts)[m.id] ?? ''}
                      onChangeText={(v) => setComplement(splitType, m.id, v.replace(',', '.').replace(/[^\d.]/g, ''))}
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

        <Divider />

        {showMore ? (
          <View style={{ gap: space.lg }}>
            <Field label={t('form.notes')} value={notes} onChangeText={setNotes} placeholder={t('form.notesPlaceholder')} multiline maxLength={1000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            <View style={{ gap: space.sm }}>
              <Text variant="label" muted>
                {t('form.paymentMethod')}
              </Text>
              <Row style={{ flexWrap: 'wrap' }}>
                {PAYMENT_METHODS.map((m) => (
                  <Chip key={m} label={t(`payment.${m}`)} selected={paymentMethod === m} onPress={() => setPaymentMethod(paymentMethod === m ? null : m)} />
                ))}
              </Row>
            </View>
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
                  <Button title={t('form.choosePhoto')} icon="image-outline" variant="secondary" onPress={() => pickReceipt('library')} style={{ flex: 1 }} />
                </Row>
              )}
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              tap();
              setShowMore(true);
            }}
          >
            <Row>
              <Ionicons name="add-circle-outline" size={18} color={c.primary} />
              <Text variant="label" color={c.primary}>
                {t('form.more')}
              </Text>
            </Row>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
        {error ? (
          <Text variant="label" color={c.danger} center>
            {error}
          </Text>
        ) : null}
        <Button title={busy ? t('form.saving') : t('common.save')} onPress={() => submit()} loading={busy} disabled={amountMinor == null || !effectiveRate} />
      </View>

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
