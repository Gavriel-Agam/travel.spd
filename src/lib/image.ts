import { Platform } from 'react-native';

/**
 * A photo ready to upload: in the browser it is scaled down to `maxSide` pixels
 * and re-encoded as JPEG (a phone photo of several MB becomes a few hundred KB).
 * Native builds upload the picker's already-compressed file as is.
 */
export async function shrinkForUpload(uri: string, maxSide = 1600, quality = 0.82): Promise<{ body: ArrayBuffer; mime: string }> {
  const original = await (await fetch(uri)).blob();
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return { body: await original.arrayBuffer(), mime: original.type || 'image/jpeg' };
  }
  const bitmap = await createImageBitmap(original);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image_encode_failed'))), 'image/jpeg', quality),
  );
  return { body: await blob.arrayBuffer(), mime: 'image/jpeg' };
}

/** Longest data URL a category picture may be (the database allows a little more). */
export const ICON_MAX_CHARS = 140_000;
const ICON_TYPES = /^data:image\/(png|jpeg|webp);base64,/;

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('image_unreadable'));
    r.readAsDataURL(blob);
  });
}

/**
 * A picked picture (PNG, SVG, JPG, WebP, GIF) as a small square category icon:
 * `size` pixels, kept inline as a data URL so it also shows offline. Photos
 * (JPEG) fill the square; logos and drawings fit inside it on a transparent
 * background. SVG is drawn into pixels, so nothing in the file can run.
 * Throws `image_unreadable` or `image_too_large`.
 */
export async function categoryIconFromPick(uri: string, size = 128): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    // Phone app: the picker already cropped it square and compressed it
    const url = await readAsDataUrl(blob);
    if (!ICON_TYPES.test(url)) throw new Error('image_unreadable');
    if (url.length > ICON_MAX_CHARS) throw new Error('image_too_large');
    return url;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_unreadable'));
      el.src = objectUrl;
    });
    // An SVG without its own size reports 0: draw it at the icon size
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image_unreadable');
    ctx.imageSmoothingQuality = 'high';
    if (blob.type === 'image/jpeg') {
      // Photo: crop the middle square
      const side = Math.min(w, h);
      ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    } else {
      const scale = Math.min(size / w, size / h);
      const dw = w * scale;
      const dh = h * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    }
    return encodeIcon(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * A finished icon canvas as a data URL: WebP where the browser can write it
 * (small, keeps transparency), else PNG, else JPEG. Throws `image_unreadable`
 * (the browser won't read it back) or `image_too_large`.
 */
export function encodeIcon(canvas: HTMLCanvasElement): string {
  const tries: [string, number | undefined][] = [['image/webp', 0.86], ['image/png', undefined], ['image/jpeg', 0.86]];
  for (const [type, quality] of tries) {
    let url: string;
    try {
      url = canvas.toDataURL(type, quality);
    } catch {
      // A picture that points at other files can't be read back (browser security)
      throw new Error('image_unreadable');
    }
    if (url.startsWith(`data:${type};base64,`) && url.length <= ICON_MAX_CHARS) return url;
  }
  throw new Error('image_too_large');
}

/** A finished photo canvas as a JPEG file in memory, with a local address to upload it from. */
export async function canvasToJpegUrl(canvas: HTMLCanvasElement, quality = 0.86): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image_encode_failed'))), 'image/jpeg', quality),
  );
  return URL.createObjectURL(blob);
}

/** Loads a picked picture to draw it (SVG without its own size gets `fallback` px). */
export async function loadPicture(uri: string, fallback = 512): Promise<{ img: HTMLImageElement; src: string; w: number; h: number; type: string }> {
  const blob = await (await fetch(uri)).blob();
  const objectUrl = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image_unreadable'));
    el.src = objectUrl;
  });
  // `src` stays valid until released with URL.revokeObjectURL
  return { img, src: objectUrl, w: img.naturalWidth || fallback, h: img.naturalHeight || fallback, type: blob.type };
}
