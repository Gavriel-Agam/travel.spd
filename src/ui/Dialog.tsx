// In-app dialog. React Native's Alert does nothing in a browser, and this app
// also runs as a home-screen web app, so every confirmation goes through here.
import { Modal, Pressable, View } from 'react-native';
import { create } from 'zustand';
import { radius, space, useColors } from '@/theme';
import { Text, tap } from './primitives';

export type DialogAction = { label: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type DialogState = { title: string; message?: string; actions: DialogAction[] } | null;

const useDialogStore = create<{ dialog: DialogState; set: (d: DialogState) => void }>((set) => ({
  dialog: null,
  set: (dialog) => set({ dialog }),
}));

export function showDialog(title: string, message?: string, actions: DialogAction[] = [{ label: 'OK' }]) {
  useDialogStore.getState().set({ title, message, actions });
}

/** Resolves true when the confirm action is chosen. */
export function confirmDialog(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  cancelLabel: string,
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) =>
    showDialog(title, message, [
      { label: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { label: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

/** Mount once at the root. */
export function DialogHost() {
  const c = useColors();
  const dialog = useDialogStore((s) => s.dialog);
  const set = useDialogStore((s) => s.set);
  const cancel = dialog?.actions.find((a) => a.style === 'cancel');

  const choose = (a?: DialogAction) => {
    set(null);
    a?.onPress?.();
  };

  return (
    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => choose(cancel)}>
      <Pressable
        onPress={() => cancel && choose(cancel)}
        style={{ flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl }}
      >
        <Pressable
          onPress={() => {}}
          style={{ width: '100%', maxWidth: 340, backgroundColor: c.card, borderRadius: radius.lg, padding: space.xl, gap: space.md }}
        >
          <Text variant="h2" center>
            {dialog?.title}
          </Text>
          {dialog?.message ? (
            <Text muted center>
              {dialog.message}
            </Text>
          ) : null}
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {dialog?.actions
              .slice()
              // Main action first, cancel last
              .sort((a, b) => (a.style === 'cancel' ? 1 : 0) - (b.style === 'cancel' ? 1 : 0))
              .map((a) => {
                const color = a.style === 'destructive' ? c.danger : a.style === 'cancel' ? c.textMuted : c.primary;
                const bg = a.style === 'destructive' ? c.dangerSoft : a.style === 'cancel' ? 'transparent' : c.primarySoft;
                return (
                  <Pressable
                    key={a.label}
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      choose(a);
                    }}
                    style={({ pressed }) => ({
                      height: 48,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: bg,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text variant="h2" color={color} style={{ fontSize: 16 }}>
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
