---
name: Udupi ward map PDF audit — label extraction and its pitfalls
description: How to read ward-number label positions out of the Udupi ArcMap GeoPDFs, and why label-vs-centroid distance alone is NOT valid evidence that a polygon is misassigned.
---

# Auditing Udupi ward polygons against the official GeoPDFs

## The two source PDFs are different editions
There are two Udupi ward GeoPDFs in `attached_assets/`, and they are **not**
interchangeable:

| Edition | Creator | Page size | Georef (`/GPTS`) |
|---|---|---|---|
| older `ward_map_Udupi_*` | Esri ArcMap 10.8.1 (2020) | 3024 x 3024 | 13.29134/74.69415 … 13.41626/74.82906 |
| `CMC_Udupi_WARD_MAP_*` | ESRI ArcMap 9.3.1 (2009) | 3600 x 2592 | 13.31233/74.6939 … 13.40625/74.82694 |

**The two editions use different ward numbering.** Cross-matching each label in
one edition to the nearest label in the other: only ~9 of 36 keep the same
number; the rest are shifted, mostly by one (new 7 sits where old 8 was, new 8
where old 9 was, and so on). The 2009 CMC edition also prints the number `29`
**twice** and has 36 numeric labels for 35 wards.

**Why this matters:** the shipped polygons were derived from the *older*
edition. Auditing them against the 2009 CMC edition produces a large pile of
apparent "mismatches" that are really just a numbering-scheme difference. Never
mix editions in one comparison.

## Extraction technique
Ward labels are PDF text operators in the first content stream (object `1 0`,
FlateDecode). Read the stream by locating `endstream` — do **not** trust the
`/Length` value, which is an indirect reference (`/Length 2 0 R`) and will give
a truncated, undecompressable slice.

```python
start = pdf.find(b'1 0 obj'); i = pdf.find(b'stream', start) + 6
if pdf[i:i+2] == b'\r\n': i += 2
elif pdf[i:i+1] in (b'\n', b'\r'): i += 1
s = zlib.decompressobj().decompress(pdf[i:pdf.find(b'endstream', i)])
```

Then pull `BT ... ET` blocks; `Tm` gives position (`e`,`f`), `(...) Tj` gives
text. In the CMC edition the real ward labels are **ArialMT at effective size
48, unrotated** — filter on that. Rotated `Arial-BoldMT` ~7.9pt blocks are road
labels; their text tokenizes into bare numbers (from IDs like `9-6-157`) and
will pollute the label set otherwise.

Convert page coords to geographic with the Viewport `/BBox` + `/GPTS` corners
(`Bounds`/`LPTS` order is SW, NW, NE, SE):
`lx=(x-x0)/(x1-x0); ly=(y-ytop)/(ybot-ytop)`, then bilinear against the corners.

## The methodology trap (this caused a real regression)
Comparing a ward's **label position** to its **polygon centroid** and treating a
large distance as proof of misassignment is invalid. Ward polygons here are
long, bent, and L-shaped; the centroid of such a shape routinely falls far from
where the cartographer placed the label — and can even fall outside the polygon.
A large label-to-centroid distance is a *hint to investigate*, never a
conclusion.

Acting on that weak signal, Ward 29's ring was once replaced with a nearby
subpath. The replacement was ~97% identical to Ward 34, i.e. it duplicated a
neighbouring ward and **removed the real Ward 29 area (around 13.3545, 74.8063)
from the service area entirely** — citizens there would have been told they were
outside the covered zone. `validate:geo` passed 24/24 both before and after, so
**the geo validation suite does not catch a wrong-but-well-formed polygon.**

**Why:** the suite checks the service-area gate and officer routing on fixed
sample points; it has no assertion that ward rings are distinct or that any
particular ward still covers its real ground.

## How to actually validate a polygon claim
Use evidence that does not depend on centroid geometry:
1. **Point-in-polygon on the label** — does the label fall inside the ring
   claimed for it (using the *matching* PDF edition)?
2. **Pairwise overlap** — sample the bbox intersection of every ward pair. Two
   wards sharing a large fraction of area means a duplicated ring. This test
   needs no georeferencing at all and is the most trustworthy signal.
3. **Coverage delta** — before/after any edit, check that no point that used to
   be in the service area has fallen out of it.
4. **Visual overlay** — render with `pdftoppm -png -r 150` and overlay the ring.

**How to apply:** run checks 2 and 3 before committing any geofence edit, and
treat a green `validate:geo` as necessary but not sufficient.

## Two-file sync
`artifacts/cleanspot/src/data/geofences.json` and
`artifacts/api-server/src/data/geofences.json` must stay byte-identical
(`cmp -s`). `rebuild-district-boundary.ts` rewrites only the api-server copy, so
copy it across afterwards or the client and server guards will disagree.
