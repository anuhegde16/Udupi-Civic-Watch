---
name: PWA push + in-app notifications
description: Key decisions and quirks for the web-push + notification bell implementation.
---

## Rules

**vite-plugin-pwa strategy:** Must use `strategies: "injectManifest"` with `srcDir: "src"` and `filename: "sw.ts"` to write a custom service worker that handles push events. `generateSW` mode cannot be extended with push handlers.

**Why:** The `generateSW` mode generates a complete service worker automatically with no hooks for custom event listeners. `injectManifest` injects the precache manifest into your own SW file, allowing you to add `push`, `notificationclick`, and `pushsubscriptionchange` listeners.

**How to apply:** Set `devOptions: { enabled: false }` in dev to avoid SW conflicts during development. The custom SW is only active in production builds.

---

**NotificationOptions TS lib gaps:** The standard `NotificationOptions` type in TypeScript's DOM lib is missing `vibrate` and `renotify` fields even though browsers support them. These cause TS2353 errors. Either cast the options object (`as any`) or simply omit those properties.

**Why:** TS DOM lib lags browser spec. `vibrate` and `renotify` are in the Web Notifications spec but not in TypeScript's built-in `NotificationOptions`.

---

**Notification sound:** Use Web Audio API (AudioContext + OscillatorNode) in the React component for in-page sounds when new notifications arrive via polling. Do NOT attempt to use an audio file in the service worker — AudioContext is unavailable in SW context. OS plays its own sound for background push notifications.

**Why:** Service workers do not have access to AudioContext. The Web Audio approach only fires when the tab is active (foreground), which is the right UX: background push notifications get the OS sound, foreground polling gets a custom chime.

---

**VAPID key storage:** Generate keys once with `webpush.generateVAPIDKeys()`, store as shared env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Public key is served to clients via `GET /api/notifications/vapid-public-key`.

---

**Subscription key encoding:** When calling `pushManager.subscribe({ applicationServerKey })`, the VAPID public key must be a `BufferSource` (specifically `ArrayBuffer`). `Uint8Array.buffer` returns `ArrayBufferLike` which includes `SharedArrayBuffer` and fails the TS type check. Fix: `keyArray.buffer.slice(keyArray.byteOffset, keyArray.byteOffset + keyArray.byteLength) as ArrayBuffer`.

---

**Notification routing:**
- New report assigned → field officer user + panchayat admin users (looked up by officer.panchayatName)
- Status change (cleaning/cleaned) → panchayat admins + control center users + officer themselves
- Field officer user lookup: match by `usersTable.email = officer.email` (officers table and users table are separate)
