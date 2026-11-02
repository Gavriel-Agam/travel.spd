import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useActiveTrip } from '@/api/queries';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import { Card, IconButton, Row, Screen, Text } from '@/ui/primitives';

export default function Onboarding() {
  const { t } = useT();
  const c = useColors();
  const { trip } = useActiveTrip();
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.lg }}>
      {trip ? (
        <View style={{ position: 'absolute', top: space.lg, start: space.lg }}>
          <IconButton name="close" onPress={() => router.back()} />
        </View>
      ) : null}
      <View style={{ gap: space.sm, marginBottom: space.md }}>
        <Text style={{ fontSize: 44 }}>🌴</Text>
        <Text variant="title">{t('onboarding.welcome')}</Text>
        <Text muted>{t('onboarding.subtitle')}</Text>
      </View>
      <Option
        icon="add-circle"
        color={c.primary}
        title={t('onboarding.create')}
        hint={t('onboarding.createHint')}
        onPress={() => router.push('/onboarding/create')}
      />
      <Option
        icon="people"
        color="#FF4D88"
        title={t('onboarding.join')}
        hint={t('onboarding.joinHint')}
        onPress={() => router.push('/onboarding/join')}
      />
    </Screen>
  );
}

function Option({ icon, color, title, hint, onPress }: {
  icon: 'add-circle' | 'people';
  color: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <Row gap={space.md}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: color + '1F', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={26} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2">{title}</Text>
          <Text variant="caption" muted>
            {hint}
          </Text>
        </View>
      </Row>
    </Card>
  );
}
