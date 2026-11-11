import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** Phone app: the root that native gestures need (the web app uses GestureRoot.web.tsx). */
export function GestureRoot({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}
