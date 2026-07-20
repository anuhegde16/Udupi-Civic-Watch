import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface WasteAnalysisResult {
  wasteTypes: string[];
  brandNames: string[];
  severity: "low" | "medium" | "high" | "critical";
}

const SYSTEM_PROMPT = `You are a waste identification AI for a civic waste reporting platform in Udupi, Karnataka, India.
Analyse the provided photo of reported waste and return a JSON object with:
- wasteTypes: array of waste categories present (e.g. "plastic bottles", "food waste", "construction debris", "paper", "glass", "electronic waste", "medical waste", "tyres", "clothing", "mixed municipal waste")
- brandNames: array of any identifiable brand names on packaging/labels (empty array if none visible or identifiable)
- severity: one of "low" (small amount, manageable), "medium" (moderate pile, needs prompt attention), "high" (large accumulation, urgent), "critical" (hazardous or blocking public access)

Respond ONLY with a valid JSON object. No explanation, no markdown, just JSON.
Example: {"wasteTypes":["plastic bottles","food waste"],"brandNames":["Bisleri"],"severity":"medium"}`;

export async function analyseWastePhoto(imageUrl: string): Promise<WasteAnalysisResult | null> {
  try {
    const response = await openai.chat.completions.create({
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
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      wasteTypes?: unknown;
      brandNames?: unknown;
      severity?: unknown;
    };

    const wasteTypes = Array.isArray(parsed.wasteTypes)
      ? (parsed.wasteTypes as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const brandNames = Array.isArray(parsed.brandNames)
      ? (parsed.brandNames as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const severity =
      ["low", "medium", "high", "critical"].includes(parsed.severity as string)
        ? (parsed.severity as WasteAnalysisResult["severity"])
        : "medium";

    return { wasteTypes, brandNames, severity };
  } catch (err) {
    logger.warn({ err, imageUrl }, "Waste photo AI analysis failed");
    return null;
  }
}
