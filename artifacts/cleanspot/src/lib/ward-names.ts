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
 * Ward names for Kundapura, transliterated from the Kundapura Town Municipal
 * Council's ward-level nodal officer list. These are phonetic English
 * spellings, not official gazetted names, but they're what residents and
 * staff will recognize each ward by until an official list is available.
 */
export const KUNDAPURA_WARD_NAMES: Record<number, string> = {
  1: "Ferry",
  2: "Maddugudde",
  3: "East Block",
  4: "Khaarvi Keri",
  5: "Bahaddur Sha",
  6: "Chikkan Sal Raste Edabadi",
  7: "Meenu Market",
  8: "Chikkan Sal Balabadi",
  9: "Sarkari Aspatre",
  10: "Church Raste",
  11: "Central",
  12: "West Block",
  13: "Mangaluru Tiles Factory",
  14: "Kodi Dakshina",
  15: "Kodi Madhya",
  16: "Kodi Uttara",
  17: "TT",
  18: "Nana Saheb",
  19: "JLB",
  20: "Kundeshwar",
  21: "Huncher Bettu",
  22: "Shanti Niketan",
  23: "Kallangar",
};

/** Ward-name lookups, keyed by panchayat, for every panchayat that has one on file. */
const WARD_NAMES_BY_PANCHAYAT: Record<string, Record<number, string>> = {
  Udupi: UDUPI_WARD_NAMES,
  Kundapura: KUNDAPURA_WARD_NAMES,
};

/**
 * Formats a geofence ward identifier (e.g. "Udupi Ward 16" or "Kundapura Ward 4")
 * into a human-readable label. When a name is on file for that panchayat's ward
 * (Udupi, Kundapura), it's shown as "N · Name" (e.g. "16 · Parkala"). Otherwise
 * — Saligrama's own "Ward 1" … "Ward 16" (no panchayat prefix at all), a future
 * panchayat with no name list yet, or an unmatched string — it falls back to
 * a plain "Ward N" (dropping the panchayat prefix, which is only needed
 * internally to keep ward keys unique across panchayats) or is returned
 * unchanged if it isn't a ward identifier at all.
 */
export function formatWardLabel(geoName: string | null | undefined): string {
  if (!geoName) return "";
  const match = geoName.match(/^(?:([A-Za-z]+)\s+)?Ward (\d+)$/);
  if (!match) return geoName;
  const [, panchayat, numStr] = match;
  const num = parseInt(numStr, 10);
  const name = panchayat ? WARD_NAMES_BY_PANCHAYAT[panchayat]?.[num] : undefined;
  return name ? `${num} · ${name}` : `Ward ${num}`;
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
