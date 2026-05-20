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

## Default Credentials (dev seed data)

- **Admin**: admin@udupicivicwatch.com / admin@udupicivicwatch.com
- **Officer (Ramesh Shetty)**: byndoor@udupicivicspot.com / byndoor@udupicivicspot.com
- **Officer (Sujata Rao)**: Udupi@udupicivicspot.com / Udupi@udupicivicspot.com
- **Officer (Vinay Hegde)**: kundapur@udupicivicspot.com / kundapur@udupicivicspot.com
- **Password = email** (set this way for easy demo access)

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
