import { create } from 'zustand';

/**
 * The feedback panel (not saved): open or closed, whether it was already shown
 * this session (it opens by itself once per app start), and a counter the bell
 * watches to give a little nudge when the panel collapses into it.
 */
type FeedbackState = {
  open: boolean;
  shownThisSession: boolean;
  nudge: number;
  setOpen: (open: boolean) => void;
  markShown: () => void;
  nudgeBell: () => void;
};

export const useFeedback = create<FeedbackState>((set) => ({
  open: false,
  shownThisSession: false,
  nudge: 0,
  setOpen: (open) => set({ open }),
  markShown: () => set({ shownThisSession: true }),
  nudgeBell: () => set((s) => ({ nudge: s.nudge + 1 })),
}));

/** The bell on screen, so the panel knows where to collapse to. */
export const bellNode: { current: unknown } = { current: null };
