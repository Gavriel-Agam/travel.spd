import { useLocalSearchParams } from 'expo-router';
import { SETTINGS_SECTIONS, SettingsScreen, type SettingsSection } from '@/ui/SettingsScreen';

/** One settings category on its own page (opened from the Settings tab). */
export default function SettingsSectionPage() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const known = SETTINGS_SECTIONS.includes(section as SettingsSection) ? (section as SettingsSection) : undefined;
  return <SettingsScreen section={known} />;
}
