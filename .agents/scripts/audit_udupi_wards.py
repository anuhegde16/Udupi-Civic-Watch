"""Audit all 35 Udupi ward polygons in geofences.json against the official ArcMap GeoPDF.

Reads the ward-number labels embedded in the GeoPDF (exact geographic positions),
compares each to the corresponding geofence polygon, and reports a verdict per ward.
Also extracts the PDF's own ward boundary subpaths so a mismatched polygon can be
replaced with the authoritative ring.
"""

import json
import re
import subprocess
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "attached_assets/ward_map_Udupi_1786351151581.pdf"
GEOFENCES = ROOT / "artifacts/cleanspot/src/data/geofences.json"
OUT = ROOT / ".agents/outputs"
OUT.mkdir(parents=True, exist_ok=True)

# ── GeoPDF georeferencing (read from the page's /Measure + /Viewport dicts) ──
X0, Y0, X1, Y1 = 24.47957, 2832.48287, 2999.46673, 24.52499
LAT_NW, LON_NW = 13.41613, 74.69399  # normalized (0,0)
LAT_NE, LON_NE = 13.41626, 74.82906  # normalized (1,0)
LAT_SW, LON_SW = 13.29134, 74.69415  # normalized (0,1)


def geo(x: float, y: float) -> tuple[float, float]:
    lx = (x - X0) / (X1 - X0)
    ly = (y - Y0) / (Y1 - Y0)
    lat = LAT_NW + lx * (LAT_NE - LAT_NW) + ly * (LAT_SW - LAT_NW)
    lng = LON_NW + lx * (LON_NE - LON_NW) + ly * (LON_SW - LON_NW)
    return lat, lng


def content_stream() -> bytes:
    raw = PDF.read_bytes()
    streams = []
    for m in re.finditer(rb"stream\r?\n", raw):
        start = m.end()
        end = raw.find(b"endstream", start)
        try:
            streams.append(zlib.decompress(raw[start:end]))
        except zlib.error:
            pass
    return max(streams, key=len)


def extract_labels(stream: bytes) -> dict[int, tuple[float, float]]:
    """Ward-number labels are drawn per-glyph, so concatenate all Tj in a BT/ET block."""
    labels: dict[int, tuple[float, float]] = {}
    for block in re.findall(rb"BT\s*(.*?)\s*ET", stream, re.S):
        text = b"".join(re.findall(rb"\(([^)]*)\)\s*Tj", block)).decode("latin1").strip()
        tm = re.findall(
            rb"([-\d.]+)\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm", block
        )
        if not tm or not re.fullmatch(r"\d{1,2}", text):
            continue
        num = int(text)
        if not 1 <= num <= 35:
            continue
        _, x, y = tm[-1]
        labels[num] = geo(float(x), float(y))
    return labels


def extract_subpaths(stream: bytes) -> list[list[tuple[float, float]]]:
    """Group `x y m` / `x y l` operators into closed subpaths, in geographic coords."""
    tokens = re.findall(rb"([-\d.]+)\s+([-\d.]+)\s+(m|l)\b", stream)
    paths: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for sx, sy, op in tokens:
        pt = geo(float(sx), float(sy))
        if op == b"m":
            if len(current) >= 4:
                paths.append(current)
            current = [pt]
        else:
            current.append(pt)
    if len(current) >= 4:
        paths.append(current)
    return paths


def ring_centroid(ring: list[tuple[float, float]]) -> tuple[float, float]:
    """Area-weighted centroid; falls back to mean for degenerate rings."""
    a = cx = cy = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][1], ring[i][0]
        x2, y2 = ring[(i + 1) % n][1], ring[(i + 1) % n][0]
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(a) < 1e-12:
        return (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)
    a *= 0.5
    return (cy / (6 * a), cx / (6 * a))


def point_in_ring(lat: float, lng: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        j = (i - 1) % n
        yi, xi = ring[i][0], ring[i][1]
        yj, xj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
    return inside


def main() -> None:
    subprocess.run(
        ["pdftoppm", "-png", "-r", "150", "-singlefile", str(PDF), str(OUT / "udupi_ward_map")],
        check=True,
    )

    stream = content_stream()
    labels = extract_labels(stream)
    subpaths = extract_subpaths(stream)

    data = json.loads(GEOFENCES.read_text())
    udupi_wards = {}
    for f in data["features"]:
        props = f["properties"]
        if props.get("type") == "ward" and props.get("panchayat") == "Udupi":
            m = re.search(r"(\d+)", props.get("name", ""))
            if m:
                udupi_wards[int(m.group(1))] = f

    print(f"labels extracted: {len(labels)}  udupi wards: {len(udupi_wards)}  subpaths: {len(subpaths)}")

    rows = []
    for num in sorted(udupi_wards):
        feature = udupi_wards[num]
        ring = [(lat, lng) for lng, lat in feature["geometry"]["coordinates"][0]]
        centroid = ring_centroid(ring)
        label = labels.get(num)
        if label is None:
            rows.append((num, None, centroid, None, False, "NO LABEL"))
            continue
        delta = ((label[0] - centroid[0]) ** 2 + (label[1] - centroid[1]) ** 2) ** 0.5
        contains = point_in_ring(label[0], label[1], ring)
        verdict = "OK" if contains else "MISMATCH"
        rows.append((num, label, centroid, delta, contains, verdict))

    # Which ward polygon actually contains each label (detects swaps)
    containment: dict[int, list[int]] = {}
    for num, label in labels.items():
        hits = [
            w
            for w, f in udupi_wards.items()
            if point_in_ring(label[0], label[1], [(lat, lng) for lng, lat in f["geometry"]["coordinates"][0]])
        ]
        containment[num] = hits

    print(f"\n{'Ward':>4} {'label lat,lng':>22} {'centroid lat,lng':>22} {'delta°':>8}  {'label falls in ward(s)':<24} verdict")
    for num, label, centroid, delta, contains, verdict in rows:
        lbl = f"{label[0]:.5f},{label[1]:.5f}" if label else "—"
        cen = f"{centroid[0]:.5f},{centroid[1]:.5f}"
        d = f"{delta:.5f}" if delta is not None else "—"
        hits = ",".join(str(h) for h in containment.get(num, [])) or "none"
        print(f"{num:>4} {lbl:>22} {cen:>22} {d:>8}  {hits:<24} {verdict}")

    report = {
        "labels": {str(k): list(v) for k, v in labels.items()},
        "rows": [
            {
                "ward": n,
                "label": list(l) if l else None,
                "centroid": list(c),
                "delta_deg": d,
                "label_inside_polygon": ins,
                "verdict": v,
                "label_falls_in_wards": containment.get(n, []),
            }
            for n, l, c, d, ins, v in rows
        ],
    }
    (OUT / "udupi_ward_audit.json").write_text(json.dumps(report, indent=2))
    json_paths = [[[lng, lat] for lat, lng in p] for p in subpaths]
    (OUT / "udupi_pdf_subpaths.json").write_text(json.dumps(json_paths))
    print(f"\nWrote {OUT / 'udupi_ward_audit.json'} and {OUT / 'udupi_pdf_subpaths.json'}")


if __name__ == "__main__":
    main()
