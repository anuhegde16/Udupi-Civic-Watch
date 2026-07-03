const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const UPLOAD_TIMEOUT_MS = 20_000;

export class UploadTimeoutError extends Error {
  constructor() {
    super("Upload timed out. Your connection may be slow — please try again.");
    this.name = "UploadTimeoutError";
  }
}

export type UploadImageResult = { url: string; uploadedAt: string };

/**
 * Uploads a base64 image data URL with real-time progress reporting via
 * XMLHttpRequest (fetch does not expose upload progress in browsers).
 * Rejects with UploadTimeoutError if no response is received within
 * UPLOAD_TIMEOUT_MS, so callers can surface a friendly retry prompt instead
 * of hanging silently on slow connections.
 */
export function uploadImageWithProgress(
  dataUrl: string,
  onProgress?: (percent: number) => void
): Promise<UploadImageResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/uploads/image`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadImageResult;
          onProgress?.(100);
          resolve(data);
        } catch {
          reject(new Error("Failed to parse upload response."));
        }
        return;
      }

      let message = `Upload failed (${xhr.status})`;
      try {
        const errorBody = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = errorBody.message || errorBody.error || message;
      } catch {
        // ignore parse failure, use default message
      }
      reject(new Error(message));
    };

    xhr.ontimeout = () => reject(new UploadTimeoutError());
    xhr.onerror = () => reject(new Error("Network error during upload. Please check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));

    xhr.send(JSON.stringify({ dataUrl }));
  });
}
