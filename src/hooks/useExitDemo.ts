import { useQueryClient } from '@tanstack/react-query';
import { leaveDemo } from '@/lib/demoPrompt';

/** Leaves the guest demo: forgets the sample trip and returns to sign-in. */
export function useExitDemo() {
  const qc = useQueryClient();
  return () => leaveDemo(qc);
}
