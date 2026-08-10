import { describe, it, expect } from "vitest";
import { formatWardLabel, formatWardChartLabel, UDUPI_WARD_NAMES } from "./ward-names";

describe("formatWardLabel", () => {
  it("formats a known Udupi ward identifier", () => {
    expect(formatWardLabel("Udupi Ward 16")).toBe("16 · Parkala");
    expect(formatWardLabel("Udupi Ward 1")).toBe("1 · Kola");
    expect(formatWardLabel("Udupi Ward 35")).toBe("35 · Ambalapady");
  });

  it("formats all 35 Udupi wards without returning the original string", () => {
    for (let i = 1; i <= 35; i++) {
      const input = `Udupi Ward ${i}`;
      const result = formatWardLabel(input);
      expect(result).not.toBe(input);
      expect(result).toBe(`${i} · ${UDUPI_WARD_NAMES[i]}`);
    }
  });

  it("leaves Saligrama ward identifiers unchanged", () => {
    // Saligrama wards are "Ward 1" … "Ward 16" — no "Udupi" prefix
    expect(formatWardLabel("Ward 1")).toBe("Ward 1");
    expect(formatWardLabel("Ward 16")).toBe("Ward 16");
  });

  it("leaves unknown or arbitrary strings unchanged", () => {
    expect(formatWardLabel("Saligrama")).toBe("Saligrama");
    expect(formatWardLabel("Unknown Ward 99")).toBe("Unknown Ward 99");
    expect(formatWardLabel("")).toBe("");
  });

  it("handles null and undefined gracefully", () => {
    expect(formatWardLabel(null)).toBe("");
    expect(formatWardLabel(undefined)).toBe("");
  });
});

describe("formatWardChartLabel", () => {
  it("formats a known short ward label from analytics", () => {
    expect(formatWardChartLabel("W16")).toBe("16 · Parkala");
    expect(formatWardChartLabel("W1")).toBe("1 · Kola");
    expect(formatWardChartLabel("W35")).toBe("35 · Ambalapady");
  });

  it("leaves non-matching strings unchanged", () => {
    // Saligrama short labels or unknown values pass through
    expect(formatWardChartLabel("Ward 1")).toBe("Ward 1");
    expect(formatWardChartLabel("W99")).toBe("W99");
    expect(formatWardChartLabel("")).toBe("");
  });
});
