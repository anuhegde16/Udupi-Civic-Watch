---
name: Status color conventions
description: Which color maps to which report status across CleanSpot UI, and which amber/orange usages are unrelated.
---

Report status colors: `reported` = red/destructive, `cleaning` (in progress) = **blue** (`#3b82f6` / Tailwind `blue-*`), `cleaned` = green/primary.

**Why:** amber/orange for "cleaning" was easy to confuse with the green "cleaned" state at a glance on maps and dashboards; blue reads unambiguously as a distinct third state.

**How to apply:** when touching any status legend, marker color, stat card, badge, or chart series tied to report status, use blue for "cleaning". Do NOT sweep every amber/orange occurrence in the codebase — many are unrelated and must stay as-is:
- Zone/officer/ward color palettes (arrays of hex colors used to distinguish areas/officers, not statuses)
- Warning/alert UI (duplicate-report warnings, unassigned-ward notices, archive buttons, "Blocked" notification chips)
- Hotspot/repeated-location indicators (flame icons, hotspot counts)
- Generic "pending count" badges that aggregate multiple statuses (not exclusively "cleaning")
- Marketing/CTA buttons unrelated to status (e.g. the citizen landing page's "Report Waste Now" button)

Map popups (citizen live map, officer zone map, panchayat map, admin district map) show a before/after photo pair when a report is `cleaned` and has a `cleanupImageUrl`; otherwise just the original photo. The public `/api/reports/public/map` backend route must explicitly select `cleanupImageUrl` (it's a hand-rolled route, not OpenAPI-generated, so it's easy to forget when adding new fields to the map response).
