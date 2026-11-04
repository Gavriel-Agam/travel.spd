import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { View } from 'react-native';
import { useActiveTrip } from '@/api/queries';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import { useSignOut } from '@/hooks/useSignOut';
import { useAuth } from '@/providers/AuthProvider';
import { Button, Card, IconButton, Row, Screen, Text } from '@/ui/primitives';

export default function Onboarding() {
  const { t } = useT();
  const c = useColors();
  const { trip } = useActiveTrip();
  const email = useAuth().session?.user.email;
  const signOut = useSignOut();
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.lg }}>
      {trip ? (
        <View style={{ position: 'absolute', top: space.lg, start: space.lg }}>
          <IconButton name="close" onPress={() => goBack('/')} />
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
      {/* Before the first trip there is no Settings tab: signing out (e.g. wrong account) happens here */}
      {!trip ? (
        <View style={{ alignItems: 'center', marginTop: space.lg, gap: space.xs }}>
          {email ? (
            <Text variant="caption" muted center>
              {t('onboarding.signedInAs', { email })}
            </Text>
          ) : null}
          <Button title={t('settings.signOut')} variant="ghost" icon="log-out-outline" onPress={signOut} />
        </View>
      ) : null}
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
