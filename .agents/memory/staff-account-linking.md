---
name: Staff ↔ login account linking
description: How Udupi hierarchy staff and legacy field officers are matched to their login rows, and why name/email matching is forbidden.
---

# Linking a staff profile to its login account

Resolve a hierarchy staff member's login row by the pair `(users.role, users.officer_id)`.
Legacy field officers are linked through their `officers` row plus the matching `users`
row. Never resolve a login account by person name or by email address.

**Why:** staff names repeat across panchayats (honorifics like "Mr."/"Smt." plus common
Kannada given names collide constantly), and hierarchy roles share seeded placeholder
emails. Matching on either one lets a password change or credential edit silently land on
a different person's account — the account that gets rewritten is whichever row the query
happened to return first, so the bug is invisible until someone can't log in.

**How to apply:** any endpoint that edits credentials, changes a password, or deletes a
staff member must look the account up by role + linked profile id before writing. If the
lookup returns nothing, fail loudly rather than falling back to a looser match.

# `users.officer_id` is a per-role foreign key, not a shared id

`users.officer_id` addresses a **different table depending on `users.role`**: `officers.id`
for a field officer, `supervisors.id` for a supervisor, and the matching hierarchy table for
the other roles. Always read it against the table that matches the session's role, and
re-check the stored row's panchayat instead of trusting the session's claim.

**Why:** those id sequences are independent, so the same number is a valid row in several
tables at once. Middleware that accepts two roles and then queries one table will silently
hand a caller of the other role whichever unrelated profile shares its number — a real
cross-account read/write, not a 404. It passes every test that fakes a session by reusing
another role's id, because the forged session exercises a lookup that cannot occur in
production.

**How to apply:** when one endpoint serves multiple roles, resolve the profile once in the
guard, attach the resolved record to the request, and let handlers use only that. Fixtures
must create the real profile row plus its `users` row rather than pointing a session at a
convenient id. Distinguish "no profile row" (data gap → 404) from "profile belongs
elsewhere" (denial → 403); collapsing both into 403 makes a valid role look unauthorized.

# Validate role/panchayat/ward pairings on the server

A staff management API must reject mismatched combinations itself — a hierarchy role in a
panchayat that does not use it, a ward belonging to another panchayat, a direct ward
assignment to a role whose coverage is derived, or a parent in a different panchayat.

**Why:** the roster UI only offers valid combinations per municipality, but dropdown
filtering is not authorization. A hand-made request creates staff that no role-scoped view
can see, so they cannot be found or cleaned up afterwards.

# Ward semantics differ by staff tier

- Supervisors and community mobilisers have **explicitly assigned** wards.
- Environmental engineers and health inspectors have **derived** coverage — the union of
  the wards belonging to the supervisors beneath them. They get no direct ward picker.
- Report counts follow the same split: Udupi hierarchy counts are computed geographically
  from ward polygons, while legacy field-officer counts come from explicit report
  assignment.

**Why:** the Udupi hierarchy was never wired to per-report assignment, so counting by
assignment would show zero for every hierarchy role.

# Never fall back to email when deleting a login

Edits may repair a missing link by matching email as a last resort, but deletion must not.
Resolve exactly one account by role + linked profile id and fail the whole removal (409,
rolled back) when zero or several match.

**Why:** an edit that lands on the wrong row is recoverable; a delete is not. A staff
profile whose link is stale or absent can share an email with a completely unrelated
account, and an email predicate then destroys that stranger's login instead. The "safe"
alternative of deleting nothing is also wrong — it leaves a working login for someone who
was just removed.

# Removal ordering

Refuse to delete a hierarchy parent while child records still reference it. Deleting an
inspector out from under its supervisors orphans them and they vanish from every
role-scoped view with no error surfaced anywhere.
