import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Web app: a plain full-screen view. Gestures on the web use React Native's
 * own responder system, so the gesture library (about 270 KB of script that
 * every launch would have to load) stays out of the web bundle.
 */
export function GestureRoot({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
