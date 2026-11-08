import { Ionicons } from '@expo/vector-icons';
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
import { Text, type IconName } from '@/ui/primitives';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home-outline', 'home'],
  expenses: ['receipt-outline', 'receipt'],
  budget: ['wallet-outline', 'wallet'],
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
  return (
    <View>
      {/* Floating add button, always one tap away */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          if (blockedInDemo(qc)) return;
          router.push('/expense/new');
        }}
        style={({ pressed }) => ({
          position: 'absolute',
          end: space.lg,
          top: -76,
          width: 62,
          height: 62,
          borderRadius: 31,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: c.primary,
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <Ionicons name="add" size={34} color={c.primaryText} />
      </Pressable>
      {demo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.warning, paddingHorizontal: space.lg, paddingVertical: 8 }}>
          <Ionicons name="eye-outline" size={16} color={onWarning} />
          <Text variant="caption" color={onWarning} style={{ flex: 1, fontWeight: '700' }} numberOfLines={2}>
            {t('demo.banner')}
          </Text>
          <Pressable accessibilityRole="button" onPress={exitDemo} hitSlop={8} style={{ backgroundColor: onWarning, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text variant="caption" color={c.warning} style={{ fontWeight: '700' }}>
              {t('demo.exit')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
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
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 2 }}
            >
              <Ionicons name={focused ? on : off} size={24} color={color} />
              <Text variant="caption" color={color} style={{ fontSize: 11 }} numberOfLines={1}>
                {String(options.title ?? route.name)}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
      <Tabs.Screen name="budget" options={{ title: t('tabs.budget') }} />
      <Tabs.Screen name="stats" options={{ title: t('tabs.stats') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
    </Tabs>
  );
}
