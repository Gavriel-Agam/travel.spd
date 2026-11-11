import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, SectionList, View, type ScrollViewProps, type SectionListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeDuration, closesSheet } from '@/lib/sheetGesture';
import { radius, space, useColors } from '@/theme';
import { Text } from './primitives';

const web = Platform.OS === 'web';
const native = !web;

/** Lets the sheet know whether its list is scrolled to the top (only then does a downward drag move the sheet). */
const ScrollTop = createContext<((y: number) => void) | null>(null);

/** A SectionList inside a Sheet, with the same rule as SheetScrollView. */
export function SheetSectionList<T, S>({ onScroll, style, ...props }: SectionListProps<T, S>) {
  const report = useContext(ScrollTop);
  return (
    <SectionList
      scrollEventThrottle={16}
      {...props}
      style={[style, web ? ({ overscrollBehaviorY: 'contain' } as object) : null]}
      onScroll={(e) => {
        report?.(e.nativeEvent.contentOffset.y);
        onScroll?.(e);
      }}
    />
  );
}

/**
 * A scrolling list inside a Sheet. While it is scrolled down, dragging down
 * scrolls it as usual; at the top, dragging down pulls the sheet away.
 */
export function SheetScrollView({ onScroll, style, ...props }: ScrollViewProps) {
  const report = useContext(ScrollTop);
  return (
    <ScrollView
      scrollEventThrottle={16}
      {...props}
      // No rubber-band bounce at the top on iPhone: that drag belongs to the sheet
      style={[style, web ? ({ overscrollBehaviorY: 'contain' } as object) : null]}
      onScroll={(e) => {
        report?.(e.nativeEvent.contentOffset.y);
        onScroll?.(e);
      }}
    />
  );
}

/**
 * Bottom sheet built on Modal: reliable on iOS, Android and web. Drag it down
 * to close: a quick flick, or pulling it past about a third of its height,
 * closes it with a smooth slide; a short or slow drag springs back. The
 * handle and title always drag; the content drags when its list is at the top.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  height,
  scroll = true,
  dragContent = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  height?: number | `${number}%`;
  /** Scroll content taller than the sheet. Off for sheets that hold their own list (use SheetScrollView) or drag gestures. */
  scroll?: boolean;
  /** Off for sheets whose content has its own drag gestures (the handle and title still drag). */
  dragContent?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  const [sheetH, setSheetH] = useState(600);
  const live = useRef({ sheetH, onClose, dragContent, scrollY: 0, closing: false, active: false, offset: 0 });
  live.current.sheetH = sheetH;
  live.current.onClose = onClose;
  live.current.dragContent = dragContent;
  // After a drag closed it, the modal disappears at once (the sheet is already off screen)
  const [instantHide, setInstantHide] = useState(false);

  useEffect(() => {
    drag.setValue(0);
    if (visible) Object.assign(live.current, { scrollY: 0, closing: false, active: false });
  }, [visible]);

  const backdrop = useMemo(() => drag.interpolate({ inputRange: [0, Math.max(1, sheetH)], outputRange: [1, 0], extrapolate: 'clamp' }), [sheetH]);

  const pans = useMemo(() => {
    const settle = (vy: number) => {
      const L = live.current;
      L.active = false;
      const dy = L.offset;
      if (closesSheet(dy, vy, L.sheetH)) {
        L.closing = true;
        const to = L.sheetH + 40;
        // Carry on at about the finger's speed, but always quick
        const duration = closeDuration(dy, vy, to);
        Animated.timing(drag, { toValue: to, duration, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(() => {
          setInstantHide(true);
          L.onClose();
          setTimeout(() => setInstantHide(false), 400);
        });
      } else {
        Animated.spring(drag, { toValue: 0, useNativeDriver: native, speed: 20, bounciness: 0 }).start();
      }
    };
    const make = (fromContent: boolean) =>
      PanResponder.create({
        // Taps and sideways moves stay with the content; a downward drag is the sheet's
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          const L = live.current;
          if (L.closing) return false;
          if (fromContent && (!L.dragContent || L.scrollY > 0)) return false;
          return g.dy > 6 && g.dy > Math.abs(g.dx) * 1.2;
        },
        onPanResponderGrant: () => {
          drag.stopAnimation();
          live.current.active = true;
          live.current.offset = 0;
        },
        onPanResponderMove: (_e, g) => {
          // Upwards it barely moves (the sheet is already fully open)
          const dy = g.dy > 0 ? g.dy : g.dy / 6;
          live.current.offset = dy;
          drag.setValue(Math.max(-12, dy));
        },
        onPanResponderRelease: (_e, g) => settle(g.vy),
        onPanResponderTerminate: () => settle(0),
        onPanResponderTerminationRequest: () => false,
      });
    return { header: make(false), content: make(true) };
  }, []);

  // Web: while the sheet follows the finger, the page must not scroll or bounce underneath
  useEffect(() => {
    if (!web || !visible) return;
    const onMove = (e: TouchEvent) => live.current.active && e.cancelable && e.preventDefault();
    document.addEventListener('touchmove', onMove, { passive: false });
    return () => document.removeEventListener('touchmove', onMove);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType={instantHide ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, opacity: backdrop }}>
          <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setSheetH(Math.round(e.nativeEvent.layout.height))}
          {...pans.content.panHandlers}
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: insets.bottom + space.md,
            height,
            maxHeight: '92%',
            transform: [{ translateY: drag }],
          }}
        >
          <View {...pans.header.panHandlers} style={web ? ({ cursor: 'grab', touchAction: 'none' } as object) : undefined}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: title ? 0 : 8 }}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
            </View>
            {title ? (
              <Text variant="h2" center style={{ paddingVertical: space.md }}>
                {title}
              </Text>
            ) : null}
          </View>
          <ScrollTop.Provider value={(y) => (live.current.scrollY = y)}>
            {scroll ? (
              <SheetScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                {children}
              </SheetScrollView>
            ) : (
              children
            )}
          </ScrollTop.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
