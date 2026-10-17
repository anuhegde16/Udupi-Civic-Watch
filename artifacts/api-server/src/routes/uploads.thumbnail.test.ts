/**
 * GET /api/uploads/files/:filename?w=800 — a smaller copy for phones on mobile data.
 * Uses the local-disk storage driver so no cloud bucket is needed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";

let app: Express;
let dir: string;
const name = "thumb-test-photo.jpg";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "thumb-test-"));
  await mkdir(join(dir, "uploads"), { recursive: true });
  const big = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 170, b: 120 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
  await writeFile(join(dir, "uploads", name), big);
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = dir;
  app = (await import("../app")).default as Express;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("GET /api/uploads/files/:filename resizing", () => {
  it("serves the original when no width is asked for", async () => {
    const res = await request(app).get(`/api/uploads/files/${name}`).expect(200);
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.width).toBe(1600);
  });

  it("serves an 800-wide copy for ?w=800, cached for a year", async () => {
    const res = await request(app).get(`/api/uploads/files/${name}?w=800`).expect(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("max-age=31536000");
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it("ignores widths it does not allow and returns the original", async () => {
    const res = await request(app).get(`/api/uploads/files/${name}?w=50`).expect(200);
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.width).toBe(1600);
  });

  it("never enlarges a photo that is already smaller than the requested width", async () => {
    await writeFile(
      join(dir, "uploads", "small.jpg"),
      await sharp({ create: { width: 300, height: 200, channels: 3, background: "#888" } }).jpeg().toBuffer(),
    );
    const res = await request(app).get(`/api/uploads/files/small.jpg?w=800`).expect(200);
    expect((await sharp(res.body as Buffer).metadata()).width).toBe(300);
  });

  it("returns 404 for a photo that does not exist", async () => {
    await request(app).get(`/api/uploads/files/nope.jpg?w=800`).expect(404);
  });
});
