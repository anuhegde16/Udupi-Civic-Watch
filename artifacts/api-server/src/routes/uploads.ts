import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { UploadImageBody } from "@workspace/api-zod";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
  const filepath = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(filepath, buffer);

  res.json({ url: `/api/uploads/files/${filename}` });
});

router.get("/uploads/files/:filename", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(raw);
  const filepath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.sendFile(filepath);
});

export default router;
