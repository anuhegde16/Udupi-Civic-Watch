"""Replace the 35 Udupi ward polygons in geofences.json with the authoritative GeoPDF rings.

Writes the API-server copy (the source the district-rebuild script reads); the client copy is
synced afterwards so the two files stay byte-identical.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "artifacts/api-server/src/data/geofences.json"
RINGS = ROOT / ".agents/outputs/udupi_ward_rings_from_pdf.json"
PRECISION = 6


def close_ring(ring):
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    return ring


def main():
    rings = {int(k): v for k, v in json.loads(RINGS.read_text()).items()}
    data = json.loads(API.read_text())

    replaced = 0
    for feature in data["features"]:
        props = feature["properties"]
        if props.get("type") != "ward" or props.get("panchayat") != "Udupi":
            continue
        num = int("".join(ch for ch in props["name"] if ch.isdigit()))
        ring = [[round(lng, PRECISION), round(lat, PRECISION)] for lng, lat in rings[num]]
        # drop consecutive duplicates introduced by rounding
        deduped = [ring[0]]
        for pt in ring[1:]:
            if pt != deduped[-1]:
                deduped.append(pt)
        feature["geometry"]["coordinates"] = [close_ring(deduped)]
        replaced += 1

    assert replaced == 35, f"expected 35 Udupi wards, replaced {replaced}"
    API.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Replaced {replaced} Udupi ward polygons in {API}")


if __name__ == "__main__":
    main()
