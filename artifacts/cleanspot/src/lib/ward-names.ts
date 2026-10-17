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

/**
 * Ward names for Kaup (Kapu), taken from the Karnataka KGIS ward-boundary data
 * (KGISWardName) that the ward polygons themselves come from.
 */
export const KAUP_WARD_NAMES: Record<number, string> = {
  1: "Kaipunjalu",
  2: "Kothalakatte",
  3: "Karavali",
  4: "Polipugudde",
  5: "Danda Thirtha",
  6: "Kalya",
  7: "Bharath Nagara",
  8: "Beedubadi",
  9: "Polipu",
  10: "Kapu Pete",
  11: "Light House",
  12: "Koppalangadi",
  13: "Thottam",
  14: "Duggana Thota",
  15: "Mangala Pete",
  16: "Janardhana Temple",
  17: "Badagara Gutthu",
  18: "Kombagudde",
  19: "General School",
  20: "Gujji",
  21: "Garadi",
  22: "Kudthimar",
  23: "Ahmadhi Mohalla",
};

/**
 * Ward names for Byndoor, read from the Byndoor Town Panchayat's ward list (Kannada)
 * and written in English letters. These are phonetic spellings, not gazetted names;
 * the KGIS ward layer that the polygons come from has no names for Byndoor.
 */
export const BYNDOOR_WARD_NAMES: Record<number, string> = {
  1: "Tarapati",
  2: "Virupakshi",
  3: "Dombe",
  4: "Someshwara",
  5: "Panchalingeshwara",
  6: "Alandur",
  7: "Kadke Maddodi",
  8: "Yojananagara",
  9: "Bankeshwara",
  10: "Byndoor Pete",
  11: "Venkatramana",
  12: "Pantigaradi",
  13: "Yedthare",
  14: "Mayyadi Kalavadi",
  15: "Bada Biyara",
  16: "Surkunda",
  17: "Ganganadu",
  18: "Chandana Vasre",
  19: "Taggarse Pete",
  20: "Nelyadi Kadodi",
};

/** Ward-name lookups, keyed by panchayat, for every panchayat that has one on file. */
const WARD_NAMES_BY_PANCHAYAT: Record<string, Record<number, string>> = {
  Udupi: UDUPI_WARD_NAMES,
  Kundapura: KUNDAPURA_WARD_NAMES,
  Kaup: KAUP_WARD_NAMES,
  Byndoor: BYNDOOR_WARD_NAMES,
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

/** Map zoom level at which ward names appear next to ward numbers on the maps. */
export const WARD_NAME_ZOOM = 14;

/**
 * HTML for an on-map ward label. The bare number is always visible; the name
 * ("· Parkala") sits in a span that the .ck-show-ward-names CSS rule reveals
 * once the map is zoomed in to WARD_NAME_ZOOM, so a zoomed-out map stays
 * readable. Wards with no name on file (Karkala, Saligrama for now) just show
 * the number. Falls back to the raw key when it isn't a ward identifier.
 */
export function wardMapLabelHtml(geoName: string | null | undefined): string {
  if (!geoName) return "";
  const label = formatWardLabel(geoName);
  const sep = label.indexOf(" · ");
  if (sep === -1) return label.replace(/^Ward /, "").replace(/[&<>]/g, "");
  const num = label.slice(0, sep);
  const name = label.slice(sep + 3).replace(/[&<>]/g, "");
  return `${num}<span class="ward-name-part"> · ${name}</span>`;
}

/**
 * Keeps a map's container class in step with its zoom level so the CSS can
 * show or hide the ward names. Call once after creating the map.
 */
export function bindWardNameZoom(map: { getZoom(): number; getContainer(): HTMLElement; on(ev: string, fn: () => void): unknown }): void {
  const update = () => map.getContainer().classList.toggle("ck-show-ward-names", map.getZoom() >= WARD_NAME_ZOOM);
  map.on("zoomend", update);
  map.on("moveend", update);
  update();
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
