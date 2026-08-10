---
name: Destructive endpoint tests on the shared dev DB
description: Tests that exercise real purge/archive endpoints must snapshot and restore pre-existing rows, or they silently wipe the seeded demo data.
---

Any test that calls a real bulk-destructive endpoint (purge, bulk-archive, cascade delete)
must snapshot the pre-existing rows in that endpoint's blast radius during setup and restore
them in teardown. Hard-deleting only the rows the test itself seeded is NOT enough.

**Why:** The seeded demo dataset is flagged `is_test = true`, and the commissioner purge
endpoint soft-deletes *every* active `is_test` report inside the caller's ward polygons —
not just rows a test created. A purge-safety test therefore archived the entire Udupi
dataset as collateral. The dashboards then rendered empty with no error anywhere: the API
returned `200` with zero reports, so it looked like a query/filtering bug and cost a long
detour before the test run was identified as the cause.

**How to apply:**
- Before adding a test that hits a destructive endpoint against the shared dev DB, ask what
  else matches its selection criteria — the seeded fixtures almost certainly do.
- In `beforeAll`, `SELECT` the ids the endpoint would affect; in `afterAll`, revive them
  (`UPDATE ... SET deleted_at = NULL`) after hard-deleting the test's own rows.
- When a dashboard suddenly shows zero records and the API is healthy, check
  `SELECT deleted_at, count(*) ... GROUP BY deleted_at` first. A single shared timestamp
  across many rows means one bulk operation did it, and the timestamp says when.
