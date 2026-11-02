import type { SplitType } from '@/lib/split';

export type Trip = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  home_currency: string;
  default_currency: string;
  timezone: string;
  created_by: string;
  created_at: string;
};

export type Member = {
  id: string;
  trip_id: string;
  user_id: string;
  display_name: string;
  color: string;
  role: 'owner' | 'member';
  joined_at: string;
};

export type Category = {
  id: string;
  trip_id: string | null;
  key: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  archived: boolean;
};

export type ExpenseSplit = {
  expense_id: string;
  member_id: string;
  weight: string;
  share_pct: string | null;
  share_original_minor: number | null;
  share_ils_minor: number;
};

export type Expense = {
  id: string;
  trip_id: string;
  kind: 'expense' | 'settlement';
  created_by: string;
  updated_by: string;
  paid_by_member_id: string;
  amount_minor: number;
  currency: string;
  fx_rate: string;
  fx_source: string;
  fx_rate_date: string | null;
  fx_fetched_at: string | null;
  fx_is_manual: boolean;
  amount_ils_minor: number;
  category_id: string | null;
  description: string;
  notes: string | null;
  occurred_at: string;
  receipt_path: string | null;
  payment_method: 'cash' | 'card' | 'transfer' | 'other' | null;
  split_type: SplitType;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  expense_splits: ExpenseSplit[];
};

export type Budget = {
  id: string;
  trip_id: string;
  scope: 'total' | 'daily' | 'category' | 'member';
  category_id: string | null;
  member_id: string | null;
  amount_ils_minor: number;
};

/** One published rate: home currency per 1 unit, with its own date and source. */
export type RateEntry = { rate: string; date: string; source: string };

export type RatesSnapshot = {
  requested_date: string;
  fetched_at: string | null;
  rates: Record<string, RateEntry>;
};
