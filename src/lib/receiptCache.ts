// Offline receipts: a copy of each receipt photo / booking file you save or
// open is kept on this device (the browser's Cache Storage), so it opens with
// no signal. Cleared on sign-out. Where Cache Storage isn't available (the
// phone app), receipts load from the server as before.

const CACHE = 'smarttrip-receipts-v1';
const keyFor = (path: string) => `https://receipts.smarttrip.invalid/${encodeURIComponent(path)}`;
const store = () => (typeof caches !== 'undefined' ? caches : null);
const objectUrls = new Map<string, string>();

/** Keeps a copy of a receipt's bytes (right after uploading it). */
export async function cacheReceiptBody(path: string, body: ArrayBuffer | Blob, mime: string) {
  const s = store();
  if (!s) return;
  try {
    await (await s.open(CACHE)).put(keyFor(path), new Response(body, { headers: { 'Content-Type': mime } }));
  } catch {
    // storage full or blocked: it still loads from the server
  }
}

/** Downloads a receipt from its (signed) url and keeps a copy. */
export async function cacheReceiptFromUrl(path: string, url: string) {
  const s = store();
  if (!s) return;
  try {
    const c = await s.open(CACHE);
    if (await c.match(keyFor(path))) return;
    const res = await fetch(url);
    if (res.ok) await c.put(keyFor(path), res);
  } catch {
    // offline or blocked: try again next time it is opened
  }
}

/** A local url for the saved copy, or null. */
export async function cachedReceiptUrl(path: string): Promise<string | null> {
  const known = objectUrls.get(path);
  if (known) return known;
  const s = store();
  if (!s || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  try {
    const res = await (await s.open(CACHE)).match(keyFor(path));
    if (!res) return null;
    const url = URL.createObjectURL(await res.blob());
    objectUrls.set(path, url);
    return url;
  } catch {
    return null;
  }
}

export async function hasCachedReceipt(path: string): Promise<boolean> {
  const s = store();
  if (!s) return false;
  try {
    return !!(await (await s.open(CACHE)).match(keyFor(path)));
  } catch {
    return false;
  }
}

/** Removes every saved copy (sign-out). */
export async function clearReceiptCache() {
  objectUrls.forEach((u) => URL.revokeObjectURL?.(u));
  objectUrls.clear();
  try {
    await store()?.delete(CACHE);
  } catch {
    // nothing to clear
  }
}
