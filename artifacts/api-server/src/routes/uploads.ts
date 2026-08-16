import { Router, type IRouter } from "express";
import { UploadImageBody } from "@workspace/api-zod";
import { getStorageDriver } from "../lib/storageDriver";

const router: IRouter = Router();

// ─── Validation constants ─────────────────────────────────────────────────────

/** Only image MIME types are accepted. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
]);

/** Maximum raw (decoded) file size: 10 MB. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── POST /uploads/image ─────────────────────────────────────────────────────

router.post("/uploads/image", async (req, res): Promise<void> => {
  const parsed = UploadImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { dataUrl } = parsed.data;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid data URL format" });
    return;
  }

  const [, mimeType, base64Data] = match;

  // MIME type whitelist — reject non-image uploads early.
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    res.status(400).json({
      error: "Unsupported file type",
      message: `Only image uploads are allowed. Received: ${mimeType}`,
    });
    return;
  }

  const buffer = Buffer.from(base64Data, "base64");

  // File size guard on decoded bytes.
  if (buffer.length > MAX_FILE_BYTES) {
    res.status(400).json({
      error: "File too large",
      message: `Maximum upload size is ${MAX_FILE_BYTES / 1024 / 1024} MB per image`,
    });
    return;
  }

  // Build a safe filename: timestamp + random suffix + extension from MIME type.
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const driver = getStorageDriver();
  await driver.save(filename, buffer, mimeType);

  const uploadedAt = new Date().toISOString();
  res.json({ url: `/api/uploads/files/${filename}`, uploadedAt });
});

// ─── GET /uploads/files/:filename ────────────────────────────────────────────

router.get("/uploads/files/:filename", async (req, res): Promise<void> => {
  // Sanitise: allow only alphanumeric, dot, hyphen, underscore.
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = raw.replace(/[^a-zA-Z0-9.\-_]/g, "");

  try {
    const driver = getStorageDriver();
    const result = await driver.read(filename);
    if (!result) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(result.buffer);
  } catch {
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

export default router;
