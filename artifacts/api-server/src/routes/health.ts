import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isSmtpConfigured } from "../lib/email";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok", smtpConfigured: isSmtpConfigured() });
  res.json(data);
});

export default router;
