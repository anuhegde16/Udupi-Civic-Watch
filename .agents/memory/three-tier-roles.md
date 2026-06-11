---
name: Three-tier role hierarchy
description: CleanSpot roles — control_center / panchayat_admin / field_officer with backward-compat aliases for admin/officer.
---

## Roles

| New name | Old alias | Dashboard route |
|---|---|---|
| `control_center` | `admin` | `/admin/dashboard` |
| `panchayat_admin` | (new) | `/master/dashboard` |
| `field_officer` | `officer` | `/officer/dashboard` |

## Middleware (artifacts/api-server/src/lib/auth.ts)
- `requireAdmin` / `requireControlCenter` — both check control_center OR admin
- `requirePanchayatAdmin` — panchayat_admin only
- `requirePanchayatOrControlCenter` — either

## Frontend alias expansion (auth-guard.tsx)
`expandRoles()` converts any old alias to the full set before checking `user.role`.

**Why:** DB column `role` stores the new values post-migration. Old name aliases in middleware prevent breaking existing session cookies.

**How to apply:** When adding new route guards, use the new role names. The auth-guard expands old names automatically, so passing `["admin"]` or `["control_center"]` both work.
