---
name: Geofence extraction from ArcMap GeoPDF
description: How Saligrama (and future taluk) service-area polygons are extracted from ArcMap GeoPDFs, plus the lat-flip gotcha and two-file sync requirement.
---

# Extracting service-area polygons from ArcMap GeoPDFs

The official boundary PDFs (e.g. `attached_assets/Saligrama_maps_*.pdf`) are
Esri ArcMap GeoPDFs. The boundary is real vector data in the page content
stream, not an image — extract it directly, don't trace by hand.

## Method
- The content stream (object `1 0`, FlateDecode) holds the path. Tokenize the
  decompressed stream and group `x y m` / `x y l` operators into subpaths.
  The town boundary is the longest closed subpath (it appears 3–4× as
  fill/stroke layers — dedupe to one ring).
- Georeference with the page's GeoPDF dict: `/GPTS` (4 geo corners as lat,lon
  pairs), `/LPTS` (normalized 0–1 corners), and the Viewport `/BBox`
  `[x0 y0 x1 y1]`. Mapping: `PDF_x = x0 + lx*(x1-x0)`, `PDF_y = y0 + ly*(y1-y0)`.
- Projection is WGS_1984_UTM_Zone_43N, north-up, axis-aligned, so a simple
  linear PDF→lat/lon transform per axis is accurate enough.

## Orientation gotcha (the bug that caused the user-visible mismatch)
**Latitude increases with PDF_y (north is up).** A prior extraction had the
latitude axis flipped, producing a polygon with identical bounding box but
rendered upside-down (south tail pointing north). The bounding box matching is
NOT sufficient proof — always verify orientation.

**Why:** same bbox can hide a mirror/rotation; only the actual vertex order reveals it.
**How to apply:** after extracting, render the raw PDF to PNG (`pdftoppm`) and
overlay the extracted path (Pillow) — the red line must trace the printed
boundary exactly. Also sanity-check that the first vertex's latitude lands on
the correct edge.

## Two-file sync
The geofence GeoJSON lives in BOTH `artifacts/cleanspot/src/data/geofences.json`
(client) and `artifacts/api-server/src/data/geofences.json` (server). They must
stay byte-identical or the client guard and server `isWithinServiceArea` check
will disagree. After regenerating, `diff` them and confirm identical.
Coords are `[lon, lat]`; `properties.name` = zone name; ring must be closed.
