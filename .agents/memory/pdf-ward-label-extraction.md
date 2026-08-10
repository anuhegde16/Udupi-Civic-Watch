---
name: Udupi ward map PDF audit — label extraction and how to validate polygon claims
description: How to read ward-number label positions out of the Udupi ArcMap GeoPDFs, and how to prove a ward polygon is right or wrong (containment + pairwise overlap, never centroid distance).
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
number; the rest are shifted, mostly by one. The 2009 CMC edition also prints
the number `29` **twice** and has 36 numeric labels for 35 wards.

**Why this matters:** the shipped polygons derive from the *older* edition.
Auditing them against the 2009 CMC edition produces a large pile of apparent
"mismatches" that are really just a numbering-scheme difference. Never mix
editions in one comparison. The audit of record used the older
`ward_map_Udupi_*` edition.

## Extraction technique
Ward labels are PDF text operators in the first/largest content stream
(FlateDecode). Read the stream by locating `endstream` — do **not** trust the
`/Length` value, which is an indirect reference (`/Length 2 0 R`) and will give
a truncated, undecompressable slice.

Then pull `BT ... ET` blocks; `Tm` gives position (`e`,`f`), `(...) Tj` gives text.

Two gotchas that silently corrupt the label set:
- **Labels are drawn glyph by glyph** — one `Tj` per character, so a two-digit
  ward arrives as `(1)Tj (5)Tj`. **Concatenate all `Tj` in a block with no
  separator.** Joining with a space yields `"1 5"`, which drops every two-digit
  ward and makes an audit look like it only found a handful of labels.
- **Filter by font and rotation.** In the CMC edition real ward labels are
  `ArialMT` at effective size 48, unrotated; rotated ~7.9pt `Arial-BoldMT`
  blocks are road labels whose text tokenizes into bare numbers (from IDs like
  `9-6-157`) and pollutes the set.

Convert page coords to geographic with the page's own Viewport `/BBox` +
`/Measure` `/GPTS` corners (`Bounds`/`LPTS` order is SW, NW, NE, SE) rather than
hardcoded constants: `lx=(x-x0)/(x1-x0); ly=(y-ytop)/(ybot-ytop)`, then bilinear
against the corners. Latitude increases with PDF_y (north-up).

Ward boundary paths use only `m`/`l` operators (no Bézier `c`/`v`/`y`), so
tokenizing straight segments captures the geometry losslessly.

## The methodology trap (this caused a real regression)
Comparing a ward's **label position** to its **polygon centroid** and treating a
large distance as proof of misassignment is invalid. Ward polygons here are
long, bent, and L-shaped; the centroid routinely falls far from where the
cartographer placed the label — and can even fall outside the polygon. A large
label-to-centroid distance is a *hint to investigate*, never a conclusion.

Acting on that weak signal, Ward 29's ring was once replaced with the
**nearest-centroid** subpath. The replacement was ~97% identical to Ward 34,
i.e. it duplicated a neighbouring ward and **removed the real Ward 29 area
(around 13.3545, 74.8063) from the service area entirely** — citizens there
would have been told they were outside the covered zone. `validate:geo` passed
24/24 both before and after, so **the geo validation suite does not catch a
wrong-but-well-formed polygon.**

**Why:** the suite checks the service-area gate and officer routing on fixed
sample points; it has no assertion that ward rings are distinct or that any
particular ward still covers its real ground.

## How to actually validate a polygon claim
Use evidence that does not depend on centroid geometry:
1. **Point-in-polygon on the label** — does the label fall inside the ring
   claimed for it (using the *matching* PDF edition), **and only that one**?
   The only passing result is exactly `[own ward]`. This catches two failure
   modes distance never sees: a label inside *no* polygon, and a label inside
   *two* overlapping polygons. Distance thresholds also cannot detect a
   whole-block off-by-one shift, because adjacent urban wards sit well within
   any tolerance you would pick.
2. **Pairwise overlap** — sample the bbox intersection of every ward pair. Two
   wards sharing a large fraction of area means a duplicated ring. Needs no
   georeferencing and is the most trustworthy signal.
3. **Coverage delta** — before/after any edit, check that no point that used to
   be in the service area has fallen out of it.
4. **Visual overlay** — render with `pdftoppm -png -r 150` and overlay the ring;
   the audit is only as good as the georeferencing, and the overlay proves it.

**How to apply:** run checks 2 and 3 before committing any geofence edit, and
treat a green `validate:geo` as necessary but not sufficient.

## Fixing is a re-derivation, not a nudge
When polygons are wrong, don't hand-adjust them and don't pick by nearest
centroid (that is exactly what produced the duplicate-ring regression above).
Match each label to the **smallest PDF subpath containing it** — that is the
authoritative ring — and replace the geometry wholesale. Dedupe the subpaths
first (fill/stroke layers repeat each ring), and confirm every ward resolves to
a **distinct** polygon before writing.

Errors from this extraction tend to be *systematic* (a run of wards each holding
their neighbour's area), not isolated. Finding one bad ward is reason to
re-check all of them.

## After any polygon edit
1. Write the API-server copy, then mirror it to the client copy — they must stay
   byte-identical (`cmp -s`). `rebuild-district-boundary.ts` rewrites only the
   api-server copy, so copy it across afterwards or the client and server guards
   will disagree.
2. Re-run the ward-union district rebuild script; confirm each district
   dissolves to a single Polygon, not a MultiPolygon (see
   district-boundary-derivation.md).
3. Run the geo-routing validation script against a restarted API server.

## Known gotcha: leftover validation fixtures
The geo-routing validation script creates a temporary "Udupi Ward 14" officer
and deletes it in a `finally` block. Interrupted runs leave orphaned
`Geo-Validation Udupi Ward 14` officer rows behind, which pollute officer counts
and ward-assignment queries. Filter them out when reasoning about real officer data.
