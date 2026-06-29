import { Router, type IRouter } from "express";
import { UploadImageBody } from "@workspace/api-zod";
import { objectStorageClient } from "../lib/objectStorage";

const router: IRouter = Router();

function getBucket() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  }
  return objectStorageClient.bucket(bucketId);
}

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
  const ext = mimeType.split("/")[1] || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const gcsPath = `uploads/${filename}`;

  const buffer = Buffer.from(base64Data, "base64");

  const bucket = getBucket();
  const file = bucket.file(gcsPath);
  await file.save(buffer, { contentType: mimeType, resumable: false });

  const uploadedAt = new Date().toISOString();
  res.json({ url: `/api/uploads/files/${filename}`, uploadedAt });
});

router.get("/uploads/files/:filename", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = raw.replace(/[^a-zA-Z0-9.\-_]/g, "");
  const gcsPath = `uploads/${filename}`;

  try {
    const bucket = getBucket();
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    file.createReadStream().pipe(res);
  } catch {
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

export default router;
