import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { getCalendars } from 'expo-localization';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useCreateTrip } from '@/api/queries';
import { useT } from '@/i18n';
import { currencyName, getCurrency } from '@/lib/currencies';
import { parseAmount } from '@/lib/money';
import { errorCode } from '@/lib/supabase';
import { MEMBER_COLORS, radius, space, useColors } from '@/theme';
import { CurrencyPicker } from '@/ui/CurrencyPicker';
import { DateField } from '@/ui/DateField';
import { Button, Card, Divider, Field, IconButton, Row, Screen, Text } from '@/ui/primitives';

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CreateTrip() {
  const { t, lang } = useT();
  const c = useColors();
  const create = useCreateTrip();

  const [memberName, setMemberName] = useState('');
  const [name, setName] = useState('');
  const [withDates, setWithDates] = useState(true);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date(Date.now() + 14 * 86_400_000));
  const [currency, setCurrency] = useState('THB');
  const [pickCurrency, setPickCurrency] = useState(false);
  const [total, setTotal] = useState('');
  const [daily, setDaily] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cur = getCurrency(currency);

  async function submit() {
    if (!memberName.trim()) return setError(t('onboarding.nameRequired'));
    if (!name.trim()) return setError(t('onboarding.tripNameRequired'));
    if (withDates && isoDate(end) < isoDate(start)) return setError(t('onboarding.datesInvalid'));
    const totalMinor = total.trim() ? parseAmount(total, 'ILS') : null;
    const dailyMinor = daily.trim() ? parseAmount(daily, 'ILS') : null;
    if ((total.trim() && totalMinor == null) || (daily.trim() && dailyMinor == null)) return setError(t('errors.invalid_amount'));
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        memberName: memberName.trim(),
        startDate: withDates ? isoDate(start) : null,
        endDate: withDates ? isoDate(end) : null,
        defaultCurrency: currency,
        // Days are counted in the timezone where the trip is created; editable later
        timezone: getCalendars()[0]?.timeZone ?? 'Asia/Bangkok',
        totalBudgetMinor: totalMinor,
        dailyBudgetMinor: dailyMinor,
        color: MEMBER_COLORS[0],
      });
      router.replace('/');
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/onboarding')} />
      </Row>
      <Text variant="title">{t('onboarding.create')}</Text>

      <Field label={t('onboarding.yourName')} value={memberName} onChangeText={setMemberName} placeholder={t('onboarding.yourNamePlaceholder')} maxLength={40} />
      <Field label={t('onboarding.tripName')} value={name} onChangeText={setName} placeholder={t('onboarding.tripNamePlaceholder')} maxLength={80} />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="h2">{t('onboarding.dates')}</Text>
          <Switch value={withDates} onValueChange={setWithDates} />
        </Row>
        {withDates ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text muted>{t('onboarding.startDate')}</Text>
              <DateField value={start} onChange={setStart} />
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text muted>{t('onboarding.endDate')}</Text>
              <DateField value={end} onChange={setEnd} minimumDate={start} />
            </Row>
          </>
        ) : null}
      </Card>

      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {t('onboarding.defaultCurrency')}
        </Text>
        <Pressable
          onPress={() => setPickCurrency(true)}
          style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}
        >
          <Text style={{ fontSize: 24 }}>{cur.flag}</Text>
          <Text style={{ flex: 1, fontWeight: '600' }}>
            {currencyName(cur, lang)} · {cur.code}
          </Text>
          <Text muted>{cur.symbol}</Text>
        </Pressable>
      </View>

      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <Field label={t('onboarding.totalBudget')} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder={t('common.optional')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('onboarding.dailyBudget')} value={daily} onChangeText={setDaily} keyboardType="decimal-pad" placeholder={t('common.optional')} />
        </View>
      </Row>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title={t('onboarding.createButton')} onPress={submit} loading={create.isPending} />

      <CurrencyPicker visible={pickCurrency} value={currency} onSelect={setCurrency} onClose={() => setPickCurrency(false)} />
    </Screen>
  );
}
