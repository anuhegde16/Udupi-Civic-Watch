// Shared "install app" state.
//
// Chrome fires `beforeinstallprompt` ONCE per page load, often before any React
// component has mounted. If nothing is listening at that moment the install offer is
// lost and the user is stuck with manual "Add to Home Screen" instructions.
//
// This module is imported first in main.tsx so the listener exists from the very
// start. Components read the saved event through `useInstallState()`.

import { useSyncExternalStore } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

interface InstallState {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let state: InstallState = { deferred: null, installed: detectStandalone() };
const listeners = new Set<() => void>();

function setState(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's own mini-bar; our "Download App" button shows the install dialog instead.
    e.preventDefault();
    setState({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    setState({ deferred: null, installed: true });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Shows the browser's install dialog. Returns true if the user accepted. */
export async function triggerInstall(): Promise<boolean> {
  const event = state.deferred;
  if (!event) return false;
  // The browser allows prompt() only once per event, so drop it straight away.
  setState({ deferred: null });
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      setState({ installed: true });
      return true;
    }
  } catch {
    // Prompt could not be shown; the user falls back to the manual steps.
  }
  return false;
}

export interface InstallEnvironment {
  isIos: boolean;
  isAndroid: boolean;
  /** iPhone/iPad Safari, the only iOS browser that can always "Add to Home Screen" */
  isIosSafari: boolean;
  /** WhatsApp / Instagram / Facebook etc. built-in browsers cannot install apps */
  inAppBrowser: boolean;
}

export function getInstallEnvironment(): InstallEnvironment {
  if (typeof navigator === "undefined") {
    return { isIos: false, isAndroid: false, isIosSafari: false, inAppBrowser: false };
  }
  const ua = navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Twitter|MicroMessenger|; wv\)/i.test(
    ua,
  );
  const isIosSafari =
    isIos && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua) && !inAppBrowser;
  return { isIos, isAndroid, isIosSafari, inAppBrowser };
}

/** Link that asks Android to open the current page in Chrome (where one-tap install works). */
export function getOpenInChromeUrl(): string {
  const { host, pathname, search, href } = window.location;
  return (
    `intent://${host}${pathname}${search}` +
    `#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(href)};end`
  );
}
