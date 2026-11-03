import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Native: a plain container (the web version is a real <form> for password managers). */
export function AuthForm({ children }: { children: ReactNode; onSubmit: () => void }) {
  return <View style={{ gap: 12 }}>{children}</View>;
}

export function submitAuthForm(onSubmit: () => void) {
  onSubmit();
}
