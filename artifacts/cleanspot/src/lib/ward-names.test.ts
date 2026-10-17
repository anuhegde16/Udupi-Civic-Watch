import { describe, it, expect } from "vitest";
import { formatWardLabel, formatWardChartLabel, wardMapLabelHtml, bindWardNameZoom, WARD_NAME_ZOOM, UDUPI_WARD_NAMES, KUNDAPURA_WARD_NAMES, KAUP_WARD_NAMES, BYNDOOR_WARD_NAMES, KARKALA_WARD_NAMES } from "./ward-names";

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

  it("formats all 23 Kaup wards with their names", () => {
    expect(formatWardLabel("Kaup Ward 1")).toBe("1 · Kaipunjalu");
    for (let i = 1; i <= 23; i++) {
      expect(formatWardLabel(`Kaup Ward ${i}`)).toBe(`${i} · ${KAUP_WARD_NAMES[i]}`);
    }
  });

  it("formats all 23 Karkala wards with their names", () => {
    expect(formatWardLabel("Karkala Ward 16")).toBe("16 · Madhyapete");
    for (let i = 1; i <= 23; i++) {
      expect(formatWardLabel(`Karkala Ward ${i}`)).toBe(`${i} · ${KARKALA_WARD_NAMES[i]}`);
    }
  });

  it("formats all 20 Byndoor wards with their names", () => {
    expect(formatWardLabel("Byndoor Ward 10")).toBe("10 · Byndoor Pete");
    for (let i = 1; i <= 20; i++) {
      expect(formatWardLabel(`Byndoor Ward ${i}`)).toBe(`${i} · ${BYNDOOR_WARD_NAMES[i]}`);
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

describe("wardMapLabelHtml", () => {
  it("keeps the number visible and puts the name in a zoom-revealed span", () => {
    expect(wardMapLabelHtml("Byndoor Ward 10")).toBe('10<span class="ward-name-part"> · Byndoor Pete</span>');
    expect(wardMapLabelHtml("Udupi Ward 16")).toBe('16<span class="ward-name-part"> · Parkala</span>');
  });

  it("shows only the number when no name is on file", () => {
    expect(wardMapLabelHtml("Newtown Ward 7")).toBe("7");
    expect(wardMapLabelHtml("Ward 3")).toBe("3");
  });

  it("returns an empty string for missing input", () => {
    expect(wardMapLabelHtml(null)).toBe("");
  });
});

describe("bindWardNameZoom", () => {
  function fakeMap(zoom: number) {
    const handlers: Record<string, () => void> = {};
    const classes = new Set<string>();
    const el = { classList: { toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) } } as unknown as HTMLElement;
    const map = {
      zoom,
      getZoom() { return this.zoom; },
      getContainer: () => el,
      on: (ev: string, fn: () => void) => { handlers[ev] = fn; },
    };
    return { map, handlers, classes };
  }

  it("shows names only at or above the threshold and follows zoom changes", () => {
    const { map, handlers, classes } = fakeMap(WARD_NAME_ZOOM - 1);
    bindWardNameZoom(map);
    expect(classes.has("ck-show-ward-names")).toBe(false);
    map.zoom = WARD_NAME_ZOOM;
    handlers.zoomend();
    expect(classes.has("ck-show-ward-names")).toBe(true);
    map.zoom = WARD_NAME_ZOOM - 2;
    handlers.zoomend();
    expect(classes.has("ck-show-ward-names")).toBe(false);
  });
});
