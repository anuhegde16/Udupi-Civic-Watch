import { describe, it, expect } from "vitest";
import { formatWardLabel, formatWardChartLabel, UDUPI_WARD_NAMES, KUNDAPURA_WARD_NAMES } from "./ward-names";

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

  it("formats a known Kundapura ward identifier with its name", () => {
    expect(formatWardLabel("Kundapura Ward 4")).toBe("4 · Khaarvi Keri");
    expect(formatWardLabel("Kundapura Ward 1")).toBe("1 · Ferry");
    expect(formatWardLabel("Kundapura Ward 23")).toBe("23 · Kallangar");
  });

  it("formats all 23 Kundapura wards without returning the original string", () => {
    for (let i = 1; i <= 23; i++) {
      const input = `Kundapura Ward ${i}`;
      const result = formatWardLabel(input);
      expect(result).not.toBe(input);
      expect(result).toBe(`${i} · ${KUNDAPURA_WARD_NAMES[i]}`);
    }
  });

  it("shortens a panchayat's ward identifier to plain \"Ward N\" when no name is on file", () => {
    // A future panchayat (or any typo'd/unknown one) with no name mapping yet
    // still gets the panchayat prefix dropped, just without a name attached.
    expect(formatWardLabel("Unknown Ward 99")).toBe("Ward 99");
  });

  it("leaves unknown or arbitrary strings unchanged", () => {
    expect(formatWardLabel("Saligrama")).toBe("Saligrama");
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
