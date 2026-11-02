import type { TFunction } from 'i18next';
import type { BudgetStatus } from '@/lib/budget';
import { categoryLabel } from '@/lib/categories';
import { useT } from '@/i18n';
import { alertColor, useColors } from '@/theme';
import type { Category, Member } from '@/types/db';
import { Banner } from './primitives';

export function budgetName(s: BudgetStatus, t: TFunction, categories: Map<string, Category>, members: Map<string, Member>) {
  if (s.scope === 'total') return t('budget.total');
  if (s.scope === 'daily') return t('budget.daily');
  if (s.scope === 'category') return categoryLabel(categories.get(s.key), t);
  return t('budget.personalOf', { name: members.get(s.key)?.display_name ?? '' });
}

/** Banner for the most urgent budget alert. Both partners see the same one. */
export function BudgetAlertBanner({
  status,
  categories,
  members,
}: {
  status: BudgetStatus | null;
  categories: Map<string, Category>;
  members: Map<string, Member>;
}) {
  const { t } = useT();
  const c = useColors();
  if (!status || status.alert < 50) return null;
  const text =
    status.scope === 'total'
      ? t(`home.alert${status.alert}`)
      : status.alert >= 100
        ? t('budget.alertOver', { name: budgetName(status, t, categories, members) })
        : t('budget.alertScoped', { name: budgetName(status, t, categories, members), pct: Math.floor(status.pct) });
  return <Banner text={text} color={alertColor(c, status.alert)} icon={status.alert >= 90 ? 'warning' : 'information-circle'} />;
}
