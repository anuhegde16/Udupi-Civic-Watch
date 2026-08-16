/**
 * Storage driver abstraction for image uploads.
 *
 * Controlled by the STORAGE_DRIVER env var (default: "gcs"):
 *   - "gcs"   — Google Cloud Storage (current production behaviour, unchanged)
 *   - "local" — Disk-based storage with sharp compression
 *
 * The GET URL format (/api/uploads/files/<filename>) is identical for both
 * drivers so no database / schema change is needed.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { objectStorageClient } from "./objectStorage";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface StorageReadResult {
  buffer: Buffer;
  contentType: string;
}

export interface StorageDriver {
  /** Persist an image buffer under the given filename key. */
  save(filename: string, buffer: Buffer, mimeType: string): Promise<void>;
  /** Retrieve a previously saved image, or null if it does not exist. */
  read(filename: string): Promise<StorageReadResult | null>;
}

// ─── GCS Driver ───────────────────────────────────────────────────────────────
// Wraps the existing GCS logic — no behaviour change for the "gcs" driver.

class GcsStorageDriver implements StorageDriver {
  private getBucket() {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
    return objectStorageClient.bucket(bucketId);
  }

  async save(filename: string, buffer: Buffer, mimeType: string): Promise<void> {
    const bucket = this.getBucket();
    const file = bucket.file(`uploads/${filename}`);
    await file.save(buffer, { contentType: mimeType, resumable: false });
  }

  async read(filename: string): Promise<StorageReadResult | null> {
    const bucket = this.getBucket();
    const file = bucket.file(`uploads/${filename}`);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "application/octet-stream";
    const [buffer] = await file.download();
    return { buffer, contentType };
  }
}

// ─── Local Driver ─────────────────────────────────────────────────────────────
// Writes/reads files from LOCAL_STORAGE_DIR (default: ./uploads-data).
// Uses sharp to compress images before writing:
//   - Longest edge capped at 1920 px (no enlargement)
//   - JPEG output at 80 % quality (sufficient for AI waste-photo analysis)

class LocalStorageDriver implements StorageDriver {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = process.env.LOCAL_STORAGE_DIR ?? "./uploads-data";
  }

  private filePath(filename: string): string {
    return join(this.baseDir, "uploads", filename);
  }

  async save(filename: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const uploadDir = join(this.baseDir, "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Dynamic import keeps sharp out of the module graph on the GCS path.
    const sharp = (await import("sharp")).default;

    const compressed = await sharp(buffer)
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: false })
      .toBuffer();

    await writeFile(this.filePath(filename), compressed);
  }

  async read(filename: string): Promise<StorageReadResult | null> {
    const fp = this.filePath(filename);
    try {
      await access(fp);
    } catch {
      return null;
    }
    const buffer = await readFile(fp);
    // All locally stored files are compressed to JPEG regardless of original format.
    return { buffer, contentType: "image/jpeg" };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _driver: StorageDriver | null = null;

/**
 * Returns a singleton storage driver for this process.
 * The driver is chosen once from STORAGE_DRIVER (default "gcs").
 */
export function getStorageDriver(): StorageDriver {
  if (_driver) return _driver;
  const driverName = (process.env.STORAGE_DRIVER ?? "gcs").toLowerCase();
  if (driverName === "local") {
    _driver = new LocalStorageDriver();
  } else {
    if (driverName !== "gcs") {
      console.warn(`[storageDriver] Unknown STORAGE_DRIVER="${driverName}", falling back to "gcs"`);
    }
    _driver = new GcsStorageDriver();
  }
  return _driver;
}
