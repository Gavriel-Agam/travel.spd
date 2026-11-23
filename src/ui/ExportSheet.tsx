import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { countryName } from '@/lib/countries';
import { buildExportTable, dayIn, exportFileName, tableLines, toCsv, toTsv, type ExportTable } from '@/lib/exportExpenses';
import { logError } from '@/lib/log';
import { paymentLabel } from '@/lib/payments';
import { radius, space, useColors } from '@/theme';
import { Sheet } from './Sheet';
import { Row, Text, tap, type IconName } from './primitives';

type Format = 'xlsx' | 'csv' | 'sheets';

/** Saves a file from the browser (the app ships as a web app). */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** An Excel file of the table: summary on top, then the expenses; right to left in Hebrew. */
async function xlsxBlob(table: ExportTable, rtl: boolean, sheetName: string) {
  const XLSX = await import('xlsx');
  const lines = tableLines(table);
  const ws = XLSX.utils.aoa_to_sheet(lines);
  ws['!cols'] = table.columns.map((_, i) => ({ wch: i === 1 || i === 8 ? 28 : i === 10 ? 22 : 14 }));
  // Amounts with two decimals
  const first = table.summary.length + 2;
  for (let r = first; r < lines.length; r++)
    for (const col of [3, 5]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
    }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'SmartTrip');
  if (rtl) wb.Workbook = { Views: [{ RTL: true }] };
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export the trip's expenses (gear menu › Export data): Excel, CSV, or Google
 * Sheets (the table is copied, a new sheet opens, paste). A summary block on
 * top, then one row per expense with its home amount, payer, split, tax-free
 * and place.
 */
export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t, lang } = useT();
  const { trip, expenses, memberById, categoryById } = useTripData();
  const [busy, setBusy] = useState<Format | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const web = Platform.OS === 'web' && typeof document !== 'undefined';

  if (!trip) return null;

  const table = () =>
    buildExportTable(expenses, {
      tripName: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
      countries: trip.countries ?? [],
      timeZone: trip.timezone,
      now: new Date(),
      labels: {
        col: (k) => t(`export.cols.${k}`),
        sum: (k) => t(`export.summary.${k}`),
        yes: t('common.yes'),
        no: t('common.no'),
        joint: t('details.jointMoney'),
        split: (type) => t(`export.split.${type}`),
        category: (id) => categoryLabel(id ? categoryById.get(id) : undefined, t),
        member: (id) => (id ? memberById.get(id)?.display_name ?? '?' : ''),
        payment: (k) => paymentLabel(k, t),
        country: (code) => countryName(code, lang),
        settlementTitle: (to) => t('settle.rowTitle', { name: to }),
      },
    });

  async function run(f: Format) {
    if (busy) return;
    tap();
    setBusy(f);
    setDone(null);
    try {
      const tb = table();
      const day = dayIn(new Date().toISOString(), trip!.timezone);
      if (f === 'csv') {
        download(new Blob([toCsv(tb)], { type: 'text/csv;charset=utf-8' }), exportFileName(trip!.name, day, 'csv'));
        setDone(t('export.doneFile'));
      } else if (f === 'xlsx') {
        download(await xlsxBlob(tb, lang === 'he', trip!.name), exportFileName(trip!.name, day, 'xlsx'));
        setDone(t('export.doneFile'));
      } else {
        await Clipboard.setStringAsync(toTsv(tb));
        setDone(t('export.doneSheets'));
        Linking.openURL('https://sheets.new');
      }
    } catch (e) {
      logError(e, 'export');
      setDone(t('export.failed'));
    } finally {
      setBusy(null);
    }
  }

  const count = expenses.filter((e) => !e.deleted_at && e.review_status !== 'pending_review' && e.pending_op !== 'delete').length;
  const options: { key: Format; icon: IconName; title: string; body: string }[] = [
    { key: 'xlsx', icon: 'grid-outline', title: t('export.xlsx'), body: t('export.xlsxBody') },
    { key: 'csv', icon: 'document-text-outline', title: t('export.csv'), body: t('export.csvBody') },
    { key: 'sheets', icon: 'logo-google', title: t('export.sheets'), body: t('export.sheetsBody') },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={t('export.title')}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <Text variant="caption" muted>
          {t('export.hint', { count })}
        </Text>
        {options.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ busy: busy === o.key, disabled: !web || count === 0 }}
            disabled={!web || count === 0 || !!busy}
            onPress={() => void run(o.key)}
            style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.cardAlt : c.card, borderWidth: 1, borderColor: c.border, opacity: !web || count === 0 ? 0.5 : 1 })}
          >
            <Row gap={space.md}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={o.icon} size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700' }}>{o.title}</Text>
                <Text variant="caption" muted>
                  {o.body}
                </Text>
              </View>
              {busy === o.key ? <Ionicons name="hourglass-outline" size={18} color={c.textMuted} /> : <Ionicons name="download-outline" size={18} color={c.textMuted} />}
            </Row>
          </Pressable>
        ))}
        {done ? (
          <Text variant="caption" color={done === t('export.failed') ? c.danger : c.success} style={{ fontWeight: '600' }} accessibilityLiveRegion="polite">
            {done}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
