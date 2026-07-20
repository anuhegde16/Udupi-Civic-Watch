import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";
import { logger } from "./logger";

const WasteAnalysisSchema = z.object({
  wasteTypes: z.array(z.string()).default([]),
  brandNames: z.array(z.string()).default([]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});

export type WasteAnalysisResult = z.infer<typeof WasteAnalysisSchema>;

const SYSTEM_PROMPT = `You are a waste identification AI for a civic waste reporting platform in Udupi, Karnataka, India.
Analyse the provided photo of reported waste and return a JSON object with:
- wasteTypes: array of waste categories present (e.g. "plastic bottles", "food waste", "construction debris", "paper", "glass", "electronic waste", "medical waste", "tyres", "clothing", "mixed municipal waste")
- brandNames: array of any identifiable brand names on packaging/labels (empty array if none visible or identifiable)
- severity: one of "low" (small amount, manageable), "medium" (moderate pile, needs prompt attention), "high" (large accumulation, urgent or hazardous)

Respond ONLY with a valid JSON object. No explanation, no markdown, just JSON.
Example: {"wasteTypes":["plastic bottles","food waste"],"brandNames":["Bisleri"],"severity":"medium"}`;

const TIMEOUT_MS = 15_000;

export async function analyseWastePhoto(imageUrl: string): Promise<WasteAnalysisResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await openai.chat.completions.create(
        {
          model: "gpt-5.6-luna",
          max_completion_tokens: 256,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: imageUrl, detail: "low" },
                },
                {
                  type: "text",
                  text: SYSTEM_PROMPT,
                },
              ],
            },
          ],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);
    const result = WasteAnalysisSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues, imageUrl }, "AI response failed Zod validation");
      return null;
    }

    return result.data;
  } catch (err) {
    logger.warn({ err, imageUrl }, "Waste photo AI analysis failed");
    return null;
  }
}
