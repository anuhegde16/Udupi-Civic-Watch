---
name: Leaflet async-init vs draw-effect race
description: Why map overlays (boundaries/markers) intermittently fail to render in the CleanSpot Leaflet components
---

# Leaflet async-init vs draw-effect race

In the CleanSpot map components, map creation runs in an **async** `useEffect` (it dynamically `import()`s leaflet), so `mapRef.current` is set only after a tick. A *separate* draw effect (keyed on React Query data like reports/officers) early-returns when `mapRef.current` is still null.

**The bug:** when the query data is already cached, the draw effect runs once at mount (map not ready → early return) and its deps never change again, so overlays are never drawn. It only "works" when data loads *after* the map, which is timing-dependent and looks intermittent.

**Why:** an async init effect and a data-driven draw effect have no ordering guarantee; relying on data changes to re-trigger the draw misses the case where data is already present.

**How to apply:** add a `mapReady` boolean state, set it `true` at the end of the async init, and include `mapReady` in the draw effect's dependency array so the draw re-runs once the map exists. Applies to any component that creates the Leaflet map in one effect and draws overlays in another.
