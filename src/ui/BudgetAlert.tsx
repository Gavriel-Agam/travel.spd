import type { TFunction } from 'i18next';
import type { BudgetStatus } from '@/lib/budget';
import { categoryLabel } from '@/lib/categories';
import { useT } from '@/i18n';
import { alertColor, useColors } from '@/theme';
import type { Category, Member } from '@/types/db';
import { usePrefs } from '@/store/prefs';
import { Banner } from './primitives';

export function budgetName(s: BudgetStatus, t: TFunction, categories: Map<string, Category>, members: Map<string, Member>) {
  if (s.scope === 'total') return t('budget.total');
  if (s.scope === 'daily') return t('budget.daily');
  if (s.scope === 'category') return categoryLabel(categories.get(s.key), t);
  return t('budget.personalOf', { name: members.get(s.key)?.display_name ?? '' });
}

/** Which alert a × closes: the budget and its level, so a later, higher one still shows. */
export const alertKey = (s: BudgetStatus) => `${s.scope}:${s.key}:${s.alert}`;

/** Banner for the most urgent budget alert. Both partners see the same one; × closes it for good on this device for this trip. */
export function BudgetAlertBanner({
  tripId,
  status,
  categories,
  members,
}: {
  tripId?: string;
  status: BudgetStatus | null;
  categories: Map<string, Category>;
  members: Map<string, Member>;
}) {
  const { t } = useT();
  const c = useColors();
  const dismissed = usePrefs((s) => (tripId ? s.dismissedAlerts[tripId] : undefined));
  const dismiss = usePrefs((s) => s.dismissAlert);
  if (!status || status.alert < 50) return null;
  if (dismissed?.includes(alertKey(status))) return null;
  const text =
    status.scope === 'total'
      ? t(`home.alert${status.alert}`)
      : status.alert >= 100
        ? t('budget.alertOver', { name: budgetName(status, t, categories, members) })
        : t('budget.alertScoped', { name: budgetName(status, t, categories, members), pct: Math.floor(status.pct) });
  return (
    <Banner
      text={text}
      color={alertColor(c, status.alert)}
      icon={status.alert >= 90 ? 'warning' : 'information-circle'}
      onClose={tripId ? () => dismiss(tripId, alertKey(status)) : undefined}
      closeLabel={t('common.close')}
    />
  );
}
