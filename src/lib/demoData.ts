// Guest demo: a read-only sample trip that lives only on this device (never on
// the server). Amounts and shares are computed with the same functions as
// real expenses, so the screens behave exactly as they would for a real trip.
import type { TFunction } from 'i18next';
import builtIn from '@/data/categories.json';
import { convertToHomeMinor } from './money';
import { sharesFromEntries, type SplitType } from './split';
import { dayKey } from './stats';
import type { Budget, Category, Expense, Member, RatesSnapshot, Trip } from '@/types/db';

export const DEMO_TRIP_ID = 'demo-trip';
const TZ = 'Asia/Bangkok';
const NOA = 'demo-member-1';
const DAN = 'demo-member-2';

// Sample rates (₪ per 1 unit), fixed so the demo always shows the same numbers
const RATES: Record<string, string> = { ILS: '1', THB: '0.093', USD: '3.6', VND: '0.000122', EUR: '3.9' };

type Row = {
  day: number; // relative to the trip start
  hour: number;
  desc: string;
  amount: number; // in the currency's main unit
  currency: keyof typeof RATES;
  cat: string;
  payer: string | null; // null: joint money
  pay: 'cash' | 'card' | 'transfer';
  split?: SplitType;
  values?: Record<string, number>; // percent or amount splits
  personal?: string;
};

const ROWS: Row[] = [
  { day: -20, hour: 20, desc: '✈️ TLV ↔ BKK', amount: 4500, currency: 'ILS', cat: 'flights', payer: NOA, pay: 'card' },
  { day: -14, hour: 11, desc: 'Travel insurance', amount: 320, currency: 'ILS', cat: 'health', payer: DAN, pay: 'transfer' },
  { day: -1, hour: 21, desc: 'eSIM 15 GB', amount: 19, currency: 'USD', cat: 'other', payer: NOA, pay: 'card' },
  { day: 0, hour: 15, desc: 'Hotel Sukhumvit · 3 nights', amount: 4200, currency: 'THB', cat: 'accommodation', payer: null, pay: 'card' },
  { day: 0, hour: 13, desc: 'Airport taxi', amount: 450, currency: 'THB', cat: 'transportation', payer: NOA, pay: 'cash' },
  { day: 0, hour: 19, desc: 'Pad thai', amount: 180, currency: 'THB', cat: 'street_food', payer: DAN, pay: 'cash' },
  { day: 1, hour: 10, desc: 'Grand Palace', amount: 1000, currency: 'THB', cat: 'activities', payer: NOA, pay: 'card' },
  { day: 1, hour: 20, desc: 'Riverside dinner', amount: 1650, currency: 'THB', cat: 'restaurants', payer: DAN, pay: 'card', split: 'percent', values: { [NOA]: 60, [DAN]: 40 } },
  { day: 1, hour: 22, desc: '7-Eleven', amount: 245, currency: 'THB', cat: 'groceries', payer: null, pay: 'cash' },
  { day: 2, hour: 16, desc: 'Thai massage', amount: 800, currency: 'THB', cat: 'health', payer: NOA, pay: 'cash', split: 'personal', personal: DAN },
  { day: 2, hour: 19, desc: 'Night market', amount: 1320, currency: 'THB', cat: 'shopping', payer: DAN, pay: 'cash', split: 'personal', personal: DAN },
  { day: 2, hour: 23, desc: 'Rooftop bar', amount: 1100, currency: 'THB', cat: 'nightlife', payer: NOA, pay: 'card' },
  { day: 3, hour: 9, desc: '✈️ BKK → HAN', amount: 140, currency: 'USD', cat: 'flights', payer: DAN, pay: 'card' },
  { day: 3, hour: 13, desc: 'Phở', amount: 120000, currency: 'VND', cat: 'street_food', payer: NOA, pay: 'cash' },
  { day: 3, hour: 15, desc: 'Old Quarter hotel · 3 nights', amount: 186, currency: 'EUR', cat: 'accommodation', payer: null, pay: 'card' },
  { day: 4, hour: 8, desc: 'Ha Long Bay cruise', amount: 2400000, currency: 'VND', cat: 'activities', payer: DAN, pay: 'card', split: 'treat' },
  { day: 4, hour: 18, desc: 'Grab rides', amount: 185000, currency: 'VND', cat: 'transportation', payer: NOA, pay: 'card' },
  { day: 5, hour: 9, desc: 'Egg coffee', amount: 90000, currency: 'VND', cat: 'restaurants', payer: DAN, pay: 'cash', split: 'amount', values: { [NOA]: 40000, [DAN]: 50000 } },
];

const MINOR: Record<string, number> = { ILS: 2, THB: 2, USD: 2, VND: 0, EUR: 2 };

function addDays(day: string, n: number) {
  return new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Midday-ish instant on a trip day, in Bangkok time (UTC+7). */
function at(day: string, hour: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour - 7) * 3600_000).toISOString();
}

export function buildDemo(t: TFunction, now = new Date()) {
  const today = dayKey(now, TZ);
  const start = addDays(today, -5);
  const trip: Trip = {
    id: DEMO_TRIP_ID,
    name: t('demo.tripName'),
    start_date: start,
    end_date: addDays(start, 13),
    home_currency: 'ILS',
    default_currency: 'THB',
    timezone: TZ,
    shared: false,
    created_by: 'demo-user-1',
    created_at: at(addDays(start, -21), 12),
  };
  const members: Member[] = [
    { id: NOA, trip_id: DEMO_TRIP_ID, user_id: 'demo-user-1', display_name: t('demo.partner1'), color: '#3366FF', role: 'owner', joined_at: trip.created_at },
    { id: DAN, trip_id: DEMO_TRIP_ID, user_id: 'demo-user-2', display_name: t('demo.partner2'), color: '#FF4D88', role: 'member', joined_at: trip.created_at },
  ];
  const categories: Category[] = builtIn.map((c, i) => ({
    id: `demo-cat-${c.key}`,
    trip_id: null,
    key: c.key,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sort_order: (i + 1) * 10,
    archived: false,
  }));

  const expense = (r: Row, i: number): Expense => {
    const amountMinor = Math.round(r.amount * 10 ** MINOR[r.currency]);
    const rate = RATES[r.currency];
    const home = convertToHomeMinor(amountMinor, r.currency, rate);
    const type: SplitType = r.split ?? 'equal';
    const entries =
      type === 'equal'
        ? [{ member_id: NOA }, { member_id: DAN }]
        : type === 'treat'
          ? [{ member_id: r.payer! }] // treats always have a payer
          : type === 'personal'
            ? [{ member_id: r.personal! }]
            : Object.entries(r.values!).map(([member_id, v]) => ({
                member_id,
                value: type === 'amount' ? Math.round(v * 10 ** MINOR[r.currency]) : v,
              }));
    const shares = sharesFromEntries(type, entries, r.payer, home);
    const day = addDays(start, r.day);
    const id = `demo-expense-${i}`;
    return {
      id,
      trip_id: DEMO_TRIP_ID,
      kind: 'expense',
      created_by: r.payer === DAN ? 'demo-user-2' : 'demo-user-1',
      updated_by: r.payer === DAN ? 'demo-user-2' : 'demo-user-1',
      paid_by_member_id: r.payer,
      amount_minor: amountMinor,
      currency: r.currency,
      fx_rate: rate,
      fx_source: r.currency === 'ILS' ? 'par' : 'demo',
      fx_rate_date: day,
      fx_fetched_at: null,
      fx_is_manual: false,
      amount_ils_minor: home,
      category_id: `demo-cat-${r.cat}`,
      description: r.desc,
      notes: null,
      occurred_at: at(day, r.hour),
      receipt_path: null,
      payment_method: r.pay,
      split_type: type,
      version: 1,
      created_at: at(day, r.hour),
      updated_at: at(day, r.hour),
      deleted_at: null,
      expense_splits: shares.map((s) => ({
        expense_id: id,
        member_id: s.memberId,
        weight: '1',
        share_pct: type === 'percent' ? String(r.values![s.memberId]) : null,
        share_original_minor: null,
        share_ils_minor: s.share,
      })),
    };
  };

  const expenses = ROWS.map(expense);
  // Dan paid Noa back 200 ₪ halfway through
  const settleDay = addDays(start, 3);
  expenses.push({
    ...expenses[0],
    id: 'demo-settlement',
    kind: 'settlement',
    paid_by_member_id: DAN,
    created_by: 'demo-user-2',
    updated_by: 'demo-user-2',
    amount_minor: 20000,
    currency: 'ILS',
    fx_rate: '1',
    fx_source: 'par',
    amount_ils_minor: 20000,
    category_id: null,
    description: '',
    occurred_at: at(settleDay, 21),
    payment_method: 'transfer',
    split_type: 'personal',
    expense_splits: [{ expense_id: 'demo-settlement', member_id: NOA, weight: '1', share_pct: null, share_original_minor: null, share_ils_minor: 20000 }],
  });
  expenses.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  const budgets: Budget[] = [
    { id: 'demo-b1', trip_id: DEMO_TRIP_ID, scope: 'total', category_id: null, member_id: null, amount_ils_minor: 1_800_000 },
    { id: 'demo-b2', trip_id: DEMO_TRIP_ID, scope: 'daily', category_id: null, member_id: null, amount_ils_minor: 90_000 },
    { id: 'demo-b3', trip_id: DEMO_TRIP_ID, scope: 'category', category_id: 'demo-cat-restaurants', member_id: null, amount_ils_minor: 150_000 },
  ];

  const rates: RatesSnapshot = {
    requested_date: today,
    fetched_at: now.toISOString(),
    rates: Object.fromEntries(Object.entries(RATES).map(([code, rate]) => [code, { rate, date: today, source: code === 'ILS' ? 'par' : 'demo' }])),
  };

  return { trip, members, categories, expenses, budgets, rates, today };
}
