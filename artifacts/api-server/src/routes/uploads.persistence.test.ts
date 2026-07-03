import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";

/**
 * The whole point of the GCS-backed object storage migration is that
 * uploaded photos survive a server restart (unlike the old ephemeral
 * local-disk storage). This test uploads a photo, then simulates a full
 * server restart by resetting the module registry and re-importing the
 * Express app from scratch (a fresh `objectStorageClient`, fresh route
 * handlers, no shared in-memory state) before fetching the photo back.
 *
 * This requires the real GCS-backed bucket to be configured
 * (DEFAULT_OBJECT_STORAGE_BUCKET_ID / PRIVATE_OBJECT_DIR /
 * PUBLIC_OBJECT_SEARCH_PATHS env vars, provided by the Object Storage tool).
 */

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("uploaded photos survive a server restart", () => {
  beforeAll(() => {
    if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
      throw new Error(
        "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — the GCS-backed bucket must be " +
          "configured for this persistence test to run against real storage.",
      );
    }
  });

  it("uploads a photo, restarts the server, and still serves it with 200", async () => {
    const { default: appBeforeRestart } = await import("../app");

    const uploadResponse = await request(appBeforeRestart)
      .post("/api/uploads/image")
      .send({ dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` })
      .expect(200);

    const { url } = uploadResponse.body as { url: string };
    expect(url).toMatch(/^\/api\/uploads\/files\/.+\.png$/);

    // --- Simulate a server restart ---
    // Clear every cached module (app, routes, the object storage client,
    // in-memory GCS auth token cache, etc.) and re-import from scratch, so
    // nothing from the pre-restart process instance is reused.
    vi.resetModules();
    const { default: appAfterRestart } = await import("../app");

    const fetchResponse = await request(appAfterRestart).get(url).expect(200);

    expect(fetchResponse.headers["content-type"]).toBe("image/png");
    expect(fetchResponse.body.length).toBeGreaterThan(0);
  });
});
