import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { useT } from '@/i18n';
import { radius, useColors } from '@/theme';
import { Text } from './primitives';

/** Date or time chooser. iOS shows the compact native control; Android opens the system dialog. */
export function DateField({
  value,
  onChange,
  mode = 'date',
  minimumDate,
}: {
  value: Date;
  onChange: (d: Date) => void;
  mode?: 'date' | 'time';
  minimumDate?: Date;
}) {
  const c = useColors();
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        locale={locale}
        minimumDate={minimumDate}
        onValueChange={(_e, d) => onChange(d)}
      />
    );
  }

  const label =
    mode === 'date'
      ? value.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      : value.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ backgroundColor: c.cardAlt, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Text variant="label">{label}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value}
          mode={mode}
          minimumDate={minimumDate}
          onValueChange={(_e, d) => {
            setOpen(false);
            onChange(d);
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
