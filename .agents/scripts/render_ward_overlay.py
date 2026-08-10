"""Overlay the geofences.json ward polygons onto the rendered official ward map.

Red outlines are the shipped polygons; they must trace the printed grey ward boundaries.
Blue labels are the ward numbers from geofences.json, drawn at each polygon's centroid --
they must sit on top of the map's own printed ward number.
"""

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

from audit_udupi_wards import (
    GEOFENCES,
    LAT_NE,
    LAT_NW,
    LAT_SW,
    LON_NE,
    LON_NW,
    LON_SW,
    OUT,
    PDF,
    X0,
    X1,
    Y0,
    Y1,
    ring_centroid,
)

DPI = 150
SCALE = DPI / 72.0
PAGE_H = 3024  # MediaBox height in points


def inverse_geo(lat: float, lng: float) -> tuple[float, float]:
    """Geographic -> normalized -> PDF point -> image pixel."""
    d_lat_x, d_lon_x = LAT_NE - LAT_NW, LON_NE - LON_NW
    d_lat_y, d_lon_y = LAT_SW - LAT_NW, LON_SW - LON_NW
    det = d_lat_x * d_lon_y - d_lat_y * d_lon_x
    dlat, dlon = lat - LAT_NW, lng - LON_NW
    lx = (dlat * d_lon_y - d_lat_y * dlon) / det
    ly = (d_lat_x * dlon - dlat * d_lon_x) / det
    pdf_x = X0 + lx * (X1 - X0)
    pdf_y = Y0 + ly * (Y1 - Y0)
    return pdf_x * SCALE, (PAGE_H - pdf_y) * SCALE


def main():
    base_path = OUT / "udupi_ward_map.png"
    if not base_path.exists():
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(DPI), "-singlefile", str(PDF), str(OUT / "udupi_ward_map")],
            check=True,
        )
    img = Image.open(base_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    data = json.loads(GEOFENCES.read_text())
    for feature in data["features"]:
        props = feature["properties"]
        if props.get("panchayat") != "Udupi":
            continue
        is_ward = props.get("type") == "ward"
        rings = feature["geometry"]["coordinates"]
        if feature["geometry"]["type"] == "MultiPolygon":
            rings = [r for poly in rings for r in poly]
        for ring in rings:
            pts = [inverse_geo(lat, lng) for lng, lat in ring]
            draw.line(pts, fill=(255, 0, 0) if is_ward else (0, 160, 0), width=2 if is_ward else 4)
        if is_ward:
            num = "".join(ch for ch in props["name"] if ch.isdigit())
            lat, lng = ring_centroid([(lat, lng) for lng, lat in rings[0]])
            x, y = inverse_geo(lat, lng)
            draw.text((x + 6, y + 4), num, fill=(0, 0, 255))

    out = OUT / "udupi_ward_overlay.png"
    img.save(out)
    # A tighter crop of the dense central/south cluster where the errors were
    img.crop((450, 700, 1750, 1900)).resize((1300, 1200)).save(OUT / "udupi_ward_overlay_central.png")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
