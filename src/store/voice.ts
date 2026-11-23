// Voice expenses on this device: recordings not saved yet (being read, waiting
// for a connection, waiting for an amount, or failed), and the confirmation
// card of the last one saved. A recording made offline is kept here until it
// is sent, then dropped; the audio is never kept after that.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { persistStorage } from '@/lib/deviceStorage';
import type { StoredSplit, VoiceDraft } from '@/lib/voice';

export type VoiceCaptureStatus = 'queued_offline' | 'processing' | 'needs_amount' | 'failed';

export type VoiceCapture = {
  /** Also the client_id sent to voice-parse (a retry gets the same answer). */
  id: string;
  tripId: string;
  createdAt: string;
  status: VoiceCaptureStatus;
  /** Base64 audio, only while it still has to be sent. */
  audio?: { mime: string; data: string };
  text?: string;
  durationMs?: number;
  transcript?: string;
  /** needs_amount: what was heard, waiting for the amount. */
  draft?: VoiceDraft;
  /** failed: an error code (parse_failed, RATE_LIMIT_EXCEEDED, no_rate, ...). */
  error?: string;
  /** Where it was recorded (0028), when known. */
  place?: { lat: number; lng: number; name: string | null } | null;
};

/** One expense on the confirmation card. */
export type CardItem = {
  /** The queued expense's client id (its id until the server has it). */
  clientId: string;
  draft: VoiceDraft;
  /** The default split before this one changed it (restored by Undo). undefined: unchanged. */
  prevSplit?: StoredSplit | null;
};

export type VoiceCard = { id: string; tripId: string; transcript: string; items: CardItem[]; undone?: boolean };

type VoiceState = {
  captures: VoiceCapture[];
  card: VoiceCard | null;
  add: (c: VoiceCapture) => void;
  patch: (id: string, patch: Partial<VoiceCapture>) => void;
  remove: (id: string) => void;
  showCard: (card: VoiceCard | null) => void;
  clear: () => void;
};

export const useVoice = create<VoiceState>()(
  persist(
    (set) => ({
      captures: [],
      card: null,
      add: (c) => set((s) => ({ captures: [c, ...s.captures.filter((x) => x.id !== c.id)] })),
      patch: (id, patch) => set((s) => ({ captures: s.captures.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      remove: (id) => set((s) => ({ captures: s.captures.filter((x) => x.id !== id) })),
      showCard: (card) => set({ card }),
      clear: () => set({ captures: [], card: null }),
    }),
    {
      name: 'travelspend-voice',
      storage: createJSONStorage(persistStorage),
      // The card is for this moment only; a recording that was being read is tried again
      partialize: (s) => ({ captures: s.captures.map((c) => (c.status === 'processing' ? { ...c, status: 'queued_offline' as const } : c)) }),
    },
  ),
);
