import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const NARRATIVE_TIMEOUT_MS = 10_000;

export interface InsightMetrics {
  totalReports: number;
  photoRate: number;
  unassignedRate: number;
  weekOverWeek: { thisWeek: number; lastWeek: number; changePct: number | null };
  sla: { within24h: number; within48h: number; within72h: number; beyond72h: number; totalCleaned: number };
  topWasteKeywords: { keyword: string; count: number }[];
  context?: string;
}

export async function generateInsightNarrative(metrics: InsightMetrics): Promise<string[] | null> {
  const scope = metrics.context ? `for ${metrics.context} Panchayat` : "across Udupi district";
  const wowText =
    metrics.weekOverWeek.changePct !== null
      ? `${metrics.weekOverWeek.changePct > 0 ? "+" : ""}${metrics.weekOverWeek.changePct}% vs last week`
      : "insufficient data for week-over-week comparison";
  const slaText =
    metrics.sla.totalCleaned > 0
      ? `${Math.round((metrics.sla.within24h / metrics.sla.totalCleaned) * 100)}% resolved within 24 h, ${Math.round(((metrics.sla.within24h + metrics.sla.within48h) / metrics.sla.totalCleaned) * 100)}% within 48 h`
      : "no resolved reports yet";
  const keywords =
    metrics.topWasteKeywords
      .slice(0, 5)
      .map((k) => k.keyword)
      .join(", ") || "none recorded yet";

  const prompt = `You are an analytics AI for CleanSpot, a civic waste reporting platform in Udupi district, Karnataka, India.

Current metrics ${scope}:
- Total active reports: ${metrics.totalReports}
- This week: ${metrics.weekOverWeek.thisWeek} reports, last week: ${metrics.weekOverWeek.lastWeek} (${wowText})
- SLA compliance: ${slaText}
- Photo submission rate: ${metrics.photoRate}%
- Unassigned reports rate: ${metrics.unassignedRate}%
- Top waste types identified: ${keywords}

Write exactly 3 concise, actionable insight bullets for a district sanitation officer. Focus on specific trends, anomalies, or recommendations. Each bullet must be 1-2 sentences. Return ONLY a JSON array of strings — no markdown, no numbering, just the array.

Example: ["Waste reports surged 40% this week due to monsoon debris near Kundapur.", "Only 52% of reports include photos — urge citizens to attach images for faster officer assignment.", "Plastic bottles remain the top waste type; consider targeted awareness campaigns near bus stands."]`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NARRATIVE_TIMEOUT_MS);
    let response;
    try {
      response = await openai.chat.completions.create(
        {
          model: "gpt-5.6-luna",
          max_completion_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return parsed.slice(0, 5);
      }
    } catch {
      /* not JSON — fall through */
    }
    const lines = content
      .split(/\n+/)
      .map((l) => l.replace(/^[-•*\d.)]+\s*/, "").trim())
      .filter((l) => l.length > 10)
      .slice(0, 5);
    return lines.length > 0 ? lines : null;
  } catch (err) {
    logger.warn({ err }, "Smart insights AI narrative failed or timed out");
    return null;
  }
}
