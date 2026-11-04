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
