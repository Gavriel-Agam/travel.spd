// The active trip's look (accent colour, cover photo URL), set by the app layout
// so every screen and component picks it up through useColors / Screen.
import { create } from 'zustand';

type TripLook = {
  theme: string | null;
  coverUrl: string | null;
  setLook: (look: { theme: string | null; coverUrl: string | null }) => void;
};

export const useTripLook = create<TripLook>((set) => ({
  theme: null,
  coverUrl: null,
  setLook: ({ theme, coverUrl }) => set({ theme, coverUrl }),
}));
