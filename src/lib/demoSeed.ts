import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { keys } from '@/api/queries';
import { buildDemo, DEMO_TRIP_ID } from './demoData';

/** Puts the demo trip into the query cache; the demo turns off all fetching. */
export function seedDemo(qc: QueryClient, t: TFunction) {
  const d = buildDemo(t);
  qc.setQueryData(keys.trips, [d.trip]);
  qc.setQueryData(keys.members(DEMO_TRIP_ID), d.members);
  qc.setQueryData(keys.categories(DEMO_TRIP_ID), d.categories);
  qc.setQueryData(keys.expenses(DEMO_TRIP_ID), d.expenses);
  qc.setQueryData(keys.budgets(DEMO_TRIP_ID), d.budgets);
  qc.setQueryData(keys.rates(d.today), d.rates);
}
