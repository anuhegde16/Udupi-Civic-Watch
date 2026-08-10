/** Official ward names for all 35 Udupi wards, keyed by ward number. */
export const UDUPI_WARD_NAMES: Record<number, string> = {
  1: "Kola",
  2: "Vadabhandeshwara",
  3: "Malpe Central",
  4: "Kodavoor",
  5: "Kalmady",
  6: "Moodubettu",
  7: "Kodankuru",
  8: "Nittur",
  9: "Subhrahmanya Nagar",
  10: "Gopalapura",
  11: "Kakkunje",
  12: "Karamballi",
  13: "Moodu Perampalli",
  14: "Saralabettu",
  15: "Shettibettu",
  16: "Parkala",
  17: "Eshwar Nagar",
  18: "Manipal",
  19: "Moodu Sagri",
  20: "Indrali",
  21: "Indira Nagar",
  22: "76 Badagubettu",
  23: "Chitpady",
  24: "Kasthurba Nagar",
  25: "Kunjibettu",
  26: "Kadiyali",
  27: "Gundibailu",
  28: "Bannanje",
  29: "Tenkapete",
  30: "Olakadu",
  31: "Bailoor",
  32: "Kinnimulky",
  33: "Ajjarakadu",
  34: "Shiribeedu",
  35: "Ambalapady",
};

/**
 * Formats a geofence ward identifier (e.g. "Udupi Ward 16") into a human-readable
 * label that includes the number and the official ward name (e.g. "16 · Parkala").
 *
 * Only transforms strings that match the exact pattern "Udupi Ward <N>" so that
 * Saligrama ward identifiers ("Ward 1" … "Ward 16") and any other strings are
 * returned unchanged.
 */
export function formatWardLabel(geoName: string | null | undefined): string {
  if (!geoName) return "";
  const m = geoName.match(/^Udupi Ward (\d+)$/);
  if (!m) return geoName;
  const num = parseInt(m[1], 10);
  const name = UDUPI_WARD_NAMES[num];
  if (!name) return geoName;
  return `${num} · ${name}`;
}

/**
 * Formats a short analytics ward label (e.g. "W16") to "16 · Parkala".
 * These short labels are produced by buildWardBacklog in the API.
 */
export function formatWardChartLabel(shortLabel: string): string {
  const m = shortLabel.match(/^W(\d+)$/);
  if (!m) return shortLabel;
  const num = parseInt(m[1], 10);
  const name = UDUPI_WARD_NAMES[num];
  if (!name) return shortLabel;
  return `${num} · ${name}`;
}
