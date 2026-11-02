import { useT } from '@/i18n';
import { EmptyState, Screen } from '@/ui/primitives';

export default function SetupRequired() {
  const { t } = useT();
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState emoji="🔌" title={t('setup.title')} body={t('setup.body')} />
    </Screen>
  );
}
