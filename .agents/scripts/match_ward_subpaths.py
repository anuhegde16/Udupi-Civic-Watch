"""Match each official ward label to its authoritative boundary subpath from the GeoPDF.

For every ward label, find the smallest PDF subpath that contains it. That subpath is the
ward's true boundary. Prints diagnostics so the assignment can be verified before writing.
"""

import json
from pathlib import Path

from audit_udupi_wards import (  # reuse the verified extraction + georeferencing
    OUT,
    content_stream,
    extract_labels,
    extract_subpaths,
    point_in_ring,
    ring_centroid,
)


def ring_area(ring):
    a = 0.0
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def signature(ring):
    return tuple(sorted((round(lat, 7), round(lng, 7)) for lat, lng in ring))


def main():
    stream = content_stream()
    labels = extract_labels(stream)
    subpaths = extract_subpaths(stream)

    # Dedupe fill/stroke duplicates of the same geometry
    unique = {}
    for p in subpaths:
        unique.setdefault(signature(p), p)
    paths = list(unique.values())
    print(f"labels: {len(labels)}  raw subpaths: {len(subpaths)}  unique: {len(paths)}")

    assignment = {}
    for num in sorted(labels):
        lat, lng = labels[num]
        containing = [p for p in paths if point_in_ring(lat, lng, p)]
        containing.sort(key=ring_area)
        if not containing:
            print(f"  ward {num}: NO containing subpath")
            continue
        best = containing[0]
        assignment[num] = best
        print(
            f"  ward {num:>2}: {len(containing)} containing; chosen area={ring_area(best):.8f} "
            f"pts={len(best)} centroid={ring_centroid(best)[0]:.5f},{ring_centroid(best)[1]:.5f}"
        )

    # Each ward must get a distinct polygon
    sigs = {}
    for num, ring in assignment.items():
        sigs.setdefault(signature(ring), []).append(num)
    dupes = {s: v for s, v in sigs.items() if len(v) > 1}
    print(f"\nassigned: {len(assignment)}/35   duplicate-geometry groups: {len(dupes)}")
    for s, wards in dupes.items():
        print(f"  wards sharing one polygon: {wards} ({len(s)} pts)")

    out = {str(n): [[lng, lat] for lat, lng in ring] for n, ring in assignment.items()}
    (OUT / "udupi_ward_rings_from_pdf.json").write_text(json.dumps(out))
    print(f"\nWrote {OUT / 'udupi_ward_rings_from_pdf.json'}")


if __name__ == "__main__":
    main()
