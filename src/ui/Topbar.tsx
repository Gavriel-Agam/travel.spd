import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, TextInput, View, type TextInputInstance, type ViewInstance } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n';
import { usePrefs } from '@/store/prefs';
import { radius, space, useColorMode, useColors } from '@/theme';
import { Dropdown, isRTL, type MenuItem } from './Dropdown';
import { Text, tap, useTextFieldDirection, type IconName } from './primitives';

const web = Platform.OS === 'web';

/** Height of every screen's top bar. */
export const TOPBAR_HEIGHT = 52;

/** A round icon control in the top bar: 44 × 44, the minimum touch target. */
export const TopbarIcon = forwardRef<
  ViewInstance,
  { icon: IconName; label: string; onPress: () => void; color?: string; expanded?: boolean; hasPopup?: boolean; children?: ReactNode }
>(function TopbarIcon({ icon, label, onPress, color, expanded, hasPopup, children }, ref) {
  const c = useColors();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      aria-expanded={expanded}
      aria-haspopup={hasPopup ? 'menu' : undefined}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.cardAlt : 'transparent',
      })}
    >
      <Ionicons name={icon} size={22} color={color ?? c.primary} />
      {children}
    </Pressable>
  );
});

/**
 * The top bar of every screen: back (on pushed screens), the title, then the
 * screen's own icons and, always last, the ⚙ menu with what this screen can
 * do. The same height, type and icon slots everywhere; in Hebrew the gear is
 * top left. `search` adds 🔍 beside the gear: it opens a search field that
 * grows out next to the title.
 */
export function Topbar({
  title,
  eyebrow,
  onBack,
  menu,
  menuLabel,
  badge,
  extra,
  search,
}: {
  title: string;
  /** A small line above the bar (Home's "Day 3"). */
  eyebrow?: string;
  onBack?: () => void;
  menu?: MenuItem[];
  menuLabel?: string;
  /** A coloured dot on the gear (a Smart import waiting). */
  badge?: string | null;
  /** Icons before the search and gear (invite, feedback). */
  extra?: ReactNode;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
}) {
  const c = useColors();
  const { t } = useT();
  const gearRef = useRef<ViewInstance | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const rtl = isRTL();

  return (
    <View>
      {eyebrow ? (
        <Text variant="caption" muted numberOfLines={1}>
          {eyebrow}
        </Text>
      ) : null}
      <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', height: TOPBAR_HEIGHT, gap: space.xs }}>
        {onBack ? <TopbarIcon icon={rtl ? 'arrow-forward' : 'arrow-back'} label={t('common.back')} onPress={onBack} color={c.text} /> : null}
        <SearchAndTitle title={title} search={search} />
        {extra}
        {menu?.length ? (
          <TopbarIcon ref={gearRef} icon="settings-outline" label={menuLabel ?? t('common.menu')} onPress={() => setMenuOpen(true)} expanded={menuOpen} hasPopup>
            {badge ? (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  end: 8,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: c.bg,
                  backgroundColor: badge,
                }}
              />
            ) : null}
          </TopbarIcon>
        ) : null}
      </View>
      {menu?.length ? <Dropdown anchor={gearRef} visible={menuOpen} onClose={() => setMenuOpen(false)} items={menu} label={menuLabel ?? t('common.menu')} /> : null}
    </View>
  );
}

/** The title, and (when the screen has search) the field that slides out beside it. */
function SearchAndTitle({ title, search }: { title: string; search?: { value: string; onChange: (v: string) => void; placeholder: string } }) {
  const c = useColors();
  const { t } = useT();
  const [open, setOpen] = useState(!!search?.value);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const input = useRef<TextInputInstance | null>(null);
  const dir = useTextFieldDirection(search?.value ?? '');
  const still = useReducedMotion();

  useEffect(() => {
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: still ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [open]);

  const title_ = (
    <Text variant="title" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">
      {title}
    </Text>
  );
  if (!search) return <View style={{ flex: 1, minWidth: 0 }}>{title_}</View>;

  const close = () => {
    search.onChange('');
    setOpen(false);
  };

  return (
    <>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
        {title_}
        {/* Grows from nothing to the room left beside the title; the spacer gives it back when closed */}
        <Animated.View
          style={{
            flexGrow: progress,
            flexBasis: 0,
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
            opacity: progress,
            marginStart: progress.interpolate({ inputRange: [0, 1], outputRange: [0, space.sm] }),
          }}
          pointerEvents={open ? 'auto' : 'none'}
          aria-hidden={!open}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: radius.md, backgroundColor: c.card, paddingHorizontal: space.sm, gap: 4 }}>
            <TextInput
              ref={input}
              value={search.value}
              onChangeText={search.onChange}
              placeholder={search.placeholder}
              placeholderTextColor={c.textMuted}
              accessibilityLabel={search.placeholder}
              returnKeyType="search"
              onKeyPress={(e) => {
                if (web && (e.nativeEvent as { key?: string }).key === 'Escape') close();
              }}
              {...(dir.dir ? ({ dir: dir.dir } as object) : null)}
              style={[{ flex: 1, minWidth: 0, height: 40, fontSize: 16, color: c.text }, dir.align, web ? ({ outlineStyle: 'none' } as object) : null]}
            />
          </View>
        </Animated.View>
        <Animated.View style={{ flexGrow: Animated.subtract(1, progress), flexBasis: 0 }} />
      </View>
      <TopbarIcon
        icon={open ? 'close' : 'search'}
        label={open ? t('common.closeSearch') : t('common.search')}
        expanded={open}
        onPress={() => {
          if (open) return close();
          setOpen(true);
          // Focus inside the tap itself: typing starts at once, and iPhone only opens the keyboard from a tap
          input.current?.focus();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- shared menu items

/** Light / dark: switches at once (the menu stays open to show it), remembered on this device. */
export function useThemeMenuItem(): MenuItem {
  const { t } = useT();
  const c = useColors();
  const mode = useColorMode();
  const setThemeMode = usePrefs((s) => s.setThemeMode);
  return {
    key: 'theme',
    icon: mode === 'dark' ? 'moon' : 'sunny-outline',
    label: t('home.menu.theme'),
    keepOpen: true,
    right: (
      <Text variant="caption" muted style={{ fontWeight: '700' }} color={c.textMuted}>
        {t(mode === 'dark' ? 'home.menu.dark' : 'home.menu.light')}
      </Text>
    ),
    onPress: () => setThemeMode(mode === 'dark' ? 'light' : 'dark'),
  };
}

/** Settings › Trip details, opened straight away. */
export function tripSettingsItem(t: (k: string) => string): MenuItem {
  return { key: 'tripSettings', icon: 'options-outline', label: t('menu.tripSettings'), onPress: () => router.push({ pathname: '/settings', params: { edit: 'trip' } }) };
}
