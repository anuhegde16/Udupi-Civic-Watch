---
name: Seed data casing mismatches
description: Seeded fixture identifiers in a project's database can differ in capitalization from what's written in project docs like replit.md.
---

Seeded/fixture accounts or identifiers stored in a database can have different capitalization than what's documented in project README-style files (e.g. `replit.md`). Trusting the documented value at face value for login-dependent flows can cause spurious failures that look like app bugs but are actually just a docs/data mismatch.

**Why:** An e2e login attempt failed using a documented credential value before checking the database directly and discovering the actual stored value had different capitalization.

**How to apply:** Before writing a login step in an e2e test plan (or debugging a login failure) for a seeded account, query the relevant table directly to confirm the exact stored value rather than trusting project docs.
