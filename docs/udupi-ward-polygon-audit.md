# Udupi ward polygon audit (all 35 wards)

Every Udupi ward polygon in `artifacts/cleanspot/src/data/geofences.json` was checked
against the official ward map `attached_assets/ward_map_Udupi_1786351151581.pdf`
before publishing.

## Method

The ward map is an ArcMap GeoPDF, so the check is measured rather than eyeballed:

1. Each printed ward number is a text object in the PDF content stream with an exact
   position. Those positions are converted to lat/lng with the page's own georeferencing
   (`/Measure` `/GPTS` + Viewport `/BBox`), giving ground-truth coordinates for all 35 wards.
2. For each ward, the official label must fall **inside** the polygon that claims that ward
   number. Label-in-wrong-polygon is the test that catches swapped or shifted geometry;
   centroid distance alone does not, because neighbouring wards overlap in range.
3. Every polygon was then re-derived from the ward boundary subpaths in the same PDF and
   the result was rendered as a red overlay on the printed map for visual confirmation.

## Result

**19 of 35 polygons were already correct; 16 were misplaced and have been fixed.**

Wards fixed: 16, 17, 18, 19, 20, 23, 24, 26, 27, 28, 29, 31, 32, 33, 34 and 35.

The errors were not random. Across the affected range the polygons were shifted along
the map's own numbering order (the polygon labelled 16 actually covered ward 17's area,
17 covered 18's, and so on), which is the same class of extraction fault that produced
the known Ward 29 misplacement.
Ward 16 had no polygon containing its official label at all.
Ward 29 contained its own label but overlapped a neighbouring ward, so a report there could route to either supervisor.

All 35 polygons were replaced with the authoritative rings taken directly from the PDF,
so the corrected set is exact rather than nudged.

## Checklist

`Label in polygon` = does the official printed ward number fall inside the polygon of the
same number. Distance is from the official label to the polygon centroid.

| Ward | Official name | HI division | Expected area (official label lat, lng) | Centroid before | Label fell inside | Centroid after | Verdict |
|------|---------------|-------------|------------------------------------------|-----------------|-------------------|----------------|---------|
| 1 | Kola | West / Malpe | 13.35642, 74.70142 | 13.35666, 74.70175 | ward 1 ✓ | 13.35668, 74.70166 | OK |
| 2 | Vadabhandeshwara | West / Malpe | 13.36282, 74.70324 | 13.36303, 74.70422 | ward 2 ✓ | 13.36306, 74.70411 | OK |
| 3 | Malpe Central | West / Malpe | 13.34701, 74.70281 | 13.34727, 74.70440 | ward 3 ✓ | 13.34729, 74.70432 | OK |
| 4 | Kodavoor | West / Malpe | 13.35995, 74.71613 | 13.36016, 74.71862 | ward 4 ✓ | 13.36019, 74.71854 | OK |
| 5 | Kalmady | West / Malpe | 13.34417, 74.71245 | 13.34420, 74.71212 | ward 5 ✓ | 13.34422, 74.71205 | OK |
| 6 | Moodubettu | West / Malpe | 13.35596, 74.72574 | 13.35616, 74.72611 | ward 6 ✓ | 13.35620, 74.72604 | OK |
| 7 | Kodankuru | West / Malpe | 13.35482, 74.73728 | 13.35501, 74.73669 | ward 7 ✓ | 13.35506, 74.73665 | OK |
| 8 | Nittur | West / Malpe | 13.35630, 74.74457 | 13.35573, 74.74560 | ward 8 ✓ | 13.35578, 74.74557 | OK |
| 9 | Subhrahmanya Nagar | West / Malpe | 13.36506, 74.73756 | 13.36750, 74.73743 | ward 9 ✓ | 13.36754, 74.73737 | OK |
| 10 | Gopalapura | West / Malpe | 13.38151, 74.74353 | 13.38117, 74.74182 | ward 10 ✓ | 13.38122, 74.74175 | OK |
| 11 | Kakkunje | East / Manipal | 13.37308, 74.75287 | 13.37502, 74.75438 | ward 11 ✓ | 13.37508, 74.75434 | OK |
| 12 | Karamballi | East / Manipal | 13.36422, 74.75891 | 13.36448, 74.75958 | ward 12 ✓ | 13.36456, 74.75955 | OK |
| 13 | Moodu Perampalli | East / Manipal | 13.37338, 74.77279 | 13.37235, 74.77429 | ward 13 ✓ | 13.37244, 74.77428 | OK |
| 14 | Saralabettu | East / Manipal | 13.36367, 74.79085 | 13.36359, 74.79139 | ward 14 ✓ | 13.36369, 74.79142 | OK |
| 15 | Shettibettu | East / Manipal | 13.36839, 74.80637 | 13.36863, 74.80837 | ward 15 ✓ | 13.36865, 74.80861 | OK |
| 16 | Parkala | East / Manipal | 13.35092, 74.80603 | 13.34696, 74.79684 | no polygon | 13.35270, 74.80686 | **FIXED** |
| 17 | Eshwar Nagar | East / Manipal | 13.34682, 74.79623 | 13.34511, 74.78672 | ward 16 | 13.34707, 74.79690 | **FIXED** |
| 18 | Manipal | East / Manipal | 13.34620, 74.78561 | 13.33481, 74.77655 | ward 17 | 13.34521, 74.78677 | **FIXED** |
| 19 | Moodu Sagri | East / Manipal | 13.35588, 74.77134 | 13.34773, 74.75901 | ward 35 | 13.35489, 74.77248 | **FIXED** |
| 20 | Indrali | East / Manipal | 13.33489, 74.77618 | 13.33292, 74.76604 | ward 18 | 13.33490, 74.77659 | **FIXED** |
| 21 | Indira Nagar | East / Manipal | 13.32053, 74.78018 | 13.32136, 74.77827 | ward 21 ✓ | 13.32143, 74.77822 | OK |
| 22 | 76 Badagubettu | Central / Udupi | 13.31867, 74.74638 | 13.31888, 74.75042 | ward 22 ✓ | 13.31893, 74.75048 | OK |
| 23 | Chitpady | Central / Udupi | 13.32498, 74.74814 | 13.32638, 74.74425 | ward 32 | 13.32475, 74.75830 | **FIXED** |
| 24 | Kasthurba Nagar | East / Manipal | 13.33274, 74.76520 | 13.32982, 74.75406 | ward 20 | 13.33299, 74.76607 | **FIXED** |
| 25 | Kunjibettu | Central / Udupi | 13.34051, 74.75659 | 13.34068, 74.75776 | ward 25 ✓ | 13.34075, 74.75777 | OK |
| 26 | Kadiyali | Central / Udupi | 13.34803, 74.75726 | 13.35508, 74.75392 | ward 19 | 13.34780, 74.75900 | **FIXED** |
| 27 | Gundibailu | Central / Udupi | 13.35490, 74.75196 | 13.34703, 74.73906 | ward 26 | 13.35514, 74.75391 | **FIXED** |
| 28 | Bannanje | West / Malpe | 13.34682, 74.73703 | 13.33522, 74.73713 | ward 27 | 13.34708, 74.73903 | **FIXED** |
| 29 | Tenkapete | Central / Udupi | 13.34005, 74.75028 | 13.33968, 74.75075 | ward 29, 34 | 13.33968, 74.75075 | **FIXED** |
| 30 | Olakadu | Central / Udupi | 13.33407, 74.75228 | 13.33427, 74.75239 | ward 30 ✓ | 13.33433, 74.75240 | OK |
| 31 | Bailoor | Central / Udupi | 13.32898, 74.75183 | 13.33634, 74.74509 | ward 24 | 13.32989, 74.75408 | **FIXED** |
| 32 | Kinnimulky | Central / Udupi | 13.32619, 74.74422 | 13.32468, 74.75827 | ward 23 | 13.32644, 74.74426 | **FIXED** |
| 33 | Ajjarakadu | Central / Udupi | 13.33614, 74.74466 | 13.34174, 74.74376 | ward 31 | 13.33640, 74.74509 | **FIXED** |
| 34 | Shiribeedu | Central / Udupi | 13.34155, 74.74377 | 13.33961, 74.75075 | ward 33 | 13.34180, 74.74375 | **FIXED** |
| 35 | Ambalapady | West / Malpe | 13.33735, 74.73266 | 13.35480, 74.77247 | ward 28 | 13.33527, 74.73712 | **FIXED** |

**Totals:** 19 already correct, 16 fixed, 35 verified.

## Post-fix verification

- Every official ward label now falls inside its own polygon, and only its own: yes.
- No Udupi ward centroid falls inside another Udupi ward (no overlapping polygons).
- The Udupi and Saligrama district boundaries were regenerated from the ward union via
  `scripts/src/rebuild-district-boundary.ts`; both dissolve to a single polygon, so no
  point inside a district is left uncovered by a ward.
- Client and server copies of `geofences.json` are byte-identical.

## Notes on the wards flagged before the audit

The division names in the app-list Excel are administrative groupings, not strict
geographic zones, so a longitude that looks 'wrong' for a division is not by itself an
error. Of the eight wards flagged for closest inspection, wards 11, 12, 8 and 10 were confirmed correctly placed against the printed map; wards 19, 20, 24 and 35 were genuinely misplaced and were corrected.

## Reproducing

```bash
python .agents/scripts/audit_udupi_wards.py       # per-ward audit table
python .agents/scripts/render_ward_overlay.py     # visual overlay on the official map
```
