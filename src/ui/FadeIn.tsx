import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Fades its content in when it first appears (a section that opens, a form
 * that follows a choice). Built on React Native's own Animated so the web app
 * doesn't need a separate animation library.
 */
export function FadeIn({ children, duration = 200, style }: { children: ReactNode; duration?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: Platform.OS !== 'web' }).start();
  }, []);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
