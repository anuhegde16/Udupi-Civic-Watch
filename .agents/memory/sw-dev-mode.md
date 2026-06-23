---
name: SW dev mode required for push subscriptions
description: Why vite-plugin-pwa devOptions must be enabled:true for push to work in development
---

## The rule

`VitePWA({ devOptions: { enabled: true, type: "module" } })` is required. Never set `enabled: false` in this project.

**Why:** With `enabled: false`, Vite never registers the service worker in the dev server. `navigator.serviceWorker.ready` then hangs indefinitely. The `subscribe()` function in `use-push-notifications.ts` awaits that promise — so the subscribe button spins forever, no subscription is POSTed to `/api/notifications/push-subscription`, zero rows land in `push_subscriptions`, and the server never sends any pushes. This was the entire reason push notifications weren't appearing.

**How to apply:** `type: "module"` is required alongside `enabled: true` for Vite's ESM dev server to serve the SW correctly. Without it the SW module fails to load. Workbox dependencies (precaching, routing, strategies) are optimized by Vite on first load — this is normal and expected.
