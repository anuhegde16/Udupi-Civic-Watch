---
name: E2E dialog and map-pin locators
description: Why getByRole("dialog") and coordinate clicks on Leaflet pins are unreliable in this app's Playwright tests, and what to use instead.
---

## Rule 1 — do not locate app modals with `getByRole("dialog")`

Use a CSS locator scoped by a stable inner test id instead, e.g.
`page.locator('[role="dialog"]:has([data-testid="<something-in-that-dialog"])')`.

**Why:** staff dashboards can pop a second modal (the push-notification opt-in
prompt) moments after load. Radix marks all background content `aria-hidden`
when a modal opens, so the report dialog silently disappears from *role-based*
queries while remaining visible on screen. The resulting failures are very
misleading: assertions report "element(s) not found" for a dialog the user can
plainly see, and `innerHTML()` on the role locator hangs until the test times
out.

**How to apply:** any Playwright assertion against a dialog that can coexist
with another modal. Role-based queries are fine only where no second modal can
open.

## Rule 2 — click Leaflet report pins via `dispatchEvent("click")`

Iterate marker elements and dispatch the click directly on each one; identify
the target from the popup's action button, not from a separate popup node.

**Why:** report pins overlap heavily inside a single ward, so a coordinate click
repeatedly lands on whichever marker is topmost and the intended pin never
opens. Separately, a closing popup lingers in the DOM briefly, so reading a
status chip from one node and a report id from another can mix two different
pins and produce flaky passes/failures.

**How to apply:** put every attribute a test needs to match on (report id and
status) on the popup's action button so a single selector identifies the pin
atomically. Note the map renders non-report markers too (ward count badges);
scope marker queries to the report-pin class rather than `.leaflet-marker-icon`.

## Rule 3 — do not click a report card at its centre to test navigation

Click a text node inside the card body (e.g. the address line) instead of the
card/link element itself.

**Why:** report cards are a link wrapping a large photo area, and that photo is
its own button that calls `preventDefault`/`stopPropagation` to open the
lightbox. Playwright's default click targets the element centre, which lands on
the photo — so the lightbox opens, navigation never happens, and the failure
surfaces as a confusing `waitForURL` timeout rather than a click error.

**How to apply:** any test asserting that a media-topped card navigates. The
inverse case (photo opens the lightbox and does *not* navigate) is worth
asserting alongside it, since the two behaviours share one element.
