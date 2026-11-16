// Smart imports waiting on this device: queued while offline, being read, ready
// to check, or failed. Kept in the browser's IndexedDB (store
// `pending_smart_imports`), since screenshots are too big for localStorage.
// Phone app builds (no IndexedDB): kept in memory for the session only.
import { create } from 'zustand';
import type { SmartImportRecord } from '@/lib/smartImport';

const DB_NAME = 'smarttrip';
const STORE = 'pending_smart_imports';

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise<T | null>((resolve) => {
        if (!d) return resolve(null);
        try {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

type State = {
  records: SmartImportRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  put: (rec: SmartImportRecord) => Promise<void>;
  patch: (id: string, patch: Partial<SmartImportRecord>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useSmartImports = create<State>((set, get) => ({
  records: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    const all = ((await run('readonly', (s) => s.getAll())) as SmartImportRecord[] | null) ?? [];
    // One left "processing" by a closed app: read it again
    const fixed = all.map((r) => (r.status === 'processing' ? { ...r, status: 'queued_offline' as const } : r));
    // Keep any added before the load finished
    set((s) => ({ loaded: true, records: [...fixed.filter((r) => !s.records.some((x) => x.id === r.id)), ...s.records].sort((a, b) => a.created_at - b.created_at) }));
  },
  put: async (rec) => {
    set((s) => ({ records: [...s.records.filter((r) => r.id !== rec.id), rec].sort((a, b) => a.created_at - b.created_at) }));
    await run('readwrite', (s) => s.put(rec));
  },
  patch: async (id, patch) => {
    const cur = get().records.find((r) => r.id === id);
    if (!cur) return;
    await get().put({ ...cur, ...patch });
  },
  remove: async (id) => {
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
    await run('readwrite', (s) => s.delete(id));
  },
}));

/** The status to show on the gear and the menu item for a trip: ready beats queued. */
export function smartImportBadge(records: SmartImportRecord[], tripId: string | undefined): 'ready' | 'queued' | 'error' | null {
  const mine = records.filter((r) => r.trip_id === tripId);
  if (mine.some((r) => r.status === 'ready_for_review')) return 'ready';
  if (mine.some((r) => r.status === 'queued_offline' || r.status === 'processing')) return 'queued';
  if (mine.some((r) => r.status === 'error')) return 'error';
  return null;
}
