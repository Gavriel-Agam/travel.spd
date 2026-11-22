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
 * top left. `search` adds 🔍 right next to the gear (one group): tapping it
 * opens a search field across the whole top row, growing out from the 🔍
 * (from the left in Hebrew), and moves the title and the gear to a second row
 * under it. ✕ in the field (or Escape) clears it and folds back to one row.
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
  const [searchOpen, setSearchOpen] = useState(!!search?.value);
  const input = useRef<TextInputInstance | null>(null);

  const gear = menu?.length ? (
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
  ) : null;

  return (
    <View>
      {eyebrow ? (
        <Text variant="caption" muted numberOfLines={1}>
          {eyebrow}
        </Text>
      ) : null}
      {search ? (
        <SearchRow
          open={searchOpen}
          search={search}
          input={input}
          onClose={() => {
            search.onChange('');
            setSearchOpen(false);
          }}
        />
      ) : null}
      <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', height: TOPBAR_HEIGHT, gap: space.xs }}>
        {onBack ? <TopbarIcon icon={rtl ? 'arrow-forward' : 'arrow-back'} label={t('common.back')} onPress={onBack} color={c.text} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {extra}
        {/* 🔍 and ⚙ as one tight group (their 44 pt touch areas overlap a little, not their icons) */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {search && !searchOpen ? (
            <TopbarIcon
              icon="search"
              label={t('common.search')}
              expanded={false}
              onPress={() => {
                setSearchOpen(true);
                // Focus inside the tap itself: typing starts at once, and iPhone only opens the keyboard from a tap
                input.current?.focus();
              }}
            />
          ) : null}
          {gear ? <View style={search && !searchOpen ? { marginStart: -10 } : null}>{gear}</View> : null}
        </View>
      </View>
      {menu?.length ? <Dropdown anchor={gearRef} visible={menuOpen} onClose={() => setMenuOpen(false)} items={menu} label={menuLabel ?? t('common.menu')} /> : null}
    </View>
  );
}

/**
 * The search field's own row above the title. Opening: the row makes room
 * (height) while the field grows across it from the 🔍 side, its left edge in
 * Hebrew and its right edge in English. Closing runs the same in reverse.
 * Always mounted, so a tap on 🔍 can focus it at once.
 */
function SearchRow({
  open,
  search,
  input,
  onClose,
}: {
  open: boolean;
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  input: React.RefObject<TextInputInstance | null>;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const dir = useTextFieldDirection(search.value);
  const still = useReducedMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  // Opening shows the row at once (so the field can take the focus); closing hides it after the animation
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: still ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished && !open) setShown(false);
    });
  }, [open]);

  return (
    <Animated.View
      style={{
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, TOPBAR_HEIGHT] }),
        justifyContent: 'center',
        // The 🔍 is at the row's end: the left in Hebrew, the right in English
        alignItems: 'flex-end',
        overflow: 'hidden',
      }}
      pointerEvents={open ? 'auto' : 'none'}
      // Hidden from screen readers while closed (and skipped by Tab: tabIndex below)
      aria-hidden={!shown}
    >
      <Animated.View
        style={{
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          opacity: progress,
          flexDirection: 'row',
          alignItems: 'center',
          height: 44,
          borderRadius: radius.md,
          backgroundColor: c.card,
          paddingStart: space.md,
          gap: 4,
        }}
      >
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          ref={input}
          value={search.value}
          onChangeText={search.onChange}
          placeholder={search.placeholder}
          placeholderTextColor={c.textMuted}
          accessibilityLabel={search.placeholder}
          returnKeyType="search"
          onKeyPress={(e) => {
            if (web && (e.nativeEvent as { key?: string }).key === 'Escape') onClose();
          }}
          {...(dir.dir ? ({ dir: dir.dir } as object) : null)}
          {...(web && !open ? ({ tabIndex: -1 } as object) : null)}
          style={[{ flex: 1, minWidth: 0, height: 44, fontSize: 16, color: c.text }, dir.align, web ? ({ outlineStyle: 'none' } as object) : null]}
        />
        <TopbarIcon icon="close" label={t('common.closeSearch')} expanded onPress={onClose} color={c.textMuted} />
      </Animated.View>
    </Animated.View>
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

/** Settings › Trip settings, opened straight away. */
export function tripSettingsItem(t: (k: string) => string): MenuItem {
  return { key: 'tripSettings', icon: 'options-outline', label: t('menu.tripSettings'), onPress: () => router.push({ pathname: '/settings', params: { edit: 'trip' } }) };
}

/** The trip checklist (to pack, to buy / do, what I brought). */
export function checklistItem(t: (k: string) => string): MenuItem {
  return { key: 'checklist', icon: 'checkbox-outline', label: t('menu.checklist'), onPress: () => router.push('/checklist') };
}
