import { createElement } from 'react';
import { useColors } from '@/theme';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Web preview: native HTML date/time inputs. */
export function DateField({
  value,
  onChange,
  mode = 'date',
}: {
  value: Date;
  onChange: (d: Date) => void;
  mode?: 'date' | 'time';
  minimumDate?: Date;
}) {
  const c = useColors();
  const str =
    mode === 'date'
      ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
      : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  return createElement('input', {
    type: mode,
    value: str,
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      if (!v) return;
      const d = new Date(value);
      if (mode === 'date') {
        const [y, m, day] = v.split('-').map(Number);
        d.setFullYear(y, m - 1, day);
      } else {
        const [h, min] = v.split(':').map(Number);
        d.setHours(h, min);
      }
      onChange(d);
    },
    style: {
      background: c.cardAlt,
      color: c.text,
      border: 'none',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 14,
      fontFamily: 'inherit',
    },
  });
}
