/**
 * Compresses an image File client-side using the Canvas API.
 * Returns a JPEG data URL, iteratively reducing quality and dimensions until
 * the encoded size is at or under `targetBytes` (default 500 KB) — or until
 * we hit the minimum quality/size floor, whichever comes first.
 * No external dependencies required.
 */

const DEFAULT_TARGET_BYTES = 500 * 1024;
const MIN_QUALITY = 0.35;
const MIN_DIMENSION = 480;

function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // Each base64 char encodes 6 bits; approximate decoded byte length.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function compressImage(
  file: File,
  opts?: { maxWidth?: number; quality?: number; targetBytes?: number }
): Promise<string> {
  const { targetBytes = DEFAULT_TARGET_BYTES } = opts ?? {};
  let { maxWidth = 1600, quality = 0.7 } = opts ?? {};

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };
    image.src = objectUrl;
  });

  const encode = (width: number, height: number, q: number): string => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", q);
  };

  let width = img.width;
  let height = img.height;
  if (width > maxWidth || height > maxWidth) {
    const ratio = Math.min(maxWidth / width, maxWidth / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  let result = encode(width, height, quality);

  // Iteratively shrink quality, then dimensions, until we're under the
  // target size or hit the floor for both.
  while (dataUrlByteLength(result) > targetBytes) {
    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
    } else if (width > MIN_DIMENSION || height > MIN_DIMENSION) {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    } else {
      break;
    }
    result = encode(width, height, quality);
  }

  return result;
}
