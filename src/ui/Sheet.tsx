import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, useColors } from '@/theme';
import { Text } from './primitives';

/** Bottom sheet built on Modal: reliable on iOS, Android and web. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  height,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  height?: number | `${number}%`;
  /** Scroll content taller than the sheet. Off for sheets that hold their own list or drag gestures. */
  scroll?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: insets.bottom + space.md,
            height,
            maxHeight: '92%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
          </View>
          {title ? (
            <Text variant="h2" center style={{ paddingVertical: space.md }}>
              {title}
            </Text>
          ) : null}
          {scroll ? (
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
