import Ionicons from '@expo/vector-icons/Ionicons';
import { primeKeyboard } from '@/lib/keyboardPrimer';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import { useExitDemo } from '@/hooks/useExitDemo';
import { readableOn } from '@/lib/contrast';
import { blockedInDemo } from '@/lib/demoPrompt';
import { useIsDemo } from '@/store/prefs';
import { useTabTap } from '@/store/tabTap';
import { Text, type IconName } from '@/ui/primitives';
import { VoiceCard } from '@/ui/VoiceCard';
import { VoiceBar } from '@/ui/VoiceRecorder';
import { SpeedDial } from '@/ui/SpeedDial';
import { useState } from 'react';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home-outline', 'home'],
  expenses: ['receipt-outline', 'receipt'],
  stats: ['pie-chart-outline', 'pie-chart'],
  settings: ['settings-outline', 'settings'],
};

function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const demo = useIsDemo();
  const exitDemo = useExitDemo();
  const qc = useQueryClient();
  const onWarning = readableOn(c.warning);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [dial, setDial] = useState(false);
  return (
    <View>
      {/* Voice: the confirmation card (hidden while the voice bar is open) */}
      <VoiceCard hidden={voiceOpen} />
      {demo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.warning, paddingHorizontal: space.lg, paddingVertical: 8 }}>
          <Ionicons name="eye-outline" size={16} color={onWarning} />
          <Text variant="caption" color={onWarning} style={{ flex: 1, fontWeight: '700' }} numberOfLines={2}>
            {t('demo.banner')}
          </Text>
          <Pressable accessibilityRole="button" onPress={exitDemo} style={{ backgroundColor: onWarning, borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', marginVertical: -4 }}>
            <Text variant="caption" color={c.warning} style={{ fontWeight: '700' }}>
              {t('demo.exit')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderTopWidth: 0.5,
          borderTopColor: c.border,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        }}
      >
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { options } = descriptors[route.key];
          const [off, on] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          const color = focused ? c.primary : c.textFaint;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (event.defaultPrevented) return;
                // Already here: back to the top of this screen
                if (focused) useTabTap.getState().tap(route.name);
                else navigateToTab(route.key);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 44 }}
            >
              <Ionicons name={focused ? on : off} size={24} color={color} />
              <Text variant="caption" color={color} style={{ fontSize: 11 }} numberOfLines={1}>
                {String(options.title ?? route.name)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* + opens a small menu (type it or say it) over a dimmed screen */}
      <SpeedDial
        open={dial}
        hidden={voiceOpen}
        onToggle={(open) => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          if (open && blockedInDemo(qc)) return;
          setDial(open);
        }}
        onType={() => {
          setDial(false);
          primeKeyboard();
          router.push('/expense/new');
        }}
        onVoice={() => {
          setDial(false);
          setVoiceOpen(true);
        }}
      />
      {voiceOpen ? <VoiceBar onClose={() => setVoiceOpen(false)} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useT();
  const c = useColors();
  return (
    // Each tab's container is painted in the app background, so a tab opened for
    // the first time never flashes white before it draws
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="expenses" options={{ title: t('tabs.expenses') }} />
      <Tabs.Screen name="stats" options={{ title: t('tabs.stats') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
    </Tabs>
  );
}
