import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTripData } from '@/hooks/useTripData';
import { useOnline } from '@/hooks/useOutboxSync';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { isNetworkError } from '@/lib/connectivity';
import { logError } from '@/lib/log';
import type { ParsedExpenseCandidate, SmartImportRecord } from '@/lib/smartImport';
import { dayKey } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useIsDemo } from '@/store/prefs';
import { useSmartImports } from '@/store/smartImports';

/**
 * A screenshot made small for sending and keeping on the device: at most 1024
 * px wide, WebP (JPEG where the browser can't write WebP), quality 0.75.
 * Phone app builds keep the picker's already-compressed file.
 */
export async function compressScreenshot(uri: string): Promise<Blob> {
  const original = await (await fetch(uri)).blob();
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return original;
  const bitmap = await createImageBitmap(original);
  const scale = Math.min(1, 1024 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.75));
  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('image_unreadable');
  return jpeg;
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('image_unreadable'));
    r.readAsDataURL(blob);
  });
}

export type ParseContext = {
  default_currency: string;
  participants: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  today_iso: string;
  ui_language: 'he' | 'en';
};

/** What the parser is told about the active trip. */
export function useParseContext(): ParseContext | null {
  const { t, lang } = useT();
  const { trip, members, categories } = useTripData();
  if (!trip || !members.length || !categories.length) return null;
  return {
    default_currency: trip.default_currency,
    participants: members.map((m) => ({ id: m.id, name: m.display_name })),
    categories: categories.map((c) => ({ id: c.id, name: categoryLabel(c, t) })),
    today_iso: dayKey(new Date(), trip.timezone),
    ui_language: lang === 'en' ? 'en' : 'he',
  };
}

/**
 * Sends one import to be read. Ends as ready_for_review, error (with a code),
 * or back to queued_offline when there is no connection (tried again later).
 */
export async function processImport(rec: SmartImportRecord, ctx: ParseContext): Promise<SmartImportRecord> {
  const store = useSmartImports.getState();
  await store.patch(rec.id, { status: 'processing', error_message: undefined });
  const finish = async (patch: Partial<SmartImportRecord>) => {
    await store.patch(rec.id, patch);
    return useSmartImports.getState().records.find((r) => r.id === rec.id) ?? { ...rec, ...patch };
  };
  try {
    const images = await Promise.all((rec.compressed_images ?? []).map(toDataUrl));
    const { data, error } = await supabase.functions.invoke('smart-parse-expenses', {
      body: { trip_id: rec.trip_id, text: rec.raw_text ?? '', images_base64: images, context: ctx },
    });
    if (error) {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.status === 'number') {
        let code = 'parse_failed';
        try {
          code = (await res.json())?.error ?? code;
        } catch {
          // not JSON
        }
        return finish({ status: 'error', error_message: res.status === 429 ? 'RATE_LIMIT_EXCEEDED' : code });
      }
      throw error;
    }
    const list = ((data as { expenses?: ParsedExpenseCandidate[] })?.expenses ?? []) as ParsedExpenseCandidate[];
    return finish(list.length ? { status: 'ready_for_review', parsed_expenses: list } : { status: 'error', error_message: 'nothing_found' });
  } catch (e) {
    if (isNetworkError(e) || !onlineManager.isOnline() || /fetch|network/i.test(String((e as Error)?.message ?? e))) {
      return finish({ status: 'queued_offline' });
    }
    logError(e, 'smartImport.parse');
    return finish({ status: 'error', error_message: 'parse_failed' });
  }
}

/**
 * Loads the saved imports, and whenever the app is online, reads the active
 * trip's imports that were queued offline (at launch and when the connection
 * returns). Mounted once, for every screen of the trip.
 */
export function useSmartImportSync() {
  const online = useOnline();
  const demo = useIsDemo();
  const ctx = useParseContext();
  const { trip } = useTripData();
  const { records, loaded, load } = useSmartImports();
  const running = useRef(false);
  // Read when the flush runs (it may wait for an earlier one)
  const live = useRef({ ctx, tripId: trip?.id });
  live.current = { ctx, tripId: trip?.id };

  useEffect(() => {
    load();
  }, [load]);

  const queued = records
    .filter((r) => r.status === 'queued_offline' && r.trip_id === trip?.id)
    .map((r) => r.id)
    .join(',');

  const flush = useCallback(async () => {
    const { ctx: c, tripId } = live.current;
    if (running.current || !c || !tripId || demo || !onlineManager.isOnline()) return;
    running.current = true;
    try {
      for (const rec of useSmartImports.getState().records.filter((r) => r.status === 'queued_offline' && r.trip_id === tripId)) {
        const out = await processImport(rec, c);
        if (out.status === 'queued_offline') break; // still no connection
      }
    } finally {
      running.current = false;
    }
  }, [demo]);

  useEffect(() => {
    if (loaded && online && queued && ctx) flush();
  }, [loaded, online, queued, !!ctx, flush]);
}
