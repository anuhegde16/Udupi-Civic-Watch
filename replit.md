# CleanSpot

## Overview

CleanSpot is a mobile-first civic waste reporting platform. Citizens can report waste locations using a photo and GPS, and reports are automatically routed to the correct government officer based on their assigned area.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS (artifacts/cleanspot)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Cookie-based sessions with bcryptjs password hashing

## Default Credentials

- **Admin**: admin@udupicivicwatch.com / admin@udupicivicwatch.com
- **Panchayat Admin (Saligrama)**: saligrama@udupicivicspot.com / saligrama@udupicivicspot.com
- **Password = email** for all field officers (see table below)

### Saligrama Field Officers

| Ward | Name | Email (= password) | Phone |
|------|------|--------------------|-------|
| Ward 1 | Rajshekhar M | rajshekharmattam1968@gmai.com | 9448263410 |
| Ward 2 | Pradeep | pradeep.preetham@gamil.com | 7760297271 |
| Ward 3 | Shivaraj Ramesh Naik | shivarajrameshnaik@gmail.com | 9481051039 |
| Ward 4 | Mamatha | mmamatha23839@gmail.com | 9035627273 |
| Ward 5 | Udaya Naik | naikudaya68@gmail.com | 9900738870 |
| Ward 6 | Sharada Bai Prabhu Hiremani | sharadahodlur@gmail.com | 9008979298 |
| Ward 7 | Sumitha H.V | sumitha.v1980@gmail.com | 8197353162 |
| Ward 8 | Praveen | praveen.kateel86@gmail.com | 8147447398 |
| Ward 9 | Prathima | prathimanayari@gmail.com | 9481384791 |
| Ward 10 | Dinesh | dineshgoldenbridge@gmail.com | 9743493420 |
| Ward 11 | Lohith | lohithpoojary63@gmail.com | 9620422944 |
| Ward 12 | Vasanthi | vasanthisudha658@gmail.com | 9964400197 |
| Ward 13 | Shwetha | swethapoojary461@gmail.com | 9513059755 |
| Ward 14 | Deepa | maheshdeepa266@gmail.com | 9845687067 |
| Ward 15 | Pragathi | kunderpragathi@gmail.com | 7892439074 |
| Ward 16 | Sushma | sushmasushma2069@gmail.com | 9902033726 |

Note: Ward 1 email has a typo (`gmai.com`) and Ward 2 has a typo (`gamil.com`) — entered exactly as provided. Correct via the officer management screen if needed.

## Interactive Maps
- **Report page**: Leaflet.js interactive map — click to drop pin, drag to adjust, "Use My Location" / "Place on Map" toggle
- **Officer report detail**: OpenStreetMap iframe embed + OSM navigation link
- **Admin Reports**: Click any report row to open a map modal; "Open Navigation" button opens OSM routing
- All maps use OpenStreetMap tiles — no API key required

## Branding
- Official government identity bar: "Government of Karnataka · Udupi District Administration · Swachh Bharat Mission"
- Login page: official portal feel with IT Act notice, `officer@udupi.gov.in` placeholder
- Footer: full official attribution on all pages

## Geographic Coverage

- **District**: Udupi, Karnataka, India
- **Center**: 13.3409° N, 74.7421° E
- **Taluks covered**: Udupi (r=8km), Kundapur (r=10km), Karkala (r=9km)
- **Maps**: OpenStreetMap (no API key required)

## Features

### Citizen
- No login required
- One-tap "Report Waste" with camera capture + GPS auto-detect
- Track report status by ID (Reported / Cleaning / Cleaned)
- Duplicate report prevention (within ~50m, 24h window)
- Rate limiting (5 reports per IP per hour)

### Officer
- Login-protected dashboard
- View assigned reports by area
- Filter by status
- Mark reports as Cleaning / Cleaned
- Upload cleanup photos

### Admin
- Full system overview with stats
- Manage officers (create, view, delete)
- Assign officers to geographic areas (center lat/lng + radius km)
- View all reports across all officers
- Reassign reports to different officers

## Core Logic

- When a report is submitted with GPS coordinates, the system checks which officer's assigned area contains that location
- Reports are automatically assigned to the matching officer
- Falls back to first available officer if no area matches

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run build` — build API server

## Dev Utilities

### Reset dev hierarchy account passwords

Restores all dev hierarchy accounts (commissioner, environmental engineer,
health inspectors, supervisors) to a known password without touching any
other data.  Safe to run repeatedly — idempotent.

```bash
pnpm --filter @workspace/scripts run reset:dev-passwords -- <newPassword>
```

**Safety guards** — the script refuses to run if:
- `NODE_ENV=production`
- `DATABASE_URL` points to a cloud/production host (neon.tech, supabase.co, etc.)

**Accounts reset** — only the phone-identified Udupi hierarchy accounts seeded
by the API server on first boot:
- Commissioner · Environmental Engineer · 4 Health Inspectors · 11 Supervisors

The script sets `password_reset_required = false` and clears `activation_token`
so the accounts are immediately usable with the new password.  It prints a
warning (but does not error) for any account that hasn't been seeded yet —
boot the API server once to seed, then re-run the script.

## File Structure

```
artifacts/
  api-server/        # Express API server
    src/
      routes/        # auth.ts, reports.ts, officers.ts, admin.ts, uploads.ts
      lib/           # auth.ts (session/password), geo.ts (haversine distance)
  cleanspot/         # React + Vite frontend
    src/
      pages/         # All page components
      hooks/         # useAuth hook
lib/
  api-spec/          # OpenAPI spec (openapi.yaml) + Orval config
  api-client-react/  # Generated React Query hooks
  api-zod/           # Generated Zod validation schemas
  db/                # Drizzle ORM schema + client
    src/schema/      # officers.ts, reports.ts, users.ts
```
