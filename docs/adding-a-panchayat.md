# Adding a new panchayat

Everything is driven by data, so a new panchayat needs no app code changes.

## 1. Get the ward boundaries
Ask for the **ward-level** KGIS file (KML/KMZ or shapefile) for the town/panchayat code.
A file with only the town outline is not enough (it has no ward lines).
Shapefiles from KGIS are in UTM zone 43N; convert to lat/lon (WGS84) before use.

## 2. Add it to the master file
`artifacts/api-server/src/data/geofences.json` is the single source of truth.
Append one `district` outline (the union of the wards) and the `ward` features:

- names: `"<Panchayat> Ward N"`, `properties.panchayat = "<Panchayat>"`
- coordinates are `[lon, lat]`, rounded to 6 decimals
- check: every ward valid, no overlaps, the union is one polygon
- the outline must be the union of the wards (see `.agents/memory/district-boundary-derivation.md`)

## 3. Regenerate the web copy
```
pnpm --filter @workspace/scripts run geo:split     # writes src/data/geo/
pnpm --filter @workspace/scripts run geo:check     # confirms nothing is out of date
```

## 4. Optional ward names
If a ward-name list exists, add `<PANCHAYAT>_WARD_NAMES` in
`artifacts/cleanspot/src/lib/ward-names.ts` and register it in `WARD_NAMES_BY_PANCHAYAT`.
Without it, wards show as "Ward N".

## 5. Add the officers (on the server)
Keep the staff list OUT of git: put it in `private/` at the repo root (ignored). Run the commands from the repo root.
CSV header: `ward,name,phone,email`
```
pnpm --filter @workspace/scripts run add:officers -- --panchayat <Name> --file private/<name>.csv          # dry run
pnpm --filter @workspace/scripts run add:officers -- --panchayat <Name> --file private/<name>.csv --apply  # save
```
Each officer gets a random temporary password (written to a private file, never printed)
and must choose a new one at first login. Add `--password phone` to use each officer's own
phone number as the temporary password instead (easier to hand out, but anyone who knows the
number can log in first, so ask officers to change it the same day). Re-running is safe: existing accounts are skipped.

## 6. Until officers exist
Reports in an area without officers are saved but unassigned. A master admin can switch the
area off for the public (Panchayat visibility) until officers are in place.
